'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateLibrary } = require('./library-validate');

const DEFAULT_MAX_BACKUPS = 5;

/**
 * JSON file repository for the song library (data.json + library-meta.json).
 * Atomic write: tmp → rename. Ready to swap for SqliteLibraryStore later.
 */
function createLibraryStore(options) {
  const rootDir = options.rootDir;
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const dataFile = options.dataFile || path.join(dataDir, 'data.json');
  const metaFile = options.metaFile || path.join(dataDir, 'library-meta.json');
  const backupDir = options.backupDir || path.join(dataDir, 'backups');
  const maxBackups = options.maxBackups != null ? options.maxBackups : DEFAULT_MAX_BACKUPS;

  function ensureDirs() {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });
  }

  function hashText(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }

  function hashLibrary(library) {
    return hashText(JSON.stringify(library));
  }

  function readMeta() {
    ensureDirs();
    if (!fs.existsSync(metaFile)) {
      const meta = { version: 1, updatedAt: new Date().toISOString() };
      writeJsonAtomic(metaFile, meta);
      return meta;
    }
    try {
      const raw = fs.readFileSync(metaFile, 'utf8');
      const meta = JSON.parse(raw);
      if (typeof meta.version !== 'number' || !Number.isFinite(meta.version)) {
        meta.version = 1;
      }
      if (!meta.updatedAt) meta.updatedAt = new Date().toISOString();
      return meta;
    } catch (e) {
      const meta = { version: 1, updatedAt: new Date().toISOString() };
      writeJsonAtomic(metaFile, meta);
      return meta;
    }
  }

  function writeJsonAtomic(targetPath, obj) {
    ensureDirs();
    const dir = path.dirname(targetPath);
    const tmp = path.join(
      dir,
      `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`
    );
    const json = JSON.stringify(obj, null, 0);
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, json, 'utf8');
      try {
        fs.fsyncSync(fd);
      } catch (_) {
        /* some FS ignore fsync */
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, targetPath);
  }

  function load() {
    ensureDirs();
    if (!fs.existsSync(dataFile)) {
      const err = new Error('data.json not found');
      err.code = 'ENOENT';
      throw err;
    }
    const raw = fs.readFileSync(dataFile, 'utf8');
    let library;
    try {
      library = JSON.parse(raw);
    } catch (e) {
      const err = new Error('data.json corrompido ou JSON inválido');
      err.code = 'EINVAL';
      throw err;
    }
    const check = validateLibrary(library);
    if (!check.ok) {
      const err = new Error(check.error || 'data.json inválido');
      err.code = 'EINVAL';
      throw err;
    }
    const meta = readMeta();
    let mtime = null;
    try {
      mtime = fs.statSync(dataFile).mtime.toISOString();
    } catch (_) {}
    const contentHash = hashLibrary(library);
    return {
      library,
      version: meta.version,
      updatedAt: meta.updatedAt || mtime,
      etag: String(meta.version),
      contentHash,
      syncedHash: meta.syncedHash || null,
    };
  }

  function rotateBackups() {
    if (!fs.existsSync(backupDir)) return;
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => /^library-.*\.json$/i.test(f))
      .map((f) => ({
        name: f,
        full: path.join(backupDir, f),
        mtime: fs.statSync(path.join(backupDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    for (let i = maxBackups; i < files.length; i++) {
      try {
        fs.unlinkSync(files[i].full);
      } catch (_) {}
    }
  }

  function createBackup() {
    ensureDirs();
    if (!fs.existsSync(dataFile)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `library-${stamp}.json`);
    fs.copyFileSync(dataFile, dest);
    rotateBackups();
    return dest;
  }

  /**
   * @param {object[]} library
   * @param {number} expectedVersion - client version; must match current
   */
  function saveAtomic(library, expectedVersion) {
    const check = validateLibrary(library);
    if (!check.ok) {
      const err = new Error(check.error);
      err.code = 'VALIDATION';
      err.status = 400;
      throw err;
    }

    const meta = readMeta();
    const current = meta.version;
    if (Number(expectedVersion) !== Number(current)) {
      const err = new Error(
        'A biblioteca foi alterada por outro dispositivo. Atualize antes de salvar.'
      );
      err.code = 'CONFLICT';
      err.status = 409;
      err.currentVersion = current;
      err.updatedAt = meta.updatedAt;
      throw err;
    }

    createBackup();

    const nextVersion = current + 1;
    const updatedAt = new Date().toISOString();
    const contentHash = hashLibrary(library);

    writeJsonAtomic(dataFile, library);
    writeJsonAtomic(metaFile, {
      version: nextVersion,
      updatedAt,
      contentHash,
      syncedHash: meta.syncedHash || null,
      lastConflictHash: meta.lastConflictHash || null,
    });

    return {
      version: nextVersion,
      updatedAt,
      etag: String(nextVersion),
      contentHash,
      syncedHash: meta.syncedHash || null,
    };
  }

  function writeMeta(fields) {
    writeJsonAtomic(metaFile, fields);
  }

  /**
   * Marca a base local como igual à última troca com a VPS.
   * Pode adotar version/updatedAt devolvidos pelo push.
   */
  function markSynced(extra) {
    const loaded = load();
    const version = extra && extra.version != null && Number.isFinite(Number(extra.version))
      ? Number(extra.version)
      : loaded.version;
    const updatedAt = extra && extra.updatedAt ? extra.updatedAt : loaded.updatedAt;
    writeMeta({
      version,
      updatedAt,
      contentHash: loaded.contentHash,
      syncedHash: loaded.contentHash,
      lastConflictHash: null,
    });
    return { version, updatedAt, contentHash: loaded.contentHash, syncedHash: loaded.contentHash };
  }

  /**
   * Substitui a base local pela cópia canônica e adota a versão remota.
   */
  function adoptRemote(library, remote) {
    const check = validateLibrary(library);
    if (!check.ok) {
      const err = new Error(check.error);
      err.code = 'VALIDATION';
      err.status = 400;
      throw err;
    }
    const contentHash = hashLibrary(library);
    if (remote && remote.contentHash && remote.contentHash !== contentHash) {
      const err = new Error('hash remoto não confere com a base recebida');
      err.code = 'HASH_MISMATCH';
      err.status = 400;
      throw err;
    }
    if (fs.existsSync(dataFile)) createBackup();
    const version = Number(remote && remote.version);
    const updatedAt = (remote && remote.updatedAt) || new Date().toISOString();
    writeJsonAtomic(dataFile, library);
    writeMeta({
      version,
      updatedAt,
      contentHash,
      syncedHash: contentHash,
      lastConflictHash: null,
    });
    return { version, updatedAt, contentHash, syncedHash: contentHash };
  }

  /**
   * Gravação canônica na VPS. baseHash null só é aceito quando ainda não há arquivo.
   */
  function saveFromSync(library, baseHash) {
    const check = validateLibrary(library);
    if (!check.ok) {
      const err = new Error(check.error);
      err.code = 'VALIDATION';
      err.status = 400;
      throw err;
    }
    let currentHash = null;
    let currentVersion = 0;
    if (fs.existsSync(dataFile)) {
      const loaded = load();
      currentHash = loaded.contentHash;
      currentVersion = loaded.version;
    }
    const base = baseHash == null || baseHash === '' ? null : String(baseHash);
    if (currentHash) {
      if (base !== currentHash) {
        const err = new Error('A base da VPS mudou desde o último ponto em comum.');
        err.code = 'CONFLICT';
        err.status = 409;
        err.contentHash = currentHash;
        err.currentVersion = currentVersion;
        throw err;
      }
    } else if (base) {
      const err = new Error('A VPS ainda não tem base para esse hash de partida.');
      err.code = 'CONFLICT';
      err.status = 409;
      err.contentHash = null;
      err.currentVersion = 0;
      throw err;
    }

    if (currentHash) createBackup();
    const contentHash = hashLibrary(library);
    const nextVersion = currentVersion > 0 ? currentVersion + 1 : 1;
    const updatedAt = new Date().toISOString();
    writeJsonAtomic(dataFile, library);
    writeMeta({
      version: nextVersion,
      updatedAt,
      contentHash,
      syncedHash: contentHash,
      lastConflictHash: null,
    });
    return { version: nextVersion, updatedAt, contentHash, syncedHash: contentHash };
  }

  function rememberConflict() {
    if (!fs.existsSync(dataFile)) return null;
    const loaded = load();
    const meta = readMeta();
    if (meta.lastConflictHash === loaded.contentHash) return null;
    const dir = path.join(dataDir, 'sync-conflicts');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(dir, 'library-' + stamp + '.json');
    fs.copyFileSync(dataFile, dest);
    writeMeta({
      version: loaded.version,
      updatedAt: loaded.updatedAt,
      contentHash: loaded.contentHash,
      syncedHash: loaded.syncedHash,
      lastConflictHash: loaded.contentHash,
    });
    return dest;
  }

  function listBackups() {
    ensureDirs();
    if (!fs.existsSync(backupDir)) return [];
    return fs
      .readdirSync(backupDir)
      .filter((f) => /^library-.*\.json$/i.test(f))
      .map((f) => {
        const full = path.join(backupDir, f);
        const st = fs.statSync(full);
        return { name: f, size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  }

  return {
    dataFile,
    metaFile,
    backupDir,
    load,
    saveAtomic,
    createBackup,
    listBackups,
    readMeta,
    hashLibrary,
    markSynced,
    adoptRemote,
    saveFromSync,
    rememberConflict,
  };
}

module.exports = { createLibraryStore };
