'use strict';

const { parseTitleNumber, stripHtml } = require('./ir');
const { normalizeForCompare } = require('./validate');

function tokenize(s) {
  return normalizeForCompare(s)
    .split(' ')
    .filter(Boolean);
}

function jaccard(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

/**
 * Build index from library folders for duplicate checks.
 */
function buildLibraryIndex(library) {
  const entries = [];
  for (let fi = 0; fi < (library || []).length; fi++) {
    const folder = library[fi];
    if (!folder || !Array.isArray(folder.songs)) continue;
    for (let si = 0; si < folder.songs.length; si++) {
      const song = folder.songs[si];
      const { number, titleRaw } = parseTitleNumber(song.title);
      entries.push({
        folderIndex: fi,
        songIndex: si,
        folderName: folder.name,
        title: song.title,
        number,
        titleNorm: normalizeForCompare(titleRaw || song.title),
        contentNorm: normalizeForCompare(song.content),
      });
    }
  }
  return entries;
}

/**
 * Classify duplicate status for one CanonicalSong or official song vs index.
 * @returns {{ code, matches: array, score: number }}
 */
function classifyDuplicate(candidate, index, opts = {}) {
  const exactThreshold = opts.exactThreshold != null ? opts.exactThreshold : 0.98;
  const possibleThreshold = opts.possibleThreshold != null ? opts.possibleThreshold : 0.72;
  const targetFolder = opts.targetFolderName || '';

  let title = '';
  let content = '';
  let number = null;

  if (candidate.metadata) {
    title = candidate.metadata.titleRaw || '';
    number = candidate.metadata.number;
    content = (candidate.presentation.slides || [])
      .map((sl) =>
        (sl.lines || [])
          .map((l) => (typeof l === 'string' ? l : l.text || (l.lines || []).join(' ') || ''))
          .join(' ')
      )
      .join(' ');
  } else {
    const p = parseTitleNumber(candidate.title);
    title = p.titleRaw;
    number = p.number;
    content = candidate.content || '';
  }

  const titleNorm = normalizeForCompare(title);
  const contentNorm = normalizeForCompare(content);
  const matches = [];

  for (const e of index) {
    const titleScore = titleNorm && e.titleNorm ? jaccard(titleNorm, e.titleNorm) : 0;
    const contentScore =
      contentNorm && e.contentNorm ? jaccard(contentNorm, e.contentNorm) : 0;
    const numberMatch = number != null && e.number != null && number === e.number;
    const numberConflict =
      number != null && e.number != null && number !== e.number;
    let score = Math.max(titleScore * 0.45 + contentScore * 0.55, titleScore, contentScore);
    if (numberMatch) score = Math.min(1, score + 0.15);
    if (numberConflict && contentScore < 0.9) score *= 0.85;

    if (
      titleScore >= 0.9 ||
      contentScore >= possibleThreshold ||
      (numberMatch && titleScore >= 0.5)
    ) {
      matches.push({
        folderName: e.folderName,
        title: e.title,
        folderIndex: e.folderIndex,
        songIndex: e.songIndex,
        titleScore,
        contentScore,
        score,
        numberMatch,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];

  if (!best) {
    return { code: 'NEW_SONG', matches: [], score: 0 };
  }

  const inTarget =
    targetFolder && best.folderName === targetFolder;
  const exact =
    best.contentScore >= exactThreshold && best.titleScore >= 0.9;

  if (exact && inTarget) {
    return { code: 'EXACT_DUPLICATE', matches, score: best.score };
  }
  if (exact || (best.titleScore >= 0.95 && best.contentScore >= 0.85)) {
    if (!inTarget) {
      return { code: 'SAME_SONG_DIFFERENT_VERSION', matches, score: best.score };
    }
    return { code: 'EXACT_DUPLICATE', matches, score: best.score };
  }
  if (best.score >= possibleThreshold || best.titleScore >= 0.9) {
    if (best.folderName !== targetFolder) {
      // high title match in another collection → version
      if (best.titleScore >= 0.92) {
        return { code: 'SAME_SONG_DIFFERENT_VERSION', matches, score: best.score };
      }
    }
    return { code: 'POSSIBLE_DUPLICATE', matches, score: best.score };
  }
  return { code: 'NEW_SONG', matches: [], score: best.score };
}

module.exports = {
  buildLibraryIndex,
  classifyDuplicate,
  jaccard,
  tokenize,
};
