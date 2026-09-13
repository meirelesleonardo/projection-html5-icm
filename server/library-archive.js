'use strict';

const MAX_REASON_LEN = 500;

function cloneLibrary(library) {
  return JSON.parse(JSON.stringify(library || []));
}

function titlesMatch(actual, confirmTitle) {
  return String(actual || '').trim() === String(confirmTitle || '').trim();
}

function requireVersion(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('body inválido');
    err.code = 'VALIDATION';
    err.status = 400;
    throw err;
  }
  if (typeof body.version !== 'number' || !Number.isFinite(body.version) || body.version < 0) {
    const err = new Error('version deve ser número >= 0');
    err.code = 'VALIDATION';
    err.status = 400;
    throw err;
  }
}

function resolveFolder(lib, folderIndex) {
  const fi = Number(folderIndex);
  if (!Number.isInteger(fi) || fi < 0 || fi >= lib.length) {
    const err = new Error('pasta não encontrada');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return { folder: lib[fi], folderIndex: fi };
}

function resolveSong(folder, songIndex) {
  const si = Number(songIndex);
  if (!Number.isInteger(si) || si < 0 || !folder.songs || si >= folder.songs.length) {
    const err = new Error('louvor não encontrado');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return { song: folder.songs[si], songIndex: si };
}

function normalizeReason(reason) {
  if (reason == null || reason === '') return '';
  const s = String(reason).trim();
  if (s.length > MAX_REASON_LEN) {
    const err = new Error(`motivo muito longo (máx. ${MAX_REASON_LEN})`);
    err.code = 'VALIDATION';
    err.status = 400;
    throw err;
  }
  return s;
}

function archiveSong(library, opts) {
  requireVersion(opts);
  const lib = cloneLibrary(library);
  const { folder } = resolveFolder(lib, opts.folderIndex);
  const { song } = resolveSong(folder, opts.songIndex);
  if (!titlesMatch(song.title, opts.confirmTitle)) {
    const err = new Error('título de confirmação não confere');
    err.code = 'CONFIRM_MISMATCH';
    err.status = 400;
    throw err;
  }
  if (song.archived) {
    const err = new Error('louvor já está arquivado');
    err.code = 'ALREADY_ARCHIVED';
    err.status = 400;
    throw err;
  }
  song.archived = true;
  song.archivedAt = new Date().toISOString();
  const reason = normalizeReason(opts.reason);
  if (reason) song.archiveReason = reason;
  else delete song.archiveReason;
  return lib;
}

function restoreSong(library, opts) {
  requireVersion(opts);
  const lib = cloneLibrary(library);
  const { folder } = resolveFolder(lib, opts.folderIndex);
  const { song } = resolveSong(folder, opts.songIndex);
  if (!song.archived) {
    const err = new Error('louvor não está arquivado');
    err.code = 'NOT_ARCHIVED';
    err.status = 400;
    throw err;
  }
  delete song.archived;
  delete song.archivedAt;
  delete song.archiveReason;
  return lib;
}

function deleteSong(library, opts) {
  requireVersion(opts);
  const lib = cloneLibrary(library);
  const { folder } = resolveFolder(lib, opts.folderIndex);
  const { song, songIndex } = resolveSong(folder, opts.songIndex);
  if (!song.archived) {
    const err = new Error('só é possível excluir definitivamente louvores arquivados');
    err.code = 'NOT_ARCHIVED';
    err.status = 400;
    throw err;
  }
  if (!titlesMatch(song.title, opts.confirmTitle)) {
    const err = new Error('título de confirmação não confere');
    err.code = 'CONFIRM_MISMATCH';
    err.status = 400;
    throw err;
  }
  folder.songs.splice(songIndex, 1);
  return lib;
}

function archiveFolder(library, opts) {
  requireVersion(opts);
  const lib = cloneLibrary(library);
  const { folder } = resolveFolder(lib, opts.folderIndex);
  if (!titlesMatch(folder.name, opts.confirmTitle)) {
    const err = new Error('nome de confirmação não confere');
    err.code = 'CONFIRM_MISMATCH';
    err.status = 400;
    throw err;
  }
  if (folder.archived) {
    const err = new Error('pasta já está arquivada');
    err.code = 'ALREADY_ARCHIVED';
    err.status = 400;
    throw err;
  }
  folder.archived = true;
  folder.archivedAt = new Date().toISOString();
  const reason = normalizeReason(opts.reason);
  if (reason) folder.archiveReason = reason;
  else delete folder.archiveReason;
  return lib;
}

function restoreFolder(library, opts) {
  requireVersion(opts);
  const lib = cloneLibrary(library);
  const { folder } = resolveFolder(lib, opts.folderIndex);
  if (!folder.archived) {
    const err = new Error('pasta não está arquivada');
    err.code = 'NOT_ARCHIVED';
    err.status = 400;
    throw err;
  }
  delete folder.archived;
  delete folder.archivedAt;
  delete folder.archiveReason;
  return lib;
}

function deleteFolder(library, opts) {
  requireVersion(opts);
  const lib = cloneLibrary(library);
  const { folder, folderIndex } = resolveFolder(lib, opts.folderIndex);
  if (!folder.archived) {
    const err = new Error('só é possível excluir definitivamente pastas arquivadas');
    err.code = 'NOT_ARCHIVED';
    err.status = 400;
    throw err;
  }
  if (!titlesMatch(folder.name, opts.confirmTitle)) {
    const err = new Error('nome de confirmação não confere');
    err.code = 'CONFIRM_MISMATCH';
    err.status = 400;
    throw err;
  }
  lib.splice(folderIndex, 1);
  return lib;
}

function listArchived(library) {
  const folders = [];
  const songs = [];
  (library || []).forEach((folder, folderIndex) => {
    if (folder.archived) {
      folders.push({
        folderIndex,
        name: folder.name,
        archivedAt: folder.archivedAt || null,
        archiveReason: folder.archiveReason || '',
        songCount: (folder.songs || []).length,
      });
    }
    (folder.songs || []).forEach((song, songIndex) => {
      if (song.archived) {
        songs.push({
          folderIndex,
          songIndex,
          folderName: folder.name,
          title: song.title,
          archivedAt: song.archivedAt || null,
          archiveReason: song.archiveReason || '',
          folderArchived: Boolean(folder.archived),
        });
      }
    });
  });
  return { folders, songs };
}

module.exports = {
  archiveSong,
  restoreSong,
  deleteSong,
  archiveFolder,
  restoreFolder,
  deleteFolder,
  listArchived,
  titlesMatch,
  MAX_REASON_LEN,
};
