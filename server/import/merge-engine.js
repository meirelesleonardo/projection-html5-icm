'use strict';

const { normalizeName, parseSongIdentity } = require('./numbering');
const { stripHtml } = require('../../tools/louvor-import/lib/ir');

function normalizeContent(content) {
  return stripHtml(content || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentEqual(a, b) {
  return normalizeContent(a) === normalizeContent(b);
}

function slideCount(content) {
  return String(content || '')
    .split(/\n\n+/)
    .filter((b) => b.trim()).length;
}

function findFolderByName(library, name) {
  const target = normalizeName(name);
  const matches = [];
  for (let i = 0; i < (library || []).length; i++) {
    const f = library[i];
    if (normalizeName(f.name) === target) {
      matches.push({ index: i, folder: f });
    }
  }
  return matches;
}

function indexFolderSongs(folder) {
  const byNumeric = new Map();
  const byImport = new Map();
  const byName = new Map();
  const songs = (folder && folder.songs) || [];
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const id = parseSongIdentity(song.title);
    if (id.kind === 'numeric') byNumeric.set(id.number, { index: i, song, id });
    if (id.kind === 'import') byImport.set(id.number, { index: i, song, id });
    const nn = normalizeName(id.titleRaw || song.title);
    if (nn) {
      if (!byName.has(nn)) byName.set(nn, []);
      byName.get(nn).push({ index: i, song, id });
    }
  }
  return { byNumeric, byImport, byName, songs };
}

/**
 * Build merge plan for incoming official songs against target folder (or empty).
 *
 * @param {object[]} incomingSongs - { title, content, key?, selected?, needsReview? }
 * @param {object|null} targetFolder
 * @param {object} options
 * @param {object} options.decisions - map key -> 'keep'|'useImported'
 * @param {Set|object} options.selection - map key -> boolean (default true)
 * @param {function} options.allocImportNumber - () => next iN
 */
function buildMergePlan(incomingSongs, targetFolder, options = {}) {
  const decisions = options.decisions || {};
  const selection = options.selection || {};
  const allocImportNumber =
    options.allocImportNumber ||
    (() => {
      throw new Error('allocImportNumber required');
    });

  const folderOp = targetFolder ? 'UPDATE' : 'INSERT';
  const index = indexFolderSongs(targetFolder || { songs: [] });
  const items = [];
  let stats = {
    found: incomingSongs.length,
    new: 0,
    update: 0,
    unchanged: 0,
    conflict: 0,
    review: 0,
    error: 0,
    selected: 0,
    skip: 0,
  };

  // Track iN allocated in this plan to avoid collisions within the same import
  let nextImport = null;
  function takeImportNumber() {
    if (nextImport == null) nextImport = allocImportNumber();
    const n = nextImport;
    nextImport += 1;
    return n;
  }

  for (let i = 0; i < incomingSongs.length; i++) {
    const inc = incomingSongs[i];
    const key = inc.key || `row-${i}`;
    const selected = selection[key] !== false;
    const id = parseSongIdentity(inc.title);
    let status = 'NEW';
    let matchIndex = null;
    let matchSong = null;
    let resolvedTitle = inc.title;
    let resolvedContent = inc.content;
    let decision = decisions[key] || null;
    const warnings = [];

    if (inc.needsReview) {
      warnings.push('marcado para revisão na extração');
    }

    if (id.kind === 'numeric') {
      const hit = index.byNumeric.get(id.number);
      if (hit) {
        matchIndex = hit.index;
        matchSong = hit.song;
        if (contentEqual(hit.song.content, inc.content)) {
          status = 'UNCHANGED';
          resolvedTitle = hit.song.title;
          resolvedContent = hit.song.content;
        } else if (decision === 'keep') {
          status = 'UNCHANGED';
          resolvedTitle = hit.song.title;
          resolvedContent = hit.song.content;
        } else if (decision === 'useImported') {
          status = 'UPDATE';
          resolvedTitle = formatKeepNumber(hit.song.title, id, inc);
          resolvedContent = inc.content;
        } else {
          status = 'CONFLICT';
          resolvedTitle = formatKeepNumber(hit.song.title, id, inc);
        }
      } else {
        status = 'NEW';
        resolvedTitle = `${id.number} - ${id.titleRaw}`;
      }
    } else if (id.kind === 'import') {
      const hit = index.byImport.get(id.number);
      if (hit) {
        matchIndex = hit.index;
        matchSong = hit.song;
        if (contentEqual(hit.song.content, inc.content)) {
          status = 'UNCHANGED';
          resolvedTitle = hit.song.title;
          resolvedContent = hit.song.content;
        } else if (decision === 'keep') {
          status = 'UNCHANGED';
          resolvedTitle = hit.song.title;
          resolvedContent = hit.song.content;
        } else if (decision === 'useImported') {
          status = 'UPDATE';
          resolvedContent = inc.content;
          resolvedTitle = hit.song.title;
        } else {
          status = 'CONFLICT';
          resolvedTitle = hit.song.title;
        }
      } else {
        status = 'NEW';
      }
    } else {
      // No number: try name match in target
      const nn = normalizeName(id.titleRaw || inc.title);
      const hits = nn ? index.byName.get(nn) || [] : [];
      if (hits.length === 1) {
        matchIndex = hits[0].index;
        matchSong = hits[0].song;
        if (contentEqual(matchSong.content, inc.content)) {
          status = 'UNCHANGED';
          resolvedTitle = matchSong.title;
          resolvedContent = matchSong.content;
        } else if (decision === 'keep') {
          status = 'UNCHANGED';
          resolvedTitle = matchSong.title;
          resolvedContent = matchSong.content;
        } else if (decision === 'useImported') {
          status = 'UPDATE';
          resolvedTitle = matchSong.title;
          resolvedContent = inc.content;
        } else {
          status = 'CONFLICT';
          resolvedTitle = matchSong.title;
        }
      } else if (hits.length > 1) {
        status = 'REVIEW';
        warnings.push('múltiplas correspondências por nome');
        const n = takeImportNumber();
        resolvedTitle = `i${n} - ${id.titleRaw || inc.title}`;
      } else {
        const n = takeImportNumber();
        resolvedTitle = `i${n} - ${id.titleRaw || inc.title}`;
        status = 'NEW';
      }
    }

    if (!selected) {
      status = 'SKIP';
      stats.skip += 1;
    } else {
      stats.selected += 1;
      if (status === 'NEW') stats.new += 1;
      else if (status === 'UPDATE') stats.update += 1;
      else if (status === 'UNCHANGED') stats.unchanged += 1;
      else if (status === 'CONFLICT') stats.conflict += 1;
      else if (status === 'REVIEW') stats.review += 1;
    }

    items.push({
      key,
      status,
      selected,
      decision,
      incomingTitle: inc.title,
      incomingContent: inc.content,
      resolvedTitle,
      resolvedContent,
      matchIndex,
      matchTitle: matchSong ? matchSong.title : null,
      matchContent: matchSong ? matchSong.content : null,
      incomingSlides: slideCount(inc.content),
      matchSlides: matchSong ? slideCount(matchSong.content) : null,
      warnings,
    });
  }

  return {
    folderOp,
    targetFolderName: targetFolder ? targetFolder.name : null,
    targetFolderIndex: null,
    items,
    statistics: stats,
  };
}

function formatKeepNumber(existingTitle, incomingId, inc) {
  const existing = parseSongIdentity(existingTitle);
  if (existing.kind === 'numeric') {
    return `${existing.number} - ${incomingId.titleRaw || existing.titleRaw}`;
  }
  return inc.title;
}

/**
 * Apply merge plan to a deep-cloned library. Returns new library array.
 */
function applyMergePlan(library, libraryName, plan, options = {}) {
  const lang = options.lang || 'pt';
  const type = options.type || 's';
  const lib = JSON.parse(JSON.stringify(library || []));

  let folderIndex = -1;
  if (plan.folderOp === 'UPDATE' && plan.targetFolderName) {
    const matches = findFolderByName(lib, plan.targetFolderName);
    if (matches.length === 1) folderIndex = matches[0].index;
    else if (matches.length === 0) {
      // treat as insert
      folderIndex = -1;
    } else {
      const err = new Error('várias pastas com nome semelhante; escolha o nome exato');
      err.code = 'AMBIGUOUS_FOLDER';
      throw err;
    }
  }

  if (folderIndex < 0) {
    // Prefer exact name match for insert name
    const exact = lib.findIndex((f) => f.name === libraryName);
    if (exact >= 0) folderIndex = exact;
  }

  if (folderIndex < 0) {
    lib.unshift({ name: libraryName, type, lang, songs: [] });
    folderIndex = 0;
  } else {
    // Keep official folder name unless user renamed via libraryName and exact match intended
    if (libraryName && lib[folderIndex].name !== libraryName) {
      // only rename if normalized equal (user chose display form)
      if (normalizeName(lib[folderIndex].name) === normalizeName(libraryName)) {
        lib[folderIndex].name = libraryName;
      }
    }
  }

  const folder = lib[folderIndex];
  const songs = folder.songs.slice();

  for (const item of plan.items) {
    if (!item.selected || item.status === 'SKIP') continue;
    if (item.status === 'CONFLICT' || item.status === 'REVIEW' || item.status === 'ERROR') {
      const err = new Error(
        `há itens não resolvidos (${item.status}): ${item.incomingTitle || item.key}`
      );
      err.code = 'UNRESOLVED';
      throw err;
    }
    if (item.status === 'UNCHANGED') continue;

    const song = { title: item.resolvedTitle, content: item.resolvedContent };
    if (item.status === 'UPDATE' && item.matchIndex != null) {
      songs[item.matchIndex] = song;
    } else if (item.status === 'NEW') {
      songs.push(song);
    }
  }

  folder.songs = songs;
  lib[folderIndex] = folder;

  // INSERT always lands at the front (new folder or promote existing match)
  if (plan.folderOp === 'INSERT' && folderIndex > 0) {
    const [moved] = lib.splice(folderIndex, 1);
    lib.unshift(moved);
  }

  return lib;
}

module.exports = {
  normalizeContent,
  contentEqual,
  slideCount,
  findFolderByName,
  indexFolderSongs,
  buildMergePlan,
  applyMergePlan,
};
