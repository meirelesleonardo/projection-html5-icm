'use strict';

const fs = require('fs');
const path = require('path');
const { validateLibrary } = require('./library-validate');

const DEFAULT_MAX_BACKUPS = 5;

/**
 * JSON file repository for the song library (data.json + library-meta.json).
 * Atomic write: tmp → rename. Ready to swap for SqliteLibraryStore later.
 */
function createLibraryStore(options) {
  const rootDir = options.rootDir;
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const dataFile = options.dataFile || path.join(dataDir, 'data.json');
  const metaFile = options.metaFile || path.join(dataDir, 'library-meta.json');
  const backupDir = options.backupDir || path.join(dataDir, 'backups');
  const maxBackups = options.maxBackups != null ? options.maxBackups : DEFAULT_MAX_BACKUPS;

  function ensureDirs() {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });
  }

  function readMeta() {
    ensureDirs();
    if (!fs.existsSync(metaFile)) {
      const meta = { version: 1, updatedAt: new Date().toISOString() };
      writeJsonAtomic(metaFile, meta);
      return meta;
    }
    try {
      const raw = fs.readFileSync(metaFile, 'utf8');
      const meta = JSON.parse(raw);
      if (typeof meta.version !== 'number' || !Number.isFinite(meta.version)) {
        meta.version = 1;
      }
      if (!meta.updatedAt) meta.updatedAt = new Date().toISOString();
      return meta;
    } catch (e) {
      const meta = { version: 1, updatedAt: new Date().toISOString() };
      writeJsonAtomic(metaFile, meta);
      return meta;
    }
  }

  function writeJsonAtomic(targetPath, obj) {
    ensureDirs();
    const dir = path.dirname(targetPath);
    const tmp = path.join(
      dir,
      `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`
    );
    const json = JSON.stringify(obj, null, 0);
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, json, 'utf8');
      try {
        fs.fsyncSync(fd);
      } catch (_) {
        /* some FS ignore fsync */
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, targetPath);
  }

  function load() {
    ensureDirs();
    if (!fs.existsSync(dataFile)) {
      const err = new Error('data.json not found');
      err.code = 'ENOENT';
      throw err;
    }
    const raw = fs.readFileSync(dataFile, 'utf8');
    let library;
    try {
      library = JSON.parse(raw);
    } catch (e) {
      const err = new Error('data.json corrompido ou JSON inválido');
      err.code = 'EINVAL';
      throw err;
    }
    const check = validateLibrary(library);
    if (!check.ok) {
      const err = new Error(check.error || 'data.json inválido');
      err.code = 'EINVAL';
      throw err;
    }
    const meta = readMeta();
    let mtime = null;
    try {
      mtime = fs.statSync(dataFile).mtime.toISOString();
    } catch (_) {}
    return {
      library,
      version: meta.version,
      updatedAt: meta.updatedAt || mtime,
      etag: String(meta.version),
    };
  }

  function rotateBackups() {
    if (!fs.existsSync(backupDir)) return;
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => /^library-.*\.json$/i.test(f))
      .map((f) => ({
        name: f,
        full: path.join(backupDir, f),
        mtime: fs.statSync(path.join(backupDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    for (let i = maxBackups; i < files.length; i++) {
      try {
        fs.unlinkSync(files[i].full);
      } catch (_) {}
    }
  }

  function createBackup() {
    ensureDirs();
    if (!fs.existsSync(dataFile)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `library-${stamp}.json`);
    fs.copyFileSync(dataFile, dest);
    rotateBackups();
    return dest;
  }

  /**
   * @param {object[]} library
   * @param {number} expectedVersion - client version; must match current
   */
  function saveAtomic(library, expectedVersion) {
    const check = validateLibrary(library);
    if (!check.ok) {
      const err = new Error(check.error);
      err.code = 'VALIDATION';
      err.status = 400;
      throw err;
    }

    const meta = readMeta();
    const current = meta.version;
    if (Number(expectedVersion) !== Number(current)) {
      const err = new Error(
        'A biblioteca foi alterada por outro dispositivo. Atualize antes de salvar.'
      );
      err.code = 'CONFLICT';
      err.status = 409;
      err.currentVersion = current;
      err.updatedAt = meta.updatedAt;
      throw err;
    }

    createBackup();

    const nextVersion = current + 1;
    const updatedAt = new Date().toISOString();

    writeJsonAtomic(dataFile, library);
    writeJsonAtomic(metaFile, { version: nextVersion, updatedAt });

    return { version: nextVersion, updatedAt, etag: String(nextVersion) };
  }

  function listBackups() {
    ensureDirs();
    if (!fs.existsSync(backupDir)) return [];
    return fs
      .readdirSync(backupDir)
      .filter((f) => /^library-.*\.json$/i.test(f))
      .map((f) => {
        const full = path.join(backupDir, f);
        const st = fs.statSync(full);
        return { name: f, size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  }

  return {
    dataFile,
    metaFile,
    backupDir,
    load,
    saveAtomic,
    createBackup,
    listBackups,
    readMeta,
  };
}

module.exports = { createLibraryStore };
