'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createLibraryStore } = require('./library-store');
const { planSync, runLibrarySync } = require('./library-sync');
const { createSyncServer } = require('./sync-server');

const sample = [
  { name: 'Test', type: 's', lang: 'pt', songs: [{ title: 'A', content: 'letra' }] },
];

function otherLibrary() {
  return [{ name: 'Test', type: 's', lang: 'pt', songs: [{ title: 'B', content: 'outra' }] }];
}

describe('planSync', () => {
  it('does nothing when hashes match', () => {
    assert.equal(planSync({ localHash: 'a', syncedHash: 'a', remoteExists: true, remoteHash: 'a' }).action, 'idle');
  });

  it('pulls when the PC is clean and the VPS changed', () => {
    assert.equal(planSync({ localHash: 'a', syncedHash: 'a', remoteExists: true, remoteHash: 'b' }).action, 'pull');
  });

  it('pushes when only the PC changed from the shared hash', () => {
    assert.equal(planSync({ localHash: 'b', syncedHash: 'a', remoteExists: true, remoteHash: 'a' }).action, 'push');
  });

  it('conflicts when both sides diverged', () => {
    assert.equal(planSync({ localHash: 'b', syncedHash: 'a', remoteExists: true, remoteHash: 'c' }).action, 'conflict');
  });

  it('conflicts when never synced and contents differ', () => {
    assert.equal(planSync({ localHash: 'b', syncedHash: null, remoteExists: true, remoteHash: 'c' }).action, 'conflict');
  });

  it('pushes the initial library when the VPS is empty', () => {
    assert.equal(planSync({ localHash: 'a', syncedHash: null, remoteExists: false, remoteHash: null }).action, 'push');
  });
});

describe('runLibrarySync sem rede', () => {
  it('does not change the local library', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-off-'));
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data', 'data.json'), JSON.stringify(sample));
    const store = createLibraryStore({ rootDir: dir, maxBackups: 2 });
    const before = fs.readFileSync(store.dataFile, 'utf8');
    const result = await runLibrarySync({
      store,
      config: { syncUrl: 'http://127.0.0.1:9', syncToken: 'x' },
      fetchImpl() {
        return Promise.reject(new Error('offline'));
      },
    });
    assert.equal(result.action, 'offline');
    assert.equal(fs.readFileSync(store.dataFile, 'utf8'), before);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('runLibrarySync contra a VPS falsa', () => {
  let localDir;
  let remoteDir;
  let server;
  let baseUrl;
  const token = 'token-teste';

  before(async () => {
    localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-local-'));
    remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-remote-'));
    fs.mkdirSync(path.join(localDir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(localDir, 'data', 'data.json'), JSON.stringify(sample));
    const started = createSyncServer({ token, dataDir: remoteDir, port: 0 });
    server = http.createServer(started.app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = 'http://127.0.0.1:' + server.address().port;
  });

  after(() => {
    server.close();
    fs.rmSync(localDir, { recursive: true, force: true });
    fs.rmSync(remoteDir, { recursive: true, force: true });
  });

  it('pushes, pulls, and rejects divergence', async () => {
    const local = createLibraryStore({ rootDir: localDir, maxBackups: 3 });
    const config = { syncUrl: baseUrl, syncToken: token };

    const seeded = await runLibrarySync({ store: local, config });
    assert.equal(seeded.action, 'pushed');
    assert.equal(local.load().syncedHash, local.load().contentHash);

    const remote = createLibraryStore({ rootDir: path.dirname(remoteDir), dataDir: remoteDir, maxBackups: 3 });
    const changed = otherLibrary();
    remote.saveAtomic(changed, remote.load().version);
    const pulled = await runLibrarySync({ store: local, config });
    assert.equal(pulled.action, 'pulled');
    assert.equal(local.load().library[0].songs[0].title, 'B');

    const localEdited = JSON.parse(JSON.stringify(local.load().library));
    localEdited[0].songs[0].title = 'Local';
    local.saveAtomic(localEdited, local.load().version);
    const remoteEdited = JSON.parse(JSON.stringify(remote.load().library));
    remoteEdited[0].songs[0].title = 'Remota';
    remote.saveAtomic(remoteEdited, remote.load().version);

    const conflict = await runLibrarySync({ store: local, config });
    assert.equal(conflict.action, 'conflict');
    assert.equal(local.load().library[0].songs[0].title, 'Local');

    const forced = await runLibrarySync({ store: local, config, force: 'pull' });
    assert.equal(forced.action, 'pulled');
    assert.equal(local.load().library[0].songs[0].title, 'Remota');
  });
});
