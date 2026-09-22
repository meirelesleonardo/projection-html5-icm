'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeManualPaste } = require('../lib/manual-paste');

describe('normalizeManualPaste', () => {
  it('splits blank lines into slides', () => {
    const r = normalizeManualPaste('1 - Teste\nLinha A\nLinha B\n\nLinha C\nLinha D');
    assert.equal(r.title, '1 - Teste');
    const slides = r.content.split('\n\n');
    assert.equal(slides.length, 2);
    assert.match(slides[0], /Linha A/);
    assert.match(slides[1], /Linha C/);
  });

  it('detects CORO and interleaves after each verse', () => {
    const r = normalizeManualPaste(
      [
        '10 - EXEMPLO',
        'Linha A',
        'Linha B',
        '',
        'CORO',
        'Linha do coro 1',
        'Linha do coro 2',
        '',
        'Linha C',
        'Linha D',
      ].join('\n')
    );
    const slides = r.content.split('\n\n');
    assert.equal(slides.length, 4);
    assert.match(slides[0], /^Linha A/);
    assert.match(slides[1], /CORO/);
    assert.match(slides[1], /Linha do coro 1/);
    assert.match(slides[2], /^Linha C/);
    assert.match(slides[3], /CORO/);
    assert.equal(slides[1], slides[3]);
  });

  it('expands repetir primeira estrofe', () => {
    const r = normalizeManualPaste(
      ['Nome Livre', 'Estrofe um', '', 'Estrofe dois', '', 'repetir primeira estrofe'].join('\n')
    );
    const slides = r.content.split('\n\n');
    assert.equal(slides[0], 'Estrofe um');
    assert.equal(slides[1], 'Estrofe dois');
    assert.equal(slides[2], 'Estrofe um');
    assert.equal(r.title, 'Nome Livre');
  });

  it('expands repetir o louvor', () => {
    const r = normalizeManualPaste(
      ['Título', 'A', '', 'B', '', 'repetir o louvor'].join('\n')
    );
    const slides = r.content.split('\n\n');
    assert.deepEqual(slides, ['A', 'B', 'A', 'B']);
  });

  it('keeps iN title prefix', () => {
    const r = normalizeManualPaste('i12 - Meu Louvor\nTexto\n');
    assert.equal(r.title, 'i12 - Meu Louvor');
  });

  it('converts BIS to yellow without duplicating', () => {
    const r = normalizeManualPaste('X\nVerso\n\n(BIS)\n');
    const slides = r.content.split('\n\n');
    assert.equal(slides.length, 2);
    assert.match(slides[1], /yellow/);
    assert.match(slides[1], /\(BIS\)/);
  });
});
