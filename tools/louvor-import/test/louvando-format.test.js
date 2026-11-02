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
    assert.equal(song.slides.length, 5);
    assert.equal((song.content.match(/CORO/g) || []).length, 2);
    assert.match(song.slides[0], /<font color="yellow"><i>CORO<\/i><\/font>/);
    assert.equal(song.slides[1].split('\n').length, 6);
    assert.match(song.slides[1], /Tua vontade, Senhor\.$/);
    assert.equal(song.slides[2].split('\n').length, 5);
    assert.match(song.slides[2], /^Rega a nossa vida, Senhor,/);
    assert.match(song.slides[2], /A chuva da tua unção\.$/);
    assert.equal(song.slides[3], song.slides[0]);
    assert.match(song.slides[4], /<font color="yellow"><i>FINAL:<\/i><\/font>/);
    assert.equal(song.warnings.length, 1);
  });

  it('treats number 0 as unnumbered', () => {
    const song = formatLouvandoPraise({
      number: 0,
      title: 'EU CLAMO PELO SANGUE DE JESUS',
      tone: '',
      collection: { name: 'Avulsos' },
      lyrics: '<p>Eu clamo pelo sangue de Jesus.</p>',
    });
    assert.equal(song.title, 'EU CLAMO PELO SANGUE DE JESUS');
    assert.equal(song.number, null);
    assert.doesNotMatch(song.title, /^0\b/);
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

  it('repeats a split chorus label and interleaves it after each verse', () => {
    const song = formatLouvandoPraise({
      title: 'PEGA A TUA PARTE, IRMÃO',
      tone: 'E',
      collection: { name: 'Avulsos' },
      lyrics:
        '<p><strong>Coro</strong></p>' +
        '<p>Pega a tua parte irmão,</p>' +
        '<p>A mesa está bem farta,</p>' +
        '<p>Pegue em abundância</p>' +
        '<p>Pois a tua esperança</p>' +
        '<p>Cristo não deixou morrer;</p>' +
        '<p>Encha o teu celeiro</p>' +
        '<p>De bênçãos espirituais,</p>' +
        '<p>Deixa que transborde,</p>' +
        '<p>Que derrame até que sobre,</p>' +
        '<p>Bençãos nunca são de mais.</p>' +
        '<p>&nbsp;</p>' +
        '<p>A mesa preparada em nossa frente,</p>' +
        '<p>O anjo com a bandeja em suas mãos,</p>' +
        '<p>Dos servos a cabeça é ungida,</p>' +
        '<p>Brasas vivas queimam o coração;</p>' +
        '<p>Cristo a cada um vai perguntando:</p>' +
        '<p>“Que queres que eu te faça, meu irmão”?</p>' +
        '<p>Hoje as bênçãos vêm em abundância,</p>' +
        '<p>Estende a Jesus Cristo a tua mão.</p>' +
        '<p>&nbsp;</p>' +
        '<p>O alimento desta festa é muito puro,</p>' +
        '<p>As bênçãos vão de cura à salvação,</p>' +
        '<p>Basta crer no nome de Jesus</p>' +
        '<p>Ele te dará a perfeição</p>' +
        '<p>Cristo a cada um vai perguntando:</p>' +
        '<p>“Que queres que eu te faça, meu irmão”?</p>' +
        '<p>Hoje as bênçãos vêm em abundância,</p>' +
        '<p>É só clamar o sangue de Jesus.</p>' +
        '<p>&nbsp;</p>' +
        '<p><strong>Final:</strong></p>' +
        '<p>Deixa que transborde</p>' +
        '<p>Que derrame até que sobre</p>' +
        '<p>Bênçãos nunca são de mais.</p>',
    });
    const coro = /<font color="yellow"><i>CORO<\/i><\/font>/;
    assert.equal(song.slides.length, 10);
    assert.match(song.slides[0], coro);
    assert.match(song.slides[0], /Cristo não deixou morrer;$/);
    assert.match(song.slides[1], coro);
    assert.match(song.slides[1], /Bençãos nunca são de mais\.$/);
    assert.match(song.slides[2], /^A mesa preparada em nossa frente,/);
    assert.match(song.slides[3], /Estende a Jesus Cristo a tua mão\.$/);
    assert.equal(song.slides[4], song.slides[0]);
    assert.equal(song.slides[5], song.slides[1]);
    assert.match(song.slides[6], /^O alimento desta festa é muito puro,/);
    assert.equal(song.slides[7], song.slides[0]);
    assert.equal(song.slides[8], song.slides[1]);
    assert.match(song.slides[9], /<font color="yellow"><i>FINAL:<\/i><\/font>/);
    assert.doesNotMatch(song.slides[9], coro);
  });

  it('does not duplicate a chorus the source already repeats', () => {
    const song = formatLouvandoPraise({
      title: 'JÁ REPETIDO',
      collection: { name: 'Avulsos' },
      lyrics:
        '<p>Verso um</p>' +
        '<p>&nbsp;</p>' +
        '<p><strong>Coro</strong></p>' +
        '<p>Linha do coro</p>' +
        '<p>&nbsp;</p>' +
        '<p>Verso dois</p>' +
        '<p>&nbsp;</p>' +
        '<p><strong>Coro</strong></p>' +
        '<p>Linha do coro</p>',
    });
    assert.equal(song.slides.length, 4);
    assert.equal(song.slides[0], 'Verso um');
    assert.match(song.slides[1], /CORO/);
    assert.match(song.slides[1], /Linha do coro/);
    assert.equal(song.slides[2], 'Verso dois');
    assert.equal(song.slides[3], song.slides[1]);
  });

  it('expands repetir o louvor and ignores a fake number 0', () => {
    const song = formatLouvandoPraise({
      number: 0,
      title: 'EU CLAMO PELO SANGUE DE JESUS',
      tone: '',
      collection: { name: 'Avulsos' },
      lyrics:
        '<p>Eu clamo pelo sangue de Jesus,</p>' +
        '<p>Que traz a comunhão, libertação e poder.</p>' +
        '<p>Entrego a ti, Senhor todo o meu ser.</p>' +
        '<p>&nbsp;</p>' +
        '<p>Purifica-me, Senhor, com teu sangue remidor. </p>' +
        '<p>Justifica-me, Jesus, com este sangue</p>' +
        '<p>Que um dia derramaste naquela cruz,</p>' +
        '<p>Só por me amar e vida eterna dar.</p>' +
        '<p>&nbsp;</p>' +
        '<p><strong>Instrumentos</strong></p>' +
        '<p>&nbsp;</p>' +
        '<p><strong>Repetir o louvor</strong></p>',
    });
    assert.equal(song.title, 'EU CLAMO PELO SANGUE DE JESUS');
    assert.equal(song.number, null);
    assert.equal(song.slides.length, 6);
    assert.match(song.slides[0], /^Eu clamo pelo sangue de Jesus,/);
    assert.match(song.slides[1], /^Purifica-me, Senhor,/);
    assert.match(song.slides[2], /INSTRUMENTOS/);
    assert.equal(song.slides[3], song.slides[0]);
    assert.equal(song.slides[4], song.slides[1]);
    assert.equal(song.slides[5], song.slides[2]);
    assert.doesNotMatch(song.content, /Repetir o louvor/i);
  });

  it('repeats only the first stanza or the whole song from voltar inicio', () => {
    const first = formatLouvandoPraise({
      title: 'PRIMEIRA',
      collection: { name: 'Avulsos' },
      lyrics:
        '<p>Estrofe um</p><p>&nbsp;</p><p>Estrofe dois</p><p>&nbsp;</p>' +
        '<p>Repetir a primeira estrofe</p>',
    });
    assert.deepEqual(first.slides, ['Estrofe um', 'Estrofe dois', 'Estrofe um']);

    const again = formatLouvandoPraise({
      title: 'INICIO',
      collection: { name: 'Avulsos' },
      lyrics: '<p>Estrofe um</p><p>&nbsp;</p><p>Estrofe dois</p><p>&nbsp;</p><p>Voltar início</p>',
    });
    assert.deepEqual(again.slides, ['Estrofe um', 'Estrofe dois', 'Estrofe um', 'Estrofe dois']);
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
    assert.equal(mapSearchHit({ short_id: 'ckgRsvBSKw', number: 0, title: 'EU CLAMO' }).number, null);
    assert.equal(hit.libraryName, 'Louvando CIA');
    assert.equal(hit.theme, '-');
  });
});
