'use strict';

const fs = require('fs');
const path = require('path');
const { extractTxt } = require('./extractors/txt');
const { extractPptx } = require('./extractors/pptx');
const { extractDocx } = require('./extractors/docx');
const { extractPdf } = require('./extractors/pdf');
const { validateCanonical } = require('./validate');
const { buildLibraryIndex, classifyDuplicate } = require('./duplicates');
const { canonicalToSong } = require('./format-song');
const {
  ensureStaging,
  saveExtracted,
  saveNormalized,
  saveReview,
  saveApproved,
  saveReport,
  DEFAULT_ROOT,
} = require('./staging');

function detectType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt') return 'txt';
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.pptx' || ext === '.ppt') return 'pptx';
  return null;
}

function extractFile(filePath, options = {}) {
  const type = detectType(filePath);
  if (!type) throw new Error(`Formato não suportado: ${filePath}`);
  if (type === 'txt') return extractTxt(filePath, options);
  if (type === 'docx') return extractDocx(filePath, options);
  if (type === 'pdf') return extractPdf(filePath, options);
  if (type === 'pptx') return extractPptx(filePath, options);
  throw new Error(`Sem extractor: ${type}`);
}

/**
 * Run extract → validate → duplicate → staging. Never writes data.json.
 */
function processFile(filePath, options = {}) {
  const root = ensureStaging(options.stagingRoot || DEFAULT_ROOT);
  const collection = options.collection || '';
  const targetFolderName = options.targetFolderName || 'Coletânea 2022';
  const library = options.library || null;
  const index = library ? buildLibraryIndex(library) : [];

  const base = path.basename(filePath);
  const fileReport = {
    file: base,
    type: detectType(filePath),
    songCount: 0,
    ok: false,
    errors: [],
    warnings: [],
    duplicates: [],
  };

  let doc;
  try {
    doc = extractFile(filePath, {
      collection,
      maxSlides: options.maxSlides,
      onlyNumbers: options.onlyNumbers,
    });
  } catch (e) {
    fileReport.errors.push(e.message);
    return { fileReport, songs: [], paths: {} };
  }

  saveExtracted(root, base, {
    type: doc.type,
    file: doc.file,
    slideCount: doc.slideCount,
    processedSlides: doc.processedSlides,
    songCount: (doc.songs || []).length,
    warnings: doc.warnings,
    // omit huge rawSlides by default unless sample
    rawSlides: options.keepRawSlides ? doc.rawSlides : undefined,
  });

  const normalized = [];
  const review = [];
  const approvedSongs = [];

  for (const song of doc.songs || []) {
    const v = validateCanonical(song);
    song.warnings = [...(song.warnings || []), ...v.warnings];
    song.needsReview = song.needsReview || v.needsReview || !v.ok;
    if (!v.ok) {
      fileReport.errors.push(...v.errors.map((e) => `${song.metadata.titleRaw}: ${e}`));
    }

    if (index.length) {
      const dup = classifyDuplicate(song, index, { targetFolderName });
      song.duplicate = dup;
      fileReport.duplicates.push({
        title: song.metadata.titleRaw,
        number: song.metadata.number,
        code: dup.code,
        best: dup.matches[0]
          ? { folder: dup.matches[0].folderName, title: dup.matches[0].title, score: dup.score }
          : null,
      });
    }

    normalized.push(song);
    if (song.needsReview || (song.duplicate && song.duplicate.code === 'POSSIBLE_DUPLICATE')) {
      review.push(song);
    } else if (
      v.ok &&
      (!song.duplicate ||
        song.duplicate.code === 'NEW_SONG' ||
        song.duplicate.code === 'SAME_SONG_DIFFERENT_VERSION')
    ) {
      try {
        const official = canonicalToSong(song);
        approvedSongs.push({ ir: song, song: official });
      } catch (e) {
        fileReport.errors.push(e.message);
        review.push(song);
      }
    } else {
      review.push(song);
    }
  }

  const normPath = saveNormalized(root, base, normalized);
  const reviewPath = review.length ? saveReview(root, base, review) : null;
  const approvedPath = approvedSongs.length
    ? saveApproved(root, base, {
        folderName: targetFolderName,
        songs: approvedSongs.map((x) => x.song),
        count: approvedSongs.length,
      })
    : null;

  fileReport.songCount = normalized.length;
  fileReport.ok = fileReport.errors.length === 0 && normalized.length > 0;
  fileReport.warnings.push(...(doc.warnings || []));
  fileReport.needsReviewCount = review.length;
  fileReport.approvedCount = approvedSongs.length;

  return {
    fileReport,
    songs: normalized,
    paths: { normalized: normPath, review: reviewPath, approved: approvedPath },
  };
}

function processPaths(paths, options = {}) {
  const root = ensureStaging(options.stagingRoot || DEFAULT_ROOT);
  const fileReports = [];
  let success = 0;
  let failed = 0;
  let needsReview = 0;
  let newSongs = 0;
  let possibleDuplicates = 0;
  let sameSongDifferentVersion = 0;
  let exactDuplicates = 0;

  for (const p of paths) {
    const { fileReport } = processFile(p, options);
    fileReports.push(fileReport);
    if (fileReport.ok) success++;
    else failed++;
    needsReview += fileReport.needsReviewCount || 0;
    for (const d of fileReport.duplicates || []) {
      if (d.code === 'NEW_SONG') newSongs++;
      else if (d.code === 'POSSIBLE_DUPLICATE') possibleDuplicates++;
      else if (d.code === 'SAME_SONG_DIFFERENT_VERSION') sameSongDifferentVersion++;
      else if (d.code === 'EXACT_DUPLICATE') exactDuplicates++;
    }
  }

  const report = {
    name: options.reportName || `import-${new Date().toISOString()}`,
    files: paths.length,
    processed: paths.length,
    success,
    failed,
    needsReview,
    newSongs,
    possibleDuplicates,
    sameSongDifferentVersion,
    exactDuplicates,
    fileReports,
    note: 'Nenhum merge em data.json foi realizado.',
  };

  const saved = saveReport(root, report.name, report);
  return { report, saved };
}

module.exports = {
  detectType,
  extractFile,
  processFile,
  processPaths,
};
