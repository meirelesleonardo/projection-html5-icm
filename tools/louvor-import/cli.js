#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { processFile, processPaths, extractFile } = require('./lib/pipeline');
const { songToCanonical } = require('./lib/parse-song');
const { canonicalToSong } = require('./lib/format-song');
const { ensureStaging, DEFAULT_ROOT } = require('./lib/staging');

function usage() {
  console.log(`Uso:
  node tools/louvor-import/cli.js extract <arquivo> [--collection 2022] [--max-slides N] [--only 1,2,5]
  node tools/louvor-import/cli.js import <arquivo|dir> [--collection 2022] [--library data/data.json]
  node tools/louvor-import/cli.js sample-2022
  node tools/louvor-import/cli.js roundtrip-check

Nunca grava data/data.json. Saída em imports/.`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--collection') args.collection = argv[++i];
    else if (a === '--library') args.library = argv[++i];
    else if (a === '--max-slides') args.maxSlides = Number(argv[++i]);
    else if (a === '--only')
      args.onlyNumbers = String(argv[++i])
        .split(',')
        .map((x) => Number(x.trim()))
        .filter(Boolean);
    else if (a === '--staging') args.stagingRoot = argv[++i];
    else if (a === '--keep-raw') args.keepRawSlides = true;
    else if (a.startsWith('-')) throw new Error(`flag desconhecida: ${a}`);
    else args._.push(a);
  }
  return args;
}

function loadLibrary(p) {
  if (!p) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectFiles(input) {
  const st = fs.statSync(input);
  if (st.isFile()) return [input];
  return fs
    .readdirSync(input)
    .filter((f) => /\.(txt|docx|pdf|pptx|ppt)$/i.test(f))
    .map((f) => path.join(input, f));
}

function cmdSample2022(args) {
  const root = path.join(__dirname, '..', '..');
  const pptx = path.join(root, 'docs', '01.COLETÂNEA_IGREJAS-2022_PROJETOR-4.3.pptx');
  if (!fs.existsSync(pptx)) {
    console.error('PPTX 2022 não encontrado:', pptx);
    process.exit(1);
  }
  const library = loadLibrary(path.join(root, 'data', 'data.json'));
  // Representative sample numbers from plan
  const onlyNumbers = args.onlyNumbers || [1, 2, 4, 22, 50, 67, 100];
  const result = processFile(pptx, {
    collection: '2022',
    targetFolderName: 'Coletânea 2022',
    library,
    onlyNumbers,
    maxSlides: args.maxSlides || 500,
    stagingRoot: args.stagingRoot || DEFAULT_ROOT,
    keepRawSlides: false,
  });
  const { saveReport, ensureStaging: es } = require('./lib/staging');
  es(args.stagingRoot || DEFAULT_ROOT);
  const report = {
    name: 'sample-2022',
    files: 1,
    processed: 1,
    success: result.fileReport.ok ? 1 : 0,
    failed: result.fileReport.ok ? 0 : 1,
    needsReview: result.fileReport.needsReviewCount || 0,
    newSongs: (result.fileReport.duplicates || []).filter((d) => d.code === 'NEW_SONG').length,
    possibleDuplicates: (result.fileReport.duplicates || []).filter(
      (d) => d.code === 'POSSIBLE_DUPLICATE'
    ).length,
    sameSongDifferentVersion: (result.fileReport.duplicates || []).filter(
      (d) => d.code === 'SAME_SONG_DIFFERENT_VERSION'
    ).length,
    exactDuplicates: (result.fileReport.duplicates || []).filter(
      (d) => d.code === 'EXACT_DUPLICATE'
    ).length,
    fileReports: [result.fileReport],
    sampleNumbers: onlyNumbers,
    paths: result.paths,
    note: 'Amostra representativa — sem merge em data.json.',
  };
  const saved = saveReport(args.stagingRoot || DEFAULT_ROOT, 'sample-2022', report);
  console.log(JSON.stringify({ report, saved, paths: result.paths }, null, 2));
}

function cmdRoundtrip() {
  const root = path.join(__dirname, '..', '..');
  const fixtures = path.join(__dirname, 'test', 'fixtures', 'sample-songs.json');
  const samples = JSON.parse(fs.readFileSync(fixtures, 'utf8'));
  let fail = 0;
  for (const song of samples) {
    const ir = songToCanonical(song, { type: 'json', collection: 'Coletânea 2018' });
    const back = canonicalToSong(ir);
    // Compare slide count and normalized text loosely
    const a = song.content.replace(/\s+/g, ' ').trim();
    const b = back.content.replace(/\s+/g, ' ').trim();
    const slidesA = song.content.split(/\n\n+/).length;
    const slidesB = back.content.split(/\n\n+/).length;
    const titleOk = back.title === song.title || back.title.replace(/\s+/g, ' ') === song.title;
    const slidesOk = slidesA === slidesB;
    // HTML may normalize whitespace inside tags — check strip similarity
    const { normalizeForCompare } = require('./lib/validate');
    const textOk = normalizeForCompare(a) === normalizeForCompare(b);
    if (!titleOk || !slidesOk || !textOk) {
      fail++;
      console.error('FAIL', song.title, { titleOk, slidesOk, textOk, slidesA, slidesB });
    } else {
      console.log('OK', song.title);
    }
  }
  process.exit(fail ? 1 : 0);
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    usage();
    process.exit(1);
  }
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  ensureStaging(args.stagingRoot || DEFAULT_ROOT);

  if (cmd === 'roundtrip-check') {
    cmdRoundtrip();
    return;
  }
  if (cmd === 'sample-2022') {
    cmdSample2022(args);
    return;
  }
  if (cmd === 'extract') {
    const file = args._[0];
    if (!file) throw new Error('informe o arquivo');
    const doc = extractFile(path.resolve(file), {
      collection: args.collection || '',
      maxSlides: args.maxSlides,
      onlyNumbers: args.onlyNumbers,
    });
    console.log(
      JSON.stringify(
        {
          type: doc.type,
          songs: doc.songs.length,
          titles: doc.songs.slice(0, 20).map((s) => ({
            n: s.metadata.number,
            t: s.metadata.titleRaw,
            slides: s.presentation.slides.length,
          })),
        },
        null,
        2
      )
    );
    return;
  }
  if (cmd === 'import') {
    const input = args._[0];
    if (!input) throw new Error('informe arquivo ou diretório');
    const files = collectFiles(path.resolve(input));
    const root = path.join(__dirname, '..', '..');
    const library = loadLibrary(
      args.library ? path.resolve(args.library) : path.join(root, 'data', 'data.json')
    );
    const { report, saved } = processPaths(files, {
      collection: args.collection || '',
      library,
      maxSlides: args.maxSlides,
      onlyNumbers: args.onlyNumbers,
      stagingRoot: args.stagingRoot || DEFAULT_ROOT,
      reportName: `import-${Date.now()}`,
    });
    console.log(JSON.stringify({ report, saved }, null, 2));
    return;
  }
  usage();
  process.exit(1);
}

try {
  main();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
