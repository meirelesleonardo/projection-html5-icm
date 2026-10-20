'use strict';

const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const { resolveAppRoot } = require('./app-root');

function httpsEnabled(config) {
  if (process.env.HTTPS === '1' || process.env.HTTPS === 'true') return true;
  if (process.env.HTTPS === '0' || process.env.HTTPS === 'false') return false;
  return Boolean(config && config.https);
}

function certPaths(certsDir) {
  const dir = certsDir || path.join(resolveAppRoot(), 'server', 'certs');
  return {
    dir,
    key: path.join(dir, 'key.pem'),
    cert: path.join(dir, 'cert.pem'),
  };
}

function generateSelfSignedPem() {
  const pems = selfsigned.generate(
    [{ name: 'commonName', value: 'projection-icm' }],
    {
      algorithm: 'sha256',
      days: 825,
      keySize: 2048,
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 2, value: 'projection-icm.local' },
            { type: 7, ip: '127.0.0.1' },
          ],
        },
      ],
    }
  );
  if (!pems || !pems.private || !pems.cert) {
    throw new Error('Falha ao gerar certificado autoassinado');
  }
  return { key: pems.private, cert: pems.cert };
}

function ensureSelfSignedCerts(certsDir) {
  const paths = certPaths(certsDir);
  fs.mkdirSync(paths.dir, { recursive: true });
  if (fs.existsSync(paths.key) && fs.existsSync(paths.cert)) {
    return {
      key: fs.readFileSync(paths.key),
      cert: fs.readFileSync(paths.cert),
    };
  }

  console.log('[https] Gerando certificado autoassinado em ' + paths.dir);
  const pems = generateSelfSignedPem();
  fs.writeFileSync(paths.key, pems.key);
  fs.writeFileSync(paths.cert, pems.cert);
  return {
    key: fs.readFileSync(paths.key),
    cert: fs.readFileSync(paths.cert),
  };
}

module.exports = {
  httpsEnabled,
  ensureSelfSignedCerts,
  generateSelfSignedPem,
  certPaths,
};
