'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveAppRoot } = require('./app-root');

describe('resolveAppRoot', () => {
  it('uses the executable directory when packaged', () => {
    const root = resolveAppRoot({
      packaged: true,
      execPath: path.join('/opt', 'projecao', 'ProjecaoICM.exe'),
      moduleDir: path.join('/snapshot', 'server'),
    });
    assert.equal(root, path.join('/opt', 'projecao'));
  });

  it('uses the repository directory in development', () => {
    const moduleDir = path.join('/tmp', 'proj', 'server');
    const root = resolveAppRoot({
      packaged: false,
      moduleDir,
      execPath: '/usr/bin/node',
    });
    assert.equal(root, path.join('/tmp', 'proj'));
  });
});
