'use strict';

const { createSlide } = require('./ir');
const { annotatePlainLines } = require('./markers');

/**
 * Deterministic pagination for plain text / normalized mode.
 * Same input → same slides.
 *
 * Targets from docs/louvor/presentation-rules.md (INFERÊNCIA):
 * - prefer 5–6 lines/slide, soft max 9
 * - prefer ≤38 chars/line (soft); does not hard-wrap mid-phrase aggressively
 */

const DEFAULTS = {
  preferLines: 6,
  softMaxLines: 9,
  softMaxChars: 38,
  startChorusOnNewSlide: true,
};

function isSectionMarker(line) {
  return line && typeof line === 'object' && line.marker === 'section';
}

function isRepeatMarker(line) {
  return line && typeof line === 'object' && line.marker === 'repeat';
}

function lineWeight(line) {
  if (typeof line === 'string') return 1;
  if (isSectionMarker(line) || isRepeatMarker(line)) return 1;
  return 1;
}

function shouldBreakBefore(line, opts) {
  if (!opts.startChorusOnNewSlide) return false;
  if (!isSectionMarker(line)) return false;
  return line.type === 'chorus' || line.type === 'final' || line.type === 'instruments';
}

/**
 * @param {string[]|object[]} lines - plain strings or already annotated tokens
 * @param {object} [options]
 * @returns {{ slides: object[], sections: object[] }}
 */
function paginateLines(lines, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const annotated =
    lines.length && typeof lines[0] === 'string'
      ? annotatePlainLines(lines)
      : { slideLines: lines, sections: annotatePlainLines(
          lines.filter((l) => typeof l === 'string').map(String)
        ).sections };

  const tokens = annotated.slideLines;
  const slides = [];
  let current = [];

  function flush() {
    if (!current.length) return;
    slides.push(createSlide(current));
    current = [];
  }

  function currentLineCount() {
    return current.reduce((n, l) => n + lineWeight(l), 0);
  }

  for (const token of tokens) {
    if (shouldBreakBefore(token, opts) && current.length) flush();

    current.push(token);

    if (currentLineCount() >= opts.preferLines) {
      // look ahead: if next is continuation of short verse, may keep until soft max
      // deterministic rule: flush at preferLines unless we are mid-chave (N/A here)
      // Allow growing to softMax only when last token is very short? Keep simple: flush at preferLines
      // but if marker-only slide would be tiny, wait one more line — skip for determinism.
      flush();
    } else if (currentLineCount() >= opts.softMaxLines) {
      flush();
    }
  }
  flush();

  // Soft wrap long string lines into visual lines without splitting words when possible
  const wrapped = slides.map((sl) => ({
    ...sl,
    lines: wrapSlideLines(sl.lines, opts.softMaxChars),
  }));

  return { slides: wrapped, sections: annotated.sections };
}

function wrapSlideLines(lines, maxChars) {
  const out = [];
  for (const line of lines) {
    if (typeof line !== 'string') {
      out.push(line);
      continue;
    }
    if (line.length <= maxChars) {
      out.push(line);
      continue;
    }
    // word-wrap; deterministic
    const words = line.split(/\s+/);
    let buf = '';
    for (const w of words) {
      if (!buf) {
        buf = w;
        continue;
      }
      if ((buf + ' ' + w).length <= maxChars) buf += ' ' + w;
      else {
        out.push(buf);
        buf = w;
      }
    }
    if (buf) out.push(buf);
  }
  return out;
}

/**
 * Paginate a full plain text body (paragraphs separated by blank lines optional).
 */
function paginatePlainText(text, options = {}) {
  const rawLines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n/)
    .map((l) => l.trimEnd());
  // collapse multiple blanks — blank lines are not slides in TXT mode until paginated
  const lines = [];
  for (const l of rawLines) {
    if (l.trim() === '') continue;
    lines.push(l.trim());
  }
  return paginateLines(lines, options);
}

module.exports = {
  paginateLines,
  paginatePlainText,
  DEFAULTS,
};
