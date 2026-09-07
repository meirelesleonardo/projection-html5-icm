'use strict';

const { createCanonicalSong, parseTitleNumber } = require('./ir');
const { contentToSlides, annotatePlainLines } = require('./markers');

/**
 * Official Song {title,content} → CanonicalSong IR (preserves presentation).
 */
function songToCanonical(song, source = {}) {
  const { number, titleRaw } = parseTitleNumber(song.title);
  const slides = contentToSlides(song.content);
  const allLines = [];
  for (const sl of slides) {
    for (const line of sl.lines) {
      if (typeof line === 'string') allLines.push(line);
      else if (line && line.marker === 'label') allLines.push(line.text);
      else if (line && line.marker === 'chave') allLines.push(...(line.lines || []));
    }
  }
  const { sections } = annotatePlainLines(
    allLines.filter((l) => typeof l === 'string')
  );

  return createCanonicalSong({
    titleRaw: titleRaw || song.title || '',
    number,
    collectionHint: source.collection || '',
    lang: source.lang || 'pt',
    source: {
      type: source.type || 'json',
      file: source.file || 'data/data.json',
      collection: source.collection || '',
    },
    sections,
    presentation: {
      mode: 'structured',
      slides,
      sourcePresentation: null,
    },
  });
}

module.exports = { songToCanonical };
