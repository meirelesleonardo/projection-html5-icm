'use strict';

const net = require('net');
const { spawn } = require('child_process');

function shouldOpenView(env, packaged) {
  const flag = env && env.OPEN_VIEW;
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;
  return Boolean(packaged);
}

function viewUrl(config) {
  const proto = config && config.protocol === 'https' ? 'https' : 'http';
  const port = config && config.port ? config.port : 3080;
  return proto + '://127.0.0.1:' + port + '/view.html';
}

function browserLaunch(url, platform) {
  if (platform === 'win32') {
    return { file: 'cmd', args: ['/c', 'start', '', url] };
  }
  if (platform === 'darwin') {
    return { file: 'open', args: [url] };
  }
  return { file: 'xdg-open', args: [url] };
}

/**
 * Segundo clique com o servidor já no ar: abre a view e encerra.
 * Caso contrário, este processo deve escutar a porta.
 */
function startupAction(portOpen, openViewEnabled) {
  if (portOpen && openViewEnabled) return 'exit-open';
  return 'listen';
}

function openView(url, options) {
  const opts = options || {};
  const platform = opts.platform || process.platform;
  const spawnImpl = opts.spawn || spawn;
  const spec = browserLaunch(url, platform);
  try {
    const child = spawnImpl(spec.file, spec.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (child && typeof child.unref === 'function') child.unref();
    if (child && typeof child.on === 'function') {
      child.on('error', (err) => {
        console.error('[server] não abriu o navegador:', err && err.message ? err.message : err);
      });
    }
    return child;
  } catch (err) {
    console.error('[server] não abriu o navegador:', err && err.message ? err.message : err);
    return null;
  }
}

function probeListening(port, host) {
  const target = host || '127.0.0.1';
  return new Promise((resolve) => {
    const socket = net.connect({ port: port, host: target });
    let settled = false;
    const done = (up) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(400, () => done(false));
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

module.exports = {
  shouldOpenView,
  viewUrl,
  browserLaunch,
  startupAction,
  openView,
  probeListening,
};
