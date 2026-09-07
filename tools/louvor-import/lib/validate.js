'use strict';

const { stripHtml } = require('./ir');

const DEFAULT_THRESHOLDS = {
  high: 0.9,
  review: 0.7,
  softMaxLines: 9,
  softMaxChars: 50,
};

/**
 * Validate a CanonicalSong IR.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], needsReview: boolean }}
 */
function validateCanonical(song, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const errors = [];
  const warnings = [];
  let needsReview = Boolean(song.needsReview);

  const title = (song.metadata && song.metadata.titleRaw) || '';
  if (!String(title).trim()) {
    errors.push('titleRaw vazio');
  }

  const slides = (song.presentation && song.presentation.slides) || [];
  if (!slides.length) {
    errors.push('nenhum slide em presentation');
  }

  let anyText = false;
  for (const sl of slides) {
    const lineCount = (sl.lines || []).length;
    if (lineCount > t.softMaxLines) {
      warnings.push(`slide com ${lineCount} linhas (> ${t.softMaxLines})`);
      needsReview = true;
    }
    for (const line of sl.lines || []) {
      if (typeof line === 'string' && line.trim()) anyText = true;
      if (typeof line === 'string' && line.length > t.softMaxChars) {
        warnings.push(`linha longa (${line.length} chars)`);
        needsReview = true;
      }
      if (line && typeof line === 'object') {
        if (typeof line.confidence === 'number' && line.confidence < t.high) {
          needsReview = true;
          if (line.confidence < t.review) {
            warnings.push(`marcador com baixa confiança (${line.confidence})`);
          } else {
            warnings.push(`marcador para revisão (confidence ${line.confidence})`);
          }
        }
        if (line.needsReview) needsReview = true;
        if (line.marker === 'label' || line.marker === 'section' || typeof line === 'string')
          anyText = true;
        if (line.marker === 'chave' && (line.lines || []).length) anyText = true;
      }
    }
    if (sl.warnings && sl.warnings.length) {
      warnings.push(...sl.warnings);
      needsReview = true;
    }
  }

  if (!anyText) errors.push('slides sem texto');

  for (const sec of song.sections || []) {
    if (typeof sec.confidence === 'number' && sec.confidence < t.high) {
      needsReview = true;
      warnings.push(`seção ${sec.type} confidence ${sec.confidence}`);
    }
    if (sec.needsReview) needsReview = true;
  }

  if (song.warnings && song.warnings.length) {
    warnings.push(...song.warnings);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    needsReview,
  };
}

/**
 * Validate official song shape (subset of library-validate).
 */
function validateOfficialSong(song) {
  const errors = [];
  if (!song || typeof song !== 'object') return { ok: false, errors: ['song inválido'] };
  if (typeof song.title !== 'string') errors.push('title deve ser string');
  if (typeof song.content !== 'string') errors.push('content deve ser string');
  if (typeof song.title === 'string' && !song.title.trim())
    errors.push('title vazio (importação estrita)');
  if (typeof song.content === 'string' && !song.content.trim())
    errors.push('content vazio');
  // reject extra keys
  for (const k of Object.keys(song)) {
    if (k !== 'title' && k !== 'content') errors.push(`campo extra não permitido: ${k}`);
  }
  return { ok: errors.length === 0, errors };
}

function normalizeForCompare(text) {
  return stripHtml(text)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  validateCanonical,
  validateOfficialSong,
  normalizeForCompare,
  DEFAULT_THRESHOLDS,
};
