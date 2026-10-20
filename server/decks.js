'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { findSoffice, findPdftoppm } = require('./which-tool');

const DECK_EXTS = /\.(pptx|ppt|odp|pdf)$/i;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || process.cwd(),
      env: process.env,
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timeout ao executar ${cmd}`));
    }, opts.timeoutMs || 180000);
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${cmd} saiu com código ${code}`));
    });
  });
}

function sanitizeDeckTitle(name) {
  const base = path.basename(String(name || 'apresentacao'));
  return base.replace(/[^a-zA-Z0-9._\u00C0-\u024F -]/g, '_').replace(/\s+/g, ' ').trim() || 'apresentacao';
}

function listDecks(decksDir) {
  if (!fs.existsSync(decksDir)) return [];
  return fs
    .readdirSync(decksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const id = d.name;
      const metaPath = path.join(decksDir, id, 'meta.json');
      if (!fs.existsSync(metaPath)) return null;
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function safeDeckId(id) {
  const s = String(id || '');
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

function deleteDeck(decksDir, id) {
  const safe = safeDeckId(id);
  if (!safe) return false;
  const dir = path.join(decksDir, safe);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

async function checkTools() {
  const soffice = findSoffice();
  const pdftoppm = findPdftoppm();
  return { soffice, pdftoppm };
}

function missingToolMessage(tool) {
  if (tool === 'pdftoppm' && process.platform === 'win32') {
    return 'pdftoppm não encontrado. Instale o Poppler e coloque pdftoppm.exe no PATH.';
  }
  if (tool === 'pdftoppm') {
    return 'pdftoppm não encontrado. Instale: sudo apt install -y poppler-utils';
  }
  if (process.platform === 'win32') {
    return 'LibreOffice não encontrado. Instale o LibreOffice (soffice.exe em Program Files) ou coloque-o no PATH.';
  }
  return 'LibreOffice não encontrado. Instale: sudo apt install -y libreoffice-impress';
}

/**
 * Convert uploaded pptx/ppt/odp/pdf into PNG slides under decksDir/<id>/.
 */
async function convertUploadedDeck(decksDir, uploadedPath, originalName) {
  const tools = await checkTools();
  if (!tools.pdftoppm) {
    const err = new Error(missingToolMessage('pdftoppm'));
    err.code = 'MISSING_TOOLS';
    throw err;
  }

  const ext = path.extname(originalName || uploadedPath).toLowerCase();
  if (!DECK_EXTS.test(ext)) {
    const err = new Error('Formato inválido. Use .pptx, .ppt, .odp ou .pdf');
    err.code = 'BAD_FORMAT';
    throw err;
  }

  const id = randomUUID().replace(/-/g, '').slice(0, 16);
  const outDir = path.join(decksDir, id);
  fs.mkdirSync(outDir, { recursive: true });

  let pdfPath = path.join(outDir, 'deck.pdf');

  try {
    if (ext === '.pdf') {
      fs.copyFileSync(uploadedPath, pdfPath);
    } else {
      if (!tools.soffice) {
        const err = new Error(missingToolMessage('soffice'));
        err.code = 'MISSING_TOOLS';
        throw err;
      }
      // LibreOffice writes <stem>.pdf into outDir
      await run(
        tools.soffice,
        ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', outDir, uploadedPath],
        { timeoutMs: 240000 }
      );
      const pdfs = fs.readdirSync(outDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
      if (!pdfs.length) {
        throw new Error('Conversão para PDF falhou (nenhum PDF gerado)');
      }
      const generated = path.join(outDir, pdfs[0]);
      if (generated !== pdfPath) {
        fs.renameSync(generated, pdfPath);
      }
    }

    const prefix = path.join(outDir, 'slide');
    await run(tools.pdftoppm, ['-png', '-r', '150', pdfPath, prefix], { timeoutMs: 180000 });

    const slides = fs
      .readdirSync(outDir)
      .filter((f) => /^slide-\d+\.png$/i.test(f))
      .sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return na - nb;
      })
      .map((f) => `/media/decks/${id}/${f}`);

    if (!slides.length) {
      throw new Error('Nenhum slide PNG gerado a partir do PDF');
    }

    const title = sanitizeDeckTitle(originalName).replace(DECK_EXTS, '') || 'Apresentação';
    const meta = {
      id,
      title,
      slides,
      slideCount: slides.length,
      createdAt: new Date().toISOString(),
      sourceExt: ext,
    };
    fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

    // Keep pdf for reprocess; remove original upload temp if different
    return meta;
  } catch (err) {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch (_) {}
    throw err;
  } finally {
    try {
      if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    } catch (_) {}
  }
}

module.exports = {
  DECK_EXTS,
  listDecks,
  deleteDeck,
  safeDeckId,
  convertUploadedDeck,
  checkTools,
  sanitizeDeckTitle,
};
