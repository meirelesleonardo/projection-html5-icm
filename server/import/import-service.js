'use strict';

const fs = require('fs');
const path = require('path');
const { extractFile } = require('../../tools/louvor-import/lib/pipeline');
const { canonicalToSong } = require('../../tools/louvor-import/lib/format-song');
const { validateOfficialSong } = require('../../tools/louvor-import/lib/validate');
const {
  normalizeName,
  getNextImportNumber,
  suggestLibraryNameFromFile,
  parseSongIdentity,
} = require('./numbering');
const { findFolderByName, buildMergePlan, applyMergePlan } = require('./merge-engine');
const { validateLibrary } = require('../library-validate');

function detectTypeFromName(name) {
  const ext = path.extname(name || '').toLowerCase();
  if (ext === '.txt') return 'txt';
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.pptx' || ext === '.ppt') return 'pptx';
  return null;
}

function createImportService(deps) {
  const { importRepo, libraryStore } = deps;

  function loadLibrarySafe() {
    try {
      return libraryStore.load();
    } catch (e) {
      if (e.code === 'ENOENT') {
        return { library: [], version: 0, updatedAt: null };
      }
      throw e;
    }
  }

  /**
   * Create job from already-stored source file path inside job/source.
   */
  function startFromUpload(opts) {
    const originalName = opts.originalName || 'upload.bin';
    const sourceType = detectTypeFromName(originalName);
    if (!sourceType) {
      const err = new Error('Formato não suportado. Use .pptx, .ppt, .pdf, .docx ou .txt');
      err.code = 'BAD_FORMAT';
      err.status = 400;
      throw err;
    }

    const libraryName =
      opts.libraryName || suggestLibraryNameFromFile(originalName);
    const job = importRepo.createJob({
      sourceFile: originalName,
      sourceType,
      sourceSize: opts.sourceSize || 0,
      libraryName,
      libraryNameNormalized: normalizeName(libraryName),
      lang: opts.lang || 'pt',
    });

    const dest = importRepo.sourcePath(job.id, originalName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (opts.tempPath && opts.tempPath !== dest) {
      fs.renameSync(opts.tempPath, dest);
    }

    try {
      processExtraction(job.id, dest, {
        collection: libraryName,
        maxSlides: opts.maxSlides,
      });
    } catch (e) {
      importRepo.updateJob(job.id, {
        status: 'FAILED',
        errors: [e.message || String(e)],
      });
      throw e;
    }

    return importRepo.getJob(job.id);
  }

  function processExtraction(id, filePath, options = {}) {
    importRepo.updateJob(id, { status: 'UPLOADED', errors: [] });
    const doc = extractFile(filePath, {
      collection: options.collection || '',
      maxSlides: options.maxSlides,
    });

    importRepo.saveArtifact(id, 'extracted.json', {
      type: doc.type,
      file: path.basename(filePath),
      slideCount: doc.slideCount,
      processedSlides: doc.processedSlides,
      songCount: (doc.songs || []).length,
      warnings: doc.warnings || [],
    });
    importRepo.updateJob(id, {
      status: 'EXTRACTED',
      warnings: doc.warnings || [],
      statistics: { found: (doc.songs || []).length },
    });

    const officialSongs = [];
    const normalized = [];
    const errors = [];

    for (let i = 0; i < (doc.songs || []).length; i++) {
      const ir = doc.songs[i];
      try {
        const song = canonicalToSong(ir);
        const v = validateOfficialSong(song);
        if (!v.ok) {
          errors.push(`${song.title || i}: ${v.errors.join('; ')}`);
          continue;
        }
        const key = `s${i}-${(ir.metadata && ir.metadata.number) || 'x'}`;
        officialSongs.push({
          key,
          title: song.title,
          content: song.content,
          needsReview: Boolean(ir.needsReview),
          selected: true,
        });
        normalized.push(ir);
      } catch (e) {
        errors.push(`song[${i}]: ${e.message}`);
      }
    }

    importRepo.saveArtifact(id, 'normalized.json', {
      songs: normalized,
      savedAt: new Date().toISOString(),
    });

    const job = importRepo.getJob(id);
    const folderDraft = {
      name: job.libraryName,
      type: 's',
      lang: job.lang || 'pt',
      songs: officialSongs.map((s) => ({
        key: s.key,
        title: s.title,
        content: s.content,
        needsReview: s.needsReview,
        selected: s.selected,
      })),
    };
    importRepo.saveArtifact(id, 'folder-draft.json', folderDraft);

    importRepo.updateJob(id, {
      status: errors.length && !officialSongs.length ? 'FAILED' : 'NORMALIZED',
      errors,
      statistics: { found: officialSongs.length },
    });

    // Auto-analyze into REVIEW
    analyze(id);
    return importRepo.getJob(id);
  }

  function patchJob(id, body) {
    const job = importRepo.getJob(id);
    if (['APPLIED', 'REJECTED', 'CANCELLED'].includes(job.status)) {
      const err = new Error('importação finalizada; não pode ser alterada');
      err.status = 409;
      err.code = 'IMMUTABLE';
      throw err;
    }

    const patch = {};
    if (body.libraryName != null) {
      patch.libraryName = String(body.libraryName).trim();
      patch.libraryNameNormalized = normalizeName(patch.libraryName);
    }
    if (body.lang != null) patch.lang = String(body.lang).trim() || 'pt';

    if (body.decisions && typeof body.decisions === 'object') {
      const cur = importRepo.getDecisions(id);
      importRepo.saveDecisions(id, { ...cur.decisions, ...body.decisions });
    }

    if (body.selection && typeof body.selection === 'object') {
      const draft = importRepo.readArtifact(id, 'folder-draft.json');
      if (draft && Array.isArray(draft.songs)) {
        for (const s of draft.songs) {
          if (Object.prototype.hasOwnProperty.call(body.selection, s.key)) {
            s.selected = Boolean(body.selection[s.key]);
          }
        }
        if (body.libraryName != null) draft.name = patch.libraryName || body.libraryName;
        if (body.lang != null) draft.lang = patch.lang || body.lang;
        importRepo.saveArtifact(id, 'folder-draft.json', draft);
      }
    } else if (body.libraryName != null || body.lang != null) {
      const draft = importRepo.readArtifact(id, 'folder-draft.json');
      if (draft) {
        if (body.libraryName != null) draft.name = patch.libraryName;
        if (body.lang != null) draft.lang = patch.lang;
        importRepo.saveArtifact(id, 'folder-draft.json', draft);
      }
    }

    if (Object.keys(patch).length) importRepo.updateJob(id, patch);

    if (body.reanalyze !== false) analyze(id);
    return getJobDetail(id);
  }

  function analyze(id) {
    const job = importRepo.getJob(id);
    const draft = importRepo.readArtifact(id, 'folder-draft.json');
    if (!draft || !Array.isArray(draft.songs)) {
      const err = new Error('folder-draft ausente; extraia novamente');
      err.status = 400;
      throw err;
    }

    const loaded = loadLibrarySafe();
    const matches = findFolderByName(loaded.library, job.libraryName);
    let targetFolder = null;
    let ambiguous = null;
    if (matches.length === 1) targetFolder = matches[0].folder;
    else if (matches.length > 1) {
      ambiguous = matches.map((m) => m.folder.name);
      targetFolder = matches.find((m) => m.folder.name === job.libraryName)?.folder || null;
    }

    const extraTitles = importRepo.collectAppliedImportTitles();
    const allocImportNumber = () =>
      getNextImportNumber(targetFolder || { songs: [] }, extraTitles);

    const decisions = importRepo.getDecisions(id).decisions || {};
    const selection = {};
    for (const s of draft.songs) selection[s.key] = s.selected !== false;

    const plan = buildMergePlan(draft.songs, targetFolder, {
      decisions,
      selection,
      allocImportNumber,
    });

    if (ambiguous) plan.ambiguousFolders = ambiguous;
    plan.targetFolderIndex =
      matches.length === 1 ? matches[0].index : targetFolder ? matches.find((m) => m.folder === targetFolder)?.index : null;
    plan.libraryName = job.libraryName;
    plan.analyzedAt = new Date().toISOString();
    plan.libraryVersion = loaded.version;

    importRepo.saveArtifact(id, 'preview.json', plan);

    const unresolved = plan.statistics.conflict + plan.statistics.review;
    importRepo.updateJob(id, {
      status: unresolved ? 'REVIEW' : 'VALIDATED',
      statistics: plan.statistics,
      previewVersion: (job.previewVersion || 0) + 1,
      warnings: ambiguous
        ? [...(job.warnings || []), `várias pastas similares: ${ambiguous.join(', ')}`]
        : job.warnings,
    });

    return plan;
  }

  function apply(id, opts = {}) {
    let job = importRepo.getJob(id);
    if (job.status === 'APPLIED') {
      const err = new Error('importação já aplicada');
      err.status = 409;
      throw err;
    }
    if (['REJECTED', 'CANCELLED', 'FAILED'].includes(job.status)) {
      const err = new Error(`não é possível aplicar status ${job.status}`);
      err.status = 409;
      throw err;
    }

    // Fresh analyze
    const plan = analyze(id);
    job = importRepo.getJob(id);

    const unresolved = (plan.items || []).filter(
      (it) =>
        it.selected &&
        (it.status === 'CONFLICT' || it.status === 'REVIEW' || it.status === 'ERROR')
    );
    if (unresolved.length) {
      const err = new Error(
        `${unresolved.length} item(ns) precisam decisão antes de aplicar`
      );
      err.status = 400;
      err.code = 'UNRESOLVED';
      err.items = unresolved.map((u) => u.key);
      throw err;
    }

    importRepo.updateJob(id, { status: 'APPROVED' });

    const loaded = loadLibrarySafe();
    const expectedVersion =
      opts.expectedVersion != null ? opts.expectedVersion : loaded.version;

    let nextLibrary;
    try {
      nextLibrary = applyMergePlan(loaded.library, job.libraryName, plan, {
        lang: job.lang,
        type: 's',
      });
    } catch (e) {
      importRepo.updateJob(id, { status: 'FAILED', errors: [e.message] });
      throw e;
    }

    const check = validateLibrary(nextLibrary);
    if (!check.ok) {
      importRepo.updateJob(id, { status: 'FAILED', errors: [check.error] });
      const err = new Error(check.error);
      err.status = 400;
      err.code = 'VALIDATION';
      throw err;
    }

    // Backup is inside saveAtomic; capture list before/after for report
    const backupsBefore = new Set(
      (libraryStore.listBackups() || []).map((b) => b.name)
    );

    let result;
    try {
      result = libraryStore.saveAtomic(nextLibrary, expectedVersion);
    } catch (e) {
      importRepo.updateJob(id, {
        status: 'FAILED',
        errors: [e.message],
        libraryVersionBefore: expectedVersion,
      });
      throw e;
    }

    const backupsAfter = libraryStore.listBackups() || [];
    const newBackup = backupsAfter.find((b) => !backupsBefore.has(b.name));

    const report = {
      ok: true,
      importId: id,
      libraryName: job.libraryName,
      folderOp: plan.folderOp,
      statistics: plan.statistics,
      inserted: plan.statistics.new,
      updated: plan.statistics.update,
      unchanged: plan.statistics.unchanged,
      skipped: plan.statistics.skip,
      conflicts: plan.statistics.conflict,
      backup: newBackup ? newBackup.name : null,
      version: result.version,
      updatedAt: result.updatedAt,
      appliedAt: new Date().toISOString(),
    };

    importRepo.saveArtifact(id, 'report.json', report);
    importRepo.saveArtifact(
      id,
      'report.md',
      [
        `# Importação ${id}`,
        '',
        `Biblioteca: ${job.libraryName}`,
        `Operação pasta: ${plan.folderOp}`,
        `Inseridos: ${report.inserted}`,
        `Atualizados: ${report.updated}`,
        `Inalterados: ${report.unchanged}`,
        `Ignorados: ${report.skipped}`,
        `Backup: ${report.backup || '(não identificado)'}`,
        `Versão: ${report.version}`,
        `Data: ${report.appliedAt}`,
      ].join('\n')
    );

    // Persist final folder-draft titles as applied (with resolved titles)
    const appliedSongs = [];
    for (const item of plan.items) {
      if (!item.selected || item.status === 'SKIP' || item.status === 'UNCHANGED') {
        if (item.selected && item.status === 'UNCHANGED') {
          appliedSongs.push({ title: item.resolvedTitle, content: item.resolvedContent });
        }
        continue;
      }
      if (item.status === 'NEW' || item.status === 'UPDATE') {
        appliedSongs.push({ title: item.resolvedTitle, content: item.resolvedContent });
      }
    }
    // Better: save snapshot of resulting folder
    const matches = findFolderByName(nextLibrary, job.libraryName);
    const resulting =
      matches.find((m) => m.folder.name === job.libraryName)?.folder ||
      matches[0]?.folder;
    if (resulting) {
      importRepo.saveArtifact(id, 'folder-draft.json', {
        name: resulting.name,
        type: 's',
        lang: resulting.lang || job.lang,
        songs: resulting.songs,
        applied: true,
      });
    }

    importRepo.updateJob(id, {
      status: 'APPLIED',
      appliedAt: report.appliedAt,
      appliedBackup: report.backup,
      libraryVersionBefore: expectedVersion,
      libraryVersionAfter: result.version,
      statistics: plan.statistics,
      errors: [],
    });

    return { report, version: result.version, updatedAt: result.updatedAt };
  }

  function reject(id) {
    const job = importRepo.getJob(id);
    if (job.status === 'APPLIED') {
      const err = new Error('já aplicada');
      err.status = 409;
      throw err;
    }
    return importRepo.updateJob(id, { status: 'REJECTED' });
  }

  function getJobDetail(id) {
    const job = importRepo.getJob(id);
    return {
      job,
      preview: importRepo.readArtifact(id, 'preview.json'),
      draft: importRepo.readArtifact(id, 'folder-draft.json'),
      decisions: importRepo.getDecisions(id),
      report: importRepo.readArtifact(id, 'report.json'),
      extracted: importRepo.readArtifact(id, 'extracted.json'),
    };
  }

  function restoreBackup(backupName, expectedVersion) {
    const safe = path.basename(String(backupName || ''));
    if (!/^library-.*\.json$/i.test(safe)) {
      const err = new Error('nome de backup inválido');
      err.status = 400;
      throw err;
    }
    const full = path.join(libraryStore.backupDir, safe);
    if (!fs.existsSync(full)) {
      const err = new Error('backup não encontrado');
      err.status = 404;
      throw err;
    }
    const library = JSON.parse(fs.readFileSync(full, 'utf8'));
    const check = validateLibrary(library);
    if (!check.ok) {
      const err = new Error(check.error);
      err.status = 400;
      throw err;
    }
    const loaded = loadLibrarySafe();
    const ver = expectedVersion != null ? expectedVersion : loaded.version;
    return libraryStore.saveAtomic(library, ver);
  }

  return {
    startFromUpload,
    processExtraction,
    patchJob,
    analyze,
    apply,
    reject,
    getJobDetail,
    listJobs: () => importRepo.listJobs(),
    restoreBackup,
    detectTypeFromName,
    suggestLibraryNameFromFile,
    parseSongIdentity,
  };
}

module.exports = { createImportService, detectTypeFromName };
