'use strict';

const fs = require('fs');
const path = require('path');

const WIN_SOFFICE = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

function pathEntries(env, platform) {
  const source = env || {};
  let value = '';
  if (platform === 'win32') {
    const key = Object.keys(source).find((k) => k.toLowerCase() === 'path');
    value = key ? source[key] : '';
  } else {
    value = source.PATH || '';
  }
  return String(value)
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch (_) {
    try {
      return fs.statSync(file).isFile();
    } catch (__) {
      return false;
    }
  }
}

/**
 * Localiza um comando no PATH sem invocar o shell.
 * No Windows também aceita o nome sem .exe.
 */
function whichSync(cmd, options) {
  const opts = options || {};
  const platform = opts.platform || process.platform;
  const env = opts.env || process.env;
  const exts = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const names = [];
  exts.forEach((ext) => {
    const name = ext && cmd.toLowerCase().endsWith(ext) ? cmd : cmd + ext;
    if (names.indexOf(name) === -1) names.push(name);
  });
  const dirs = pathEntries(env, platform);
  for (let i = 0; i < dirs.length; i++) {
    for (let n = 0; n < names.length; n++) {
      const full = path.join(dirs[i], names[n]);
      if (isExecutable(full)) return full;
    }
  }
  return null;
}

function findSoffice(options) {
  const opts = options || {};
  const platform = opts.platform || process.platform;
  const fromPath = whichSync('soffice', opts) || whichSync('libreoffice', opts);
  if (fromPath) return fromPath;
  if (platform !== 'win32') return null;
  const extras = opts.winSoffice || WIN_SOFFICE;
  for (let i = 0; i < extras.length; i++) {
    if (isExecutable(extras[i])) return extras[i];
  }
  return null;
}

function findPdftoppm(options) {
  return whichSync('pdftoppm', options);
}

module.exports = {
  whichSync,
  findSoffice,
  findPdftoppm,
  WIN_SOFFICE,
};
