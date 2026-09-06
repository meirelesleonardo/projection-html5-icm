'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const { Room } = require('./room');
const { buildInfo, pairingUrls, startUdpBeacon, listLanIps } = require('./discovery');
const { sanitizeFilename, uniqueMediaName, safeVideoPath } = require('./media');
const {
  listDecks,
  deleteDeck,
  safeDeckId,
  convertUploadedDeck,
  DECK_EXTS,
} = require('./decks');

const ROOT = path.join(__dirname, '..');
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const mediaDir = path.isAbsolute(config.mediaDir)
  ? config.mediaDir
  : path.join(ROOT, config.mediaDir);

function mediaPublicSrc(folder, filename) {
  const safe = String(filename)
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `/media/${folder}/${safe}`;
}

for (const sub of ['videos', 'tmp', 'images', 'decks']) {
  fs.mkdirSync(path.join(mediaDir, sub), { recursive: true });
}

const decksDir = path.join(mediaDir, 'decks');
const decksUploadDir = path.join(mediaDir, 'tmp');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const room = new Room(config);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dest = req.query.to === 'videos' ? path.join(mediaDir, 'videos') : path.join(mediaDir, 'tmp');
    cb(null, dest);
  },
  filename(req, file, cb) {
    const dest =
      req.query.to === 'videos' ? path.join(mediaDir, 'videos') : path.join(mediaDir, 'tmp');
    cb(null, uniqueMediaName(dest, file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

const deckUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, decksUploadDir);
    },
    filename(req, file, cb) {
      cb(null, uniqueMediaName(decksUploadDir, file.originalname));
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (DECK_EXTS.test(file.originalname)) cb(null, true);
    else cb(new Error('Use .pptx, .ppt, .odp ou .pdf'));
  },
});

app.use(express.json({ limit: '20mb' }));

app.get('/api/info', (req, res) => {
  res.json(buildInfo(config));
});

app.get('/api/pairing', async (req, res) => {
  const urls = pairingUrls(config);
  const primary = urls[0] || `http://127.0.0.1:${config.port}/mobile.html`;
  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(primary, { width: 512, margin: 1 });
  } catch (err) {
    console.warn('[pairing] QR error', err.message);
  }
  res.json({
    ...buildInfo(config),
    urls,
    primaryUrl: primary,
    qrDataUrl,
    pin: config.roomPin || null,
  });
});

app.get('/api/library', (req, res) => {
  const dataFile = path.join(ROOT, 'data', 'data.json');
  if (!fs.existsSync(dataFile)) {
    return res.status(404).json({ error: 'data.json not found' });
  }
  res.sendFile(dataFile);
});

app.get('/api/media/list', (req, res) => {
  const videosDir = path.join(mediaDir, 'videos');
  const files = fs
    .readdirSync(videosDir)
    .filter((f) => /\.(mp4|webm|ogg|mov)$/i.test(f))
    .map((f) => ({
      name: f,
      src: mediaPublicSrc('videos', f),
    }));
  res.json({ videos: files });
});

app.post('/api/media/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const folder = req.query.to === 'videos' ? 'videos' : 'tmp';
  res.json({
    name: req.file.filename,
    src: mediaPublicSrc(folder, req.file.filename),
  });
});

app.delete('/api/media/videos/:name', (req, res) => {
  const parsed = safeVideoPath(mediaDir, decodeURIComponent(req.params.name));
  if (!parsed) return res.status(400).json({ error: 'invalid name' });
  if (!fs.existsSync(parsed.full)) return res.status(404).json({ error: 'not found' });
  try {
    fs.unlinkSync(parsed.full);
    room.rewritePlaylistSrc(mediaPublicSrc('videos', parsed.base), null);
    return res.json({ ok: true, name: parsed.base });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/media/rename', (req, res) => {
  const from = req.body && req.body.from;
  const toRaw = req.body && req.body.to;
  const src = safeVideoPath(mediaDir, from);
  if (!src || !fs.existsSync(src.full)) {
    return res.status(404).json({ error: 'source not found' });
  }
  let toName = sanitizeFilename(toRaw);
  if (!path.extname(toName) && path.extname(src.base)) {
    toName += path.extname(src.base);
  }
  const dest = safeVideoPath(mediaDir, toName);
  if (!dest) return res.status(400).json({ error: 'invalid target name' });
  if (dest.base === src.base) {
    return res.json({
      ok: true,
      name: src.base,
      src: mediaPublicSrc('videos', src.base),
    });
  }
  if (fs.existsSync(dest.full)) {
    const suggested = uniqueMediaName(src.videosDir, toName);
    return res.status(409).json({
      error: 'target exists',
      suggested,
    });
  }
  try {
    fs.renameSync(src.full, dest.full);
    const oldSrc = mediaPublicSrc('videos', src.base);
    const newSrc = mediaPublicSrc('videos', dest.base);
    room.rewritePlaylistSrc(oldSrc, newSrc);
    // Keep projected slides pointing at the new file
    if (room.state.slidesHtml && room.state.slidesHtml.indexOf(src.base) !== -1) {
      room.state.slidesHtml = room.state.slidesHtml.split(oldSrc).join(newSrc);
      room.broadcast({
        host: 'projection-html5',
        function: 'reloadReveal',
        data: room.state.slidesHtml,
      });
      room.broadcast({
        host: 'projection-html5',
        function: 'playVideo',
        data: { src: newSrc, currentTime: 0 },
      });
    }
    room.broadcast({
      host: 'projection-html5',
      function: 'playlistUpdate',
      data: room.state.playlist,
    });
    return res.json({ ok: true, name: dest.base, src: newSrc });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/playlist', (req, res) => {
  const playlist = Array.isArray(req.body) ? req.body : req.body.playlist || [];
  room.state.playlist = playlist;
  room.broadcast({
    host: 'projection-html5',
    function: 'playlistUpdate',
    data: playlist,
  });
  res.json({ ok: true, count: playlist.length });
});

app.get('/api/decks/list', (req, res) => {
  res.json({ decks: listDecks(decksDir) });
});

app.post('/api/decks/upload', (req, res) => {
  deckUpload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload inválido' });
    }
    if (!req.file) return res.status(400).json({ error: 'file required' });
    try {
      const meta = await convertUploadedDeck(decksDir, req.file.path, req.file.originalname);
      return res.json(meta);
    } catch (e) {
      const status = e.code === 'MISSING_TOOLS' ? 503 : 500;
      return res.status(status).json({ error: e.message || 'Falha na conversão' });
    }
  });
});

app.delete('/api/decks/:id', (req, res) => {
  const id = safeDeckId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  if (!deleteDeck(decksDir, id)) return res.status(404).json({ error: 'not found' });
  return res.json({ ok: true, id });
});

app.use('/media', express.static(mediaDir));
app.use(express.static(ROOT));

function envelope(fn, data, extra = {}) {
  return {
    host: 'projection-html5',
    function: fn,
    data,
    ...extra,
  };
}

const CONTROL_FUNCTIONS = new Set([
  'reloadReveal',
  'changeSlide',
  'changeTheme',
  'changeFontSize',
  'clearProjection',
  'showLogo',
  'showPairing',
  'hidePairing',
  'setDisplayProfile',
  'setVideoFit',
  'setBrowserFullscreen',
  'playlistUpdate',
  'libraryUpdate',
  'playVideo',
  'pauseVideo',
  'seekVideo',
  'setVideoMuted',
  'streamStarted',
  'streamStopped',
]);

wss.on('connection', (ws) => {
  let clientId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const fn = msg.function;
    if (fn === 'hello') {
      const pin = msg.pin != null ? String(msg.pin) : msg.data && msg.data.pin;
      if (config.roomPin && String(pin || '') !== String(config.roomPin)) {
        ws.send(
          JSON.stringify(
            envelope('error', { code: 'bad_pin', message: 'PIN incorreto' })
          )
        );
        ws.close();
        return;
      }
      const role = (msg.role || (msg.data && msg.data.role) || 'controller').toLowerCase();
      const name = msg.name || (msg.data && msg.data.name) || role;
      const client = room.addClient(ws, { role, name });
      clientId = client.id;
      ws.send(
        JSON.stringify(
          envelope('welcome', {
            clientId,
            role: client.role,
            controllerId: room.controllerId,
            youControl: room.hasControl(clientId),
          })
        )
      );
      ws.send(JSON.stringify(envelope('stateSnapshot', room.snapshot())));
      ws.send(JSON.stringify(envelope('networkInfo', buildInfo(config))));
      room.broadcast(
        envelope('controlChanged', {
          controllerId: room.controllerId,
          pairingVisible: room.state.pairingVisible,
        }),
        null
      );
      if (room.state.pairingVisible) {
        room.broadcast(envelope('showPairing', true), null);
      } else {
        room.broadcast(envelope('hidePairing', true), null);
      }
      console.log(`[ws] hello ${client.role} ${clientId}`);
      return;
    }

    if (!clientId) return;
    const client = room.getClient(clientId);
    if (!client) return;

    if (fn === 'takeControl') {
      if (room.takeControl(clientId)) {
        room.broadcast(
          envelope('controlChanged', {
            controllerId: room.controllerId,
            pairingVisible: false,
          })
        );
        room.broadcast(envelope('hidePairing', true));
      }
      return;
    }

    if (fn === 'webrtc-signal') {
      // Relay signaling to views (and optionally other peers)
      room.broadcast(
        envelope('webrtc-signal', msg.data, {
          fromId: clientId,
          fromRole: client.role,
        }),
        clientId
      );
      return;
    }

    if (client.role === 'observer') {
      return;
    }

    if (CONTROL_FUNCTIONS.has(fn)) {
      if (
        (client.role === 'controller' || client.role === 'admin') &&
        !room.hasControl(clientId) &&
        fn !== 'showPairing' &&
        fn !== 'takeControl'
      ) {
        ws.send(
          JSON.stringify(
            envelope('error', {
              code: 'no_control',
              message: 'Outro aparelho tem o comando. Use Assumir comando.',
            })
          )
        );
        return;
      }
      room.applyCommand(fn, msg.data, clientId);
      room.broadcast(envelope(fn, msg.data, { fromId: clientId }), null);
      return;
    }
  });

  ws.on('close', () => {
    if (!clientId) return;
    const removed = room.removeClient(clientId);
    room.broadcast(
      envelope('controlChanged', {
        controllerId: room.controllerId,
        pairingVisible: room.state.pairingVisible,
      })
    );
    if (room.state.pairingVisible) {
      room.broadcast(envelope('showPairing', true));
    } else {
      room.broadcast(envelope('hidePairing', true));
      // Celular bloqueou/saiu: idle com logo em vez do QR (culto em andamento)
      if (removed && removed.idleWithoutController) {
        room.state.logo = true;
        room.state.cleared = false;
        room.broadcast(envelope('pauseVideo', {}));
        room.broadcast(envelope('showLogo', true));
      }
    }
    console.log(`[ws] close ${clientId}`);
  });
});

// Refresh network info periodically (DHCP may arrive late on hotspot)
setInterval(() => {
  const info = buildInfo(config);
  room.broadcast(envelope('networkInfo', info));
}, 5000);

startUdpBeacon(config);

function onListenError(err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `[server] Porta ${config.port} já em uso. Pare a outra instância (ex.: kill $(ss -tlnp | grep ':${config.port}' | grep -oP 'pid=\\K[0-9]+')) ou mude "port" em server/config.json.`
    );
  } else {
    console.error('[server] falha ao escutar:', err && err.message ? err.message : err);
  }
  process.exit(1);
}

server.on('error', onListenError);
wss.on('error', onListenError);

server.listen(config.port, '0.0.0.0', () => {
  const ips = listLanIps();
  console.log(`[server] Projeção ICM v${config.version} on port ${config.port}`);
  console.log(`[server] Local: http://127.0.0.1:${config.port}/`);
  ips.forEach((i) => {
    console.log(`[server] LAN  : http://${i.address}:${config.port}/mobile.html`);
  });
  if (config.roomPin) console.log(`[server] PIN  : ${config.roomPin}`);
});
