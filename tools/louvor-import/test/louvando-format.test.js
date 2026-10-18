'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatLouvandoPraise,
  libraryNameForCollection,
  mapSearchHit,
} = require('../lib/louvando-format');

const CONHECAMOS_LYRICS =
  '<p><strong>Coro</strong></p>' +
  '<p>Conheçamos e prossigamos</p>' +
  '<p>Em conhecer ao Senhor,</p>' +
  '<p>Como a alva será a sua saída;</p>' +
  '<p>E ele a nós virá</p>' +
  '<p>Como a chuva que rega a terra.</p>' +
  '<p>&nbsp;</p>' +
  '<p>Queremos te conhecer, ó Deus,</p>' +
  '<p>Conhecer mais e mais de ti;</p>' +
  '<p>Queremos ver a tua face,</p>' +
  '<p>Contemplar o teu amor,</p>' +
  '<p>Queremos conhecer mais e mais</p>' +
  '<p>Tua vontade, Senhor.</p>' +
  '<p>Rega a nossa vida, Senhor,</p>' +
  '<p>Como a chuva serôdia</p>' +
  '<p>Que rega a terra;</p>' +
  '<p>Derrama em nossos corações</p>' +
  '<p>A chuva da tua unção.</p>' +
  '<p>&nbsp;</p>' +
  '<p><strong>Final:</strong></p>' +
  '<p>Renova os nossos corações,</p>' +
  '<p>Renova a nossa fé;</p>' +
  '<p>Como a alva será a sua saída;</p>' +
  '<p>E ele a nós virá</p>' +
  '<p>Jesus virá, Jesus virá!</p>';

describe('formatLouvandoPraise', () => {
  it('names the CIA folder and keeps an unnumbered title', () => {
    const song = formatLouvandoPraise({
      number: null,
      title: 'CONHEÇAMOS E PROSSIGAMOS',
      tone: 'E',
      collection: { name: 'Crianças, Intermediários e Adolescentes' },
      theme: { name: '-' },
      lyrics: CONHECAMOS_LYRICS,
    });
    assert.equal(song.libraryName, 'Louvando CIA');
    assert.equal(song.title, 'CONHEÇAMOS E PROSSIGAMOS (E)');
    assert.doesNotMatch(song.title, /^i\d+/);
    assert.equal(song.slides.length, 4);
    assert.equal((song.content.match(/CORO/g) || []).length, 1);
    assert.match(song.slides[0], /<font color="yellow"><i>CORO<\/i><\/font>/);
    assert.equal(song.slides[1].split('\n').length, 6);
    assert.match(song.slides[1], /Tua vontade, Senhor\.$/);
    assert.equal(song.slides[2].split('\n').length, 5);
    assert.match(song.slides[2], /^Rega a nossa vida, Senhor,/);
    assert.match(song.slides[2], /A chuva da tua unção\.$/);
    assert.match(song.slides[3], /<font color="yellow"><i>FINAL:<\/i><\/font>/);
    assert.equal(song.warnings.length, 1);
  });

  it('formats a numbered title and keeps the collection name', () => {
    const song = formatLouvandoPraise({
      number: 455,
      title: 'QUANTO MAIS EU TE CONHEÇO',
      tone: 'A',
      collection: { name: 'Coletânea ICM' },
      lyrics: '<p>Linha um</p><p>Linha dois</p>',
    });
    assert.equal(song.title, '455 - QUANTO MAIS EU TE CONHEÇO (A)');
    assert.equal(song.libraryName, 'Louvando Coletânea ICM');
    assert.equal(song.slides.length, 1);
    assert.equal(song.warnings.length, 0);
  });

  it('marks Cantar 2x and male and female voice tags', () => {
    const song = formatLouvandoPraise({
      title: 'VOZES',
      collection: { name: 'Avulsos' },
      lyrics:
        '<p>Linha um</p>' +
        '<p>Cantar 2x</p>' +
        '<p>(V)</p>' +
        '<p>Parte masculina</p>' +
        '<p>(servas)</p>' +
        '<p>Parte feminina</p>',
    });
    assert.equal(song.slides.length, 3);
    assert.match(song.slides[0], /Linha um/);
    assert.match(song.slides[0], /<font color="yellow"><i>\(2X\)<\/i><\/font>/);
    assert.doesNotMatch(song.content, /Cantar 2x/i);
    assert.match(song.slides[1], /<font color="yellow"><i>\(V\)<\/i><\/font>/);
    assert.match(song.slides[1], /Parte masculina/);
    assert.match(song.slides[2], /<font color="yellow"><i>\(SERVAS\)<\/i><\/font>/);
    assert.match(song.slides[2], /Parte feminina/);
  });

  it('keeps a short stanza that already fits', () => {
    const lines = [];
    for (let i = 1; i <= 7; i++) lines.push(`<p>Linha ${i}${i === 7 ? '.' : ''}</p>`);
    const song = formatLouvandoPraise({
      title: 'CURTO',
      tone: '',
      collection: { name: 'Avulsos' },
      lyrics: lines.join(''),
    });
    assert.equal(song.libraryName, 'Louvando Avulsos');
    assert.equal(song.title, 'CURTO');
    assert.equal(song.slides.length, 1);
    assert.equal(song.slides[0].split('\n').length, 7);
  });
});

describe('libraryNameForCollection', () => {
  it('abbreviates the children collection', () => {
    assert.equal(
      libraryNameForCollection('Crianças, Intermediários e Adolescentes'),
      'Louvando CIA'
    );
  });
});

describe('mapSearchHit', () => {
  it('keeps number, title, collection and theme', () => {
    const hit = mapSearchHit({
      short_id: 'VsP0IV67jg',
      number: null,
      title: 'CONHEÇAMOS E PROSSIGAMOS',
      tone: 'E',
      collection: { name: 'Crianças, Intermediários e Adolescentes' },
      theme: { name: '-' },
    });
    assert.equal(hit.id, 'VsP0IV67jg');
    assert.equal(hit.number, null);
    assert.equal(hit.libraryName, 'Louvando CIA');
    assert.equal(hit.theme, '-');
  });
});
