'use strict';

/**
 * Normalize pasted plain-text lyrics for mobile manual import.
 * Produces official Song-shaped { titleLine, content } with:
 * - blank lines → slides (\n\n)
 * - CORO + lyrics (no blank between) → yellow CORO + interleave after each verse
 * - "repetir o louvor" / "repetir primeira estrofe" / "repetir o coro" → expand content
 * - BIS / FINAL / INSTRUMENTOS / (Nx) → yellow labels (no lyric duplication)
 */

const { formatYellowLabel, classifyLabel } = require('./markers');
const { parseTitleNumber } = require('./ir');

const IMPORT_TITLE_RE = /^i(\d+)\s*[-–—]\s*(.+)$/i;

const REPEAT_LOUVOR_RE =
  /^(repetir(\s+o)?\s+louvor|bis(\s+o)?\s+louvor)$/i;
const REPEAT_FIRST_RE =
  /^(repetir(\s+a)?\s+(primeira|1[aª]?)\s+estrofe)$/i;
const REPEAT_CORO_RE = /^(repetir(\s+o)?\s+coro)$/i;
const REPEAT_ESTROFE_N_RE =
  /^repetir(\s+a)?\s+(\d+)[aª]?\s+estrofe$/i;

const CHORUS_LINE_RE = /^(CORO|REFR[AÃ]O)(?:\s*\((\d+)\s*X\))?:?$/i;

function splitBlocks(body) {
  return String(body || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function blockLines(block) {
  return String(block || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function isChorusHeader(line) {
  return CHORUS_LINE_RE.test(String(line || '').trim());
}

function parseChorusHeader(line) {
  const m = String(line || '')
    .trim()
    .match(CHORUS_LINE_RE);
  if (!m) return null;
  const n = m[2] ? Number(m[2]) : null;
  return {
    label: n ? `CORO (${n}X)` : 'CORO',
  };
}

function detectCommand(lines) {
  if (lines.length !== 1) return null;
  const t = lines[0].trim();
  if (REPEAT_LOUVOR_RE.test(t)) return { kind: 'repeat_song' };
  if (REPEAT_FIRST_RE.test(t)) return { kind: 'repeat_first' };
  if (REPEAT_CORO_RE.test(t)) return { kind: 'repeat_chorus' };
  const m = t.match(REPEAT_ESTROFE_N_RE);
  if (m) return { kind: 'repeat_verse_n', n: Number(m[2]) };
  return null;
}

function makeChorusSlide(headerLine, bodyLines) {
  const header = parseChorusHeader(headerLine) || { label: 'CORO' };
  const parts = [formatYellowLabel(header.label)];
  for (const line of bodyLines) {
    if (isChorusHeader(line)) continue;
    parts.push(line);
  }
  return parts.join('\n');
}

function makeMarkerSlide(lines) {
  const out = [];
  for (const line of lines) {
    const classified = classifyLabel(line);
    if (classified && classified.kind === 'section') {
      const label =
        classified.type === 'chorus'
          ? classified.repeat && classified.repeat.kind === 'nx'
            ? `CORO (${classified.repeat.n}X)`
            : 'CORO'
          : classified.type === 'final'
            ? 'FINAL:'
            : classified.type === 'instruments'
              ? 'INSTRUMENTOS'
              : classified.type === 'part_cue'
                ? line.trim().toUpperCase()
                : String(line).trim().toUpperCase();
      out.push(formatYellowLabel(label));
    } else if (classified && classified.kind === 'repeat') {
      if (classified.repeat && classified.repeat.kind === 'bis') {
        out.push(formatYellowLabel('(BIS)'));
      } else if (classified.repeat && classified.repeat.kind === 'nx') {
        out.push(formatYellowLabel(`(${classified.repeat.n}X)`));
      }
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

function isPureMarkerBlock(lines) {
  if (!lines.length) return false;
  return lines.every((line) => {
    const c = classifyLabel(line);
    return c && (c.kind === 'section' || c.kind === 'repeat');
  });
}

function rebuildInterleaved(verses, chorusSlide) {
  const slides = [];
  for (const v of verses) {
    slides.push(v);
    if (chorusSlide) slides.push(chorusSlide);
  }
  return slides;
}

/**
 * @param {string} rawText
 * @returns {{ titleLine: string, title: string, content: string, warnings: string[] }}
 */
function normalizeManualPaste(rawText) {
  const warnings = [];
  const full = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!full) {
    const err = new Error('cole a letra do louvor');
    err.code = 'EMPTY';
    err.status = 400;
    throw err;
  }

  const allLines = full.split('\n');
  while (allLines.length && !allLines[0].trim()) allLines.shift();
  if (!allLines.length) {
    const err = new Error('cole a letra do louvor');
    err.code = 'EMPTY';
    err.status = 400;
    throw err;
  }

  const titleLine = allLines[0].trim();
  const body = allLines.slice(1).join('\n');
  const blocks = splitBlocks(body);

  let chorusSlide = null;
  let verses = [];
  let slides = [];
  let startedWithChorus = false;

  function applyChorusDiscovery() {
    if (!chorusSlide) return;
    if (verses.length) {
      slides = rebuildInterleaved(verses, chorusSlide);
    } else if (startedWithChorus) {
      slides = [chorusSlide];
    }
  }

  for (const block of blocks) {
    const lines = blockLines(block);
    if (!lines.length) continue;

    const cmd = detectCommand(lines);
    if (cmd) {
      if (cmd.kind === 'repeat_song') {
        if (slides.length) slides = slides.concat(slides.slice());
        else warnings.push('repetir o louvor sem conteúdo anterior');
      } else if (cmd.kind === 'repeat_first') {
        if (verses[0]) slides.push(verses[0]);
        else warnings.push('repetir primeira estrofe: nenhuma estrofe ainda');
      } else if (cmd.kind === 'repeat_chorus') {
        if (chorusSlide) slides.push(chorusSlide);
        else warnings.push('repetir o coro: coro ainda não definido');
      } else if (cmd.kind === 'repeat_verse_n') {
        const idx = cmd.n - 1;
        if (verses[idx]) slides.push(verses[idx]);
        else warnings.push(`repetir estrofe ${cmd.n}: estrofe inexistente`);
      }
      continue;
    }

    if (isChorusHeader(lines[0])) {
      chorusSlide = makeChorusSlide(lines[0], lines.slice(1));
      if (!verses.length && slides.length === 0) {
        startedWithChorus = true;
      }
      applyChorusDiscovery();
      continue;
    }

    // Pure marker block (FINAL, BIS, INSTRUMENTOS…) — keep as slide, no interleave
    if (isPureMarkerBlock(lines)) {
      slides.push(makeMarkerSlide(lines));
      continue;
    }

    // Mixed: first line marker section (FINAL + lyrics) without being chorus
    const firstClass = classifyLabel(lines[0]);
    if (
      firstClass &&
      firstClass.kind === 'section' &&
      firstClass.type !== 'chorus'
    ) {
      slides.push(makeMarkerSlide(lines));
      continue;
    }

    // Verse
    const verseSlide = lines.join('\n');
    verses.push(verseSlide);
    slides.push(verseSlide);
    if (chorusSlide) {
      slides.push(chorusSlide);
    }
  }

  // Drop trailing duplicate chorus if last two are chorus copies (shouldn't happen with our logic)
  if (
    chorusSlide &&
    slides.length >= 2 &&
    slides[slides.length - 1] === chorusSlide &&
    slides[slides.length - 2] === chorusSlide
  ) {
    slides.pop();
  }

  const content = slides.join('\n\n');
  if (!content.trim()) {
    const err = new Error('letra vazia após o título');
    err.code = 'EMPTY_BODY';
    err.status = 400;
    throw err;
  }

  let title = titleLine;
  const importMatch = titleLine.match(IMPORT_TITLE_RE);
  if (importMatch) {
    title = `i${Number(importMatch[1])} - ${importMatch[2].trim()}`;
  } else {
    const parsed = parseTitleNumber(titleLine);
    if (parsed.number != null) {
      title = `${parsed.number} - ${parsed.titleRaw}`;
    } else {
      title = parsed.titleRaw || titleLine;
    }
  }

  return {
    titleLine,
    title,
    content,
    warnings,
  };
}

module.exports = {
  normalizeManualPaste,
  splitBlocks,
  detectCommand,
  isChorusHeader,
};
