'use strict';

const SYNC_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Decide pull, push, idle ou conflito a partir dos hashes.
 * syncedHash ausente e conteúdos diferentes não escolhe um lado sozinho.
 */
function planSync(input) {
  const localHash = input.localHash;
  const syncedHash = input.syncedHash || null;
  const remoteExists = Boolean(input.remoteExists);
  const remoteHash = input.remoteHash || null;

  if (!remoteExists) return { action: 'push', reason: 'seed' };
  if (localHash && localHash === remoteHash) return { action: 'idle' };
  if (!syncedHash) return { action: 'conflict', reason: 'unsynced' };
  if (syncedHash === localHash) return { action: 'pull' };
  if (remoteHash === syncedHash) return { action: 'push' };
  return { action: 'conflict', reason: 'diverged' };
}

function syncConfig(config) {
  const url = config && config.syncUrl ? String(config.syncUrl).trim().replace(/\/$/, '') : '';
  const token = config && config.syncToken ? String(config.syncToken).trim() : '';
  return { url, token, enabled: Boolean(url && token) };
}

async function readBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return { error: text.slice(0, 300) };
  }
}

function createSyncScheduler(options) {
  const run = options.run;
  const onResult = options.onResult;
  const intervalMs = options.intervalMs || SYNC_INTERVAL_MS;
  const queue = [];
  let running = false;

  function pump() {
    if (running || !queue.length) return;
    const job = queue.shift();
    running = true;
    Promise.resolve()
      .then(() => run(job.runOptions || {}))
      .then((result) => {
        try {
          if (onResult) onResult(result, job.reason || 'sync');
        } catch (err) {
          console.error('[sync] onResult', err && err.message ? err.message : err);
        }
        job.resolve(result);
      })
      .catch((err) => {
        const result = {
          action: 'error',
          error: err && err.message ? err.message : String(err),
        };
        try {
          if (onResult) onResult(result, job.reason || 'sync');
        } catch (_) {}
        job.resolve(result);
      })
      .finally(() => {
        running = false;
        pump();
      });
  }

  function kick(reason, runOptions) {
    return new Promise((resolve) => {
      queue.push({
        reason: reason || 'sync',
        runOptions: runOptions || null,
        resolve,
      });
      pump();
    });
  }

  function startInterval() {
    return setInterval(() => {
      kick('interval');
    }, intervalMs);
  }

  return { kick, startInterval };
}

/**
 * Uma rodada de sincronização. fetchImpl injeta o cliente HTTP nos testes.
 */
async function runLibrarySync(options) {
  const store = options.store;
  const cfg = syncConfig(options.config);
  if (!cfg.enabled) return { action: 'disabled' };

  const fetchImpl = options.fetchImpl || fetch;
  const force = options.force || null;
  const headers = {
    Authorization: 'Bearer ' + cfg.token,
    Accept: 'application/json',
  };
  const timeoutMs = options.timeoutMs || 20000;
  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(timeoutMs)
    : undefined;

  let statusRes;
  try {
    statusRes = await fetchImpl(cfg.url + '/api/library/sync', { headers, signal });
  } catch (err) {
    return { action: 'offline', error: err && err.message ? err.message : 'sem rede' };
  }

  const statusBody = await readBody(statusRes);
  if (statusRes.status === 401 || statusRes.status === 403) {
    return { action: 'error', status: statusRes.status, error: 'token de sincronização rejeitado' };
  }
  if (statusRes.status !== 200 && statusRes.status !== 404) {
    return {
      action: 'error',
      status: statusRes.status,
      error: (statusBody && statusBody.error) || 'falha ao consultar a VPS',
    };
  }

  const remoteExists = statusRes.status === 200 && statusBody && statusBody.contentHash;
  const remoteHash = remoteExists ? statusBody.contentHash : null;
  const local = store.load();
  let decision = planSync({
    localHash: local.contentHash,
    syncedHash: local.syncedHash,
    remoteExists,
    remoteHash,
  });
  if (force === 'pull' || force === 'push') {
    decision = { action: force, reason: 'manual' };
  }

  if (decision.action === 'idle') {
    if (local.syncedHash !== local.contentHash) store.markSynced();
    return { action: 'idle', version: local.version, contentHash: local.contentHash };
  }

  if (decision.action === 'conflict') {
    const copy = store.rememberConflict();
    return {
      action: 'conflict',
      reason: decision.reason,
      version: local.version,
      contentHash: local.contentHash,
      remoteVersion: statusBody && statusBody.version,
      remoteHash,
      copy,
    };
  }

  if (decision.action === 'pull') {
    if (!remoteExists) {
      return { action: 'error', error: 'A VPS ainda não tem base para baixar.' };
    }
    let blobRes;
    try {
      blobRes = await fetchImpl(cfg.url + '/api/library/sync/blob', { headers, signal });
    } catch (err) {
      return { action: 'offline', error: err && err.message ? err.message : 'sem rede' };
    }
    const blob = await readBody(blobRes);
    if (!blobRes.ok) {
      return {
        action: 'error',
        status: blobRes.status,
        error: (blob && blob.error) || 'falha ao baixar a base',
      };
    }
    const adopted = store.adoptRemote(blob.library, {
      version: blob.version,
      updatedAt: blob.updatedAt,
      contentHash: blob.contentHash,
    });
    return { action: 'pulled', version: adopted.version, updatedAt: adopted.updatedAt, contentHash: adopted.contentHash };
  }

  const baseHash = force === 'push'
    ? (remoteExists ? remoteHash : null)
    : (remoteExists ? local.syncedHash : null);
  let putRes;
  try {
    putRes = await fetchImpl(cfg.url + '/api/library/sync', {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify({ baseHash, library: local.library }),
      signal,
    });
  } catch (err) {
    return { action: 'offline', error: err && err.message ? err.message : 'sem rede' };
  }
  const putBody = await readBody(putRes);
  if (putRes.status === 409) {
    const copy = store.rememberConflict();
    return {
      action: 'conflict',
      reason: 'rejected',
      version: local.version,
      contentHash: local.contentHash,
      remoteVersion: putBody && putBody.version,
      remoteHash: putBody && putBody.contentHash,
      copy,
    };
  }
  if (!putRes.ok) {
    return {
      action: 'error',
      status: putRes.status,
      error: (putBody && putBody.error) || 'falha ao enviar a base',
    };
  }
  const marked = store.markSynced({ version: putBody.version, updatedAt: putBody.updatedAt });
  return { action: 'pushed', version: marked.version, updatedAt: marked.updatedAt, contentHash: marked.contentHash };
}

module.exports = {
  SYNC_INTERVAL_MS,
  planSync,
  syncConfig,
  createSyncScheduler,
  runLibrarySync,
};
