'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatLyricLine,
  dialectToContent,
  htmlToDialect,
} = require('../lib/lyric-markup');
const { slidesToContent } = require('../lib/markers');
const { formatLouvandoPraise } = require('../lib/louvando-format');
const { normalizeManualPaste } = require('../lib/manual-paste');

describe('formatLyricLine', () => {
  it('highlights a parenthetical and keeps the parentheses', () => {
    const html = formatLyricLine('Jesus (amém) virá');
    assert.equal(
      html,
      'Jesus <font color="yellow"><i>(amém)</i></font> virá'
    );
  });

  it('does not wrap a line that is already tagged', () => {
    const tagged = '<font color="yellow"><i>(2X)</i></font>';
    assert.equal(formatLyricLine(tagged), tagged);
  });
});

describe('dialectToContent', () => {
  it('turns a multi-line brace into chave-2x on the same slide', () => {
    const content = dialectToContent('aaaaa\n{bbbbb\ncccc}2x');
    assert.equal(
      content,
      'aaaaa\n<blockquote class="chave-2x">bbbbb\ncccc</blockquote>'
    );
  });

  it('maps bis braces and does not repeat the chorus after the next slide', () => {
    const content = dialectToContent('CORO\nlinha\n\n{volta\naqui}bis');
    const slides = content.split('\n\n');
    assert.equal(slides.length, 2);
    assert.equal(slides[0], '<font color="yellow"><i>CORO</i></font>\nlinha');
    assert.equal(slides[1], '<blockquote class="chave-bis">volta\naqui</blockquote>');
  });

  it('keeps (2X) as a single yellow label', () => {
    const content = dialectToContent('(2X)');
    assert.equal(content, '<font color="yellow"><i>(2X)</i></font>');
    assert.equal((content.match(/<font/g) || []).length, 1);
  });
});

describe('htmlToDialect', () => {
  it('round-trips braces, chorus and parentheses', () => {
    const original = dialectToContent(
      'aaaaa\n{bbbbb\ncccc}2x\n\nCORO\nJesus (amém) virá\n\nFINAL:'
    );
    const back = htmlToDialect(original);
    assert.equal(dialectToContent(back), original);
    assert.match(back, /\{bbbbb\ncccc\}2x/);
    assert.match(back, /^CORO$/m);
    assert.match(back, /Jesus \(amém\) virá/);
  });
});

describe('import paths', () => {
  it('highlights parentheses in collection slides', () => {
    const content = slidesToContent([{ lines: ['Glória (em voz baixa)'] }]);
    assert.match(content, /<font color="yellow"><i>\(em voz baixa\)<\/i><\/font>/);
  });

  it('highlights parentheses from Louvando without retagging (2X)', () => {
    const song = formatLouvandoPraise({
      title: 'PARENTESES',
      collection: { name: 'Avulsos' },
      lyrics: '<p>Canto (suave) aqui</p><p>&nbsp;</p><p>(2X)</p>',
    });
    assert.match(song.slides[0], /<font color="yellow"><i>\(suave\)<\/i><\/font>/);
    assert.equal(song.slides[1], '<font color="yellow"><i>(2X)</i></font>');
  });

  it('highlights parentheses in manual paste and keeps voice tags', () => {
    const r = normalizeManualPaste('Nome\nCanto (suave)\n\nAmém (V)\n');
    const slides = r.content.split('\n\n');
    assert.match(slides[0], /<font color="yellow"><i>\(suave\)<\/i><\/font>/);
    assert.match(slides[1], /^Amém\n/);
    assert.match(slides[1], /<font color="yellow"><i>\(V\)<\/i><\/font>/);
  });
});
