'use strict';

const os = require('os');
const dgram = require('dgram');

function listLanIps() {
  const ips = [];
  const skipName = /^(lo|docker|br-|veth|virbr|tun|wg)/i;
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (skipName.test(name) || name.startsWith('br-') || name.startsWith('veth')) continue;
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prefer hotspot/LAN private ranges; still include others as fallback
        ips.push({ interface: name, address: iface.address });
      }
    }
  }
  // Sort: 192.168 / 10. / 172.16-31 first
  ips.sort((a, b) => score(a.address) - score(b.address));
  return ips;
}

function score(ip) {
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 2;
  return 9;
}

function buildInfo(config) {
  const ips = listLanIps();
  return {
    name: config.serviceName || 'Projeção ICM',
    version: config.version || '2.0.0',
    port: config.port,
    hostname: config.hostname || 'projection-icm.local',
    pinRequired: Boolean(config.roomPin),
    displayProfile: config.displayProfile || '1080p',
    ips: ips.map((i) => i.address),
    interfaces: ips,
    mobilePath: '/mobile.html',
    viewPath: '/view.html',
    wsPath: '/ws',
  };
}

function pairingUrls(config) {
  const info = buildInfo(config);
  const pinQ = config.roomPin ? `?pin=${encodeURIComponent(config.roomPin)}` : '';
  return info.ips.map((ip) => `http://${ip}:${config.port}/mobile.html${pinQ}`);
}

function startUdpBeacon(config) {
  const port = config.udpDiscoveryPort || 41234;
  let socket;
  try {
    socket = dgram.createSocket('udp4');
  } catch (err) {
    console.warn('[discovery] UDP unavailable:', err.message);
    return null;
  }

  socket.on('error', (err) => {
    console.warn('[discovery] UDP error:', err.message);
  });

  socket.on('message', (msg, rinfo) => {
    const text = msg.toString('utf8').trim();
    if (text !== 'PROJECTION_ICM_DISCOVER' && text !== 'projection-icm?') return;
    const payload = Buffer.from(JSON.stringify(buildInfo(config)), 'utf8');
    socket.send(payload, 0, payload.length, rinfo.port, rinfo.address);
  });

  try {
    socket.bind(port, () => {
      try {
        socket.setBroadcast(true);
      } catch (_) {
        /* ignore */
      }
      console.log(`[discovery] UDP beacon on :${port}`);
    });
  } catch (err) {
    console.warn('[discovery] UDP bind failed:', err.message);
    return null;
  }

  return socket;
}

module.exports = {
  listLanIps,
  buildInfo,
  pairingUrls,
  startUdpBeacon,
};
