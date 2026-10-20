'use strict';

const path = require('path');

/**
 * Pasta gravável da aplicação.
 * No exe empacotado, __dirname aponta para o snapshot; a raiz real é a pasta do executável.
 * @param {{ packaged?: boolean, execPath?: string, moduleDir?: string }} [options]
 */
function resolveAppRoot(options) {
  const opts = options || {};
  const packaged = opts.packaged != null ? Boolean(opts.packaged) : Boolean(process.pkg);
  const execPath = opts.execPath || process.execPath;
  const moduleDir = opts.moduleDir || __dirname;
  if (packaged) return path.dirname(execPath);
  return path.join(moduleDir, '..');
}

module.exports = { resolveAppRoot };
