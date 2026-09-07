'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const {
  segmentSongsByIndexMarker,
  segmentSongsAuto,
  detectUnnumberedTitle,
  extractPptx,
} = require('../lib/extractors/pptx');
const { canonicalToSong } = require('../lib/format-song');
const { buildMergePlan } = require('../../../server/import/merge-engine');

describe('pptx unnumbered / avulsos', () => {
  it('detectUnnumberedTitle prefers short footer title', () => {
    const t = detectUnnumberedTitle([
      'ESSAS LÁGRIMAS QUE ESCORREM DOS TEUS OLHOS',
      'SÓ JESUS É QUE PODE ENXUGÁ-LAS,',
      'Torre forte',
    ]);
    assert.equal(t.titleRaw, 'Torre forte');
  });

  it('detectUnnumberedTitle uses short first line when last is lyric', () => {
    const t = detectUnnumberedTitle([
      'SHEKINAH',
      'CORO',
      'Ó SENHOR, A TI CLAMO',
      'COM TUA PRESENÇA, A TUA SHEKINAH.',
    ]);
    assert.equal(t.titleRaw, 'SHEKINAH');
  });

  it('segmentSongsByIndexMarker splits on Índice and strips it', () => {
    const records = [
      {
        index: 1,
        lines: ['SHEKINAH', 'CORO', 'Ó SENHOR, A TI CLAMO'],
        skip: false,
        warnings: [],
      },
      {
        index: 2,
        lines: ['CONTINUAÇÃO', 'FINAL: SHEKINAH', 'Índice'],
        skip: false,
        warnings: [],
      },
      {
        index: 3,
        lines: [
          'ESSAS LÁGRIMAS QUE ESCORREM DOS TEUS OLHOS',
          'CRISTO QUER SER SEU AMIGO;',
          'Torre forte',
        ],
        skip: false,
        warnings: [],
      },
      {
        index: 4,
        lines: ['CORO', 'TORRE FORTE', 'Índice'],
        skip: false,
        warnings: [],
      },
    ];

    const songs = segmentSongsByIndexMarker(records);
    assert.equal(songs.length, 2);
    assert.equal(songs[0].number, null);
    assert.equal(songs[0].titleRaw, 'SHEKINAH');
    assert.equal(songs[1].titleRaw, 'Torre forte');

    const allLines = songs.flatMap((s) => s.slides.flatMap((sl) => sl.lines));
    assert.ok(!allLines.some((l) => /^[ií]ndice$/i.test(l)));
    assert.ok(!songs[0].slides[0].lines.includes('SHEKINAH'));
    assert.ok(!songs[1].slides[0].lines.includes('Torre forte'));
  });

  it('segmentSongsAuto falls back when no numbered titles', () => {
    const records = [
      { index: 1, lines: ['TÍTULO UM', 'letra'], skip: false, warnings: [] },
      { index: 2, lines: ['fim', 'Índice'], skip: false, warnings: [] },
    ];
    const songs = segmentSongsAuto(records);
    assert.equal(songs.length, 1);
    assert.equal(songs[0].number, null);
    assert.equal(songs[0].titleRaw, 'TÍTULO UM');
  });

  it('merge assigns iN for unnumbered extracted titles', () => {
    const plan = buildMergePlan(
      [
        { key: 'a', title: 'SHEKINAH', content: 'A' },
        { key: 'b', title: 'Torre forte', content: 'B' },
      ],
      null,
      {
        allocImportNumber: (() => {
          let n = 1;
          return () => n++;
        })(),
        selection: { a: true, b: true },
        decisions: {},
      }
    );
    assert.equal(plan.items[0].resolvedTitle, 'i1 - SHEKINAH');
    assert.equal(plan.items[1].resolvedTitle, 'i2 - Torre forte');
  });
});

describe('pptx avulsos smoke', () => {
  it('extracts LOUVORES AVULSOS pptx with many unnumbered songs', (t) => {
    const pptx = path.join(
      __dirname,
      '../../../docs/LOUVORES AVULSOS_Rev_31.12.22.pptx'
    );
    if (!fs.existsSync(pptx)) {
      t.skip('PPTX fixture not present');
      return;
    }
    const doc = extractPptx(pptx);
    assert.ok(doc.songs.length >= 80, `expected ≥80 songs, got ${doc.songs.length}`);
    assert.ok(doc.songs.every((s) => s.metadata.number == null));
    const official = doc.songs.slice(0, 3).map(canonicalToSong);
    assert.ok(official.every((s) => s.title && !/^\d+\s*-/.test(s.title)));
    assert.ok(official.every((s) => s.content && !/[ií]ndice/i.test(s.content)));
  });
});
