'use strict';

const { formatOfficialTitle } = require('./ir');
const { slidesToContent } = require('./markers');

/**
 * CanonicalSong → official { title, content }.
 * No provenance fields.
 */
function canonicalToSong(canonical) {
  const title = formatOfficialTitle(
    canonical.metadata.number,
    canonical.metadata.titleRaw
  );
  const content = slidesToContent(canonical.presentation.slides);
  return { title, content };
}

/**
 * Build a library folder ready for merge (caller decides when to write).
 */
function songsToFolder(songs, name = 'Coletânea 2022', lang = 'pt') {
  return {
    name,
    type: 's',
    lang,
    songs: songs.map((s) =>
      s.title != null && s.content != null ? s : canonicalToSong(s)
    ),
  };
}

module.exports = { canonicalToSong, songsToFolder };
