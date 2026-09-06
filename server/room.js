'use strict';

const { v4: uuidv4 } = require('uuid');

const DISPLAY_PRESETS = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
};

function pathBasename(src) {
  try {
    const s = decodeURIComponent(String(src || ''));
    const parts = s.split('/');
    return parts[parts.length - 1] || s;
  } catch (_) {
    return String(src || '');
  }
}

class Room {
  constructor(config) {
    this.config = config;
    this.clients = new Map();
    this.controllerId = null;
    this.state = {
      slidesHtml: '',
      slideIndex: 0,
      theme: 'icm',
      fontSize: 2,
      playlist: [],
      library: null,
      cleared: false,
      logo: false,
      pairingVisible: true,
      displayProfile: config.displayProfile || '1080p',
      video: { playing: false, currentTime: 0, src: null, fit: 'contain', fullscreen: false, muted: false },
      streamActive: false,
      browserFullscreen: false,
    };
  }

  rewritePlaylistSrc(oldSrc, newSrc) {
    if (!Array.isArray(this.state.playlist)) return;
    this.state.playlist = this.state.playlist
      .map((item) => {
        if (!item || item.src !== oldSrc) return item;
        if (newSrc == null) return null;
        return { ...item, src: newSrc, title: pathBasename(newSrc) };
      })
      .filter(Boolean);
  }

  displaySize() {
    return DISPLAY_PRESETS[this.state.displayProfile] || DISPLAY_PRESETS['1080p'];
  }

  snapshot() {
    return {
      ...this.state,
      displaySize: this.displaySize(),
      controllerId: this.controllerId,
      clients: [...this.clients.values()].map((c) => ({
        id: c.id,
        role: c.role,
        name: c.name,
      })),
    };
  }

  addClient(ws, meta) {
    const id = uuidv4();
    const client = {
      id,
      ws,
      role: meta.role || 'controller',
      name: meta.name || meta.role || 'client',
    };
    this.clients.set(id, client);

    if (
      (client.role === 'controller' || client.role === 'admin') &&
      !this.controllerId
    ) {
      this.controllerId = id;
      this.state.pairingVisible = false;
    }

    if (client.role === 'view' || client.role === 'controller' || client.role === 'admin') {
      const hasController = [...this.clients.values()].some(
        (c) => c.role === 'controller' || c.role === 'admin'
      );
      this.state.pairingVisible = !hasController;
    }

    return client;
  }

  removeClient(id) {
    const client = this.clients.get(id);
    this.clients.delete(id);
    if (this.controllerId === id) {
      const next = [...this.clients.values()].find(
        (c) => c.role === 'controller' || c.role === 'admin'
      );
      this.controllerId = next ? next.id : null;
    }
    const hasController = [...this.clients.values()].some(
      (c) => c.role === 'controller' || c.role === 'admin'
    );
    const hasContent = !!(this.state.slidesHtml && String(this.state.slidesHtml).trim());
    // QR só se não há controlador e a sala está “vazia” (sem projeção ativa).
    // Se o celular cair no meio do culto, mantém a tela (logo/padrão no close).
    this.state.pairingVisible = !hasController && !hasContent;
    return {
      client,
      hasController,
      hasContent,
      idleWithoutController: !hasController && hasContent,
    };
  }

  getClient(id) {
    return this.clients.get(id);
  }

  hasControl(clientId) {
    return this.controllerId === clientId;
  }

  takeControl(clientId) {
    const client = this.clients.get(clientId);
    if (!client || (client.role !== 'controller' && client.role !== 'admin')) {
      return false;
    }
    this.controllerId = clientId;
    this.state.pairingVisible = false;
    return true;
  }

  broadcast(msg, exceptId = null) {
    const raw = JSON.stringify(msg);
    for (const [id, client] of this.clients) {
      if (exceptId && id === exceptId) continue;
      if (client.ws.readyState === 1) {
        client.ws.send(raw);
      }
    }
  }

  send(clientId, msg) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(msg));
    }
  }

  applyCommand(fn, data, fromId) {
    switch (fn) {
      case 'reloadReveal':
        this.state.slidesHtml = data || '';
        this.state.slideIndex = 0;
        this.state.cleared = false;
        this.state.logo = false;
        this.state.pairingVisible = false;
        break;
      case 'changeSlide':
        this.state.slideIndex = Number(data) || 0;
        this.state.cleared = false;
        break;
      case 'changeTheme':
        this.state.theme = data;
        break;
      case 'changeFontSize':
        this.state.fontSize = data;
        break;
      case 'clearProjection':
        this.state.cleared = Boolean(data === undefined ? true : data);
        break;
      case 'showLogo':
        this.state.logo = true;
        this.state.cleared = false;
        this.state.pairingVisible = false;
        if (typeof data === 'string' && data.indexOf('<section') !== -1) {
          this.state.slidesHtml = data;
          this.state.slideIndex = 0;
        }
        break;
      case 'showPairing':
        this.state.pairingVisible = true;
        break;
      case 'hidePairing':
        this.state.pairingVisible = false;
        break;
      case 'setDisplayProfile':
        if (DISPLAY_PRESETS[data]) this.state.displayProfile = data;
        break;
      case 'setVideoFit':
        this.state.video = {
          ...this.state.video,
          fit: (data && data.fit) || this.state.video.fit || 'contain',
          fullscreen: !!(data && data.fullscreen),
        };
        break;
      case 'setBrowserFullscreen':
        this.state.browserFullscreen = !!(data && (data.on === true || data === true));
        break;
      case 'playlistUpdate':
        this.state.playlist = Array.isArray(data) ? data : [];
        break;
      case 'libraryUpdate':
        this.state.library = data;
        break;
      case 'playVideo':
        this.state.video = {
          ...this.state.video,
          playing: true,
          currentTime: (data && data.currentTime) || 0,
          src: (data && data.src) || this.state.video.src,
          muted: data && data.src ? false : this.state.video.muted,
        };
        break;
      case 'setVideoMuted':
        this.state.video = {
          ...this.state.video,
          muted: !!(data && (data.muted === true || data === true)),
        };
        break;
      case 'pauseVideo':
        this.state.video = {
          ...this.state.video,
          playing: false,
          currentTime: (data && data.currentTime) || this.state.video.currentTime,
        };
        break;
      case 'seekVideo':
        this.state.video = {
          ...this.state.video,
          currentTime: Number(data && data.currentTime != null ? data.currentTime : data) || 0,
        };
        break;
      case 'streamStarted':
        this.state.streamActive = true;
        break;
      case 'streamStopped':
        this.state.streamActive = false;
        break;
      default:
        break;
    }
  }
}

module.exports = { Room, DISPLAY_PRESETS };
