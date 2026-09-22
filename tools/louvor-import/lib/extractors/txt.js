'use strict';

const fs = require('fs');
const path = require('path');
const { createCanonicalSong } = require('../ir');
const { paginatePlainText } = require('../paginate');
const { parseTitleNumber } = require('../ir');

/**
 * Extract CanonicalSong(s) from TXT string content.
 * Heuristic: optional first line as title if looks like "N - TITLE" or ALL CAPS short line;
 * rest is body. Multiple songs separated by form-feed or line of ===.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.collection]
 * @param {string} [options.fileName] - used when title must be inferred
 */
function extractTxtContent(text, options = {}) {
  const collection = options.collection || '';
  const fileName = options.fileName || 'paste.txt';
  const chunks = String(text || '').split(/\n={3,}\n|\f/);
  const songs = [];
  const warnings = [];

  for (const chunk of chunks) {
    const chunkWarnings = [];
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
      titleLine = path.basename(fileName, path.extname(fileName));
      bodyLines = lines;
      chunkWarnings.push('título inferido do nome do arquivo');
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
          file: path.basename(fileName),
          collection,
        },
        sections,
        presentation: { mode: 'normalized', slides },
        needsReview: chunkWarnings.length > 0,
        warnings: chunkWarnings.slice(),
      })
    );
  }

  return {
    type: 'txt',
    file: fileName,
    songs,
    warnings,
  };
}

/**
 * Extract CanonicalSong(s) from a TXT file.
 */
function extractTxt(filePath, options = {}) {
  const text = fs.readFileSync(filePath, 'utf8');
  const result = extractTxtContent(text, {
    ...options,
    fileName: path.basename(filePath),
  });
  return {
    ...result,
    file: filePath,
  };
}

module.exports = { extractTxt, extractTxtContent };
