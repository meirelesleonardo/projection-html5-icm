'use strict';

/**
 * Louvando.app praise JSON → official { title, content }.
 * Keeps section order (does not interleave CORO).
 * Splits a section taller than the projection budget, preferring a phrase end.
 */

const { classifyLabel, formatYellowLabel, extractTrailingCue } = require('./markers');

const PREFER_LINES = 6;
const HARD_MAX_LINES = 9;
const MIN_CHUNK = 3;

const CIA_KEY = 'criancas, intermediarios e adolescentes';

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
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function collectionKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function shortCollectionName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'Avulsos';
  if (collectionKey(raw) === CIA_KEY) return 'CIA';
  return raw;
}

function libraryNameForCollection(name) {
  return `Louvando ${shortCollectionName(name)}`;
}

function cleanTone(tone) {
  const t = String(tone || '').trim();
  if (!t || t === '-' || t === '–' || t === '—') return '';
  return t;
}

function formatLouvandoTitle(praise) {
  const rawTitle = String((praise && praise.title) || '').trim();
  if (!rawTitle) {
    const err = new Error('louvor sem título');
    err.status = 400;
    err.code = 'EMPTY';
    throw err;
  }
  const tone = cleanTone(praise && praise.tone);
  const withTone = tone ? `${rawTitle} (${tone})` : rawTitle;
  const num = praise && praise.number;
  if (num != null && String(num).trim() !== '' && !Number.isNaN(Number(num))) {
    return `${Number(num)} - ${withTone}`;
  }
  return withTone;
}

function extractParagraphs(html) {
  const src = String(html || '');
  const paras = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(src))) paras.push(m[1]);
  if (paras.length) return paras;
  if (!src.trim()) return [];
  return [src];
}

function paragraphText(inner) {
  const withBreaks = String(inner || '').replace(/<br\s*\/?>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  return decodeEntities(stripped).replace(/\u00A0/g, ' ').trim();
}

function htmlToTokens(html) {
  const tokens = [];
  for (const inner of extractParagraphs(html)) {
    const text = paragraphText(inner);
    if (!text) {
      tokens.push({ type: 'break' });
      continue;
    }
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t) tokens.push({ type: 'line', text: t });
    }
  }
  return tokens;
}

function markerFromLine(text) {
  const classified = classifyLabel(text);
  if (!classified) return null;
  if (classified.kind === 'repeat') {
    if (classified.repeat && classified.repeat.kind === 'bis') return { yellow: '(BIS)' };
    if (classified.repeat && classified.repeat.kind === 'nx') {
      return { yellow: `(${classified.repeat.n}X)` };
    }
    return null;
  }
  if (classified.kind !== 'section') return null;
  if (classified.type === 'chorus') {
    const n = classified.repeat && classified.repeat.n;
    return { section: n ? `CORO (${n}X)` : 'CORO' };
  }
  if (classified.type === 'final') return { section: 'FINAL:' };
  if (classified.type === 'instruments') return { section: 'INSTRUMENTOS' };
  return { section: String(text || '').trim().toUpperCase() };
}

function tokensToSections(tokens) {
  const sections = [];
  let current = { label: null, lines: [] };
  function flush() {
    if (current.label || current.lines.length) sections.push(current);
    current = { label: null, lines: [] };
  }
  for (const tok of tokens) {
    if (tok.type === 'break') {
      flush();
      continue;
    }
    const mapped = markerFromLine(tok.text);
    if (mapped && mapped.section) {
      if (current.label || current.lines.length) flush();
      current.label = mapped.section;
      continue;
    }
    if (mapped && mapped.yellow) {
      current.lines.push({ yellow: mapped.yellow });
      continue;
    }
    const trail = extractTrailingCue(tok.text);
    if (trail && trail.kind === 'repeat') {
      if (trail.text) current.lines.push(trail.text);
      current.lines.push({ yellow: trail.display });
      continue;
    }
    if (trail && trail.kind === 'section') {
      if (trail.text) current.lines.push(trail.text);
      if (current.label || current.lines.length) flush();
      current.label = trail.display;
      continue;
    }
    current.lines.push(tok.text);
  }
  flush();
  return sections;
}

function plainLine(line) {
  if (line && typeof line === 'object') return String(line.yellow || '');
  return String(line || '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function endsPhrase(line) {
  return /[.;!?…]["'”’)\]]*$/.test(plainLine(line));
}

function bestPhraseCut(lines, target, minCut, maxCut) {
  let best = null;
  let bestDist = Infinity;
  for (let c = minCut; c <= maxCut; c++) {
    if (!endsPhrase(lines[c - 1])) continue;
    const dist = Math.abs(c - target);
    if (dist < bestDist || (dist === bestDist && (best == null || c > best))) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * How many lines to take from the front of `lines`.
 * Budgets are lyric-line counts (a section label is already subtracted).
 */
function chooseCut(lines, budgetPrefer, budgetMax) {
  const n = lines.length;
  if (n <= 0) return 0;
  const prefer = Math.max(1, budgetPrefer);
  const hard = Math.max(prefer, budgetMax);
  if (n <= prefer) return n;
  if (n <= hard) {
    const maxCut = n - MIN_CHUNK;
    if (maxCut < MIN_CHUNK) return n;
    const best = bestPhraseCut(lines, prefer, MIN_CHUNK, maxCut);
    return best == null ? n : best;
  }
  const maxCut = Math.min(hard, n - 1);
  const minCut = Math.min(MIN_CHUNK, maxCut);
  const best = bestPhraseCut(lines, prefer, minCut, maxCut);
  if (best != null) return best;
  return Math.min(prefer, maxCut);
}

function emitLine(line) {
  if (line && typeof line === 'object' && line.yellow) {
    return formatYellowLabel(line.yellow);
  }
  return escapeHtml(line);
}

function paginateSection(labelHtml, lyricLines) {
  const slides = [];
  let pending = lyricLines.slice();
  let includeLabel = Boolean(labelHtml);
  let split = false;
  while (pending.length || includeLabel) {
    const overhead = includeLabel ? 1 : 0;
    const cut = chooseCut(
      pending,
      PREFER_LINES - overhead,
      HARD_MAX_LINES - overhead
    );
    if (!pending.length) {
      slides.push(labelHtml);
      break;
    }
    if (cut <= 0) break;
    const chunk = pending.slice(0, cut);
    pending = pending.slice(cut);
    const parts = [];
    if (includeLabel) parts.push(labelHtml);
    for (const line of chunk) parts.push(emitLine(line));
    slides.push(parts.join('\n'));
    if (pending.length) split = true;
    includeLabel = false;
  }
  return { slides, split };
}

function collectionNameOf(praise) {
  if (!praise) return '';
  if (praise.collection && typeof praise.collection === 'object') {
    return praise.collection.name || '';
  }
  return praise.collection || '';
}

function themeNameOf(praise) {
  if (!praise) return null;
  if (praise.theme && typeof praise.theme === 'object') return praise.theme.name || null;
  return praise.theme || null;
}

/**
 * @param {object} praise - Louvando praise payload (title, number, tone, lyrics, collection)
 * @returns {{ title: string, libraryName: string, content: string, slides: string[], warnings: string[] }}
 */
function formatLouvandoPraise(praise) {
  const title = formatLouvandoTitle(praise);
  const collection = collectionNameOf(praise);
  const libraryName = libraryNameForCollection(collection);
  const sections = tokensToSections(htmlToTokens(praise && praise.lyrics));
  const warnings = [];
  const slides = [];
  for (const sec of sections) {
    const labelHtml = sec.label ? formatYellowLabel(sec.label) : null;
    const made = paginateSection(labelHtml, sec.lines);
    if (made.split) warnings.push('estrofe dividida para caber no telão');
    slides.push(...made.slides);
  }
  const content = slides.join('\n\n').trim();
  if (!content) {
    const err = new Error('letra vazia');
    err.status = 400;
    err.code = 'EMPTY_BODY';
    throw err;
  }
  const num = praise && praise.number;
  return {
    title,
    libraryName,
    content,
    slides,
    warnings,
    number: num != null && String(num).trim() !== '' && !Number.isNaN(Number(num)) ? Number(num) : null,
    tone: cleanTone(praise && praise.tone) || null,
    collection: collection || null,
    theme: themeNameOf(praise),
  };
}

function mapSearchHit(hit) {
  const collection = hit && hit.collection && hit.collection.name ? hit.collection.name : '';
  const theme = hit && hit.theme && hit.theme.name ? hit.theme.name : '';
  return {
    id: String((hit && (hit.short_id || hit.id)) || ''),
    number: hit && hit.number != null ? hit.number : null,
    title: (hit && hit.title) || '',
    tone: cleanTone(hit && hit.tone) || null,
    collection,
    theme,
    libraryName: libraryNameForCollection(collection),
  };
}

module.exports = {
  formatLouvandoPraise,
  formatLouvandoTitle,
  cleanTone,
  libraryNameForCollection,
  shortCollectionName,
  mapSearchHit,
  PREFER_LINES,
  HARD_MAX_LINES,
};
