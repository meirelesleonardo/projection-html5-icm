'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tls = require('tls');
const { ensureSelfSignedCerts } = require('./https-certs');

describe('https certs', () => {
  it('generates a self-signed PEM without openssl', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'certs-'));
    const first = ensureSelfSignedCerts(dir);
    assert.match(first.cert.toString(), /BEGIN CERTIFICATE/);
    assert.match(first.key.toString(), /BEGIN .*PRIVATE KEY/);
    const context = tls.createSecureContext({ key: first.key, cert: first.cert });
    assert.ok(context);
    const second = ensureSelfSignedCerts(dir);
    assert.equal(second.cert.toString(), first.cert.toString());
  });
});
