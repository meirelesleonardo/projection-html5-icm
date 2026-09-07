'use strict';

const fs = require('fs');
const path = require('path');
const { createCanonicalSong } = require('../ir');
const { paginatePlainText } = require('../paginate');
const { parseTitleNumber } = require('../ir');

/**
 * Extract CanonicalSong(s) from a TXT file.
 * Heuristic: optional first line as title if looks like "N - TITLE" or ALL CAPS short line;
 * rest is body. Multiple songs separated by form-feed or line of ===.
 */
function extractTxt(filePath, options = {}) {
  const text = fs.readFileSync(filePath, 'utf8');
  const collection = options.collection || '';
  const chunks = text.split(/\n={3,}\n|\f/);
  const songs = [];
  const warnings = [];

  for (const chunk of chunks) {
    const lines = chunk.replace(/\r\n/g, '\n').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) continue;

    let titleLine = lines[0].trim();
    let bodyLines = lines.slice(1);
    const parsed = parseTitleNumber(titleLine);
    const looksTitle =
      parsed.number != null ||
      (titleLine === titleLine.toUpperCase() && titleLine.length <= 80 && bodyLines.length);

    if (!looksTitle) {
      titleLine = path.basename(filePath, path.extname(filePath));
      bodyLines = lines;
      warnings.push('título inferido do nome do arquivo');
    }

    const { number, titleRaw } = parseTitleNumber(titleLine);
    const body = bodyLines.join('\n');
    const { slides, sections } = paginatePlainText(body);

    songs.push(
      createCanonicalSong({
        titleRaw: titleRaw || titleLine,
        number,
        collectionHint: collection,
        source: {
          type: 'txt',
          file: path.basename(filePath),
          collection,
        },
        sections,
        presentation: { mode: 'normalized', slides },
        needsReview: warnings.length > 0,
        warnings: warnings.slice(),
      })
    );
  }

  return {
    type: 'txt',
    file: filePath,
    songs,
    warnings,
  };
}

module.exports = { extractTxt };
