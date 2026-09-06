/**
 * Transport adapter: WebSocket (LAN) and optional postMessage legacy helpers.
 */
(function (global) {
  'use strict';

  function createId() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function ProjectionTransport(options) {
    this.options = options || {};
    this.role = this.options.role || 'controller';
    this.name = this.options.name || this.role;
    this.pin = this.options.pin || '';
    this.wsUrl = this.options.wsUrl || null;
    this.handlers = {};
    this.ws = null;
    this.clientId = null;
    this.youControl = false;
    this.controllerId = null;
    this.reconnectDelay = 1000;
    this._closed = false;
    this.connected = false;
  }

  ProjectionTransport.prototype.on = function (event, fn) {
    (this.handlers[event] = this.handlers[event] || []).push(fn);
    return this;
  };

  ProjectionTransport.prototype.emit = function (event, payload) {
    (this.handlers[event] || []).forEach(function (fn) {
      try {
        fn(payload);
      } catch (e) {
        console.error(e);
      }
    });
  };

  ProjectionTransport.prototype.connect = function (wsUrl) {
    if (wsUrl) this.wsUrl = wsUrl;
    if (!this.wsUrl) {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = proto + '//' + location.host + '/ws';
    }
    this._closed = false;
    this._open();
  };

  ProjectionTransport.prototype._open = function () {
    var self = this;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
    }
    var ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.onopen = function () {
      self.connected = true;
      self.reconnectDelay = 1000;
      self.emit('open');
      self.send('hello', {
        role: self.role,
        name: self.name,
        pin: self.pin,
      }, { role: self.role, name: self.name, pin: self.pin });
    };

    ws.onmessage = function (ev) {
      var msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      if (msg.function === 'welcome') {
        self.clientId = msg.data.clientId;
        self.youControl = !!msg.data.youControl;
        self.controllerId = msg.data.controllerId;
      }
      if (msg.function === 'controlChanged') {
        self.controllerId = msg.data.controllerId;
        self.youControl = self.clientId && self.clientId === msg.data.controllerId;
      }
      if (msg.function === 'error') {
        self.emit('error', msg.data);
      }
      self.emit('message', msg);
      self.emit(msg.function, msg.data, msg);
    };

    ws.onclose = function () {
      self.connected = false;
      self.emit('close');
      if (!self._closed) {
        setTimeout(function () {
          self._open();
        }, self.reconnectDelay);
        self.reconnectDelay = Math.min(self.reconnectDelay * 1.5, 10000);
      }
    };

    ws.onerror = function () {
      self.emit('socketError');
    };
  };

  ProjectionTransport.prototype.send = function (fn, data, extra) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    var msg = Object.assign(
      {
        host: 'projection-html5',
        function: fn,
        data: data,
        clientId: this.clientId,
        role: this.role,
      },
      extra || {}
    );
    if (fn === 'hello') {
      msg.pin = (extra && extra.pin) || this.pin;
      msg.role = this.role;
      msg.name = this.name;
    }
    this.ws.send(JSON.stringify(msg));
    return true;
  };

  ProjectionTransport.prototype.takeControl = function () {
    return this.send('takeControl', {});
  };

  ProjectionTransport.prototype.disconnect = function () {
    this._closed = true;
    if (this.ws) this.ws.close();
  };

  /** Legacy helper: post to window + iframe like core.js */
  ProjectionTransport.postMessageTargets = function (targets, fn, data) {
    var payload = JSON.stringify({
      host: 'projection-html5',
      function: fn,
      url: location.href,
      data: data,
    });
    (targets || []).forEach(function (t) {
      if (t && !t.closed) {
        try {
          t.postMessage(payload, '*');
        } catch (_) {}
      }
    });
  };

  global.ProjectionTransport = ProjectionTransport;
})(typeof window !== 'undefined' ? window : globalThis);
