'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { createCanonicalSong, createSlide } = require('../ir');
const { annotatePlainLines } = require('../markers');

const TITLE_FOOTER_RE = /^(\d{1,4})\s*[-–—]\s*(.+)$/;

/**
 * Extract text lines from a slide XML (OOXML).
 */
function extractTextFromSlideXml(xml) {
  const lines = [];
  const paras = String(xml).split(/<\/a:p>/i);
  for (const para of paras) {
    const texts = [];
    // Use <a:t> or <a:t …> — NOT <a:txBody> / <a:tab> (prefix trap)
    const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi;
    let m;
    while ((m = re.exec(para))) {
      texts.push(decodeXml(m[1]));
    }
    const line = texts.join('').replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
  }
  return lines;
}

function decodeXml(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function listSlideFiles(slidesDir) {
  return fs
    .readdirSync(slidesDir)
    .filter((n) => /^slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)[1]);
      const nb = Number(b.match(/slide(\d+)/i)[1]);
      return na - nb;
    })
    .map((n) => path.join(slidesDir, n));
}

function detectTitleLine(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(TITLE_FOOTER_RE);
    if (m) {
      return {
        number: Number(m[1]),
        titleRaw: m[2].trim(),
        index: i,
      };
    }
  }
  for (let i = 0; i < Math.min(2, lines.length); i++) {
    const m = lines[i].match(TITLE_FOOTER_RE);
    if (m) {
      return {
        number: Number(m[1]),
        titleRaw: m[2].trim(),
        index: i,
      };
    }
  }
  return null;
}

function isIndexSlide(lines, slideIndex) {
  if (slideIndex !== 1) return false;
  const joined = lines.join(' ').toUpperCase();
  return /COLET[AÂ]NEA/.test(joined) && lines.length > 20;
}

function isClosingArt(lines, slideIndex, total) {
  if (slideIndex < total - 2) return false;
  const joined = lines.join(' ').toUpperCase();
  return /MARANATA/.test(joined) && lines.length <= 8;
}

function isNavOnly(line) {
  return /^[ií]ndice$/i.test(line.trim());
}

const MARKER_LINE_RE =
  /^(CORO(?:\s*\(\d+\s*X\))?|BIS(?:\s*\(\d+\s*X\))?|FINAL:?|FINALE:?|INSTRUMENTOS)\s*$/i;

function isMarkerLine(line) {
  return MARKER_LINE_RE.test(String(line || '').trim()) || isNavOnly(line);
}

function looksLikeTitle(line) {
  const t = String(line || '').trim();
  if (!t || isMarkerLine(t)) return false;
  if (t.length > 55) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 10) return false;
  // Lyric cadence: trailing punctuation on a longer phrase
  if (/[,;.:!?]$/.test(t) && (t.length > 20 || words.length > 4)) return false;
  return true;
}

/**
 * Pick title from the first slide of an unnumbered song.
 * Prefer a short last line (footer-style), else a short first line.
 */
function detectUnnumberedTitle(lines) {
  const body = (lines || [])
    .map((l, i) => ({ text: String(l).trim(), index: i }))
    .filter((x) => x.text && !isNavOnly(x.text) && !isMarkerLine(x.text));

  if (!body.length) {
    return { titleRaw: 'Sem título', index: -1, needsReview: true };
  }

  const first = body[0];
  const last = body[body.length - 1];
  const lastOk = looksLikeTitle(last.text);
  const firstOk = looksLikeTitle(first.text);

  if (lastOk && last.index !== first.index) {
    // Footer title only when the opener looks like a lyric line (long / not title-like)
    const lastIsFooter =
      last.text.length < first.text.length &&
      (first.text.length > 35 || !firstOk);
    if (lastIsFooter) {
      return { titleRaw: last.text, index: last.index, needsReview: false };
    }
  }
  if (firstOk) {
    return { titleRaw: first.text, index: first.index, needsReview: false };
  }
  if (lastOk) {
    return { titleRaw: last.text, index: last.index, needsReview: false };
  }
  return { titleRaw: first.text, index: first.index, needsReview: true };
}

function slideHasIndexMarker(lines) {
  return (lines || []).some((l) => isNavOnly(l));
}

/**
 * Segment slides using "Índice" as end-of-song marker (avulsos / unnumbered decks).
 */
function segmentSongsByIndexMarker(slideRecords) {
  const songs = [];
  let bucket = [];

  function flush() {
    if (!bucket.length) return;
    const first = bucket[0];
    const title = detectUnnumberedTitle(first.lines);
    const slides = bucket.map((rec, slideIdx) => {
      let lines = (rec.lines || []).filter((l) => !isNavOnly(l));
      if (slideIdx === 0 && title.index >= 0) {
        // Remove title line from first slide body (match by original index among all lines)
        const orig = rec.lines || [];
        const titleText = orig[title.index];
        let removed = false;
        lines = lines.filter((l) => {
          if (!removed && l === titleText) {
            removed = true;
            return false;
          }
          return true;
        });
      }
      return {
        lines,
        sourceSlideIndex: rec.index,
        warnings: rec.warnings || [],
      };
    });

    songs.push({
      number: null,
      titleRaw: title.titleRaw,
      slides,
      needsReview: Boolean(title.needsReview),
    });
    bucket = [];
  }

  for (const rec of slideRecords) {
    if (rec.skip) continue;
    bucket.push(rec);
    if (slideHasIndexMarker(rec.lines)) flush();
  }
  flush();
  return songs;
}

function normalizeTitle(t) {
  return String(t || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deckHasNumberedTitles(slideRecords) {
  for (const rec of slideRecords) {
    if (rec.skip) continue;
    if (detectTitleLine(rec.lines)) return true;
  }
  return false;
}

/**
 * Segment slides into songs using numbered title markers.
 */
function segmentSongs(slideRecords) {
  const songs = [];
  let current = null;

  function startSong(meta, slide) {
    if (current) songs.push(current);
    current = {
      number: meta.number,
      titleRaw: meta.titleRaw,
      slides: [slide],
    };
  }

  for (const rec of slideRecords) {
    if (rec.skip) continue;
    const title = detectTitleLine(rec.lines);
    const bodyLines = rec.lines.filter((l) => !isNavOnly(l));

    if (title) {
      const lyricLines = bodyLines.filter((l) => {
        const m = l.match(TITLE_FOOTER_RE);
        if (m && Number(m[1]) === title.number) return false;
        return true;
      });

      const isNew =
        !current ||
        current.number !== title.number ||
        normalizeTitle(current.titleRaw) !== normalizeTitle(title.titleRaw);

      const slide = {
        lines: lyricLines.length ? lyricLines : bodyLines.filter((l) => !TITLE_FOOTER_RE.test(l)),
        sourceSlideIndex: rec.index,
        warnings: rec.warnings || [],
      };

      if (isNew) startSong(title, slide);
      else current.slides.push(slide);
    } else if (current) {
      current.slides.push({
        lines: bodyLines,
        sourceSlideIndex: rec.index,
        warnings: rec.warnings || [],
      });
    }
  }
  if (current) songs.push(current);
  return songs;
}

/**
 * Prefer numbered segmentation; fall back to Índice-marker segmentation for avulsos.
 */
function segmentSongsAuto(slideRecords) {
  if (deckHasNumberedTitles(slideRecords)) {
    const numbered = segmentSongs(slideRecords);
    if (numbered.length) return numbered;
  }
  return segmentSongsByIndexMarker(slideRecords);
}

/**
 * Full PPTX extraction → RawDocument + CanonicalSongs (structured mode).
 */
function extractPptx(filePath, options = {}) {
  const collection = options.collection || '2022';
  const maxSlides = options.maxSlides != null ? options.maxSlides : Infinity;
  const onlyNumbers = options.onlyNumbers ? new Set(options.onlyNumbers.map(Number)) : null;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'louvor-pptx-'));
  try {
    execFileSync('unzip', ['-qq', '-o', filePath, 'ppt/slides/*.xml', '-d', tmp], {
      stdio: 'ignore',
    });
    const slidesDir = path.join(tmp, 'ppt', 'slides');
    const files = listSlideFiles(slidesDir);
    const total = files.length;
    const slideRecords = [];
    const rawSlides = [];
    const limit = Math.min(total, maxSlides);

    for (let i = 0; i < limit; i++) {
      const file = files[i];
      const idx = Number(path.basename(file).match(/slide(\d+)/i)[1]);
      const xml = fs.readFileSync(file, 'utf8');
      const lines = extractTextFromSlideXml(xml);
      const warnings = [];
      if (/p:timing|p:anim/i.test(xml)) warnings.push('animações detectadas (ignoradas)');
      const skip =
        isIndexSlide(lines, idx) ||
        isClosingArt(lines, idx, total) ||
        lines.length === 0;

      const rec = { index: idx, entry: file, lines, warnings, skip };
      slideRecords.push(rec);
      rawSlides.push({ index: idx, lines, skip, warnings });
    }

    let segmented = segmentSongsAuto(slideRecords);
    if (onlyNumbers) {
      segmented = segmented.filter((s) => onlyNumbers.has(s.number));
    }

    const songs = segmented.map((seg) => {
      const slideObjs = seg.slides.map((s) => {
        const { slideLines, sections } = annotatePlainLines(s.lines);
        return {
          slide: createSlide(slideLines, {
            sourceSlideIndex: s.sourceSlideIndex,
            warnings: s.warnings,
          }),
          sections,
        };
      });

      const sections = [];
      for (const x of slideObjs) sections.push(...x.sections);
      const slides = slideObjs.map((x) => x.slide);

      const densityWarnings = [];
      for (const sl of slides) {
        if ((sl.lines || []).length > 9) densityWarnings.push('slide denso (>9 linhas)');
      }
      const warnings = densityWarnings.slice();
      if (seg.needsReview) warnings.push('título sem número — revisar');

      return createCanonicalSong({
        titleRaw: seg.titleRaw,
        number: seg.number != null ? seg.number : null,
        collectionHint: collection,
        source: {
          type: 'pptx',
          file: path.basename(filePath),
          collection,
        },
        sections,
        presentation: {
          mode: 'structured',
          slides,
          sourcePresentation: {
            type: 'pptx',
            slideIndexes: slides.map((s) => s.sourceSlideIndex),
          },
        },
        needsReview: densityWarnings.length > 0 || Boolean(seg.needsReview),
        warnings,
      });
    });

    return {
      type: 'pptx',
      file: filePath,
      slideCount: total,
      processedSlides: limit,
      rawSlides,
      songs,
      warnings: [],
    };
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (_) {}
  }
}

module.exports = {
  extractPptx,
  extractTextFromSlideXml,
  segmentSongs,
  segmentSongsByIndexMarker,
  segmentSongsAuto,
  detectTitleLine,
  detectUnnumberedTitle,
};
