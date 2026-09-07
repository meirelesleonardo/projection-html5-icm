'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { songToCanonical } = require('../lib/parse-song');
const { canonicalToSong } = require('../lib/format-song');
const { normalizeForCompare, validateCanonical, validateOfficialSong } = require('../lib/validate');
const { classifyLabel, annotatePlainLines, slidesToContent } = require('../lib/markers');
const { paginatePlainText } = require('../lib/paginate');
const { buildLibraryIndex, classifyDuplicate } = require('../lib/duplicates');

const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-songs.json'), 'utf8')
);

describe('round-trip JSON → IR → JSON', () => {
  for (const song of fixtures) {
    it(`preserves ${song.title}`, () => {
      const ir = songToCanonical(song, { type: 'json', collection: 'Coletânea 2018' });
      const back = canonicalToSong(ir);
      assert.equal(
        normalizeForCompare(back.title),
        normalizeForCompare(song.title)
      );
      assert.equal(
        song.content.split(/\n\n+/).length,
        back.content.split(/\n\n+/).length
      );
      assert.equal(normalizeForCompare(back.content), normalizeForCompare(song.content));
      const v = validateOfficialSong(back);
      assert.equal(v.ok, true, v.errors.join(';'));
    });
  }
});

describe('markers', () => {
  it('classifies CORO and BIS', () => {
    assert.equal(classifyLabel('CORO').type, 'chorus');
    assert.equal(classifyLabel('(BIS)').kind, 'repeat');
    assert.equal(classifyLabel('CORO (2X)').type, 'chorus');
    assert.equal(classifyLabel('(3X)').repeat.n, 3);
  });

  it('does not treat ponte lyric as section', () => {
    const { slideLines } = annotatePlainLines(['ÉS A PONTE PARA O CÉU']);
    assert.equal(typeof slideLines[0], 'string');
  });
});

describe('paginate deterministic', () => {
  it('same input → same output', () => {
    const text = Array.from({ length: 20 }, (_, i) => `LINHA NUMERO ${i + 1} DO VERSO`).join(
      '\n'
    );
    const a = paginatePlainText(text);
    const b = paginatePlainText(text);
    assert.deepEqual(a.slides, b.slides);
    assert.ok(a.slides.length >= 3);
  });
});

describe('duplicates', () => {
  it('flags same song different version', () => {
    const library = [
      {
        name: 'Coletânea 2018',
        type: 's',
        lang: 'pt',
        songs: [fixtures[0]],
      },
    ];
    const index = buildLibraryIndex(library);
    const ir = songToCanonical(fixtures[0], { collection: '2022' });
    const dup = classifyDuplicate(ir, index, { targetFolderName: 'Coletânea 2022' });
    assert.equal(dup.code, 'SAME_SONG_DIFFERENT_VERSION');
  });
});

describe('validate', () => {
  it('rejects empty title on import', () => {
    const ir = songToCanonical(fixtures[0]);
    ir.metadata.titleRaw = '';
    const v = validateCanonical(ir);
    assert.equal(v.ok, false);
  });
});
