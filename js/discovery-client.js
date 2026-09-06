/**
 * Client-side host discovery helpers (manual, history, HTTP probe).
 * UDP discover from the browser is limited; server beacon is for native/Capacitor later.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'projection_icm_hosts';
  var DEFAULT_HOSTNAME = 'projection-icm.local';
  var DEFAULT_PORT = 3080;

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  function saveHost(host) {
    var list = loadHistory().filter(function (h) {
      return h !== host;
    });
    list.unshift(host);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 8)));
  }

  function normalizeBase(input) {
    var s = (input || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    try {
      var u = new URL(s);
      if (!u.port) u.port = String(DEFAULT_PORT);
      return u.origin;
    } catch (_) {
      return null;
    }
  }

  function probeInfo(base, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, timeoutMs || 2500);
    return fetch(base + '/api/info', { signal: ctrl && ctrl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function tryCandidates(candidates) {
    var chain = Promise.reject();
    candidates.forEach(function (base) {
      chain = chain.catch(function () {
        return probeInfo(base).then(function (info) {
          return { base: base, info: info };
        });
      });
    });
    return chain;
  }

  function autoDiscover(port) {
    port = port || DEFAULT_PORT;
    var candidates = [];
    loadHistory().forEach(function (h) {
      var b = normalizeBase(h);
      if (b) candidates.push(b);
    });
    candidates.push('http://' + DEFAULT_HOSTNAME + ':' + port);
    if (location.protocol.indexOf('http') === 0 && location.hostname) {
      candidates.push(location.origin);
    }
    // Common Android hotspot DHCP ranges — light scan of .1 gateway skipped;
    // phone is often host; PC is typically .x — user uses QR primarily.
    return tryCandidates(candidates);
  }

  function fetchPairing(base) {
    return fetch(base + '/api/pairing').then(function (r) {
      return r.json();
    });
  }

  global.ProjectionDiscovery = {
    DEFAULT_HOSTNAME: DEFAULT_HOSTNAME,
    DEFAULT_PORT: DEFAULT_PORT,
    loadHistory: loadHistory,
    saveHost: saveHost,
    normalizeBase: normalizeBase,
    probeInfo: probeInfo,
    autoDiscover: autoDiscover,
    fetchPairing: fetchPairing,
  };
})(typeof window !== 'undefined' ? window : globalThis);
