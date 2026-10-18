'use strict';

/**
 * Graphic braces (rightBrace) and projection line-fit for PPTX slides.
 *
 * A BIS in Coletânea 2022 is often a shape beside the lines it repeats, not a
 * caption after the stanza. Line spacing factor 1.2 was calibrated so slide 24
 * (louvor 10) covers the first two lines and slide 201 (two braces) covers each pair.
 */

const { annotatePlainLines } = require('./markers');
const { wrapSlideLines, DEFAULTS } = require('./paginate');

const EMU_PER_PT = 12700;
const LINE_FACTOR = 1.2;
const OVERLAP_MIN = 0.45;
const LABEL_NEAR_X = 1500000;
const LABEL_NEAR_Y = 400000;

const PREFER_LINES = 6;
const HARD_MAX_LINES = 9;
const MIN_CHUNK = 3;

const BRACE_RE = /prst="(rightBrace|leftBrace|bracePair)"/;
const LABEL_RE = /^(?:BIS|\(?\d+\s*X\)?)$/i;
const TITLE_RE = /^(\d{1,4})\s*[-–—]\s*(.+)$/;
const NAV_RE = /^[ií]ndice$/i;

function decodeXml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normText(s) {
  return decodeXml(s).replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  const m = String(tag || '').match(new RegExp('\\b' + name + '="(-?\\d+)"'));
  return m ? Number(m[1]) : null;
}

function extractSpBlocks(xml) {
  const blocks = [];
  const re = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;
  let m;
  const src = String(xml || '');
  while ((m = re.exec(src))) blocks.push(m[0]);
  return blocks;
}

function readBox(sp) {
  const xfrm = sp.match(/<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/);
  if (!xfrm) return null;
  const off = xfrm[1].match(/<a:off\b[^/]*\/>/);
  const ext = xfrm[1].match(/<a:ext\b[^/]*\/>/);
  if (!off || !ext) return null;
  const x = attr(off[0], 'x');
  const y = attr(off[0], 'y');
  const cx = attr(ext[0], 'cx');
  const cy = attr(ext[0], 'cy');
  if (x == null || y == null || cx == null || cy == null) return null;
  return { x, y, cx, cy };
}

function readParas(sp) {
  const tx = sp.match(/<p:txBody\b[^>]*>([\s\S]*?)<\/p:txBody>/);
  if (!tx) return { body: {}, paras: [], defSz: null };
  const bodyTag = tx[1].match(/<a:bodyPr\b[^>]*>/);
  const body = {
    anchor: bodyTag ? (bodyTag[0].match(/\banchor="([^"]+)"/) || [])[1] || 't' : 't',
    tIns: bodyTag ? attr(bodyTag[0], 'tIns') : null,
    bIns: bodyTag ? attr(bodyTag[0], 'bIns') : null,
  };
  let defSz = null;
  const def = tx[1].match(/<a:defRPr\b[^>]*\bsz="(\d+)"/);
  if (def) defSz = Number(def[1]);
  const paras = [];
  const parts = tx[1].split(/<\/a:p>/i);
  for (const part of parts) {
    if (!/<a:p\b/.test(part)) continue;
    const texts = [];
    const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi;
    let m;
    while ((m = re.exec(part))) texts.push(m[1]);
    const szM = part.match(/<a:rPr\b[^>]*\bsz="(\d+)"/);
    let ln = null;
    const pct = part.match(/<a:lnSpc>[\s\S]*?<a:spcPct\b[^>]*\bval="(\d+)"/);
    const pts = part.match(/<a:lnSpc>[\s\S]*?<a:spcPts\b[^>]*\bval="(\d+)"/);
    if (pct) ln = { kind: 'pct', val: Number(pct[1]) };
    else if (pts) ln = { kind: 'pts', val: Number(pts[1]) };
    paras.push({
      text: normText(texts.join('')),
      sz: szM ? Number(szM[1]) : null,
      ln,
    });
  }
  return { body, paras, defSz };
}

function shapeKind(sp, paras) {
  const brace = sp.match(BRACE_RE);
  if (brace) return { type: 'brace', prst: brace[1] };
  const text = paras
    .map((p) => p.text)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { type: 'empty' };
  if (LABEL_RE.test(text)) return { type: 'label', text };
  if (NAV_RE.test(text)) return { type: 'nav', text };
  if (TITLE_RE.test(text) && paras.filter((p) => p.text).length === 1) {
    return { type: 'title', text };
  }
  return { type: 'lyric', text };
}

function parseShapes(xml) {
  const shapes = [];
  for (const sp of extractSpBlocks(xml)) {
    const box = readBox(sp);
    if (!box) continue;
    const { body, paras, defSz } = readParas(sp);
    const kind = shapeKind(sp, paras);
    shapes.push({ box, body, paras, defSz, kind });
  }
  return shapes;
}

function lineBands(shape) {
  const { box, body, paras, defSz } = shape;
  const tIns = body.tIns != null ? body.tIns : 45720;
  const bIns = body.bIns != null ? body.bIns : 45720;
  const anchor = body.anchor || 't';
  const heights = paras.map((para) => {
    const sz = para.sz || defSz || 2800;
    const pt = sz / 100;
    if (para.ln && para.ln.kind === 'pct') {
      return pt * (para.ln.val / 100000) * LINE_FACTOR * EMU_PER_PT;
    }
    if (para.ln && para.ln.kind === 'pts') {
      return (para.ln.val / 100) * EMU_PER_PT;
    }
    return pt * 1.2 * LINE_FACTOR * EMU_PER_PT;
  });
  const contentH = Math.max(0, box.cy - tIns - bIns);
  const total = heights.reduce((a, b) => a + b, 0);
  let y = box.y + tIns;
  if (anchor === 'ctr') y += Math.max(0, (contentH - total) / 2);
  else if (anchor === 'b') y += Math.max(0, contentH - total);
  return paras.map((para, i) => {
    const y0 = y;
    const y1 = y + heights[i];
    y = y1;
    return { y0, y1, text: para.text, index: i };
  });
}

function overlapFrac(band, braceBox) {
  const by0 = braceBox.y;
  const by1 = braceBox.y + braceBox.cy;
  const h = band.y1 - band.y0;
  if (h <= 0) return 0;
  const ov = Math.min(band.y1, by1) - Math.max(band.y0, by0);
  return ov / h;
}

function nearestLyric(braceBox, lyrics) {
  let best = null;
  for (const lyric of lyrics) {
    const box = lyric.box;
    if (box.x > braceBox.x + braceBox.cx) continue;
    const oy = Math.min(box.y + box.cy, braceBox.y + braceBox.cy) - Math.max(box.y, braceBox.y);
    if (oy <= 0) continue;
    const dist = Math.abs(box.x + box.cx - braceBox.x);
    if (!best || dist < best.dist) best = { dist, lyric };
  }
  return best ? best.lyric : null;
}

function nearestLabel(braceBox, labels) {
  let best = null;
  const braceMid = braceBox.y + braceBox.cy / 2;
  for (const label of labels) {
    const mid = label.box.y + label.box.cy / 2;
    if (mid < braceBox.y - LABEL_NEAR_Y || mid > braceBox.y + braceBox.cy + LABEL_NEAR_Y) continue;
    const dx = Math.abs(label.box.x - (braceBox.x + braceBox.cx));
    if (dx > LABEL_NEAR_X) continue;
    const dist = Math.abs(mid - braceMid) + dx;
    if (!best || dist < best.dist) best = { dist, label };
  }
  return best ? best.label : null;
}

function chaveClass(label, lineCount) {
  const small = lineCount <= 4 ? '-small' : '';
  const m = String(label || '').match(/(\d+)\s*X/i);
  if (m) return `chave-${m[1]}x${small}`;
  return `chave-bis${small}`;
}

function repeatFromLabel(label) {
  const m = String(label || '').match(/(\d+)\s*X/i);
  if (m) return { kind: 'nx', n: Number(m[1]) };
  return { kind: 'bis' };
}

/**
 * Ordered slide tokens. Title, Índice and a matched BIS/Nx label stay as strings
 * so the segmenter can drop them; covered lyric lines become { kind:'chave' }.
 * @returns {{ hasBrace: boolean, tokens: Array, warnings: string[] }}
 */
function buildSlideLayout(xml) {
  const shapes = parseShapes(xml);
  const braces = [];
  const labels = [];
  const lyrics = [];
  for (const shape of shapes) {
    if (shape.kind.type === 'brace') braces.push(shape);
    else if (shape.kind.type === 'label') labels.push(shape);
    else if (shape.kind.type === 'lyric') lyrics.push(shape);
  }
  if (!braces.length) return { hasBrace: false, tokens: null, warnings: [] };

  const warnings = [];
  for (const brace of braces) {
    brace.lyric = nearestLyric(brace.box, lyrics);
    const label = nearestLabel(brace.box, labels);
    brace.labelText = label ? label.kind.text : null;
    brace.labelShape = label;
    brace.hit = new Set();
  }
  for (const lyric of lyrics) {
    const bands = lineBands(lyric);
    const owner = bands.map(() => null);
    for (const brace of braces) {
      if (brace.lyric !== lyric) continue;
      for (const band of bands) {
        if (!band.text) continue;
        const frac = overlapFrac(band, brace.box);
        if (frac < OVERLAP_MIN) continue;
        const cur = owner[band.index];
        if (!cur || frac > cur.frac) owner[band.index] = { brace, frac };
      }
    }
    lyric.owner = owner;
    for (let i = 0; i < owner.length; i++) {
      if (owner[i]) owner[i].brace.hit.add(i);
    }
  }
  const consumed = new Set();
  for (const brace of braces) {
    if (!brace.hit.size) {
      warnings.push('chave gráfica sem linhas — revisar');
      continue;
    }
    if (brace.labelShape) consumed.add(brace.labelShape);
  }

  const tokens = [];
  for (const shape of shapes) {
    if (shape.kind.type === 'brace' || shape.kind.type === 'empty') continue;
    if (shape.kind.type === 'label') {
      if (!consumed.has(shape)) tokens.push(shape.kind.text);
      continue;
    }
    if (shape.kind.type === 'nav' || shape.kind.type === 'title') {
      tokens.push(shape.kind.text);
      continue;
    }
    const owner = shape.owner || [];
    let i = 0;
    const paras = shape.paras;
    while (i < paras.length) {
      const br = owner[i] ? owner[i].brace : null;
      if (!br) {
        if (paras[i].text) tokens.push(paras[i].text);
        i++;
        continue;
      }
      const group = [];
      while (i < paras.length) {
        if (paras[i].text && !br.hit.has(i)) break;
        if (!paras[i].text) {
          let j = i + 1;
          while (j < paras.length && !paras[j].text) j++;
          if (j >= paras.length || !br.hit.has(j)) break;
        }
        if (paras[i].text) group.push(paras[i].text);
        i++;
      }
      if (group.length) {
        tokens.push({ kind: 'chave', label: br.labelText || 'BIS', lines: group });
      }
    }
  }
  return { hasBrace: true, tokens, warnings };
}

function annotateMixed(tokens) {
  const out = [];
  const sections = [];
  let buf = [];

  function flush() {
    if (!buf.length) return;
    const ann = annotatePlainLines(buf);
    out.push(...ann.slideLines);
    sections.push(...ann.sections);
    buf = [];
  }

  for (const tok of tokens || []) {
    if (tok && typeof tok === 'object' && tok.kind === 'chave') {
      flush();
      out.push({
        marker: 'chave',
        label: tok.label || 'BIS',
        lines: (tok.lines || []).slice(),
      });
      sections.push({
        type: 'verse',
        lines: (tok.lines || []).slice(),
        repeat: repeatFromLabel(tok.label),
        confidence: 0.95,
        needsReview: false,
      });
      continue;
    }
    const text = String(tok || '').trim();
    if (text) buf.push(text);
  }
  flush();
  return { slideLines: out, sections };
}

function wrapStructuredLines(lines, maxChars) {
  const max = maxChars != null ? maxChars : DEFAULTS.softMaxChars;
  const out = [];
  for (const line of lines || []) {
    if (line && typeof line === 'object' && line.marker === 'chave') {
      const inner = wrapSlideLines(line.lines || [], max);
      out.push({
        marker: 'chave',
        className: chaveClass(line.label, inner.length),
        lines: inner,
      });
      continue;
    }
    if (typeof line === 'string') {
      const wrapped = wrapSlideLines([line], max);
      out.push(...wrapped);
      continue;
    }
    out.push(line);
  }
  return out;
}

function visualWeight(line) {
  if (line && typeof line === 'object' && line.marker === 'chave') {
    return Math.max(1, (line.lines || []).length);
  }
  return 1;
}

function visualLineCount(lines) {
  return (lines || []).reduce((n, line) => n + visualWeight(line), 0);
}

function endsPhraseLine(line) {
  let text = '';
  if (line && typeof line === 'object' && line.marker === 'chave') {
    const inner = line.lines || [];
    text = inner.length ? inner[inner.length - 1] : '';
  } else if (typeof line === 'string') {
    text = line;
  } else {
    return false;
  }
  return /[.;!?…]["'”’)\]]*$/.test(String(text || '').trim());
}

function chooseCutUnits(lines) {
  const total = visualLineCount(lines);
  if (total <= HARD_MAX_LINES) return lines.length;
  if (lines.length <= 1) return lines.length;

  const bounds = [];
  let vis = 0;
  for (let k = 1; k < lines.length; k++) {
    vis += visualWeight(lines[k - 1]);
    bounds.push({ k, vis, phrase: endsPhraseLine(lines[k - 1]) });
  }
  const remain = (b) => total - b.vis;
  const phraseHits = bounds.filter(
    (b) => b.phrase && b.vis >= MIN_CHUNK && b.vis <= HARD_MAX_LINES && remain(b) >= MIN_CHUNK
  );
  const pool = phraseHits.length
    ? phraseHits
    : bounds.filter((b) => b.vis >= 1 && b.vis <= HARD_MAX_LINES && remain(b) >= 1);
  if (!pool.length) return lines.length;
  pool.sort((a, b) => {
    const da = Math.abs(a.vis - PREFER_LINES);
    const db = Math.abs(b.vis - PREFER_LINES);
    if (da !== db) return da - db;
    return b.k - a.k;
  });
  return pool[0].k;
}

/**
 * Split only when a slide is taller than 9 visual lines.
 * Cut near 6 lines, on a phrase end, without opening a chave.
 */
function splitDenseLines(lines) {
  const out = [];
  let pending = (lines || []).slice();
  while (pending.length) {
    if (visualLineCount(pending) <= HARD_MAX_LINES) {
      out.push(pending);
      break;
    }
    const cut = chooseCutUnits(pending);
    if (cut <= 0 || cut >= pending.length) {
      out.push(pending);
      break;
    }
    out.push(pending.slice(0, cut));
    pending = pending.slice(cut);
  }
  return out;
}

module.exports = {
  buildSlideLayout,
  annotateMixed,
  wrapStructuredLines,
  splitDenseLines,
  visualLineCount,
  chaveClass,
  LINE_FACTOR,
  OVERLAP_MIN,
  HARD_MAX_LINES,
};
