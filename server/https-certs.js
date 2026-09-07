'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CERTS_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERTS_DIR, 'key.pem');
const CERT_PATH = path.join(CERTS_DIR, 'cert.pem');

function httpsEnabled(config) {
  if (process.env.HTTPS === '1' || process.env.HTTPS === 'true') return true;
  if (process.env.HTTPS === '0' || process.env.HTTPS === 'false') return false;
  return Boolean(config && config.https);
}

function ensureSelfSignedCerts() {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    return {
      key: fs.readFileSync(KEY_PATH),
      cert: fs.readFileSync(CERT_PATH),
    };
  }

  console.log('[https] Gerando certificado autoassinado em server/certs/ …');
  const result = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      KEY_PATH,
      '-out',
      CERT_PATH,
      '-days',
      '825',
      '-nodes',
      '-subj',
      '/CN=projection-icm/O=Projecao ICM/C=BR',
      '-addext',
      'subjectAltName=DNS:localhost,DNS:projection-icm.local,IP:127.0.0.1',
    ],
    { encoding: 'utf8' }
  );

  if (result.status !== 0 || !fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
    // Older openssl without -addext
    const fallback = spawnSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-keyout',
        KEY_PATH,
        '-out',
        CERT_PATH,
        '-days',
        '825',
        '-nodes',
        '-subj',
        '/CN=projection-icm',
      ],
      { encoding: 'utf8' }
    );
    if (fallback.status !== 0 || !fs.existsSync(KEY_PATH)) {
      const err =
        (result.stderr || fallback.stderr || '').trim() ||
        'openssl indisponível — instale openssl ou coloque key.pem/cert.pem em server/certs/';
      throw new Error(err);
    }
  }

  return {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH),
  };
}

module.exports = {
  httpsEnabled,
  ensureSelfSignedCerts,
  KEY_PATH,
  CERT_PATH,
  CERTS_DIR,
};
