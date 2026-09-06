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
  };
  var slideCount = 0;
  var pc = null;
  var localStream = null;
  var qrStream = null;

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
    var can = state.role === 'observer' ? false : state.youControl;
    ['btnPrev', 'btnNext', 'btnBlack', 'btnLogo', 'btnFontUp', 'btnFontDown', 'btnPlayVid', 'btnPauseVid'].forEach(
      function (id) {
        var el = $(id);
        if (el) el.disabled = !can && state.role !== 'observer';
        if (state.role === 'observer' && el) el.disabled = true;
      }
    );
    var label = transport && transport.connected
      ? state.role === 'observer'
        ? 'Observando'
        : state.youControl
          ? 'Você controla'
          : 'Outro aparelho controla'
      : 'Desconectado';
    setStatus(
      $('appStatus'),
      label + (baseUrl ? ' · ' + baseUrl.replace(/^https?:\/\//, '') : ''),
      transport && transport.connected ? 'ok' : 'bad'
    );
  }

  function gotoSlide(i) {
    if (!transport || !state.youControl) {
      if (transport) transport.takeControl();
      return;
    }
    state.slideIndex = i;
    transport.send('changeSlide', i);
    renderSlides();
  }

  function buildLogoSlide() {
    return '<section><h1>Maranata</h1><h3>O Senhor Jesus Vem</h3></section>';
  }

  function projectHtml(html) {
    state.slidesHtml = html;
    state.slideIndex = 0;
    if (transport && state.youControl) {
      transport.send('reloadReveal', html);
      transport.send('changeSlide', 0);
    }
    renderSlides();
  }

  var videoBgSrc = null;

  function songToHtml(song) {
    var title = song.name || song.text || 'Louvor';
    var content = song.content || song.data && song.data.content || '';
    var parts = String(content).split(/\n\s*\n/);
    var bgAttr = videoBgSrc
      ? ' data-background-video="' + escapeHtml(videoBgSrc) + '" data-background-video-loop data-background-size="contain"'
      : '';
    var html = '';
    parts.forEach(function (part, idx) {
      var body = part.trim().replace(/\n/g, '<br>');
      if (!body) return;
      if (idx === 0) {
        html +=
          '<section' +
          bgAttr +
          ' data-state="showtitle"><h3>' +
          escapeHtml(title) +
          '</h3><p>' +
          body +
          '</p></section>';
      } else {
        html += '<section' + bgAttr + '><p>' + body + '</p></section>';
      }
    });
    if (!html) html = '<section' + bgAttr + '><h3>' + escapeHtml(title) + '</h3></section>';
    return html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function videoSlide(src, title) {
    return (
      '<section class="video-slide" data-video-src="' +
      escapeHtml(src) +
      '"><h3>' +
      escapeHtml(title || 'Vídeo') +
      '</h3><video src="' +
      escapeHtml(src) +
      '" playsinline controls style="max-width:100%;max-height:80vh;object-fit:contain"></video></section>'
    );
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
          projectHtml(videoSlide(item.src, item.title));
          if (state.youControl) transport.send('playVideo', { src: item.src, currentTime: 0 });
        } else if (item.html) {
          projectHtml(item.html);
        } else if (item.song) {
          projectHtml(songToHtml(item.song));
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
    if (!transport || !state.youControl) return;
    transport.send('playlistUpdate', state.playlist);
    fetch(baseUrl + '/api/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlist: state.playlist }),
    }).catch(function () {});
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
          var item = { type: 'song', title: s.name, song: s, html: songToHtml(s) };
          state.playlist.push(item);
          syncPlaylist();
          renderPlaylist();
          projectHtml(item.html);
          showTab('live');
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
        if (transport && state.youControl) transport.send('libraryUpdate', data);
      })
      .catch(function () {
        $('libraryBox').innerHTML = '<p class="status bad">Falha ao carregar data.json</p>';
      });
  }

  function loadVideos() {
    fetch(baseUrl + '/api/media/list')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var box = $('videoList');
        box.innerHTML = '';
        (data.videos || []).forEach(function (v) {
          var btn = document.createElement('button');
          btn.className = 'secondary';
          btn.textContent = v.name;
          btn.addEventListener('click', function () {
            var item = { type: 'video', title: v.name, src: v.src };
            state.playlist.push(item);
            syncPlaylist();
            renderPlaylist();
            projectHtml(videoSlide(v.src, v.name));
            showTab('live');
          });
          var bg = document.createElement('button');
          bg.className = 'secondary';
          bg.textContent = 'Usar como fundo de letra';
          bg.addEventListener('click', function (e) {
            e.stopPropagation();
            videoBgSrc = v.src;
            alert('Próximo louvor usará este vídeo de fundo (Reveal background-video).');
          });
          box.appendChild(btn);
          box.appendChild(bg);
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
      updateControlUi();
    });
    transport.on('controlChanged', function (data) {
      state.youControl = transport.clientId === data.controllerId;
      updateControlUi();
    });
    transport.on('stateSnapshot', function (snap) {
      state.slidesHtml = snap.slidesHtml || '';
      state.slideIndex = snap.slideIndex || 0;
      state.fontSize = snap.fontSize != null ? snap.fontSize : 2;
      state.playlist = snap.playlist || [];
      if (snap.library) state.library = snap.library;
      if (snap.displayProfile) $('displayProfile').value = snap.displayProfile;
      renderSlides();
      renderPlaylist();
      updateControlUi();
    });
    transport.on('reloadReveal', function (html) {
      state.slidesHtml = html || '';
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
    transport.on('error', function (err) {
      setStatus($('connectStatus'), (err && err.message) || 'Erro', 'bad');
      setStatus($('appStatus'), (err && err.message) || 'Erro', 'bad');
    });
    transport.on('close', function () {
      updateControlUi();
    });
    transport.on('webrtc-signal', function (data, msg) {
      handleSignal(data, msg);
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

  // WebRTC
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
    if (!data || state.role === 'view') return;
    // Controllers only send; views consume — ignore remote offers on mobile unless answering
    if (data.type === 'answer' && pc) {
      pc.setRemoteDescription(data.sdp).catch(function () {});
    } else if (data.type === 'candidate' && pc && data.candidate) {
      pc.addIceCandidate(data.candidate).catch(function () {});
    }
  }

  async function startCameraStream() {
    if (!state.youControl) {
      transport.takeControl();
      return;
    }
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
      transport.send('webrtc-signal', { type: 'offer', sdp: conn.localDescription });
      transport.send('streamStarted', {});
    } catch (e) {
      alert('WebRTC falhou: ' + (e.message || e) + '\nUse o upload de vídeo como alternativa.');
    }
  }

  async function startFileStream(file) {
    if (!state.youControl) return;
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
      transport.send('webrtc-signal', { type: 'offer', sdp: conn.localDescription });
      transport.send('streamStarted', {});
    } catch (e) {
      // Fallback: upload + playVideo
      var fd = new FormData();
      fd.append('file', file);
      fetch(baseUrl + '/api/media/upload?to=tmp', { method: 'POST', body: fd })
        .then(function (r) {
          return r.json();
        })
        .then(function (res) {
          projectHtml(videoSlide(res.src, file.name));
          transport.send('playVideo', { src: res.src, currentTime: 0 });
          alert('Stream WebRTC indisponível — vídeo enviado e projetado via upload.');
        })
        .catch(function () {
          alert('Falha no stream e no upload: ' + (e.message || e));
        });
    }
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
    if (transport) transport.send('streamStopped', {});
  }

  // QR scan using BarcodeDetector when available; else prompt
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
          var u = new URL(raw);
          $('hostInput').value = u.host;
          var pin = u.searchParams.get('pin');
          if (pin) $('pinInput').value = pin;
          $('btnConnect').click();
        }
      } catch (_) {}
    }, 600);
  }

  // Events
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
    if (transport) transport.send('showPairing', true);
  });
  $('btnBlack').addEventListener('click', function () {
    if (transport) transport.send('clearProjection', true);
  });
  $('btnLogo').addEventListener('click', function () {
    projectHtml(buildLogoSlide());
    if (transport) transport.send('showLogo', true);
  });
  $('btnFontDown').addEventListener('click', function () {
    state.fontSize = Math.max(1, Number(state.fontSize) - 0.5);
    if (transport) transport.send('changeFontSize', state.fontSize);
  });
  $('btnFontUp').addEventListener('click', function () {
    state.fontSize = Math.min(6, Number(state.fontSize) + 0.5);
    if (transport) transport.send('changeFontSize', state.fontSize);
  });
  $('displayProfile').addEventListener('change', function () {
    if (transport && state.youControl) {
      transport.send('setDisplayProfile', $('displayProfile').value);
    }
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
        projectHtml(videoSlide(res.src, res.name));
      })
      .catch(function () {
        alert('Falha no upload');
      });
  });
  $('btnPlayVid').addEventListener('click', function () {
    if (transport) transport.send('playVideo', {});
  });
  $('btnPauseVid').addEventListener('click', function () {
    if (transport) transport.send('pauseVideo', {});
  });
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
    if (f) startFileStream(f).catch(function (e) {
      alert(e.message || 'Falha no stream');
    });
  });
  $('btnStopStream').addEventListener('click', stopStream);

  // Boot from querystring (QR)
  (function boot() {
    renderHistory();
    var pin = qs('pin');
    if (pin) $('pinInput').value = pin;
    if (location.protocol.indexOf('http') === 0 && location.hostname && location.hostname !== 'localhost') {
      $('hostInput').value = location.host;
      // Same origin — auto connect
      connectTo(location.origin, $('pinInput').value, $('roleSelect').value);
    } else {
      var hist = ProjectionDiscovery.loadHistory();
      if (hist[0]) $('hostInput').value = hist[0].replace(/^https?:\/\//, '');
    }
  })();
})();
