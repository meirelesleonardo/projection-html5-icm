'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  archiveSong,
  restoreSong,
  deleteSong,
  archiveFolder,
  restoreFolder,
  deleteFolder,
  listArchived,
} = require('./library-archive');
const { validateLibrary } = require('./library-validate');

function sampleLib() {
  return [
    {
      name: 'Coletânea 2022',
      type: 's',
      lang: 'pt',
      songs: [
        { title: '1 - Um', content: 'A' },
        { title: '2 - Dois', content: 'B' },
      ],
    },
    {
      name: 'Avulsos',
      type: 's',
      lang: 'pt',
      songs: [{ title: 'i1 - X', content: 'C' }],
    },
  ];
}

describe('library-archive song', () => {
  it('archives with matching title and reason', () => {
    const next = archiveSong(sampleLib(), {
      version: 1,
      folderIndex: 0,
      songIndex: 0,
      confirmTitle: '1 - Um',
      reason: 'duplicado',
    });
    assert.equal(next[0].songs[0].archived, true);
    assert.equal(next[0].songs[0].archiveReason, 'duplicado');
    assert.ok(next[0].songs[0].archivedAt);
    assert.equal(validateLibrary(next).ok, true);
  });

  it('rejects wrong confirm title', () => {
    assert.throws(
      () =>
        archiveSong(sampleLib(), {
          version: 1,
          folderIndex: 0,
          songIndex: 0,
          confirmTitle: 'errado',
        }),
      (e) => e.code === 'CONFIRM_MISMATCH'
    );
  });

  it('restore clears flags', () => {
    let lib = archiveSong(sampleLib(), {
      version: 1,
      folderIndex: 0,
      songIndex: 1,
      confirmTitle: '2 - Dois',
    });
    lib = restoreSong(lib, { version: 2, folderIndex: 0, songIndex: 1 });
    assert.equal(lib[0].songs[1].archived, undefined);
    assert.equal(lib[0].songs[1].archiveReason, undefined);
  });

  it('DELETE requires archived', () => {
    assert.throws(
      () =>
        deleteSong(sampleLib(), {
          version: 1,
          folderIndex: 0,
          songIndex: 0,
          confirmTitle: '1 - Um',
        }),
      (e) => e.code === 'NOT_ARCHIVED'
    );
  });

  it('DELETE removes archived song', () => {
    let lib = archiveSong(sampleLib(), {
      version: 1,
      folderIndex: 0,
      songIndex: 0,
      confirmTitle: '1 - Um',
    });
    lib = deleteSong(lib, {
      version: 2,
      folderIndex: 0,
      songIndex: 0,
      confirmTitle: '1 - Um',
    });
    assert.equal(lib[0].songs.length, 1);
    assert.equal(lib[0].songs[0].title, '2 - Dois');
  });
});

describe('library-archive folder', () => {
  it('archive / restore / delete folder', () => {
    let lib = archiveFolder(sampleLib(), {
      version: 1,
      folderIndex: 1,
      confirmTitle: 'Avulsos',
      reason: 'teste',
    });
    assert.equal(lib[1].archived, true);
    lib = restoreFolder(lib, { version: 2, folderIndex: 1 });
    assert.equal(lib[1].archived, undefined);
    lib = archiveFolder(lib, {
      version: 3,
      folderIndex: 1,
      confirmTitle: 'Avulsos',
    });
    lib = deleteFolder(lib, {
      version: 4,
      folderIndex: 1,
      confirmTitle: 'Avulsos',
    });
    assert.equal(lib.length, 1);
    assert.equal(lib[0].name, 'Coletânea 2022');
  });
});

describe('library-archive listArchived', () => {
  it('lists archived folders and songs', () => {
    let lib = archiveSong(sampleLib(), {
      version: 1,
      folderIndex: 0,
      songIndex: 0,
      confirmTitle: '1 - Um',
    });
    lib = archiveFolder(lib, {
      version: 2,
      folderIndex: 1,
      confirmTitle: 'Avulsos',
    });
    const listed = listArchived(lib);
    assert.equal(listed.songs.length, 1);
    assert.equal(listed.folders.length, 1);
    assert.equal(listed.songs[0].title, '1 - Um');
    assert.equal(listed.folders[0].name, 'Avulsos');
  });
});
