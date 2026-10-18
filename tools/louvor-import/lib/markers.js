'use strict';

/**
 * Marker classification / normalization for CORO, BIS, Nx, FINAL, etc.
 * Context-aware enough to avoid treating lyric words as structure blindly.
 */

const YELLOW_LABEL_RE =
  /<font[^>]*color=["']?yellow["']?[^>]*>\s*<i>\s*([^<]+?)\s*<\/i>\s*<\/font>/gi;

const CHAVE_RE = /<blockquote\s+class=["'](chave-[^"']+)["']>([\s\S]*?)<\/blockquote>/gi;

const LABEL_MAP = [
  { re: /^CORO(?:\s*\((\d+)\s*X\))?:?$/i, type: 'chorus', conf: 1 },
  { re: /^REFR[AÃ]O:?$/i, type: 'chorus', conf: 0.95 },
  { re: /^FINAL:?$/i, type: 'final', conf: 1 },
  { re: /^FINALE:?$/i, type: 'final', conf: 0.95 },
  { re: /^INSTRUMENTOS:?$/i, type: 'instruments', conf: 1 },
  { re: /^VAR[OÕ]ES:?$/i, type: 'part_cue', conf: 1 },
  { re: /^SERVAS:?$/i, type: 'part_cue', conf: 1 },
  { re: /^\(VAR[OÕ]ES\)$/i, type: 'part_cue', conf: 1 },
  { re: /^\(SERVAS\)$/i, type: 'part_cue', conf: 1 },
  { re: /^\(HOMENS\)$/i, type: 'part_cue', conf: 1 },
  { re: /^\(MULHERES\)$/i, type: 'part_cue', conf: 1 },
  { re: /^\([VSHM]\)$/i, type: 'part_cue', conf: 1 },
  { re: /^\(BIS\)$/i, type: 'repeat_bis', conf: 1 },
  { re: /^BIS$/i, type: 'repeat_bis', conf: 0.92 },
  { re: /^CANTAR\s+(\d+)\s*X$/i, type: 'repeat_nx', conf: 1 },
  { re: /^\((\d+)\s*X\)$/i, type: 'repeat_nx', conf: 1 },
  { re: /^(\d+)\s*X$/i, type: 'repeat_nx', conf: 0.9 },
];

function normalizeLabelText(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Classify a standalone label line (no surrounding lyric on same logical token).
 * @returns {{ kind: string, type?: string, repeat?: object, confidence: number } | null}
 */
function classifyLabel(raw) {
  const text = normalizeLabelText(raw).replace(/\u00A0/g, ' ');
  if (!text) return null;

  for (const rule of LABEL_MAP) {
    const m = text.match(rule.re);
    if (!m) continue;
    if (rule.type === 'repeat_bis') {
      return { kind: 'repeat', repeat: { kind: 'bis' }, confidence: rule.conf };
    }
    if (rule.type === 'repeat_nx') {
      const n = Number(m[1]);
      return { kind: 'repeat', repeat: { kind: 'nx', n }, confidence: rule.conf };
    }
    if (rule.type === 'chorus') {
      const n = m[1] ? Number(m[1]) : null;
      return {
        kind: 'section',
        type: 'chorus',
        repeat: n ? { kind: 'nx', n } : null,
        confidence: rule.conf,
      };
    }
    return { kind: 'section', type: rule.type, confidence: rule.conf };
  }
  return null;
}

/**
 * Scan a plain line for trailing/leading repeat cues like "… (2X)" or "… (BIS)".
 * Only treats as marker when the cue is parenthetical at end or whole-token.
 */
function extractInlineRepeat(line) {
  const s = String(line || '');
  let m = s.match(/^(.*?)[\s,]*\((BIS)\)\s*$/i);
  if (m && m[1].trim().length > 0) {
    return { text: m[1].trim(), repeat: { kind: 'bis' }, confidence: 0.96 };
  }
  m = s.match(/^(.*?)[\s,]*\((\d+)\s*X\)\s*$/i);
  if (m && m[1].trim().length > 0) {
    return {
      text: m[1].trim(),
      repeat: { kind: 'nx', n: Number(m[2]) },
      confidence: 0.96,
    };
  }
  return null;
}

/**
 * Cue at the end of a lyric line: "… Cantar 2x" or "… (V)".
 * The lyric before the cue must be non-empty; a line that is only the cue
 * is handled by classifyLabel.
 * @returns {{ text: string, display: string, kind: 'repeat'|'section', repeat?: object } | null}
 */
function extractTrailingCue(line) {
  const s = String(line || '').trim();
  let m = s.match(/^(.*\S)\s+cantar\s+(\d+)\s*x\s*$/i);
  if (m) {
    const n = Number(m[2]);
    return {
      text: m[1].trim(),
      display: `(${n}X)`,
      kind: 'repeat',
      repeat: { kind: 'nx', n },
    };
  }
  m = s.match(
    /^(.*\S)\s*(\((?:v|s|h|m|var[oõ]es|servas|homens|mulheres)\))\s*$/i
  );
  if (!m) m = s.match(/^(.*\S)\s+(var[oõ]es|servas)\s*$/i);
  if (m) {
    const token = m[2];
    const classified = classifyLabel(token);
    if (classified && classified.kind === 'section' && classified.type === 'part_cue') {
      return {
        text: m[1].trim(),
        display: normalizeLabelText(token),
        kind: 'section',
      };
    }
  }
  return null;
}

function chaveClassToRepeat(className) {
  const c = String(className || '');
  if (/chave-bis/i.test(c)) return { kind: 'bis' };
  const m = c.match(/chave-(\d+)x/i);
  if (m) return { kind: 'nx', n: Number(m[1]) };
  return null;
}

/**
 * Convert official song HTML content into presentation slides (plain-ish lines + marker tags).
 * Preserves structure for round-trip: slides by \n\n, lines by \n.
 * Marker lines become tokens: { marker: true, ... }
 */
function contentToSlides(content) {
  const blocks = String(content || '').split(/\n\n+/);
  const slides = [];

  for (const block of blocks) {
    const lines = [];
    let rest = block;

    // Expand blockquotes into markers around inner lines
    rest = rest.replace(CHAVE_RE, (_, cls, inner) => {
      const repeat = chaveClassToRepeat(cls);
      const innerLines = stripTagsKeepBreaks(inner)
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const payload = JSON.stringify({
        marker: 'chave',
        className: cls,
        repeat,
        lines: innerLines,
      });
      return `\n@@CHAVE@@${payload}@@\n`;
    });

    rest = rest.replace(YELLOW_LABEL_RE, (_, label) => {
      const payload = JSON.stringify({ marker: 'label', text: label.trim() });
      return `\n@@LABEL@@${payload}@@\n`;
    });

    const parts = stripTagsKeepBreaks(rest).split(/\n/);
    for (const part of parts) {
      const t = part.trim();
      if (!t) continue;
      if (t.startsWith('@@LABEL@@') && t.endsWith('@@')) {
        const json = t.slice('@@LABEL@@'.length, -2);
        try {
          lines.push(JSON.parse(json));
        } catch (_) {
          lines.push(t);
        }
        continue;
      }
      if (t.startsWith('@@CHAVE@@') && t.endsWith('@@')) {
        const json = t.slice('@@CHAVE@@'.length, -2);
        try {
          lines.push(JSON.parse(json));
        } catch (_) {
          lines.push(t);
        }
        continue;
      }
      lines.push(t);
    }
    if (lines.length) slides.push({ lines, sourceSlideIndex: null, warnings: [] });
  }
  return slides;
}

function stripTagsKeepBreaks(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

/**
 * Format a label or plain line back to ICM HTML fragment (single line / multi).
 */
function formatYellowLabel(text) {
  return `<font color="yellow"><i>${escapeHtml(text)}</i></font>`;
}

function formatChave(className, lines) {
  const body = lines.map(escapeHtml).join('\n');
  return `<blockquote class="${className}">${body}</blockquote>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build official content string from presentation slides (IR).
 */
function slidesToContent(slides) {
  const blocks = [];
  for (const slide of slides || []) {
    const out = [];
    for (const line of slide.lines || []) {
      if (line && typeof line === 'object' && line.marker === 'label') {
        out.push(formatYellowLabel(line.text));
        continue;
      }
      if (line && typeof line === 'object' && line.marker === 'chave') {
        out.push(formatChave(line.className || 'chave-bis', line.lines || []));
        continue;
      }
      if (line && typeof line === 'object' && line.marker === 'section') {
        const label =
          line.type === 'chorus'
            ? line.repeat && line.repeat.kind === 'nx'
              ? `CORO (${line.repeat.n}X)`
              : 'CORO'
            : line.type === 'final'
              ? 'FINAL:'
              : line.type === 'instruments'
                ? 'INSTRUMENTOS'
                : line.text || String(line.type || '').toUpperCase();
        out.push(formatYellowLabel(label));
        continue;
      }
      if (line && typeof line === 'object' && line.marker === 'repeat') {
        if (line.repeat && line.repeat.kind === 'bis') out.push(formatYellowLabel('(BIS)'));
        else if (line.repeat && line.repeat.kind === 'nx')
          out.push(formatYellowLabel(`(${line.repeat.n}X)`));
        continue;
      }
      out.push(String(line));
    }
    if (out.length) blocks.push(out.join('\n'));
  }
  return blocks.join('\n\n');
}

/**
 * Classify plain-text lines (from TXT/PPTX) into slide line tokens + sections.
 */
function annotatePlainLines(lines) {
  const out = [];
  const sections = [];
  let current = { type: 'verse', lines: [], repeat: null, confidence: 1, needsReview: false };

  function pushCurrent() {
    if (current.lines.length || current.type !== 'verse') {
      sections.push({
        type: current.type,
        lines: current.lines.slice(),
        repeat: current.repeat,
        confidence: current.confidence,
        needsReview: current.needsReview,
      });
    }
    current = { type: 'verse', lines: [], repeat: null, confidence: 1, needsReview: false };
  }

  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;

    const asLabel = classifyLabel(line);
    if (asLabel && asLabel.kind === 'section') {
      pushCurrent();
      current.type = asLabel.type;
      current.repeat = asLabel.repeat;
      current.confidence = asLabel.confidence;
      out.push({
        marker: 'section',
        type: asLabel.type,
        repeat: asLabel.repeat,
        text: line,
      });
      continue;
    }
    if (asLabel && asLabel.kind === 'repeat') {
      out.push({ marker: 'repeat', repeat: asLabel.repeat });
      if (!current.repeat) current.repeat = asLabel.repeat;
      continue;
    }

    const inline = extractInlineRepeat(line);
    if (inline) {
      out.push(inline.text);
      out.push({ marker: 'repeat', repeat: inline.repeat });
      current.lines.push(inline.text);
      if (!current.repeat) current.repeat = inline.repeat;
      continue;
    }

    const trail = extractTrailingCue(line);
    if (trail && trail.kind === 'repeat') {
      out.push(trail.text);
      out.push({ marker: 'repeat', repeat: trail.repeat });
      current.lines.push(trail.text);
      if (!current.repeat) current.repeat = trail.repeat;
      continue;
    }
    if (trail && trail.kind === 'section') {
      out.push(trail.text);
      current.lines.push(trail.text);
      pushCurrent();
      current.type = 'part_cue';
      current.confidence = 1;
      out.push({ marker: 'section', type: 'part_cue', text: trail.display });
      continue;
    }

    // Whole-line BIS without parens only if exact
    if (/^bis$/i.test(line)) {
      out.push({ marker: 'repeat', repeat: { kind: 'bis' } });
      continue;
    }

    out.push(line);
    current.lines.push(line);
  }
  pushCurrent();
  return { slideLines: out, sections };
}

module.exports = {
  classifyLabel,
  extractInlineRepeat,
  extractTrailingCue,
  chaveClassToRepeat,
  contentToSlides,
  slidesToContent,
  annotatePlainLines,
  formatYellowLabel,
  formatChave,
  normalizeLabelText,
  YELLOW_LABEL_RE,
};
