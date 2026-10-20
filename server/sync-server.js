'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createLibraryStore } = require('./library-store');

function tokensMatch(got, expected) {
  const a = Buffer.from(String(got || ''));
  const b = Buffer.from(String(expected || ''));
  if (!b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createSyncApp(options) {
  const token = options.token;
  const store = options.store;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20mb' }));

  function requireToken(req, res) {
    const header = req.get('authorization') || '';
    const got = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!tokensMatch(got, token)) {
      res.status(401).json({ error: 'token ausente ou inválido', code: 'unauthorized' });
      return false;
    }
    return true;
  }

  app.get('/api/library/sync', (req, res) => {
    if (!requireToken(req, res)) return;
    try {
      const loaded = store.load();
      return res.json({
        version: loaded.version,
        updatedAt: loaded.updatedAt,
        contentHash: loaded.contentHash,
      });
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ error: 'base vazia', code: 'empty' });
      return res.status(500).json({ error: e.message || 'falha ao ler' });
    }
  });

  app.get('/api/library/sync/blob', (req, res) => {
    if (!requireToken(req, res)) return;
    try {
      const loaded = store.load();
      return res.json({
        version: loaded.version,
        updatedAt: loaded.updatedAt,
        contentHash: loaded.contentHash,
        library: loaded.library,
      });
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ error: 'base vazia', code: 'empty' });
      return res.status(500).json({ error: e.message || 'falha ao ler' });
    }
  });

  app.put('/api/library/sync', (req, res) => {
    if (!requireToken(req, res)) return;
    const body = req.body || {};
    if (!Array.isArray(body.library)) {
      return res.status(400).json({ error: 'library deve ser um array', code: 'validation' });
    }
    try {
      const saved = store.saveFromSync(body.library, body.baseHash);
      return res.json({
        ok: true,
        version: saved.version,
        updatedAt: saved.updatedAt,
        contentHash: saved.contentHash,
      });
    } catch (e) {
      if (e.code === 'CONFLICT' || e.status === 409) {
        return res.status(409).json({
          error: e.message,
          code: 'conflict',
          version: e.currentVersion,
          contentHash: e.contentHash,
        });
      }
      if (e.code === 'VALIDATION' || e.status === 400) {
        return res.status(400).json({ error: e.message, code: 'validation' });
      }
      return res.status(500).json({ error: e.message || 'falha ao gravar' });
    }
  });

  return app;
}

function loadSyncServerConfig(configPath) {
  const file = configPath || path.join(__dirname, 'sync-config.json');
  if (!fs.existsSync(file)) {
    return {
      port: Number(process.env.SYNC_PORT || 3090),
      token: process.env.SYNC_TOKEN || '',
      dataDir: process.env.SYNC_DATA_DIR || path.join(__dirname, '..', 'data'),
    };
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    port: Number(process.env.SYNC_PORT || parsed.port || 3090),
    token: process.env.SYNC_TOKEN || parsed.token || '',
    dataDir: process.env.SYNC_DATA_DIR || parsed.dataDir || path.join(__dirname, '..', 'data'),
  };
}

function createSyncServer(options) {
  const opts = options || loadSyncServerConfig();
  if (!opts.token) {
    throw new Error('Defina token em server/sync-config.json ou na variável SYNC_TOKEN.');
  }
  const dataDir = path.resolve(opts.dataDir);
  const store = createLibraryStore({
    rootDir: path.dirname(dataDir),
    dataDir,
    maxBackups: 20,
  });
  const app = createSyncApp({ token: opts.token, store });
  return { app, store, port: opts.port, dataDir };
}

function main() {
  const started = createSyncServer();
  started.app.listen(started.port, '0.0.0.0', () => {
    console.log('[sync] base de louvores em http://0.0.0.0:' + started.port + '/api/library/sync');
    console.log('[sync] dados em ' + started.dataDir);
    console.log('[sync] publique este processo só atrás de HTTPS (Caddy ou nginx).');
  });
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[sync]', err.message || err);
    process.exit(1);
  }
}

module.exports = {
  createSyncApp,
  createSyncServer,
  loadSyncServerConfig,
  tokensMatch,
};
