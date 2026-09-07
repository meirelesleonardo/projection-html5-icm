'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createCanonicalSong, parseTitleNumber } = require('../ir');
const { paginatePlainText } = require('../paginate');

function extractPdf(filePath, options = {}) {
  const collection = options.collection || '';
  let text;
  try {
    text = execFileSync('pdftotext', ['-layout', filePath, '-'], {
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error(`pdftotext falhou: ${e.message}`);
  }

  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return {
      type: 'pdf',
      file: filePath,
      songs: [],
      warnings: [
        'PDF sem texto (possível scan). Use OCR ou caminho deck PNG.',
      ],
    };
  }

  // Split songs on form feed or numbered headers
  const chunks = trimmed.split(/\f+/).map((c) => c.trim()).filter(Boolean);
  const songs = [];

  for (const chunk of chunks) {
    const lines = chunk.split(/\n/).map((l) => l.trimEnd());
    const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
    if (!nonEmpty.length) continue;

    let titleLine = nonEmpty[0];
    let bodyLines = nonEmpty.slice(1);
    const parsed = parseTitleNumber(titleLine);
    if (parsed.number == null && chunks.length === 1) {
      // single doc: keep first as title if short
      if (titleLine.length > 80) {
        titleLine = path.basename(filePath, path.extname(filePath));
        bodyLines = nonEmpty;
      }
    }

    const { number, titleRaw } = parseTitleNumber(titleLine);
    const { slides, sections } = paginatePlainText(bodyLines.join('\n'));
    songs.push(
      createCanonicalSong({
        titleRaw: titleRaw || titleLine,
        number,
        collectionHint: collection,
        source: { type: 'pdf', file: path.basename(filePath), collection },
        sections,
        presentation: { mode: 'normalized', slides },
        needsReview: true,
        warnings: ['PDF importado em modo normalized — revisar'],
      })
    );
  }

  return {
    type: 'pdf',
    file: filePath,
    songs,
    warnings: songs.length ? [] : ['nenhum louvor detectado'],
  };
}

module.exports = { extractPdf };
