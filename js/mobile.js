(function () {
  'use strict';

  var transport = null;
  var baseUrl = null;
  var state = {
    slidesHtml: '',
    slideIndex: 0,
    fontSize: 2,
    playlist: [],
    library: null,
    youControl: false,
    role: 'controller',
    videoFit: 'contain',
    videoFullscreen: false,
  };
  var slideCount = 0;
  var pc = null;
  var localStream = null;
  var qrStream = null;
  var videoBgSrc = null;
  var controlWaiters = [];
  var BG_DEFAULT = 'imagens/fundo.jpg';
  var LOGO_SLIDE_HTML = null;

  var $ = function (id) {
    return document.getElementById(id);
  };

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function setStatus(el, text, cls) {
    el.textContent = text;
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s.id === id);
    });
  }

  function showTab(name) {
    document.querySelectorAll('.nav-tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    ['live', 'playlist', 'library', 'media', 'more'].forEach(function (t) {
      var el = $('tab-' + t);
      if (el) el.classList.toggle('hidden', t !== name);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  /** Wait until this device has control, then run fn. Never drop silently. */
  function ensureControl(fn) {
    if (state.role === 'observer') {
      setStatus($('appStatus'), 'Modo observador — não pode controlar', 'bad');
      return;
    }
    if (!transport || !transport.connected) {
      setStatus($('appStatus'), 'Desconectado do servidor', 'bad');
      return;
    }
    if (state.youControl || (transport.youControl && transport.clientId === transport.controllerId)) {
      state.youControl = true;
      fn();
      return;
    }
    controlWaiters.push(fn);
    setStatus($('appStatus'), 'Assumindo comando…', '');
    transport.takeControl();
    setTimeout(function () {
      if (!controlWaiters.length) return;
      // Retry once if welcome already gave us control but flag lagged
      if (transport.youControl || transport.clientId === transport.controllerId) {
        state.youControl = true;
        flushControlWaiters();
      } else {
        setStatus($('appStatus'), 'Toque em Assumir comando e tente de novo', 'bad');
        controlWaiters = [];
      }
    }, 800);
  }

  function flushControlWaiters() {
    var queue = controlWaiters.slice();
    controlWaiters = [];
    queue.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
    updateControlUi();
  }

  function sendCmd(fn, data) {
    if (!transport) return false;
    return transport.send(fn, data);
  }

  function parseSlides(html) {
    var div = document.createElement('div');
    div.innerHTML = html || '';
    var sections = div.querySelectorAll('section');
    return Array.prototype.map.call(sections, function (sec, i) {
      return {
        index: i,
        text: (sec.innerText || sec.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      };
    });
  }

  function renderSlides() {
    var slides = parseSlides(state.slidesHtml);
    slideCount = slides.length;
    var box = $('slideList');
    box.innerHTML = '';
    slides.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'slide-row' + (s.index === state.slideIndex ? ' active' : '');
      row.textContent = s.index + '. ' + (s.text || '(vazio)');
      row.addEventListener('click', function () {
        gotoSlide(s.index);
      });
      box.appendChild(row);
    });
    var cur = slides[state.slideIndex];
    $('previewBox').textContent = cur
      ? cur.text || '(slide ' + state.slideIndex + ')'
      : 'Sem slides — adicione da lista ou biblioteca';
    updateControlUi();
  }

  function updateControlUi() {
    var can = state.role !== 'observer';
    [
      'btnPrev',
      'btnNext',
      'btnBlack',
      'btnLogo',
      'btnFontUp',
      'btnFontDown',
      'btnPlayVid',
      'btnPauseVid',
      'btnVideoContain',
      'btnVideoCover',
      'btnVideoFull',
    ].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.disabled = state.role === 'observer';
    });
    var label = transport && transport.connected
      ? state.role === 'observer'
        ? 'Observando'
        : state.youControl
          ? 'Você controla'
          : 'Outro aparelho controla — toque Assumir comando'
      : 'Desconectado';
    setStatus(
      $('appStatus'),
      label + (baseUrl ? ' · ' + baseUrl.replace(/^https?:\/\//, '') : ''),
      transport && transport.connected ? (state.youControl || state.role === 'observer' ? 'ok' : '') : 'bad'
    );
  }

  function gotoSlide(i) {
    ensureControl(function () {
      state.slideIndex = i;
      sendCmd('changeSlide', i);
      renderSlides();
    });
  }

  function buildLogoSlide() {
    // Align with desktop telaPadrao + backlay logo ICM
    return (
      '<section data-background="' +
      BG_DEFAULT +
      '" data-state="show_backlay1">' +
      '<style>.show_backlay1 header.backlay1-pt-br .backlay_1-pt-br{display:block}</style>' +
      '<h1>Maranata</h1><h3>O Senhor Jesus Vem</h3></section>'
    );
  }

  LOGO_SLIDE_HTML = buildLogoSlide();

  function projectHtml(html) {
    ensureControl(function () {
      state.slidesHtml = html || '';
      state.slideIndex = 0;
      sendCmd('reloadReveal', state.slidesHtml);
      sendCmd('changeSlide', 0);
      sendCmd('hidePairing', true);
      renderSlides();
      showTab('live');
    });
  }

  function songToHtml(song) {
    var title = song.name || song.text || song.title || 'Louvor';
    var content = song.content || (song.data && song.data.content) || '';
    var sid = String(title)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 24) || 'song';
    var parts = String(content).split(/\n\n/);
    var bgBase = videoBgSrc
      ? ' data-background-video="' +
        escapeAttr(videoBgSrc) +
        '" data-background-video-loop data-background-size="contain"'
      : ' data-background="' + BG_DEFAULT + '"';
    var html = '';
    var verseCount = 0;
    parts.forEach(function (part, j) {
      var estrofeEsp = part.trim().replace(/\n/g, '<br>');
      if (!estrofeEsp) return;
      var fimState = '';
      var fimStyle = '';
      // last non-empty handled below after loop — compute later
      var stateId = 'm' + sid + '_' + j;
      if (j === 0 || verseCount === 0) {
        var titleEsc = String(title).replace(/"/g, '\\"');
        html +=
          '<section' +
          bgBase +
          ' data-state="showtitle' +
          stateId +
          '">' +
          '\n<style>\n.showtitle' +
          stateId +
          ' header.winetitle{ display: table; }\n.showtitle' +
          stateId +
          ' header.winetitle #logo{ display: table; }\n.showtitle' +
          stateId +
          ' header.winetitle #titulo:after { content: "' +
          titleEsc +
          '"; }\n</style>\n' +
          estrofeEsp +
          '\n</section>\n';
      } else {
        html +=
          '<section' +
          bgBase +
          ' data-state="showlogo' +
          stateId +
          '" data-background-transition="none">' +
          '\n<style>\n.showlogo' +
          stateId +
          ' header.whitelogo{ display: block; }\n.showlogo' +
          stateId +
          ' header.whitelogo #logo{ display: block; }</style>\n' +
          estrofeEsp +
          '\n</section>\n';
      }
      verseCount++;
    });
    if (!html) {
      html =
        '<section' +
        bgBase +
        '><h3>' +
        escapeHtml(title) +
        '</h3></section>\n';
    }
    // Closing default screen like desktop
    html +=
      '<section data-background="' +
      BG_DEFAULT +
      '" data-state="show_backlay1">' +
      '<style>.show_backlay1 header.backlay1-pt-br .backlay_1-pt-br{display:block}</style>' +
      '<h1>Maranata</h1><h3>O Senhor Jesus Vem</h3></section>\n';
    return html;
  }

  function videoSlide(src, title, opts) {
    opts = opts || {};
    var fit = opts.fit || state.videoFit || 'contain';
    var full = opts.fullscreen != null ? opts.fullscreen : state.videoFullscreen;
    var cls = 'video-slide' + (full ? ' video-fullscreen' : '');
    var titleHtml = full ? '' : '<h3 class="video-title">' + escapeHtml(title || 'Vídeo') + '</h3>';
    return (
      '<section class="' +
      cls +
      '" data-video-src="' +
      escapeAttr(src) +
      '" data-video-fit="' +
      escapeAttr(fit) +
      '">' +
      titleHtml +
      '<video src="' +
      escapeAttr(src) +
      '" playsinline webkit-playsinline data-autoplay ' +
      (full ? '' : 'controls ') +
      'class="proj-video" style="object-fit:' +
      escapeAttr(fit) +
      '"></video></section>'
    );
  }

  function projectVideo(src, title) {
    ensureControl(function () {
      var html = videoSlide(src, title);
      state.slidesHtml = html;
      state.slideIndex = 0;
      sendCmd('reloadReveal', html);
      sendCmd('changeSlide', 0);
      sendCmd('hidePairing', true);
      sendCmd('playVideo', { src: src, currentTime: 0 });
      renderSlides();
      showTab('live');
    });
  }

  function applyVideoFit(fit, fullscreen) {
    ensureControl(function () {
      if (fit) state.videoFit = fit;
      if (fullscreen != null) state.videoFullscreen = !!fullscreen;
      sendCmd('setVideoFit', {
        fit: state.videoFit,
        fullscreen: state.videoFullscreen,
      });
      // If current slides are a single video, rebuild for consistency
      var m = state.slidesHtml && state.slidesHtml.match(/data-video-src="([^"]+)"/);
      if (m) {
        var src = m[1].replace(/&amp;/g, '&');
        var titleMatch = state.slidesHtml.match(/class="video-title"[^>]*>([^<]*)</);
        var title = titleMatch ? titleMatch[1] : 'Vídeo';
        var html = videoSlide(src, title, {
          fit: state.videoFit,
          fullscreen: state.videoFullscreen,
        });
        state.slidesHtml = html;
        state.slideIndex = 0;
        sendCmd('reloadReveal', html);
        sendCmd('changeSlide', 0);
        sendCmd('playVideo', { src: src });
        renderSlides();
      }
    });
  }

  function renderPlaylist() {
    var box = $('playlistBox');
    box.innerHTML = '';
    if (!state.playlist.length) {
      box.innerHTML = '<p class="status">Lista vazia — adicione louvores ou vídeos.</p>';
      return;
    }
    state.playlist.forEach(function (item, idx) {
      var div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML =
        '<strong>' +
        escapeHtml(item.title || item.name || item.type || 'Item') +
        '</strong><br><small>' +
        escapeHtml(item.type || 'song') +
        '</small>';
      div.addEventListener('click', function () {
        if (item.type === 'video') {
          projectVideo(item.src, item.title);
        } else if (item.html) {
          projectHtml(item.html);
        } else if (item.song) {
          projectHtml(songToHtml(item.song));
        } else if (item.type === 'logo') {
          projectHtml(buildLogoSlide());
        }
      });
      var rm = document.createElement('button');
      rm.className = 'secondary';
      rm.textContent = 'Remover';
      rm.style.marginTop = '0.35rem';
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        state.playlist.splice(idx, 1);
        syncPlaylist();
        renderPlaylist();
      });
      div.appendChild(rm);
      box.appendChild(div);
    });
  }

  function syncPlaylist() {
    ensureControl(function () {
      sendCmd('playlistUpdate', state.playlist);
      fetch(baseUrl + '/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist: state.playlist }),
      }).catch(function () {});
    });
  }

  function flattenLibrary(data) {
    var out = [];
    function walk(node, folder) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(function (n) {
          walk(n, folder);
        });
        return;
      }
      if (node.songs && Array.isArray(node.songs)) {
        var folderName = node.name || node.text || folder || '';
        node.songs.forEach(function (song) {
          out.push({
            name: song.title || song.name || song.text,
            content: song.content || '',
            folder: folderName,
            lang: node.lang || song.lang,
          });
        });
      }
      if (node.children) {
        walk(node.children, node.text || node.name || folder);
      }
      if (node.content || (node.data && node.data.content)) {
        out.push({
          name: node.text || node.name || node.title,
          content: node.content || node.data.content,
          folder: folder || '',
          lang: node.lang,
        });
      }
    }
    walk(data, '');
    return out;
  }

  function renderLibrary(filter) {
    var box = $('libraryBox');
    box.innerHTML = '';
    if (!state.library) {
      box.innerHTML = '<p class="status">Carregando biblioteca…</p>';
      return;
    }
    var songs = flattenLibrary(state.library);
    var q = (filter || '').toLowerCase();
    songs
      .filter(function (s) {
        if (!q) return true;
        return (
          (s.name || '').toLowerCase().indexOf(q) >= 0 ||
          (s.content || '').toLowerCase().indexOf(q) >= 0
        );
      })
      .slice(0, 200)
      .forEach(function (s) {
        var div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML =
          '<strong>' +
          escapeHtml(s.name) +
          '</strong><br><small>' +
          escapeHtml(s.folder) +
          '</small>';
        div.addEventListener('click', function () {
          var html = songToHtml(s);
          var item = { type: 'song', title: s.name, song: s, html: html };
          state.playlist.push(item);
          syncPlaylist();
          renderPlaylist();
          projectHtml(html);
        });
        box.appendChild(div);
      });
  }

  function loadLibrary() {
    fetch(baseUrl + '/api/library')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        state.library = data;
        renderLibrary($('libSearch').value);
      })
      .catch(function () {
        $('libraryBox').innerHTML = '<p class="status bad">Falha ao carregar data.json</p>';
      });
  }

  function updateBgStatus() {
    var el = $('bgStatus');
    if (!el) return;
    if (videoBgSrc) {
      var name = videoBgSrc.split('/').pop();
      try {
        name = decodeURIComponent(name);
      } catch (_) {}
      el.textContent = 'Fundo ativo: ' + name;
      el.className = 'status ok';
    } else {
      el.textContent = 'Nenhum fundo de vídeo';
      el.className = 'status';
    }
  }

  function clearVideoBg() {
    videoBgSrc = null;
    updateBgStatus();
  }

  function deleteVideo(name, src) {
    if (!confirm('Apagar o vídeo "' + name + '" do PC?')) return;
    fetch(baseUrl + '/api/media/videos/' + encodeURIComponent(name), { method: 'DELETE' })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          alert((res.j && res.j.error) || 'Falha ao apagar');
          return;
        }
        if (videoBgSrc === src) clearVideoBg();
        state.playlist = state.playlist.filter(function (it) {
          return !(it && it.src === src);
        });
        syncPlaylist();
        renderPlaylist();
        loadVideos();
      })
      .catch(function () {
        alert('Falha ao apagar');
      });
  }

  function renameVideo(name) {
    var next = prompt('Novo nome do arquivo:', name);
    if (next == null) return;
    next = String(next).trim();
    if (!next || next === name) return;
    fetch(baseUrl + '/api/media/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: name, to: next }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { status: r.status, ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (res.status === 409) {
          var sug = res.j && res.j.suggested;
          if (sug && confirm('Já existe. Usar o nome sugerido "' + sug + '"?')) {
            renameVideoApply(name, sug);
          }
          return;
        }
        if (!res.ok) {
          alert((res.j && res.j.error) || 'Falha ao renomear');
          return;
        }
        afterRename(name, res.j.name, res.j.src);
      })
      .catch(function () {
        alert('Falha ao renomear');
      });
  }

  function renameVideoApply(from, to) {
    fetch(baseUrl + '/api/media/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from, to: to }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          alert((res.j && res.j.error) || 'Falha ao renomear');
          return;
        }
        afterRename(from, res.j.name, res.j.src);
      });
  }

  function afterRename(oldName, newName, newSrc) {
    var oldSrc = '/media/videos/' + encodeURIComponent(oldName);
    if (videoBgSrc === oldSrc || videoBgSrc === '/media/videos/' + oldName) {
      videoBgSrc = newSrc;
      updateBgStatus();
    }
    state.playlist.forEach(function (it) {
      if (it && (it.src === oldSrc || it.src === '/media/videos/' + oldName)) {
        it.src = newSrc;
        it.title = newName;
      }
    });
    // Refresh currently projected HTML if it pointed at the old file
    if (state.slidesHtml && state.slidesHtml.indexOf(oldName) !== -1) {
      state.slidesHtml = state.slidesHtml.split(oldSrc).join(newSrc);
      if (oldSrc !== '/media/videos/' + oldName) {
        state.slidesHtml = state.slidesHtml.split('/media/videos/' + oldName).join(newSrc);
      }
      projectVideo(newSrc, newName);
    }
    syncPlaylist();
    renderPlaylist();
    loadVideos();
  }

  function loadVideos() {
    updateBgStatus();
    fetch(baseUrl + '/api/media/list')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var box = $('videoList');
        box.innerHTML = '';
        (data.videos || []).forEach(function (v) {
          var wrap = document.createElement('div');
          wrap.className = 'card';
          wrap.style.padding = '0.65rem';
          wrap.style.marginBottom = '0.5rem';
          var title = document.createElement('div');
          title.style.marginBottom = '0.35rem';
          title.innerHTML = '<strong>' + escapeHtml(v.name) + '</strong>';
          wrap.appendChild(title);

          var play = document.createElement('button');
          play.className = 'secondary';
          play.textContent = 'Projetar';
          play.addEventListener('click', function () {
            var item = { type: 'video', title: v.name, src: v.src };
            state.playlist.push(item);
            syncPlaylist();
            renderPlaylist();
            projectVideo(v.src, v.name);
          });
          wrap.appendChild(play);

          var bg = document.createElement('button');
          bg.className = 'secondary';
          bg.textContent = 'Usar como fundo de letra';
          bg.addEventListener('click', function () {
            videoBgSrc = v.src;
            updateBgStatus();
          });
          wrap.appendChild(bg);

          var ren = document.createElement('button');
          ren.className = 'secondary';
          ren.textContent = 'Renomear';
          ren.addEventListener('click', function () {
            renameVideo(v.name);
          });
          wrap.appendChild(ren);

          var del = document.createElement('button');
          del.className = 'danger';
          del.textContent = 'Apagar';
          del.addEventListener('click', function () {
            deleteVideo(v.name, v.src);
          });
          wrap.appendChild(del);

          box.appendChild(wrap);
        });
        if (!(data.videos || []).length) {
          box.innerHTML = '<p class="status">Nenhum MP4 em media/videos</p>';
        }
      });
  }

  function connectTo(base, pin, role) {
    baseUrl = ProjectionDiscovery.normalizeBase(base);
    if (!baseUrl) {
      setStatus($('connectStatus'), 'Endereço inválido', 'bad');
      return;
    }
    ProjectionDiscovery.saveHost(baseUrl);
    state.role = role || 'controller';
    if (transport) transport.disconnect();
    transport = new ProjectionTransport({
      role: state.role,
      name: 'mobile-' + (navigator.platform || 'android'),
      pin: pin || '',
      wsUrl: baseUrl.replace(/^http/, 'ws') + '/ws',
    });
    wireTransport();
    transport.connect();
    setStatus($('connectStatus'), 'Conectando a ' + baseUrl + '…');
  }

  function wireTransport() {
    transport.on('open', function () {
      setStatus($('connectStatus'), 'Conectado', 'ok');
      showScreen('screen-app');
      loadLibrary();
      loadVideos();
    });
    transport.on('welcome', function (data) {
      state.youControl = !!data.youControl;
      if (state.youControl) flushControlWaiters();
      updateControlUi();
    });
    transport.on('controlChanged', function (data) {
      state.youControl = transport.clientId === data.controllerId;
      if (state.youControl) flushControlWaiters();
      updateControlUi();
    });
    transport.on('stateSnapshot', function (snap) {
      state.slidesHtml = snap.slidesHtml || '';
      state.slideIndex = snap.slideIndex || 0;
      state.fontSize = snap.fontSize != null ? snap.fontSize : 2;
      state.playlist = snap.playlist || [];
      if (snap.library) state.library = snap.library;
      if (snap.displayProfile) $('displayProfile').value = snap.displayProfile;
      if (snap.video) {
        if (snap.video.fit) state.videoFit = snap.video.fit;
        if (snap.video.fullscreen != null) state.videoFullscreen = !!snap.video.fullscreen;
      }
      renderSlides();
      renderPlaylist();
      updateControlUi();
    });
    transport.on('reloadReveal', function (html) {
      state.slidesHtml = html || '';
      state.slideIndex = 0;
      renderSlides();
    });
    transport.on('changeSlide', function (i) {
      state.slideIndex = Number(i) || 0;
      renderSlides();
    });
    transport.on('playlistUpdate', function (pl) {
      state.playlist = pl || [];
      renderPlaylist();
    });
    transport.on('setVideoFit', function (data) {
      if (!data) return;
      if (data.fit) state.videoFit = data.fit;
      if (data.fullscreen != null) state.videoFullscreen = !!data.fullscreen;
    });
    transport.on('error', function (err) {
      setStatus($('connectStatus'), (err && err.message) || 'Erro', 'bad');
      setStatus($('appStatus'), (err && err.message) || 'Erro', 'bad');
    });
    transport.on('close', function () {
      updateControlUi();
    });
    transport.on('webrtc-signal', function (data) {
      handleSignal(data);
    });
  }

  function renderHistory() {
    var box = $('historyBox');
    var hist = ProjectionDiscovery.loadHistory();
    if (!hist.length) {
      box.innerHTML = '<small class="status">Sem históricos ainda</small>';
      return;
    }
    box.innerHTML = '<small>Últimos usados</small>';
    hist.forEach(function (h) {
      var b = document.createElement('button');
      b.className = 'secondary';
      b.textContent = h;
      b.addEventListener('click', function () {
        $('hostInput').value = h.replace(/^https?:\/\//, '');
      });
      box.appendChild(b);
    });
  }

  function ensurePc() {
    if (pc) return pc;
    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pc.onicecandidate = function (ev) {
      if (ev.candidate && transport) {
        transport.send('webrtc-signal', { type: 'candidate', candidate: ev.candidate });
      }
    };
    return pc;
  }

  function handleSignal(data) {
    if (!data) return;
    if (data.type === 'answer' && pc) {
      pc.setRemoteDescription(data.sdp).catch(function () {});
    } else if (data.type === 'candidate' && pc && data.candidate) {
      pc.addIceCandidate(data.candidate).catch(function () {});
    }
  }

  async function startCameraStream() {
    ensureControl(async function () {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: true,
        });
        var conn = ensurePc();
        localStream.getTracks().forEach(function (t) {
          conn.addTrack(t, localStream);
        });
        var offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        sendCmd('webrtc-signal', { type: 'offer', sdp: conn.localDescription });
        sendCmd('streamStarted', {});
      } catch (e) {
        alert('WebRTC falhou: ' + (e.message || e) + '\nUse o upload de vídeo.');
      }
    });
  }

  async function startFileStream(file) {
    ensureControl(async function () {
      try {
        var url = URL.createObjectURL(file);
        var video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        if (!video.captureStream && !video.mozCaptureStream) {
          throw new Error('captureStream não suportado');
        }
        localStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        var conn = ensurePc();
        localStream.getTracks().forEach(function (t) {
          conn.addTrack(t, localStream);
        });
        var offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        sendCmd('webrtc-signal', { type: 'offer', sdp: conn.localDescription });
        sendCmd('streamStarted', {});
      } catch (e) {
        var fd = new FormData();
        fd.append('file', file);
        fetch(baseUrl + '/api/media/upload?to=tmp', { method: 'POST', body: fd })
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            projectVideo(res.src, file.name);
            alert('Stream indisponível — vídeo enviado e projetado.');
          })
          .catch(function () {
            alert('Falha no stream e no upload: ' + (e.message || e));
          });
      }
    });
  }

  function stopStream() {
    if (localStream) {
      localStream.getTracks().forEach(function (t) {
        t.stop();
      });
      localStream = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
    if (transport) sendCmd('streamStopped', {});
  }

  async function scanQr() {
    var video = $('qrVideo');
    if (!window.BarcodeDetector) {
      var manual = prompt('Cole a URL do QR (ou o IP):');
      if (manual) {
        if (/^https?:\/\//i.test(manual)) {
          try {
            var u = new URL(manual);
            $('hostInput').value = u.host;
            var pin = u.searchParams.get('pin');
            if (pin) $('pinInput').value = pin;
          } catch (_) {
            $('hostInput').value = manual;
          }
        } else {
          $('hostInput').value = manual;
        }
      }
      return;
    }
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    video.srcObject = qrStream;
    video.style.display = 'block';
    await video.play();
    var detector = new BarcodeDetector({ formats: ['qr_code'] });
    var timer = setInterval(async function () {
      try {
        var codes = await detector.detect(video);
        if (codes && codes[0]) {
          clearInterval(timer);
          qrStream.getTracks().forEach(function (t) {
            t.stop();
          });
          video.style.display = 'none';
          var raw = codes[0].rawValue;
          var u2 = new URL(raw);
          $('hostInput').value = u2.host;
          var pin2 = u2.searchParams.get('pin');
          if (pin2) $('pinInput').value = pin2;
          $('btnConnect').click();
        }
      } catch (_) {}
    }, 600);
  }

  $('btnConnect').addEventListener('click', function () {
    connectTo($('hostInput').value, $('pinInput').value, $('roleSelect').value);
  });
  $('btnAuto').addEventListener('click', function () {
    setStatus($('connectStatus'), 'Procurando…');
    ProjectionDiscovery.autoDiscover()
      .then(function (res) {
        $('hostInput').value = res.base.replace(/^https?:\/\//, '');
        connectTo(res.base, $('pinInput').value, $('roleSelect').value);
      })
      .catch(function () {
        setStatus($('connectStatus'), 'Não encontrado — use o QR do projetor', 'bad');
      });
  });
  $('btnScanQr').addEventListener('click', function () {
    scanQr().catch(function (e) {
      setStatus($('connectStatus'), e.message || 'Falha na câmera', 'bad');
    });
  });

  document.querySelectorAll('.nav-tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      showTab(b.getAttribute('data-tab'));
    });
  });

  $('btnPrev').addEventListener('click', function () {
    if (state.slideIndex > 0) gotoSlide(state.slideIndex - 1);
  });
  $('btnNext').addEventListener('click', function () {
    if (state.slideIndex < slideCount - 1) gotoSlide(state.slideIndex + 1);
  });

  var touchX = null;
  $('slideList').addEventListener(
    'touchstart',
    function (e) {
      touchX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );
  $('slideList').addEventListener(
    'touchend',
    function (e) {
      if (touchX == null) return;
      var dx = e.changedTouches[0].screenX - touchX;
      if (dx > 60) $('btnPrev').click();
      if (dx < -60) $('btnNext').click();
      touchX = null;
    },
    { passive: true }
  );

  $('btnTakeControl').addEventListener('click', function () {
    if (transport) transport.takeControl();
  });
  $('btnShowPairing').addEventListener('click', function () {
    ensureControl(function () {
      sendCmd('showPairing', true);
    });
  });
  $('btnBlack').addEventListener('click', function () {
    ensureControl(function () {
      sendCmd('clearProjection', true);
    });
  });
  $('btnLogo').addEventListener('click', function () {
    projectHtml(buildLogoSlide());
  });
  if ($('btnClearBg')) {
    $('btnClearBg').addEventListener('click', function () {
      clearVideoBg();
    });
  }
  if ($('btnViewFullscreen')) {
    $('btnViewFullscreen').addEventListener('click', function () {
      ensureControl(function () {
        sendCmd('setBrowserFullscreen', { on: true });
      });
    });
  }
  if ($('btnViewExitFullscreen')) {
    $('btnViewExitFullscreen').addEventListener('click', function () {
      ensureControl(function () {
        sendCmd('setBrowserFullscreen', { on: false });
      });
    });
  }
  $('btnFontDown').addEventListener('click', function () {
    ensureControl(function () {
      state.fontSize = Math.max(1, Number(state.fontSize) - 0.5);
      sendCmd('changeFontSize', state.fontSize);
    });
  });
  $('btnFontUp').addEventListener('click', function () {
    ensureControl(function () {
      state.fontSize = Math.min(6, Number(state.fontSize) + 0.5);
      sendCmd('changeFontSize', state.fontSize);
    });
  });
  $('displayProfile').addEventListener('change', function () {
    ensureControl(function () {
      sendCmd('setDisplayProfile', $('displayProfile').value);
    });
  });
  $('btnDisconnect').addEventListener('click', function () {
    stopStream();
    if (transport) transport.disconnect();
    showScreen('screen-connect');
  });
  $('btnAddBlank').addEventListener('click', function () {
    var item = { type: 'logo', title: 'Tela padrão', html: buildLogoSlide() };
    state.playlist.push(item);
    syncPlaylist();
    renderPlaylist();
  });
  $('libSearch').addEventListener('input', function () {
    renderLibrary($('libSearch').value);
  });
  $('btnUploadVideo').addEventListener('click', function () {
    var file = $('videoFile').files[0];
    if (!file || !baseUrl) return;
    var fd = new FormData();
    fd.append('file', file);
    fetch(baseUrl + '/api/media/upload?to=videos', { method: 'POST', body: fd })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        loadVideos();
        var item = { type: 'video', title: res.name, src: res.src };
        state.playlist.push(item);
        syncPlaylist();
        renderPlaylist();
        projectVideo(res.src, res.name);
      })
      .catch(function () {
        alert('Falha no upload');
      });
  });
  $('btnPlayVid').addEventListener('click', function () {
    ensureControl(function () {
      sendCmd('playVideo', {});
    });
  });
  $('btnPauseVid').addEventListener('click', function () {
    ensureControl(function () {
      sendCmd('pauseVideo', {});
    });
  });
  if ($('btnVideoContain')) {
    $('btnVideoContain').addEventListener('click', function () {
      applyVideoFit('contain', false);
    });
  }
  if ($('btnVideoCover')) {
    $('btnVideoCover').addEventListener('click', function () {
      applyVideoFit('cover', false);
    });
  }
  if ($('btnVideoFull')) {
    $('btnVideoFull').addEventListener('click', function () {
      applyVideoFit('cover', true);
    });
  }
  $('btnStartStream').addEventListener('click', function () {
    startCameraStream().catch(function (e) {
      alert(e.message || 'Câmera indisponível');
    });
  });
  $('btnStartFileStream').addEventListener('click', function () {
    $('streamFile').click();
  });
  $('streamFile').addEventListener('change', function () {
    var f = $('streamFile').files[0];
    if (f) {
      startFileStream(f).catch(function (e) {
        alert(e.message || 'Falha no stream');
      });
    }
  });
  $('btnStopStream').addEventListener('click', stopStream);

  (function boot() {
    renderHistory();
    var pin = qs('pin');
    if (pin) $('pinInput').value = pin;
    if (location.protocol.indexOf('http') === 0 && location.hostname && location.hostname !== 'localhost') {
      $('hostInput').value = location.host;
      connectTo(location.origin, $('pinInput').value, $('roleSelect').value);
    } else {
      var hist = ProjectionDiscovery.loadHistory();
      if (hist[0]) $('hostInput').value = hist[0].replace(/^https?:\/\//, '');
    }
  })();
})();
