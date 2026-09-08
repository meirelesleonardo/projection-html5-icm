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
  var pendingIce = [];
  var remoteDescSet = false;
  var fileStreamVideo = null;
  var qrStream = null;
  var videoBgSrc = null;
  var controlWaiters = [];
  var BG_DEFAULT = 'imagens/fundo.jpg';
  var LOGO_SLIDE_HTML = null;
  var SESSION_KEY = 'proj-icm-mobile';
  var persistTimer = null;
  var bibleUiReady = false;

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
    var activeBtn = null;
    document.querySelectorAll('.nav-tabs button').forEach(function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.classList.toggle('active', on);
      if (on) activeBtn = b;
    });
    ['live', 'playlist', 'library', 'bible', 'decks', 'media', 'more'].forEach(function (t) {
      var el = $('tab-' + t);
      if (el) el.classList.toggle('hidden', t !== name);
    });
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      try {
        activeBtn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      } catch (e) {
        activeBtn.scrollIntoView(false);
      }
    }
    if (name === 'bible') initBibleTab();
    if (name === 'decks') loadDecks();
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistSession, 250);
  }

  function persistSession() {
    try {
      var payload = {
        baseUrl: baseUrl,
        pin: $('pinInput') ? $('pinInput').value : '',
        role: state.role,
        playlist: state.playlist,
        slidesHtml: state.slidesHtml,
        slideIndex: state.slideIndex,
        fontSize: state.fontSize,
        videoFit: state.videoFit,
        videoFullscreen: state.videoFullscreen,
        videoBgSrc: videoBgSrc,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearSessionLocal() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    state.playlist = [];
    state.slidesHtml = '';
    state.slideIndex = 0;
    videoBgSrc = null;
    renderPlaylist();
    renderSlides();
    updateBgStatus();
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

  function extractCssContentStrings(styleText) {
    var out = [];
    var re = /content\s*:\s*["']([^"']*)["']/gi;
    var m;
    while ((m = re.exec(styleText || ''))) {
      var v = String(m[1] || '').trim();
      if (v) out.push(v);
    }
    return out;
  }

  function slidePreviewText(sec) {
    if (!sec) return '';
    var clone = sec.cloneNode(true);
    var styles = clone.querySelectorAll('style');
    var cssBlob = '';
    Array.prototype.forEach.call(styles, function (st) {
      cssBlob += st.textContent || '';
      if (st.parentNode) st.parentNode.removeChild(st);
    });

    var text = (clone.innerText || clone.textContent || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (text) return text.slice(0, 120);

    var fromCss = extractCssContentStrings(cssBlob);
    if (fromCss.length) return fromCss.join(' — ').slice(0, 120);

    var stateAttr = String(sec.getAttribute('data-state') || '');
    if (/scriptures/i.test(stateAttr)) return 'Escritura';
    if (/showtitle/i.test(stateAttr)) return 'Título';
    if (/showlogo/i.test(stateAttr)) return 'Logo';
    if (/show_backlay|backlay/i.test(stateAttr)) return 'Tela padrão';
    if (clone.querySelector('img')) return 'Imagem';
    if (clone.querySelector('video') || sec.getAttribute('data-video-src')) return 'Vídeo';
    return '';
  }

  function parseSlides(html) {
    var div = document.createElement('div');
    div.innerHTML = html || '';
    var sections = div.querySelectorAll('section');
    return Array.prototype.map.call(sections, function (sec, i) {
      return {
        index: i,
        text: slidePreviewText(sec),
      };
    });
  }

  function isVideoProjection() {
    var html = state.slidesHtml || '';
    return html.indexOf('data-video-src=') !== -1 || /<video[\s>]/i.test(html);
  }

  function updateLiveVideoControls() {
    var box = $('liveVideoControls');
    if (!box) return;
    box.classList.toggle('hidden', !isVideoProjection());
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
    updateLiveVideoControls();
    updateControlUi();
    schedulePersist();
  }

  function updateControlUi() {
    [
      'btnPrev',
      'btnNext',
      'btnBlack',
      'btnLogo',
      'btnLiveLogo',
      'btnFontUp',
      'btnFontDown',
      'btnPlayVid',
      'btnPauseVid',
      'btnVideoContain',
      'btnVideoCover',
      'btnVideoFull',
      'btnLivePlay',
      'btnLivePause',
      'btnLiveSeekBack',
      'btnLiveSeekFwd',
      'btnLiveContain',
      'btnLiveCover',
      'btnLiveFull',
      'btnLiveExitFull',
      'btnLiveUnmute',
      'btnLiveMute',
      'btnVideoUnmute',
      'btnVideoMute',
      'btnBibleAdd',
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
      schedulePersist();
    });
  }

  function showLogoInterrupt() {
    ensureControl(function () {
      stopStream();
      sendCmd('pauseVideo', {});
      var html = buildLogoSlide();
      state.slidesHtml = html;
      state.slideIndex = 0;
      sendCmd('showLogo', html);
      sendCmd('hidePairing', true);
      renderSlides();
      showTab('live');
      schedulePersist();
    });
  }

  function seekVideoBy(delta) {
    ensureControl(function () {
      sendCmd('seekVideo', { delta: delta });
    });
  }

  function playVideoKeep() {
    ensureControl(function () {
      sendCmd('playVideo', {});
    });
  }

  function pauseVideoCmd() {
    ensureControl(function () {
      sendCmd('pauseVideo', {});
    });
  }

  function setVideoMuted(muted) {
    ensureControl(function () {
      sendCmd('setVideoMuted', { muted: !!muted });
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
      '" playsinline webkit-playsinline ' +
      (full ? '' : 'controls ') +
      'class="proj-video" style="object-fit:' +
      escapeAttr(fit) +
      '"></video></section>'
    );
  }

  function projectVideo(src, title) {
    ensureControl(function () {
      state._videoTitle = title || 'Vídeo';
      var html = videoSlide(src, state._videoTitle);
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
      // Só estilos no projetor — não remonta o <video> (evita reinício)
      sendCmd('setVideoFit', {
        fit: state.videoFit,
        fullscreen: state.videoFullscreen,
      });
      // Atualiza HTML local (sessão/preview) sem reloadReveal no projetor
      var m = state.slidesHtml && state.slidesHtml.match(/data-video-src="([^"]+)"/);
      if (m) {
        var src = m[1].replace(/&amp;/g, '&');
        var titleMatch = state.slidesHtml.match(/class="video-title"[^>]*>([^<]*)</);
        if (titleMatch) state._videoTitle = titleMatch[1];
        var title = state._videoTitle || 'Vídeo';
        state.slidesHtml = videoSlide(src, title, {
          fit: state.videoFit,
          fullscreen: state.videoFullscreen,
        });
        renderSlides();
      }
      schedulePersist();
    });
  }

  function renderPlaylist() {
    var box = $('playlistBox');
    box.innerHTML = '';
    if (!state.playlist.length) {
      box.innerHTML = '<p class="status">Lista vazia — adicione louvores, bíblia, slides ou vídeos.</p>';
      schedulePersist();
      return;
    }
    state.playlist.forEach(function (item, idx) {
      var div = document.createElement('div');
      div.className = 'list-item';
      var body = document.createElement('div');
      body.innerHTML =
        '<strong>' +
        escapeHtml(item.title || item.name || item.type || 'Item') +
        '</strong><br><small>' +
        escapeHtml(item.type || 'song') +
        '</small>';
      body.addEventListener('click', function () {
        if (item.type === 'video') {
          projectVideo(item.src, item.title);
        } else if (item.html) {
          projectHtml(item.html);
        } else if (item.song) {
          projectHtml(songToHtml(item.song));
        } else if (
          item.type === 'song' &&
          item.folderId != null &&
          item.id != null &&
          state.library &&
          state.library[item.folderId] &&
          state.library[item.folderId].songs &&
          state.library[item.folderId].songs[item.id]
        ) {
          var libSong = state.library[item.folderId].songs[item.id];
          projectHtml(
            songToHtml({
              name: libSong.title || item.title,
              title: libSong.title || item.title,
              content: libSong.content || '',
            })
          );
        } else if (item.type === 'deck' && item.slides) {
          projectHtml(deckToHtml(item.slides, item.title));
        } else if (item.type === 'bible') {
          if (item.html) {
            projectHtml(item.html);
          } else if (item.bible || (item.b != null && item.c != null)) {
            var bb = item.bible || item;
            if (typeof MobileBible !== 'undefined' && MobileBible.scriptureToHtml) {
              var closing =
                '<section data-background="' +
                BG_DEFAULT +
                '" data-state="show_backlay1">' +
                '<style>.show_backlay1 header.backlay1-pt-br .backlay_1-pt-br{display:block}</style>' +
                '<h1>Maranata</h1><h3>O Senhor Jesus Vem</h3></section>\n';
              projectHtml(
                MobileBible.scriptureToHtml({
                  version: bb.version || 'acf',
                  b: bb.b,
                  c: bb.c,
                  from: bb.from,
                  to: bb.to,
                  bg: '#000000',
                  closingHtml: closing,
                })
              );
            }
          } else {
            projectHtml(buildLogoSlide());
          }
        } else if (item.type === 'logo') {
          projectHtml(item.html || buildLogoSlide());
        }
      });
      div.appendChild(body);

      var actions = document.createElement('div');
      actions.className = 'list-item-actions';

      var up = document.createElement('button');
      up.type = 'button';
      up.className = 'secondary';
      up.textContent = '↑';
      up.disabled = idx === 0;
      up.addEventListener('click', function (e) {
        e.stopPropagation();
        if (idx === 0) return;
        var tmp = state.playlist[idx - 1];
        state.playlist[idx - 1] = state.playlist[idx];
        state.playlist[idx] = tmp;
        syncPlaylist();
        renderPlaylist();
      });

      var down = document.createElement('button');
      down.type = 'button';
      down.className = 'secondary';
      down.textContent = '↓';
      down.disabled = idx === state.playlist.length - 1;
      down.addEventListener('click', function (e) {
        e.stopPropagation();
        if (idx >= state.playlist.length - 1) return;
        var tmp2 = state.playlist[idx + 1];
        state.playlist[idx + 1] = state.playlist[idx];
        state.playlist[idx] = tmp2;
        syncPlaylist();
        renderPlaylist();
      });

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'danger';
      rm.textContent = 'Remover';
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        state.playlist.splice(idx, 1);
        syncPlaylist();
        renderPlaylist();
      });

      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(rm);
      div.appendChild(actions);
      box.appendChild(div);
    });
    schedulePersist();
  }

  function syncPlaylist() {
    ensureControl(function () {
      sendCmd('playlistUpdate', state.playlist);
      fetch(baseUrl + '/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist: state.playlist }),
      }).catch(function () {});
      schedulePersist();
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
          setStatus($('appStatus'), 'Adicionado à lista: ' + (s.name || 'louvor'), 'ok');
          schedulePersist();
        });
        box.appendChild(div);
      });
  }

  function loadLibrary() {
    fetch(baseUrl + '/api/library', { cache: 'no-store' })
      .then(function (r) {
        var ver = r.headers.get('X-Library-Version');
        return r.json().then(function (data) {
          return { data: data, version: ver != null ? Number(ver) : null, ok: r.ok };
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status');
        state.library = res.data;
        state.libraryVersion = res.version;
        renderLibrary($('libSearch').value);
      })
      .catch(function () {
        $('libraryBox').innerHTML = '<p class="status bad">Falha ao carregar biblioteca do servidor</p>';
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
    schedulePersist();
  }

  function fillSelect(el, count, selected) {
    if (!el) return;
    el.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = String(i + 1);
      if (i === selected) opt.selected = true;
      el.appendChild(opt);
    }
  }

  function bibleVersion() {
    return ($('bibleVersion') && $('bibleVersion').value) || 'acf';
  }

  function refreshBiblePreview() {
    if (!window.MobileBible) return;
    var v = bibleVersion();
    var b = Number($('bibleBook').value) || 0;
    var c = Number($('bibleChapter').value) || 0;
    var from = Number($('bibleFrom').value) || 0;
    var to = Number($('bibleTo').value) || 0;
    if (to < from) {
      to = from;
      $('bibleTo').value = String(from);
    }
    $('biblePreview').textContent = MobileBible.previewText(v, b, c, from, to, 5);
  }

  function rebuildBibleVerses() {
    if (!window.MobileBible) return;
    var v = bibleVersion();
    var b = Number($('bibleBook').value) || 0;
    var c = Number($('bibleChapter').value) || 0;
    var n = MobileBible.verseCount(v, b, c);
    var from = Math.min(Number($('bibleFrom').value) || 0, Math.max(0, n - 1));
    var to = Math.min(Number($('bibleTo').value) || from, Math.max(0, n - 1));
    fillSelect($('bibleFrom'), n, from);
    fillSelect($('bibleTo'), n, to);
    refreshBiblePreview();
  }

  function rebuildBibleChapters() {
    if (!window.MobileBible) return;
    var v = bibleVersion();
    var b = Number($('bibleBook').value) || 0;
    var n = MobileBible.chapterCount(v, b);
    var c = Math.min(Number($('bibleChapter').value) || 0, Math.max(0, n - 1));
    fillSelect($('bibleChapter'), n, c);
    rebuildBibleVerses();
  }

  function rebuildBibleBooks() {
    if (!window.MobileBible) return;
    var v = bibleVersion();
    var sel = $('bibleBook');
    var prev = Number(sel.value) || 0;
    sel.innerHTML = '';
    var n = MobileBible.bookCount(v);
    for (var i = 0; i < n; i++) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = MobileBible.bookName(v, i);
      sel.appendChild(opt);
    }
    sel.value = String(Math.min(prev, Math.max(0, n - 1)));
    rebuildBibleChapters();
  }

  function initBibleTab() {
    if (!window.MobileBible || !baseUrl) return;
    var status = $('bibleLoadStatus');
    status.textContent = 'Carregando bíblia…';
    MobileBible.ensureLoaded(bibleVersion(), baseUrl, function (err) {
      if (err) {
        status.textContent = err.message || 'Falha ao carregar';
        status.className = 'status bad';
        return;
      }
      status.textContent = '';
      status.className = 'status';
      if (!bibleUiReady) {
        bibleUiReady = true;
        $('bibleVersion').addEventListener('change', function () {
          status.textContent = 'Carregando…';
          MobileBible.ensureLoaded(bibleVersion(), baseUrl, function (e2) {
            if (e2) {
              status.textContent = e2.message;
              return;
            }
            status.textContent = '';
            rebuildBibleBooks();
          });
        });
        $('bibleBook').addEventListener('change', rebuildBibleChapters);
        $('bibleChapter').addEventListener('change', rebuildBibleVerses);
        $('bibleFrom').addEventListener('change', refreshBiblePreview);
        $('bibleTo').addEventListener('change', refreshBiblePreview);
        $('btnBibleAdd').addEventListener('click', function () {
          addBibleToPlaylist();
        });
      }
      rebuildBibleBooks();
    });
  }

  function addBibleToPlaylist() {
    if (!window.MobileBible) return;
    var v = bibleVersion();
    MobileBible.ensureLoaded(v, baseUrl, function (err) {
      if (err) {
        alert(err.message || 'Bíblia indisponível');
        return;
      }
      var b = Number($('bibleBook').value) || 0;
      var c = Number($('bibleChapter').value) || 0;
      var from = Number($('bibleFrom').value) || 0;
      var to = Number($('bibleTo').value) || from;
      if (to < from) to = from;
      var closing =
        '<section data-background="' +
        BG_DEFAULT +
        '" data-state="show_backlay1">' +
        '<style>.show_backlay1 header.backlay1-pt-br .backlay_1-pt-br{display:block}</style>' +
        '<h1>Maranata</h1><h3>O Senhor Jesus Vem</h3></section>\n';
      var html = MobileBible.scriptureToHtml({
        version: v,
        b: b,
        c: c,
        from: from,
        to: to,
        bg: '#000000',
        closingHtml: closing,
      });
      var title = MobileBible.passageLabel(v, b, c, from, to);
      state.playlist.push({
        type: 'bible',
        title: title,
        bible: { version: v, b: b, c: c, from: from, to: to },
        html: html,
      });
      syncPlaylist();
      renderPlaylist();
      setStatus($('appStatus'), 'Bíblia na lista: ' + title, 'ok');
      schedulePersist();
    });
  }

  function deckToHtml(slides, title) {
    var html = '';
    (slides || []).forEach(function (src, i) {
      html +=
        '<section data-background="#000000" class="deck-slide" data-deck-slide="' +
        i +
        '">' +
        '<img class="deck-img" src="' +
        escapeAttr(src) +
        '" alt="' +
        escapeAttr((title || 'Slide') + ' ' + (i + 1)) +
        '" style="max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto">' +
        '</section>\n';
    });
    html +=
      '<section data-background="' +
      BG_DEFAULT +
      '" data-state="show_backlay1">' +
      '<style>.show_backlay1 header.backlay1-pt-br .backlay_1-pt-br{display:block}</style>' +
      '<h1>Maranata</h1><h3>O Senhor Jesus Vem</h3></section>\n';
    return html;
  }

  function loadDecks() {
    if (!baseUrl) return;
    var box = $('deckList');
    if (!box) return;
    box.innerHTML = '<p class="status">Carregando…</p>';
    fetch(baseUrl + '/api/decks/list')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        renderDeckList(data.decks || []);
      })
      .catch(function () {
        box.innerHTML = '<p class="status bad">Falha ao listar apresentações</p>';
      });
  }

  function renderDeckList(decks) {
    var box = $('deckList');
    if (!box) return;
    box.innerHTML = '';
    if (!decks.length) {
      box.innerHTML = '<p class="status">Nenhuma apresentação convertida ainda.</p>';
      return;
    }
    decks.forEach(function (d) {
      var wrap = document.createElement('div');
      wrap.className = 'card';
      wrap.style.padding = '0.65rem';
      wrap.style.marginBottom = '0.5rem';
      wrap.innerHTML =
        '<strong>' +
        escapeHtml(d.title || d.id) +
        '</strong><br><small>' +
        escapeHtml(String(d.slideCount || (d.slides && d.slides.length) || 0)) +
        ' slides</small>';

      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'secondary';
      add.textContent = 'Adicionar à lista';
      add.addEventListener('click', function () {
        var html = deckToHtml(d.slides, d.title);
        state.playlist.push({
          type: 'deck',
          title: d.title || 'Apresentação',
          deckId: d.id,
          slides: d.slides,
          html: html,
        });
        syncPlaylist();
        renderPlaylist();
        setStatus($('appStatus'), 'Slides na lista: ' + (d.title || d.id), 'ok');
        schedulePersist();
      });

      var proj = document.createElement('button');
      proj.type = 'button';
      proj.textContent = 'Projetar';
      proj.addEventListener('click', function () {
        var html = deckToHtml(d.slides, d.title);
        state.playlist.push({
          type: 'deck',
          title: d.title || 'Apresentação',
          deckId: d.id,
          slides: d.slides,
          html: html,
        });
        syncPlaylist();
        renderPlaylist();
        projectHtml(html);
      });

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'danger';
      del.textContent = 'Apagar';
      del.addEventListener('click', function () {
        if (!confirm('Apagar apresentação "' + (d.title || d.id) + '" do PC?')) return;
        fetch(baseUrl + '/api/decks/' + encodeURIComponent(d.id), { method: 'DELETE' })
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
            loadDecks();
          })
          .catch(function () {
            alert('Falha ao apagar');
          });
      });

      wrap.appendChild(add);
      wrap.appendChild(proj);
      wrap.appendChild(del);
      box.appendChild(wrap);
    });
  }

  function uploadDeck() {
    var file = $('deckFile') && $('deckFile').files[0];
    var st = $('deckStatus');
    if (!file || !baseUrl) {
      if (st) {
        st.textContent = 'Escolha um arquivo .pptx ou .pdf';
        st.className = 'status bad';
      }
      return;
    }
    if (st) {
      st.textContent = 'Enviando e convertendo… (pode levar um minuto)';
      st.className = 'status';
    }
    var fd = new FormData();
    fd.append('file', file);
    fetch(baseUrl + '/api/decks/upload', { method: 'POST', body: fd })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, j: j };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          if (st) {
            st.textContent = (res.j && res.j.error) || 'Falha na conversão';
            st.className = 'status bad';
          }
          return;
        }
        if (st) {
          st.textContent =
            'Pronto: ' + (res.j.title || '') + ' (' + (res.j.slideCount || 0) + ' slides)';
          st.className = 'status ok';
        }
        if ($('deckFile')) $('deckFile').value = '';
        loadDecks();
      })
      .catch(function () {
        if (st) {
          st.textContent = 'Falha de rede no upload';
          st.className = 'status bad';
        }
      });
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
      var localPl = state.playlist && state.playlist.length ? state.playlist.slice() : [];
      if (snap.slidesHtml) {
        state.slidesHtml = snap.slidesHtml;
        state.slideIndex = snap.slideIndex || 0;
      }
      state.fontSize = snap.fontSize != null ? snap.fontSize : state.fontSize;
      if (snap.playlist && snap.playlist.length) {
        state.playlist = snap.playlist;
      } else if (localPl.length) {
        state.playlist = localPl;
        setTimeout(function () {
          syncPlaylist();
        }, 0);
      } else {
        state.playlist = [];
      }
      if (snap.library) state.library = snap.library;
      if (snap.displayProfile) $('displayProfile').value = snap.displayProfile;
      if (snap.video) {
        if (snap.video.fit) state.videoFit = snap.video.fit;
        if (snap.video.fullscreen != null) state.videoFullscreen = !!snap.video.fullscreen;
      }
      renderSlides();
      renderPlaylist();
      updateControlUi();
      schedulePersist();
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

  function setStreamStatus(msg, kind) {
    var el = $('streamStatus');
    if (!el) return;
    setStatus(el, msg || '', kind || '');
  }

  function requireSecureMedia() {
    if (window.isSecureContext === false) {
      var hint = baseUrl
        ? baseUrl.replace(/^http:/i, 'https:')
        : 'https://IP-DO-PC:3080/mobile.html';
      throw new Error(
        'Câmera/WebRTC exige HTTPS.\nAbra o painel em:\n' +
          hint +
          '\n(No PC: npm run start:https — aceite o certificado no celular.)\nOu use Enviar vídeo.'
      );
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Câmera indisponível neste navegador/contexto.\nUse HTTPS na LAN ou Enviar vídeo para o PC.'
      );
    }
  }

  function resetPeerConnection() {
    pendingIce = [];
    remoteDescSet = false;
    if (pc) {
      try {
        pc.close();
      } catch (_) {}
      pc = null;
    }
  }

  function ensurePc() {
    if (pc) return pc;
    pendingIce = [];
    remoteDescSet = false;
    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pc.onicecandidate = function (ev) {
      if (ev.candidate && transport) {
        transport.send('webrtc-signal', { type: 'candidate', candidate: ev.candidate });
      }
    };
    pc.onconnectionstatechange = function () {
      var st = pc && pc.connectionState;
      if (st === 'connected') setStreamStatus('Stream conectado', 'ok');
      else if (st === 'failed' || st === 'disconnected') setStreamStatus('Stream: ' + st, 'bad');
      else if (st === 'connecting') setStreamStatus('Conectando stream…', '');
    };
    return pc;
  }

  function flushPendingIce() {
    if (!pc || !remoteDescSet) return;
    var list = pendingIce.slice();
    pendingIce = [];
    list.forEach(function (c) {
      pc.addIceCandidate(c).catch(function () {});
    });
  }

  function handleSignal(data) {
    if (!data || !pc) return;
    if (data.type === 'answer') {
      pc
        .setRemoteDescription(data.sdp)
        .then(function () {
          remoteDescSet = true;
          flushPendingIce();
        })
        .catch(function (e) {
          console.warn('setRemoteDescription answer', e);
        });
    } else if (data.type === 'candidate' && data.candidate) {
      if (!remoteDescSet) {
        pendingIce.push(data.candidate);
      } else {
        pc.addIceCandidate(data.candidate).catch(function () {});
      }
    }
  }

  async function getCameraStream() {
    requireSecureMedia();
    var attempts = [
      { video: { facingMode: { ideal: 'environment' } }, audio: true },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: true },
      { video: true, audio: false },
    ];
    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        return await navigator.mediaDevices.getUserMedia(attempts[i]);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Não foi possível abrir a câmera');
  }

  async function publishLocalStream(stream) {
    stopStreamTracksOnly();
    resetPeerConnection();
    localStream = stream;
    var conn = ensurePc();
    stream.getTracks().forEach(function (t) {
      conn.addTrack(t, stream);
    });
    var offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    if (transport) {
      transport.send('webrtc-signal', { type: 'offer', sdp: conn.localDescription });
    }
    sendCmd('streamStarted', {});
    setStreamStatus('Oferta enviada — aguarde o projetor…', '');
  }

  function startCameraStream() {
    ensureControl(function () {
      setStreamStatus('Abrindo câmera…', '');
      getCameraStream()
        .then(function (stream) {
          return publishLocalStream(stream);
        })
        .catch(function (e) {
          setStreamStatus(e.message || 'Falha na câmera', 'bad');
          alert((e && e.message) || String(e));
        });
    });
  }

  function startFileStream(file) {
    ensureControl(function () {
      setStreamStatus('Preparando arquivo…', '');
      (async function () {
        try {
          requireSecureMedia();
          var url = URL.createObjectURL(file);
          if (fileStreamVideo) {
            try {
              fileStreamVideo.pause();
              fileStreamVideo.src = '';
            } catch (_) {}
          }
          var video = document.createElement('video');
          fileStreamVideo = video;
          video.src = url;
          video.muted = true;
          video.playsInline = true;
          video.loop = true;
          await video.play();
          if (!video.captureStream && !video.mozCaptureStream) {
            throw new Error('captureStream não suportado');
          }
          var stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
          await publishLocalStream(stream);
        } catch (e) {
          var fd = new FormData();
          fd.append('file', file);
          fetch(baseUrl + '/api/media/upload?to=tmp', { method: 'POST', body: fd })
            .then(function (r) {
              return r.json();
            })
            .then(function (res) {
              projectVideo(res.src, file.name);
              setStreamStatus('Stream indisponível — vídeo enviado ao PC', '');
              alert('Stream indisponível — vídeo enviado e projetado.');
            })
            .catch(function () {
              setStreamStatus('Falha no stream e no upload', 'bad');
              alert('Falha no stream e no upload: ' + (e.message || e));
            });
        }
      })();
    });
  }

  function stopStreamTracksOnly() {
    if (localStream) {
      localStream.getTracks().forEach(function (t) {
        try {
          t.stop();
        } catch (_) {}
      });
      localStream = null;
    }
    if (fileStreamVideo) {
      try {
        fileStreamVideo.pause();
        fileStreamVideo.removeAttribute('src');
        fileStreamVideo.load();
      } catch (_) {}
      fileStreamVideo = null;
    }
  }

  function stopStream() {
    stopStreamTracksOnly();
    resetPeerConnection();
    if (transport) sendCmd('streamStopped', {});
    setStreamStatus('Stream parado', '');
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
    showLogoInterrupt();
  });
  if ($('btnLiveLogo')) {
    $('btnLiveLogo').addEventListener('click', function () {
      showLogoInterrupt();
    });
  }
  if ($('btnClearBg')) {
    $('btnClearBg').addEventListener('click', function () {
      clearVideoBg();
    });
  }
  if ($('btnClearSession')) {
    $('btnClearSession').addEventListener('click', function () {
      if (!confirm('Limpar sessão deste celular (lista, slides e conexão salva)?')) return;
      stopStream();
      clearSessionLocal();
      if (transport) transport.disconnect();
      showScreen('screen-connect');
      setStatus($('connectStatus'), 'Sessão limpa', 'ok');
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
      schedulePersist();
    });
  });
  $('btnFontUp').addEventListener('click', function () {
    ensureControl(function () {
      state.fontSize = Math.min(6, Number(state.fontSize) + 0.5);
      sendCmd('changeFontSize', state.fontSize);
      schedulePersist();
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
  if ($('btnDeckUpload')) {
    $('btnDeckUpload').addEventListener('click', function () {
      uploadDeck();
    });
  }
  $('btnUploadVideo').addEventListener('click', function () {
    var input = $('videoFile');
    var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
    if (!files.length || !baseUrl) {
      alert('Escolha pelo menos um vídeo.');
      return;
    }
    var status = $('uploadStatus');
    var i = 0;
    var lastRes = null;

    function next() {
      if (i >= files.length) {
        loadVideos();
        if (lastRes) {
          var item = { type: 'video', title: lastRes.name, src: lastRes.src };
          state.playlist.push(item);
          syncPlaylist();
          renderPlaylist();
          projectVideo(lastRes.src, lastRes.name);
        }
        if (status) {
          setStatus(status, files.length + ' vídeo(s) enviado(s)', 'ok');
        }
        input.value = '';
        return;
      }
      var file = files[i++];
      if (status) setStatus(status, 'Enviando ' + i + '/' + files.length + ': ' + file.name, '');
      var fd = new FormData();
      fd.append('file', file);
      fetch(baseUrl + '/api/media/upload?to=videos', { method: 'POST', body: fd })
        .then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) throw new Error((j && j.error) || 'upload');
            return j;
          });
        })
        .then(function (res) {
          lastRes = res;
          next();
        })
        .catch(function () {
          if (status) setStatus(status, 'Falha em: ' + file.name, 'bad');
          alert('Falha no upload de ' + file.name);
          next();
        });
    }
    next();
  });
  $('btnPlayVid').addEventListener('click', playVideoKeep);
  $('btnPauseVid').addEventListener('click', pauseVideoCmd);
  if ($('btnLivePlay')) $('btnLivePlay').addEventListener('click', playVideoKeep);
  if ($('btnLivePause')) $('btnLivePause').addEventListener('click', pauseVideoCmd);
  if ($('btnLiveSeekBack')) {
    $('btnLiveSeekBack').addEventListener('click', function () {
      seekVideoBy(-10);
    });
  }
  if ($('btnLiveSeekFwd')) {
    $('btnLiveSeekFwd').addEventListener('click', function () {
      seekVideoBy(10);
    });
  }
  if ($('btnLiveContain')) {
    $('btnLiveContain').addEventListener('click', function () {
      applyVideoFit('contain'); // preserva tela cheia
    });
  }
  if ($('btnLiveCover')) {
    $('btnLiveCover').addEventListener('click', function () {
      applyVideoFit('cover'); // preserva tela cheia
    });
  }
  if ($('btnLiveFull')) {
    $('btnLiveFull').addEventListener('click', function () {
      applyVideoFit(state.videoFit || 'cover', true);
    });
  }
  if ($('btnLiveExitFull')) {
    $('btnLiveExitFull').addEventListener('click', function () {
      applyVideoFit(state.videoFit || 'contain', false);
    });
  }
  if ($('btnLiveUnmute')) {
    $('btnLiveUnmute').addEventListener('click', function () {
      setVideoMuted(false);
    });
  }
  if ($('btnLiveMute')) {
    $('btnLiveMute').addEventListener('click', function () {
      setVideoMuted(true);
    });
  }
  if ($('btnVideoContain')) {
    $('btnVideoContain').addEventListener('click', function () {
      applyVideoFit('contain');
    });
  }
  if ($('btnVideoCover')) {
    $('btnVideoCover').addEventListener('click', function () {
      applyVideoFit('cover');
    });
  }
  if ($('btnVideoFull')) {
    $('btnVideoFull').addEventListener('click', function () {
      applyVideoFit(state.videoFit || 'cover', true);
    });
  }
  if ($('btnVideoUnmute')) {
    $('btnVideoUnmute').addEventListener('click', function () {
      setVideoMuted(false);
    });
  }
  if ($('btnVideoMute')) {
    $('btnVideoMute').addEventListener('click', function () {
      setVideoMuted(true);
    });
  }
  $('btnStartStream').addEventListener('click', function () {
    startCameraStream();
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
    var saved = loadSession();
    if (saved) {
      if (saved.pin && $('pinInput')) $('pinInput').value = saved.pin;
      if (saved.role && $('roleSelect')) $('roleSelect').value = saved.role;
      state.playlist = Array.isArray(saved.playlist) ? saved.playlist : [];
      state.slidesHtml = saved.slidesHtml || '';
      state.slideIndex = saved.slideIndex || 0;
      state.fontSize = saved.fontSize != null ? saved.fontSize : 2;
      state.videoFit = saved.videoFit || 'contain';
      state.videoFullscreen = !!saved.videoFullscreen;
      videoBgSrc = saved.videoBgSrc || null;
      if (saved.baseUrl) {
        $('hostInput').value = String(saved.baseUrl).replace(/^https?:\/\//, '');
      }
    }
    if (location.protocol.indexOf('http') === 0 && location.hostname && location.hostname !== 'localhost') {
      $('hostInput').value = location.host;
      connectTo(location.origin, $('pinInput').value, $('roleSelect').value);
    } else if (saved && saved.baseUrl) {
      connectTo(saved.baseUrl, $('pinInput').value, $('roleSelect').value);
    } else {
      var hist = ProjectionDiscovery.loadHistory();
      if (hist[0]) $('hostInput').value = hist[0].replace(/^https?:\/\//, '');
    }
  })();
})();
