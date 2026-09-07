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

function normalizeTitle(t) {
  return String(t || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

    let segmented = segmentSongs(slideRecords);
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

      return createCanonicalSong({
        titleRaw: seg.titleRaw,
        number: seg.number,
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
        needsReview: densityWarnings.length > 0,
        warnings: densityWarnings,
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
  detectTitleLine,
};
