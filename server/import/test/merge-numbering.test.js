'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getNextImportNumber,
  parseSongIdentity,
  normalizeName,
  suggestLibraryNameFromFile,
} = require('../numbering');
const { buildMergePlan, applyMergePlan, contentEqual } = require('../merge-engine');

describe('numbering', () => {
  it('parses numeric and import titles', () => {
    assert.equal(parseSongIdentity('200 - Teu povo').kind, 'numeric');
    assert.equal(parseSongIdentity('200 - Teu povo').number, 200);
    assert.equal(parseSongIdentity('i205 - Teu povo').kind, 'import');
    assert.equal(parseSongIdentity('i205 - Teu povo').number, 205);
    assert.equal(parseSongIdentity('Teu povo').kind, 'none');
  });

  it('getNextImportNumber uses MAX+1', () => {
    const folder = {
      songs: [
        { title: 'i200 - A', content: 'x' },
        { title: 'i201 - B', content: 'x' },
        { title: 'i205 - C', content: 'x' },
        { title: '10 - D', content: 'x' },
      ],
    };
    assert.equal(getNextImportNumber(folder), 206);
  });

  it('starts at i1 when empty', () => {
    assert.equal(getNextImportNumber({ songs: [] }), 1);
  });

  it('suggests Coletânea YEAR from filename', () => {
    assert.equal(
      suggestLibraryNameFromFile('01.COLETÂNEA_IGREJAS-2022_PROJETOR-4.3.pptx'),
      'Coletânea 2022'
    );
  });

  it('suggests Louvores Avulsos YEAR from filename', () => {
    assert.equal(
      suggestLibraryNameFromFile('LOUVORES AVULSOS_Rev_31.12.22.pptx'),
      'Louvores Avulsos 2022'
    );
    assert.equal(suggestLibraryNameFromFile('avulsos.pptx'), 'Louvores Avulsos');
  });

  it('normalizes names', () => {
    assert.equal(normalizeName('Coletânea 2022'), normalizeName('COLETANEA  2022'));
  });
});

describe('merge-engine', () => {
  const alloc = (() => {
    let n = 1;
    return () => n++;
  })();

  it('INSERT new library songs', () => {
    const plan = buildMergePlan(
      [
        { key: 'a', title: '1 - Um', content: 'A' },
        { key: 'b', title: '2 - Dois', content: 'B' },
      ],
      null,
      { allocImportNumber: alloc, selection: { a: true, b: true }, decisions: {} }
    );
    assert.equal(plan.folderOp, 'INSERT');
    assert.equal(plan.statistics.new, 2);
    const lib = applyMergePlan([], 'Coletânea Teste', plan);
    assert.equal(lib.length, 1);
    assert.equal(lib[0].songs.length, 2);
  });

  it('INSERT places new folder at the front of the library', () => {
    const existing = [
      { name: 'Coletânea 2018', type: 's', lang: 'pt', songs: [] },
      { name: 'CIA 2018', type: 's', lang: 'pt', songs: [] },
    ];
    const plan = buildMergePlan(
      [{ key: 'a', title: '1 - Um', content: 'A' }],
      null,
      { allocImportNumber: () => 1, selection: { a: true }, decisions: {} }
    );
    const lib = applyMergePlan(existing, 'Coletânea 2022', plan);
    assert.equal(lib[0].name, 'Coletânea 2022');
    assert.equal(lib[1].name, 'Coletânea 2018');
    assert.equal(lib[2].name, 'CIA 2018');
  });

  it('INSERT promotes existing same-name folder to the front', () => {
    const existing = [
      { name: 'Coletânea 2018', type: 's', lang: 'pt', songs: [] },
      { name: 'CIA 2018', type: 's', lang: 'pt', songs: [] },
      {
        name: 'Coletânea 2022',
        type: 's',
        lang: 'pt',
        songs: [{ title: '1 - Já existe', content: 'OLD' }],
      },
    ];
    const plan = buildMergePlan(
      [{ key: 'a', title: '2 - Novo', content: 'NEW' }],
      null,
      { allocImportNumber: () => 1, selection: { a: true }, decisions: {} }
    );
    assert.equal(plan.folderOp, 'INSERT');
    const lib = applyMergePlan(existing, 'Coletânea 2022', plan);
    assert.equal(lib[0].name, 'Coletânea 2022');
    assert.equal(lib[0].songs.length, 2);
    assert.equal(lib[1].name, 'Coletânea 2018');
    assert.equal(lib[2].name, 'CIA 2018');
  });

  it('UPDATE keeps existing folder position', () => {
    const folder2022 = {
      name: 'Coletânea 2022',
      type: 's',
      lang: 'pt',
      songs: [{ title: '1 - A', content: 'OLD' }],
    };
    const existing = [
      { name: 'Coletânea 2018', type: 's', lang: 'pt', songs: [] },
      { name: 'CIA 2018', type: 's', lang: 'pt', songs: [] },
      folder2022,
    ];
    const plan = buildMergePlan(
      [{ key: 'a', title: '1 - A', content: 'NEW' }],
      folder2022,
      {
        allocImportNumber: () => 1,
        selection: { a: true },
        decisions: { a: 'useImported' },
      }
    );
    assert.equal(plan.folderOp, 'UPDATE');
    const lib = applyMergePlan(existing, 'Coletânea 2022', plan);
    assert.equal(lib[0].name, 'Coletânea 2018');
    assert.equal(lib[1].name, 'CIA 2018');
    assert.equal(lib[2].name, 'Coletânea 2022');
    assert.equal(lib[2].songs[0].content, 'NEW');
  });

  it('UPDATE same number different content → CONFLICT until decided', () => {
    const folder = {
      name: 'Coletânea 2022',
      type: 's',
      lang: 'pt',
      songs: [{ title: '200 - Teu povo clama', content: 'VERSAO A' }],
    };
    const plan = buildMergePlan(
      [{ key: 'x', title: '200 - Teu povo clama', content: 'VERSAO B' }],
      folder,
      { allocImportNumber: () => 1, decisions: {}, selection: { x: true } }
    );
    assert.equal(plan.items[0].status, 'CONFLICT');
  });

  it('UPDATE with useImported', () => {
    const folder = {
      name: 'Coletânea 2022',
      type: 's',
      lang: 'pt',
      songs: [{ title: '200 - Teu povo clama', content: 'VERSAO A' }],
    };
    const plan = buildMergePlan(
      [{ key: 'x', title: '200 - Teu povo clama', content: 'VERSAO B' }],
      folder,
      {
        allocImportNumber: () => 1,
        decisions: { x: 'useImported' },
        selection: { x: true },
      }
    );
    assert.equal(plan.items[0].status, 'UPDATE');
    const lib = applyMergePlan([folder], 'Coletânea 2022', plan);
    assert.equal(lib[0].songs[0].content, 'VERSAO B');
  });

  it('UNCHANGED when content equal', () => {
    const folder = {
      name: 'X',
      type: 's',
      lang: 'pt',
      songs: [{ title: '1 - A', content: 'Hello\n\nWorld' }],
    };
    const plan = buildMergePlan(
      [{ key: 'x', title: '1 - A', content: 'Hello\n\nWorld' }],
      folder,
      { allocImportNumber: () => 1, selection: { x: true }, decisions: {} }
    );
    assert.equal(plan.items[0].status, 'UNCHANGED');
  });

  it('assigns iN for unnumbered new song', () => {
    const folder = {
      name: 'Avulsos',
      type: 's',
      lang: 'pt',
      songs: [
        { title: 'i200 - Velho', content: 'a' },
        { title: 'i205 - Outro', content: 'b' },
      ],
    };
    const plan = buildMergePlan(
      [{ key: 'n', title: 'Novo louvor', content: 'c' }],
      folder,
      {
        allocImportNumber: () => getNextImportNumber(folder),
        selection: { n: true },
        decisions: {},
      }
    );
    assert.equal(plan.items[0].status, 'NEW');
    assert.match(plan.items[0].resolvedTitle, /^i206 -/);
  });

  it('unnumbered matching existing updates i205', () => {
    const folder = {
      name: 'Avulsos',
      type: 's',
      lang: 'pt',
      songs: [{ title: 'i205 - Teu povo clama', content: 'OLD' }],
    };
    const plan = buildMergePlan(
      [{ key: 'n', title: 'Teu povo clama', content: 'NEW' }],
      folder,
      {
        allocImportNumber: () => 300,
        decisions: { n: 'useImported' },
        selection: { n: true },
      }
    );
    assert.equal(plan.items[0].status, 'UPDATE');
    assert.equal(plan.items[0].resolvedTitle, 'i205 - Teu povo clama');
  });

  it('reimport without duplication when unchanged', () => {
    const folder = {
      name: 'C',
      type: 's',
      lang: 'pt',
      songs: [{ title: '1 - A', content: 'X' }],
    };
    const plan = buildMergePlan(
      [{ key: 'a', title: '1 - A', content: 'X' }],
      folder,
      { allocImportNumber: () => 1, selection: { a: true }, decisions: {} }
    );
    assert.equal(plan.statistics.unchanged, 1);
    const lib = applyMergePlan([folder], 'C', plan);
    assert.equal(lib[0].songs.length, 1);
  });

  it('contentEqual ignores html', () => {
    assert.ok(
      contentEqual(
        'FOO <font color="yellow"><i>CORO</i></font> BAR',
        'FOO CORO BAR'
      )
    );
  });
});
