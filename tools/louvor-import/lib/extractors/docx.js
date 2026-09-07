'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createCanonicalSong, parseTitleNumber } = require('../ir');
const { paginatePlainText } = require('../paginate');

/**
 * DOCX is OOXML zip: word/document.xml
 */
function extractDocx(filePath, options = {}) {
  const collection = options.collection || '';
  let xml;
  try {
    xml = execFileSync('unzip', ['-p', filePath, 'word/document.xml'], {
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error(`Falha ao ler DOCX: ${e.message}`);
  }

  const paras = [];
  const parts = xml.split(/<\/w:p>/i);
  for (const part of parts) {
    const texts = [];
    // <w:t> only — not <w:tr>/<w:tc>/<w:tbl>
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi;
    let m;
    while ((m = re.exec(part))) {
      texts.push(
        m[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
      );
    }
    const line = texts.join('').replace(/\s+/g, ' ').trim();
    if (line) paras.push(line);
  }

  if (!paras.length) {
    return {
      type: 'docx',
      file: filePath,
      songs: [],
      warnings: ['DOCX sem texto extraível'],
    };
  }

  let titleLine = paras[0];
  let body = paras.slice(1).join('\n');
  const parsed = parseTitleNumber(titleLine);
  if (parsed.number == null && titleLine.length > 100) {
    titleLine = path.basename(filePath, path.extname(filePath));
    body = paras.join('\n');
  }

  const { number, titleRaw } = parseTitleNumber(titleLine);
  const { slides, sections } = paginatePlainText(body);

  const song = createCanonicalSong({
    titleRaw: titleRaw || titleLine,
    number,
    collectionHint: collection,
    source: { type: 'docx', file: path.basename(filePath), collection },
    sections,
    presentation: { mode: 'normalized', slides },
    needsReview: true,
    warnings: ['DOCX importado em modo normalized — revisar quebras'],
  });

  return { type: 'docx', file: filePath, songs: [song], warnings: song.warnings };
}

module.exports = { extractDocx };
