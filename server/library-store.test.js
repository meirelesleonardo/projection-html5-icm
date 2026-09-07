'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { createLibraryStore } = require('./library-store');
const { validateLibrary, validatePutBody } = require('./library-validate');

const sample = [
  {
    name: 'Test',
    type: 's',
    lang: 'pt',
    songs: [{ title: 'A', content: 'letra' }],
  },
];

describe('library-validate', () => {
  it('accepts valid library', () => {
    assert.equal(validateLibrary(sample).ok, true);
  });
  it('rejects non-array', () => {
    assert.equal(validateLibrary({}).ok, false);
  });
  it('rejects bad song', () => {
    const bad = JSON.parse(JSON.stringify(sample));
    bad[0].songs[0].content = 1;
    assert.equal(validateLibrary(bad).ok, false);
  });
  it('validatePutBody requires version + library', () => {
    assert.equal(validatePutBody({ version: 1, library: sample }).ok, true);
    assert.equal(validatePutBody({ library: sample }).ok, false);
  });
});

describe('library-store atomic', () => {
  let dir;
  let store;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'libstore-'));
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data', 'data.json'), JSON.stringify(sample));
    store = createLibraryStore({ rootDir: dir, maxBackups: 3 });
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('load returns version and library', () => {
    const loaded = store.load();
    assert.equal(loaded.library[0].name, 'Test');
    assert.equal(typeof loaded.version, 'number');
    assert.ok(loaded.version >= 1);
  });

  it('saveAtomic increments version and keeps file valid', () => {
    const before = store.load();
    const next = JSON.parse(JSON.stringify(before.library));
    next[0].songs[0].title = 'B';
    const saved = store.saveAtomic(next, before.version);
    assert.equal(saved.version, before.version + 1);
    const after = store.load();
    assert.equal(after.library[0].songs[0].title, 'B');
    assert.equal(after.version, saved.version);
  });

  it('conflict on stale version', () => {
    const cur = store.load();
    assert.throws(
      () => store.saveAtomic(cur.library, cur.version - 1),
      (e) => e.code === 'CONFLICT' || e.status === 409
    );
    const still = store.load();
    assert.equal(still.version, cur.version);
  });

  it('creates backups', () => {
    const cur = store.load();
    const next = JSON.parse(JSON.stringify(cur.library));
    next[0].songs.push({ title: 'C', content: 'x' });
    store.saveAtomic(next, cur.version);
    const backups = store.listBackups();
    assert.ok(backups.length >= 1);
  });

  it('rejects invalid library without touching file', () => {
    const cur = store.load();
    const rawBefore = fs.readFileSync(store.dataFile, 'utf8');
    assert.throws(
      () => store.saveAtomic({ not: 'array' }, cur.version),
      (e) => e.code === 'VALIDATION' || e.status === 400
    );
    assert.equal(fs.readFileSync(store.dataFile, 'utf8'), rawBefore);
  });
});
