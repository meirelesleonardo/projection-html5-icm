'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createLibraryStore } = require('../../library-store');
const { createImportRepository } = require('../import-repository');
const { createImportService, MANUAL_FOLDER_DEFAULT } = require('../import-service');

describe('importManualText', () => {
  let tmp;
  let libraryStore;
  let importService;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'louvor-manual-'));
    fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'data', 'data.json'), JSON.stringify([]));
    fs.writeFileSync(
      path.join(tmp, 'data', 'library-meta.json'),
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString() })
    );
    libraryStore = createLibraryStore({ rootDir: tmp, maxBackups: 5 });
    const importRepo = createImportRepository({ rootDir: tmp });
    importService = createImportService({ importRepo, libraryStore });
  });

  after(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (_) {}
  });

  it('creates Avulso Manual with i1 when title has no number', () => {
    const loaded = libraryStore.load();
    const res = importService.importManualText({
      text: 'Teu povo clama\n\nLINHA UM\nLINHA DOIS\n',
      expectedVersion: loaded.version,
    });
    assert.equal(res.ok, true);
    assert.equal(res.libraryName, MANUAL_FOLDER_DEFAULT);
    assert.match(res.title, /^i1 -/);
    assert.equal(res.status, 'NEW');
    const after = libraryStore.load();
    const folder = after.library.find((f) => f.name === MANUAL_FOLDER_DEFAULT);
    assert.ok(folder);
    assert.match(folder.songs[0].title, /^i1 -/);
  });

  it('assigns next iN', () => {
    const loaded = libraryStore.load();
    const res = importService.importManualText({
      text: 'Outro louvor\n\nAAA\n\nBBB\n',
      expectedVersion: loaded.version,
    });
    assert.match(res.title, /^i2 -/);
  });

  it('keeps numeric title', () => {
    const loaded = libraryStore.load();
    const res = importService.importManualText({
      text: '150 - NOME FIXO\n\nCorpo\n',
      expectedVersion: loaded.version,
    });
    assert.equal(res.title, '150 - NOME FIXO');
  });

  it('interleaves CORO in saved content', () => {
    const loaded = libraryStore.load();
    const res = importService.importManualText({
      text: [
        'Coro Teste',
        'E1a',
        '',
        'CORO',
        'C1',
        '',
        'E2a',
      ].join('\n'),
      expectedVersion: loaded.version,
    });
    const after = libraryStore.load();
    const folder = after.library.find((f) => f.name === MANUAL_FOLDER_DEFAULT);
    const song = folder.songs.find((s) => s.title === res.title);
    const slides = song.content.split('\n\n');
    assert.equal(slides.length, 4);
    assert.match(slides[1], /CORO/);
    assert.match(slides[3], /CORO/);
  });

  it('conflicts when same name different content', () => {
    const loaded = libraryStore.load();
    // First insert with plain name that becomes iN — use numeric to control identity
    importService.importManualText({
      text: '200 - Conflito\n\nOLD BODY\n',
      expectedVersion: loaded.version,
    });
    const mid = libraryStore.load();
    assert.throws(
      () =>
        importService.importManualText({
          text: '200 - Conflito\n\nNEW BODY\n',
          expectedVersion: mid.version,
        }),
      (err) => err.code === 'UNRESOLVED' || err.status === 409
    );
  });
});
