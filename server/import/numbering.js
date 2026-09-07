'use strict';

/**
 * Title / folder name normalization and iN numbering for imports.
 */

const IMPORT_NUM_RE = /^i(\d+)\s*[-–—]\s*(.+)$/i;
const PLAIN_NUM_RE = /^(\d+)\s*[-–—]\s*(.+)$/;

function normalizeName(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {{ kind: 'numeric'|'import'|'none', number: number|null, titleRaw: string, importKey: string|null }}
 */
function parseSongIdentity(title) {
  const raw = String(title || '').trim();
  let m = raw.match(IMPORT_NUM_RE);
  if (m) {
    return {
      kind: 'import',
      number: Number(m[1]),
      titleRaw: m[2].trim(),
      importKey: `i${Number(m[1])}`,
    };
  }
  m = raw.match(PLAIN_NUM_RE);
  if (m) {
    return {
      kind: 'numeric',
      number: Number(m[1]),
      titleRaw: m[2].trim(),
      importKey: null,
    };
  }
  return { kind: 'none', number: null, titleRaw: raw, importKey: null };
}

function formatNumericTitle(number, titleRaw) {
  return `${Number(number)} - ${String(titleRaw || '').trim()}`;
}

function formatImportTitle(n, titleRaw) {
  return `i${Number(n)} - ${String(titleRaw || '').trim()}`;
}

/**
 * Next iN for a folder. Always MAX(iN)+1; if none, start at i1.
 * Optionally scan extra titles (e.g. from applied jobs) via extraTitles[].
 */
function getNextImportNumber(folderOrSongs, extraTitles = []) {
  const songs = Array.isArray(folderOrSongs)
    ? folderOrSongs
    : (folderOrSongs && folderOrSongs.songs) || [];
  let max = 0;
  const scan = (title) => {
    const id = parseSongIdentity(title);
    if (id.kind === 'import' && id.number > max) max = id.number;
  };
  for (const s of songs) scan(s.title);
  for (const t of extraTitles) scan(t);
  return max + 1;
}

function suggestLibraryNameFromFile(filename) {
  let base = String(filename || 'Coletânea')
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "01.COLETÂNEA IGREJAS-2022 PROJETOR-4.3" → try to find year
  const year = base.match(/(20\d{2})/);
  if (/colet[aâ]nea/i.test(base) && year) {
    return `Coletânea ${year[1]}`;
  }
  if (year && base.length > 40) {
    return `Coletânea ${year[1]}`;
  }
  // Title-case lightly
  if (base.length > 80) base = base.slice(0, 80).trim();
  return base || 'Coletânea importada';
}

module.exports = {
  normalizeName,
  parseSongIdentity,
  formatNumericTitle,
  formatImportTitle,
  getNextImportNumber,
  suggestLibraryNameFromFile,
  IMPORT_NUM_RE,
  PLAIN_NUM_RE,
};
