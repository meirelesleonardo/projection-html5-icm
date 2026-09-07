'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createLibraryStore } = require('../../library-store');
const { createImportRepository } = require('../import-repository');
const { createImportService } = require('../import-service');

describe('import-service apply (temp store)', () => {
  let tmp;
  let libraryStore;
  let importRepo;
  let importService;
  let sampleTxt;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'louvor-import-svc-'));
    fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'data', 'data.json'),
      JSON.stringify([
        {
          name: 'Coletânea Demo',
          type: 's',
          lang: 'pt',
          songs: [{ title: '1 - Existente', content: 'OLD\n\nLINE' }],
        },
      ])
    );
    fs.writeFileSync(
      path.join(tmp, 'data', 'library-meta.json'),
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString() })
    );
    sampleTxt = path.join(tmp, 'sample.txt');
    fs.writeFileSync(
      sampleTxt,
      '1 - Existente\n\nNEW CONTENT\nSECOND\n\n2 - Novo Louvor\n\nHELLO\nWORLD\n'
    );

    libraryStore = createLibraryStore({ rootDir: tmp, maxBackups: 5 });
    importRepo = createImportRepository({ rootDir: tmp });
    importService = createImportService({ importRepo, libraryStore });
  });

  after(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (_) {}
  });

  it('uploads, conflicts, resolves, applies without corrupting on cancel path', () => {
    const job = importService.startFromUpload({
      originalName: 'sample.txt',
      tempPath: sampleTxt,
      sourceSize: fs.statSync(sampleTxt).size,
      libraryName: 'Coletânea Demo',
      lang: 'pt',
    });
    assert.ok(job.id);
    let detail = importService.getJobDetail(job.id);
    assert.ok(detail.preview);
    assert.equal(detail.preview.folderOp, 'UPDATE');

    const conflict = detail.preview.items.find((i) => i.status === 'CONFLICT');
    assert.ok(conflict, 'expected conflict on song 1');

    // Cancel should not change library version content of song 1
    const before = libraryStore.load();
    assert.equal(before.library[0].songs[0].content, 'OLD\n\nLINE');

    importService.reject(job.id);
    const afterReject = libraryStore.load();
    assert.equal(afterReject.version, before.version);
    assert.equal(afterReject.library[0].songs[0].content, 'OLD\n\nLINE');
  });

  it('applies resolved import: update + insert', () => {
    const txt2 = path.join(tmp, 'sample2.txt');
    fs.writeFileSync(
      txt2,
      '1 - Existente\n\nNEW CONTENT\nSECOND\n\n===\n\n2 - Novo Louvor\n\nHELLO\nWORLD\n'
    );
    const job = importService.startFromUpload({
      originalName: 'sample2.txt',
      tempPath: txt2,
      sourceSize: 10,
      libraryName: 'Coletânea Demo',
    });
    const detail0 = importService.getJobDetail(job.id);
    const conflictKey = detail0.preview.items.find((i) => i.status === 'CONFLICT').key;
    importService.patchJob(job.id, {
      decisions: { [conflictKey]: 'useImported' },
    });
    const loaded = libraryStore.load();
    const result = importService.apply(job.id, { expectedVersion: loaded.version });
    assert.ok(result.report.ok);
    const after = libraryStore.load();
    assert.equal(after.version, loaded.version + 1);
    assert.equal(after.library[0].songs.length, 2);
    assert.match(after.library[0].songs[0].content, /NEW CONTENT/);
    assert.ok(after.library[0].songs.some((s) => s.title.startsWith('2 -')));
    assert.ok(result.report.backup || libraryStore.listBackups().length >= 1);
  });

  it('assigns iN on new folder without numbers', () => {
    const txt = path.join(tmp, 'avulso.txt');
    fs.writeFileSync(txt, 'Teu povo clama\n\nLINHA UM\nLINHA DOIS\n');
    const job = importService.startFromUpload({
      originalName: 'avulso.txt',
      tempPath: txt,
      sourceSize: 5,
      libraryName: 'Avulsos Import Test',
    });
    const detail = importService.getJobDetail(job.id);
    assert.equal(detail.preview.folderOp, 'INSERT');
    assert.match(detail.preview.items[0].resolvedTitle, /^i1 -/);
    const loaded = libraryStore.load();
    importService.apply(job.id, { expectedVersion: loaded.version });
    const after = libraryStore.load();
    const folder = after.library.find((f) => f.name === 'Avulsos Import Test');
    assert.ok(folder);
    assert.match(folder.songs[0].title, /^i1 -/);
  });
});
