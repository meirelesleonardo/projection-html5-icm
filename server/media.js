'use strict';

const path = require('path');
const fs = require('fs');

function sanitizeFilename(name) {
  const base = path.basename(String(name || 'video'));
  let cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  cleaned = cleaned.replace(/_+\./g, '.').replace(/^\.+/, '').replace(/_+$/g, '');
  if (!cleaned || cleaned === '.') cleaned = 'video';
  // Ensure there is a stem if only extension remains
  if (cleaned.startsWith('.')) cleaned = 'video' + cleaned;
  return cleaned;
}

/**
 * Keep original name; if taken, append _2, _3, ... before extension.
 */
function uniqueMediaName(dir, originalName) {
  const safe = sanitizeFilename(originalName);
  const ext = path.extname(safe);
  const stem = ext ? safe.slice(0, -ext.length) : safe;
  let candidate = safe;
  let n = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem}_${n}${ext}`;
    n += 1;
  }
  return candidate;
}

function safeVideoPath(mediaDir, name) {
  const raw = String(name || '');
  const base = path.basename(raw);
  if (!base || base !== raw || base.includes('..')) return null;
  if (!/\.(mp4|webm|ogg|mov)$/i.test(base)) return null;
  const videosDir = path.resolve(path.join(mediaDir, 'videos'));
  const full = path.resolve(path.join(videosDir, base));
  if (!full.startsWith(videosDir + path.sep)) return null;
  return { base, full, videosDir };
}

module.exports = {
  sanitizeFilename,
  uniqueMediaName,
  safeVideoPath,
};
