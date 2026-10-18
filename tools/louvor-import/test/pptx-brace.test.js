'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { slidesToContent } = require('../lib/markers');
const { buildSlideLayout, splitDenseLines } = require('../lib/pptx-layout');
const { extractPptx, presentSlideLines, filterLayoutTokens } = require('../lib/extractors/pptx');
const { canonicalToSong } = require('../lib/format-song');

function para(text, sz) {
  const size = sz || 2900;
  return (
    '<a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr>' +
    '<a:r><a:rPr sz="' +
    size +
    '"/><a:t>' +
    text +
    '</a:t></a:r></a:p>'
  );
}

function textBox(box, paragraphs, extraBody) {
  const body =
    extraBody ||
    'wrap="square" lIns="74498" tIns="37251" rIns="74498" bIns="37251"';
  return (
    '<p:sp><p:spPr><a:xfrm><a:off x="' +
    box.x +
    '" y="' +
    box.y +
    '"/><a:ext cx="' +
    box.cx +
    '" cy="' +
    box.cy +
    '"/></a:xfrm><a:prstGeom prst="rect"/></p:spPr><p:txBody><a:bodyPr ' +
    body +
    '/>' +
    paragraphs +
    '</p:txBody></p:sp>'
  );
}

function braceBox(box) {
  return (
    '<p:sp><p:spPr><a:xfrm><a:off x="' +
    box.x +
    '" y="' +
    box.y +
    '"/><a:ext cx="' +
    box.cx +
    '" cy="' +
    box.cy +
    '"/></a:xfrm><a:prstGeom prst="rightBrace"/></p:spPr><p:txBody><a:bodyPr anchor="ctr"/></p:txBody></p:sp>'
  );
}

function labelBox(box, text) {
  return textBox(box, para(text, 2800));
}

function contentOf(xml, titleNumber) {
  const laid = buildSlideLayout(xml);
  const tokens = laid.hasBrace ? filterLayoutTokens(laid.tokens, titleNumber, null) : null;
  const lines = tokens || [];
  const presented = presentSlideLines(lines);
  return {
    laid,
    slides: presented.pieces.map((piece) => slidesToContent([{ lines: piece }])),
  };
}

function plainLines(html) {
  return String(html || '')
    .replace(/<blockquote[^>]*>/g, '')
    .replace(/<\/blockquote>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

describe('pptx graphic brace', () => {
  it('wraps only the two lines beside the brace (louvor 10)', () => {
    const xml =
      textBox(
        { x: 638092, y: 1746932, cx: 8496943, cy: 3758225 },
        para('VAMOS LAVAR AS VESTES') +
          para('NO SANGUE DO CORDEIRO.') +
          '<a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr></a:p>' +
          para('QUANDO JESUS VIER NAQUELE GRANDE DIA,') +
          para('AS VESTES ESTANDO LIMPAS,') +
          para('TEMOS PAZ E ALEGRIA.')
      ) +
      braceBox({ x: 5976950, y: 1845618, cx: 252147, cy: 1220616 }) +
      labelBox({ x: 6229097, y: 2202861, cx: 782931, cy: 506129 }, 'BIS') +
      textBox(
        { x: 2988618, y: 345644, cx: 5976664, cy: 707886 },
        para('10 - VAMOS LAVAR AS VESTES', 4000)
      );

    const { laid, slides } = contentOf(xml, 10);
    assert.equal(laid.warnings.length, 0);
    assert.equal(slides.length, 1);
    assert.match(
      slides[0],
      /^<blockquote class="chave-bis-small">VAMOS LAVAR AS VESTES\nNO SANGUE DO CORDEIRO\.<\/blockquote>\nQUANDO JESUS VIER NAQUELE GRANDE DIA,/
    );
    assert.doesNotMatch(slides[0], /\(BIS\)/);
    assert.doesNotMatch(slides[0], /10 - VAMOS/);
  });

  it('keeps two braces on their own line pairs', () => {
    const xml =
      textBox(
        { x: 396330, y: 2288486, cx: 8180713, cy: 3432655 },
        para('O ANJO DO SENHOR ESTÁ PASSEANDO,') +
          para('ESTÁ PASSEANDO AQUI NESTE LUGAR.') +
          '<a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr></a:p>' +
          para('DÁ LUGAR, IRMÃO, DÁ LUGAR, IRMÃO,') +
          para('E DEIXA O ANJO DO SENHOR TE VISITAR.'),
        'wrap="square" tIns="45712" bIns="45712"'
      ) +
      braceBox({ x: 7813154, y: 2478086, cx: 221676, cy: 1025031 }) +
      labelBox({ x: 8053935, y: 2728991, cx: 812279, cy: 523220 }, 'BIS') +
      braceBox({ x: 8072836, y: 4547041, cx: 221676, cy: 1025031 }) +
      labelBox({ x: 8313617, y: 4797946, cx: 812279, cy: 523220 }, 'BIS');

    const { slides } = contentOf(xml);
    assert.equal(slides.length, 1);
    assert.match(
      slides[0],
      /<blockquote class="chave-bis-small">O ANJO DO SENHOR ESTÁ PASSEANDO,\nESTÁ PASSEANDO AQUI NESTE LUGAR\.<\/blockquote>/
    );
    assert.match(
      slides[0],
      /<blockquote class="chave-bis-small">DÁ LUGAR, IRMÃO, DÁ LUGAR, IRMÃO,\nE DEIXA O ANJO DO SENHOR TE VISITAR\.<\/blockquote>/
    );
    assert.doesNotMatch(slides[0], /\(BIS\)/);
  });

  it('leaves an unmatched brace as a yellow BIS and a review warning', () => {
    const xml =
      textBox(
        { x: 1000, y: 1000, cx: 4000000, cy: 800000 },
        para('UMA LINHA CURTA.')
      ) +
      braceBox({ x: 5000000, y: 8000000, cx: 200000, cy: 400000 }) +
      labelBox({ x: 5300000, y: 8100000, cx: 700000, cy: 400000 }, 'BIS');
    const laid = buildSlideLayout(xml);
    assert.ok(laid.warnings.some((w) => /sem linhas/.test(w)));
    assert.ok(laid.tokens.includes('BIS'));
    assert.ok(laid.tokens.includes('UMA LINHA CURTA.'));
  });
});

describe('pptx line fit', () => {
  it('turns an inline (BIS) into a yellow label and does not duplicate the line', () => {
    const presented = presentSlideLines([
      'HÁ VITÓRIA PARA MIM, (BIS)',
      'PELO SANGUE DO CORDEIRO,',
    ]);
    const content = slidesToContent([{ lines: presented.pieces[0] }]);
    assert.match(content, /HÁ VITÓRIA PARA MIM\n/);
    assert.match(content, /<font color="yellow"><i>\(BIS\)<\/i><\/font>/);
    assert.equal(content.split('VITÓRIA').length, 2);
  });

  it('wraps a phrase longer than 38 characters on word boundaries', () => {
    const presented = presentSlideLines([
      'GRANDE É O SENHOR E MUI DIGNO DE LOUVOR, NA CIDADE DO NOSSO DEUS,',
      'DELE NOS PROSTRAMOS.',
    ]);
    assert.equal(presented.pieces.length, 1);
    const lines = presented.pieces[0];
    assert.deepEqual(lines, [
      'GRANDE É O SENHOR E MUI DIGNO DE',
      'LOUVOR, NA CIDADE DO NOSSO DEUS,',
      'DELE NOS PROSTRAMOS.',
    ]);
    assert.ok(lines.every((l) => l.length <= 38));
  });

  it('splits a stanza only after it passes 9 lines and keeps a chave whole', () => {
    const short = [];
    for (let i = 1; i <= 8; i++) short.push(i === 4 ? 'FRASE;' : 'LINHA ' + i);
    assert.equal(splitDenseLines(short).length, 1);

    const chave = { kind: 'chave', label: 'BIS', lines: ['PRIMEIRA.', 'SEGUNDA.'] };
    const tall = [chave];
    for (let i = 1; i <= 8; i++) tall.push('VERSO ' + i + (i === 8 ? '.' : ''));
    const presented = presentSlideLines(tall);
    assert.ok(presented.pieces.length >= 2);
    const chaveSlides = presented.pieces.filter((piece) =>
      piece.some((l) => l && l.marker === 'chave')
    );
    assert.equal(chaveSlides.length, 1);
    const chaveLine = chaveSlides[0].find((l) => l && l.marker === 'chave');
    assert.deepEqual(chaveLine.lines, ['PRIMEIRA.', 'SEGUNDA.']);
    assert.ok(presented.pieces.every((piece) => piece.length >= 1));
  });
});

describe('pptx 2022 samples', () => {
  const root = path.join(__dirname, '../../..');
  const pptxName = fs.existsSync(root)
    ? fs.readdirSync(root).find((n) => /2022\.pptx$/i.test(n) && !/avulsos/i.test(n))
    : null;
  const pptx = pptxName ? path.join(root, pptxName) : '';

  const run = pptx ? it : it.skip;

  run('louvor 10 uses chave-bis-small on the first two lines only', () => {
    const doc = extractPptx(pptx, { onlyNumbers: [10] });
    const song = canonicalToSong(doc.songs[0]);
    assert.match(
      song.content,
      /<blockquote class="chave-bis-small">VAMOS LAVAR AS VESTES\nNO SANGUE DO CORDEIRO\.<\/blockquote>\nQUANDO JESUS VIER NAQUELE GRANDE DIA,\nAS VESTES ESTANDO LIMPAS,\nTEMOS PAZ E ALEGRIA\./
    );
    assert.doesNotMatch(song.content, /\(BIS\)/);
  });

  run('louvor 656 keeps two slides and no line longer than 38 characters', () => {
    const doc = extractPptx(pptx, { onlyNumbers: [656] });
    const song = canonicalToSong(doc.songs[0]);
    const slides = song.content.split(/\n\n/);
    assert.equal(slides.length, 2);
    assert.match(slides[0], /GRANDE É O SENHOR E MUI DIGNO DE\nLOUVOR, NA CIDADE DO NOSSO DEUS,/);
    assert.match(slides[1], /QUEREMOS O TEU NOME ENGRANDECER E\nAGRADECER-TE POR TUA OBRA EM NOSSA\nVIDA;/);
    const lines = plainLines(song.content);
    assert.ok(
      lines.every((l) => l.length <= 38),
      lines.filter((l) => l.length > 38).join(' | ')
    );
    assert.doesNotMatch(song.content, /DIGNO DE LOUVOR, NA CIDADE/);
    assert.doesNotMatch(song.content, /ENGRANDECER E AGRADECER-TE/);
  });
});
