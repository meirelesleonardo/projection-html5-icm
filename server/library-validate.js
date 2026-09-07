'use strict';

const MAX_LIBRARY_BYTES = 15 * 1024 * 1024; // 15 MiB
const MAX_FOLDERS = 500;
const MAX_SONGS_PER_FOLDER = 20000;
const MAX_TITLE_LEN = 2000;
const MAX_CONTENT_LEN = 500000;
const MAX_NAME_LEN = 500;

/**
 * Validate library document (array of folders with songs).
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateLibrary(library) {
  if (!Array.isArray(library)) {
    return { ok: false, error: 'library deve ser um array de pastas' };
  }
  if (library.length > MAX_FOLDERS) {
    return { ok: false, error: `demasiadas pastas (máx. ${MAX_FOLDERS})` };
  }

  let approx = 2;
  for (let i = 0; i < library.length; i++) {
    const folder = library[i];
    if (!folder || typeof folder !== 'object' || Array.isArray(folder)) {
      return { ok: false, error: `pasta[${i}] inválida` };
    }
    if (typeof folder.name !== 'string' || !folder.name.trim()) {
      return { ok: false, error: `pasta[${i}].name obrigatório` };
    }
    if (folder.name.length > MAX_NAME_LEN) {
      return { ok: false, error: `pasta[${i}].name muito longo` };
    }
    if (folder.type !== 's') {
      return { ok: false, error: `pasta[${i}].type deve ser "s"` };
    }
    if (typeof folder.lang !== 'string' || !folder.lang.trim()) {
      return { ok: false, error: `pasta[${i}].lang obrigatório` };
    }
    if (!Array.isArray(folder.songs)) {
      return { ok: false, error: `pasta[${i}].songs deve ser array` };
    }
    if (folder.songs.length > MAX_SONGS_PER_FOLDER) {
      return { ok: false, error: `pasta[${i}] tem demasiados louvores` };
    }
    approx += folder.name.length + 32;
    for (let s = 0; s < folder.songs.length; s++) {
      const song = folder.songs[s];
      if (!song || typeof song !== 'object' || Array.isArray(song)) {
        return { ok: false, error: `pasta[${i}].songs[${s}] inválido` };
      }
      if (typeof song.title !== 'string') {
        return { ok: false, error: `pasta[${i}].songs[${s}].title deve ser string` };
      }
      if (typeof song.content !== 'string') {
        return { ok: false, error: `pasta[${i}].songs[${s}].content deve ser string` };
      }
      if (song.title.length > MAX_TITLE_LEN) {
        return { ok: false, error: `pasta[${i}].songs[${s}].title muito longo` };
      }
      if (song.content.length > MAX_CONTENT_LEN) {
        return { ok: false, error: `pasta[${i}].songs[${s}].content muito longo` };
      }
      approx += song.title.length + song.content.length + 16;
      if (approx > MAX_LIBRARY_BYTES) {
        return { ok: false, error: 'biblioteca excede tamanho máximo' };
      }
    }
  }
  return { ok: true };
}

function validatePutBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body deve ser { version, library }' };
  }
  if (typeof body.version !== 'number' || !Number.isFinite(body.version) || body.version < 0) {
    return { ok: false, error: 'version deve ser número >= 0' };
  }
  const v = validateLibrary(body.library);
  if (!v.ok) return v;
  return { ok: true };
}

module.exports = {
  validateLibrary,
  validatePutBody,
  MAX_LIBRARY_BYTES,
};
