'use strict';

/**
 * Parentheses highlight and editor dialect ({lines}2x) ↔ official song HTML.
 * Does not interleave CORO. Known whole-line markers stay labels, not a second wrap.
 */

const { classifyLabel, formatYellowLabel, normalizeLabelText } = require('./markers');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

const PAREN_RE = /\(([^()\n]+)\)/g;

/**
 * Escape a lyric line and highlight parenthetical expressions.
 * Leaves an already-tagged line unchanged.
 * @param {string} text
 */
function formatLyricLine(text) {
  const src = String(text ?? '');
  if (/<[a-z!/]/i.test(src)) return src;
  let out = '';
  let last = 0;
  PAREN_RE.lastIndex = 0;
  let m;
  while ((m = PAREN_RE.exec(src))) {
    out += escapeHtml(src.slice(last, m.index));
    out += formatYellowLabel(m[0]);
    last = m.index + m[0].length;
  }
  out += escapeHtml(src.slice(last));
  return out;
}

function labelHtml(line) {
  const classified = classifyLabel(line);
  if (!classified) return null;
  if (classified.kind === 'repeat' && classified.repeat) {
    if (classified.repeat.kind === 'bis') return formatYellowLabel('(BIS)');
    if (classified.repeat.kind === 'nx') return formatYellowLabel(`(${classified.repeat.n}X)`);
    return null;
  }
  if (classified.kind !== 'section') return null;
  if (classified.type === 'chorus') {
    const n = classified.repeat && classified.repeat.n;
    return formatYellowLabel(n ? `CORO (${n}X)` : 'CORO');
  }
  if (classified.type === 'final') return formatYellowLabel('FINAL:');
  if (classified.type === 'instruments') return formatYellowLabel('INSTRUMENTOS');
  if (classified.type === 'part_cue') return formatYellowLabel(normalizeLabelText(line));
  return formatYellowLabel(String(line).trim().toUpperCase());
}

function parseChaveClose(text) {
  let m = String(text || '').match(/^(.*)\}(\d+)\s*x\s*$/i);
  if (m) return { body: m[1].trim(), cls: `chave-${Number(m[2])}x` };
  m = String(text).match(/^(.*)\}bis\s*$/i);
  if (m) return { body: m[1].trim(), cls: 'chave-bis' };
  return null;
}

function formatChave(className, lines) {
  const body = lines.map((line) => formatLyricLine(line)).join('\n');
  return `<blockquote class="${className}">${body}</blockquote>`;
}

function dialectSlideToHtml(block) {
  const lines = String(block || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    if (trimmed.startsWith('{')) {
      const buf = [];
      let closed = null;
      let j = i;
      for (; j < lines.length; j++) {
        let text = lines[j].trim();
        if (j === i) text = text.replace(/^\{/, '');
        const close = parseChaveClose(text);
        if (close) {
          if (close.body) buf.push(close.body);
          closed = close;
          break;
        }
        if (text) buf.push(text);
      }
      if (closed && buf.length) {
        out.push(formatChave(closed.cls, buf));
        i = j + 1;
        continue;
      }
    }
    const label = labelHtml(trimmed);
    out.push(label || formatLyricLine(trimmed));
    i += 1;
  }
  return out.join('\n');
}

/**
 * Editor text → official content. Blank line = slide. No chorus interleave.
 * @param {string} text
 * @returns {string}
 */
function dialectToContent(text) {
  const raw = String(text || '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!raw) return '';
  return raw
    .split(/\n\n+/)
    .map((block) => dialectSlideToHtml(block))
    .filter((slide) => slide.trim())
    .join('\n\n');
}

function chaveSuffix(className) {
  const c = String(className || '');
  const n = c.match(/chave-(\d+)x/i);
  if (n) return `${n[1]}x`;
  if (/chave-bis/i.test(c)) return 'bis';
  return 'bis';
}

function plainInner(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ''));
}

function chaveBlockToDialect(className, inner) {
  const text = String(inner || '').replace(
    /<font[^>]*color=["']?yellow["']?[^>]*>\s*<i>([\s\S]*?)<\/i>\s*<\/font>/gi,
    (_, yellow) => plainInner(yellow)
  );
  const lines = plainInner(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const suffix = chaveSuffix(className);
  if (!lines.length) return `{}` + suffix;
  if (lines.length === 1) return `{${lines[0]}}${suffix}`;
  const mid = lines.slice(1, -1);
  return [`{${lines[0]}`, ...mid, `${lines[lines.length - 1]}}${suffix}`].join('\n');
}

function slideToDialect(slide) {
  let src = String(slide || '');
  src = src.replace(
    /<blockquote\s+class=["']([^"']+)["']>([\s\S]*?)<\/blockquote>/gi,
    (_, cls, inner) => `\n${chaveBlockToDialect(cls, inner)}\n`
  );
  src = src.replace(
    /<font[^>]*color=["']?yellow["']?[^>]*>\s*<i>([\s\S]*?)<\/i>\s*<\/font>/gi,
    (_, inner) => plainInner(inner)
  );
  src = src.replace(/<br\s*\/?>/gi, '\n');
  src = src.replace(/<[^>]+>/g, '');
  return src
    .split('\n')
    .map((line) => decodeEntities(line).trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Official content → editor text.
 * @param {string} content
 * @returns {string}
 */
function htmlToDialect(content) {
  return String(content || '')
    .split(/\n\n+/)
    .map((slide) => slideToDialect(slide))
    .filter((slide) => slide.trim())
    .join('\n\n');
}

module.exports = {
  formatLyricLine,
  dialectToContent,
  htmlToDialect,
};
