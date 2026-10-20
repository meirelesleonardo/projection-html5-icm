'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { whichSync, findSoffice, findPdftoppm } = require('./which-tool');

describe('which-tool', () => {
  it('finds an executable on PATH without a shell', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'which-'));
    const bin = path.join(dir, 'pdftoppm');
    fs.writeFileSync(bin, '#!/bin/sh\n');
    fs.chmodSync(bin, 0o755);
    const found = whichSync('pdftoppm', {
      platform: 'linux',
      env: { PATH: dir },
    });
    assert.equal(found, bin);
  });

  it('finds soffice.exe on the Windows LibreOffice path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soffice-'));
    const exe = path.join(dir, 'soffice.exe');
    fs.writeFileSync(exe, '');
    const found = findSoffice({
      platform: 'win32',
      env: { Path: '' },
      winSoffice: [exe],
    });
    assert.equal(found, exe);
    assert.equal(findPdftoppm({ platform: 'win32', env: { Path: '' } }), null);
  });
});
