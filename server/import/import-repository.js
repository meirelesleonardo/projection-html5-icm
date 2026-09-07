'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const STATUSES = [
  'UPLOADED',
  'EXTRACTED',
  'NORMALIZED',
  'REVIEW',
  'VALIDATED',
  'APPROVED',
  'APPLIED',
  'FAILED',
  'REJECTED',
  'CANCELLED',
];

function createImportRepository(options = {}) {
  const rootDir = options.rootDir;
  const importsDir =
    options.importsDir || path.join(rootDir, 'data', 'imports');

  function ensureRoot() {
    fs.mkdirSync(importsDir, { recursive: true });
  }

  function jobDir(id) {
    const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) throw new Error('import id inválido');
    return path.join(importsDir, safe);
  }

  function writePretty(filePath, obj) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  }

  function readJson(filePath, fallback = null) {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function newImportId() {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const short = randomUUID().replace(/-/g, '').slice(0, 6);
    return `${day}-${short}`;
  }

  function createJob(meta) {
    ensureRoot();
    const id = meta.id || newImportId();
    const dir = jobDir(id);
    fs.mkdirSync(path.join(dir, 'source'), { recursive: true });
    const now = new Date().toISOString();
    const job = {
      id,
      status: 'UPLOADED',
      sourceFile: meta.sourceFile || '',
      sourceType: meta.sourceType || '',
      sourceSize: meta.sourceSize || 0,
      libraryName: meta.libraryName || '',
      libraryNameNormalized: meta.libraryNameNormalized || '',
      type: 's',
      lang: meta.lang || 'pt',
      createdAt: now,
      updatedAt: now,
      statistics: {
        found: 0,
        new: 0,
        update: 0,
        unchanged: 0,
        conflict: 0,
        review: 0,
        error: 0,
        selected: 0,
      },
      errors: [],
      warnings: [],
      previewVersion: 0,
      appliedAt: null,
      appliedBackup: null,
      libraryVersionBefore: null,
      libraryVersionAfter: null,
    };
    writePretty(path.join(dir, 'status.json'), job);
    writePretty(path.join(dir, 'decisions.json'), { decisions: {} });
    return job;
  }

  function listJobs() {
    ensureRoot();
    return fs
      .readdirSync(importsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '.' && !d.name.startsWith('.'))
      .map((d) => {
        try {
          return readJson(path.join(importsDir, d.name, 'status.json'));
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function getJob(id) {
    const dir = jobDir(id);
    const job = readJson(path.join(dir, 'status.json'));
    if (!job) {
      const err = new Error('importação não encontrada');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }
    return job;
  }

  function updateJob(id, patch) {
    const dir = jobDir(id);
    const job = getJob(id);
    const next = {
      ...job,
      ...patch,
      id: job.id,
      updatedAt: new Date().toISOString(),
      statistics: patch.statistics
        ? { ...job.statistics, ...patch.statistics }
        : job.statistics,
      errors: patch.errors != null ? patch.errors : job.errors,
      warnings: patch.warnings != null ? patch.warnings : job.warnings,
    };
    if (patch.status && !STATUSES.includes(patch.status)) {
      throw new Error(`status inválido: ${patch.status}`);
    }
    writePretty(path.join(dir, 'status.json'), next);
    return next;
  }

  function saveArtifact(id, name, obj) {
    const dir = jobDir(id);
    writePretty(path.join(dir, name), obj);
  }

  function readArtifact(id, name, fallback = null) {
    return readJson(path.join(jobDir(id), name), fallback);
  }

  function sourcePath(id, filename) {
    return path.join(jobDir(id), 'source', filename);
  }

  function getDecisions(id) {
    return readArtifact(id, 'decisions.json', { decisions: {} });
  }

  function saveDecisions(id, decisions) {
    saveArtifact(id, 'decisions.json', { decisions: decisions || {} });
  }

  /** Titles already assigned as iN in APPLIED jobs (for collision avoidance). */
  function collectAppliedImportTitles() {
    const titles = [];
    for (const job of listJobs()) {
      if (job.status !== 'APPLIED') continue;
      const draft = readArtifact(job.id, 'folder-draft.json');
      if (!draft || !Array.isArray(draft.songs)) continue;
      for (const s of draft.songs) {
        if (s && s.title) titles.push(s.title);
      }
    }
    return titles;
  }

  return {
    importsDir,
    STATUSES,
    createJob,
    listJobs,
    getJob,
    updateJob,
    saveArtifact,
    readArtifact,
    sourcePath,
    jobDir,
    getDecisions,
    saveDecisions,
    collectAppliedImportTitles,
    writePretty,
    newImportId,
  };
}

module.exports = { createImportRepository, STATUSES };
