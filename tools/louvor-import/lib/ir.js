'use strict';

/**
 * Intermediate Representation helpers for louvor import.
 * Official Song remains { title, content } only.
 */

function createSource(partial) {
  return {
    type: partial.type || 'unknown',
    file: partial.file || '',
    collection: partial.collection || '',
    extractedAt: partial.extractedAt || new Date().toISOString(),
  };
}

function createCanonicalSong(partial = {}) {
  return {
    metadata: {
      titleRaw: partial.titleRaw || '',
      number: partial.number != null ? partial.number : null,
      collectionHint: partial.collectionHint || '',
      lang: partial.lang || 'pt',
      source: createSource(partial.source || {}),
    },
    sections: Array.isArray(partial.sections) ? partial.sections : [],
    presentation: {
      mode: (partial.presentation && partial.presentation.mode) || 'normalized',
      slides: (partial.presentation && partial.presentation.slides) || [],
      sourcePresentation: (partial.presentation && partial.presentation.sourcePresentation) || null,
    },
    needsReview: Boolean(partial.needsReview),
    warnings: Array.isArray(partial.warnings) ? partial.warnings.slice() : [],
    duplicate: partial.duplicate || null,
  };
}

function createSlide(lines, opts = {}) {
  return {
    lines: Array.isArray(lines) ? lines.slice() : [],
    sourceSlideIndex: opts.sourceSlideIndex != null ? opts.sourceSlideIndex : null,
    warnings: Array.isArray(opts.warnings) ? opts.warnings.slice() : [],
  };
}

function createSection(partial = {}) {
  return {
    type: partial.type || 'verse',
    lines: Array.isArray(partial.lines) ? partial.lines.slice() : [],
    repeat: partial.repeat != null ? partial.repeat : null,
    confidence: typeof partial.confidence === 'number' ? partial.confidence : 1,
    needsReview: Boolean(partial.needsReview),
  };
}

/**
 * Parse "12 - TITLE" / "01 – TITLE" / "001 - TITLE"
 * @returns {{ number: number|null, titleRaw: string }}
 */
function parseTitleNumber(title) {
  const raw = String(title || '').trim();
  const m = raw.match(/^(\d+)\s*[-–—]\s*(.+)$/);
  if (!m) return { number: null, titleRaw: raw };
  return { number: Number(m[1]), titleRaw: m[2].trim() };
}

function formatOfficialTitle(number, titleRaw) {
  const t = String(titleRaw || '').trim();
  if (number == null || number === '') return t;
  return `${Number(number)} - ${t}`;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|blockquote|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

module.exports = {
  createSource,
  createCanonicalSong,
  createSlide,
  createSection,
  parseTitleNumber,
  formatOfficialTitle,
  stripHtml,
};
