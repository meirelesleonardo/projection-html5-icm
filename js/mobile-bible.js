/**
 * Mobile Bible helpers (ACF/NVI). Loads bible/*.js on demand.
 */
(function (global) {
  'use strict';

  var loading = {};

  function getData(version) {
    if (version === 'nvi') return global.biblenvi || null;
    return global.bibleacf || null;
  }

  function ensureLoaded(version, baseUrl, cb) {
    version = version === 'nvi' ? 'nvi' : 'acf';
    if (getData(version)) {
      cb(null, getData(version));
      return;
    }
    if (loading[version]) {
      loading[version].push(cb);
      return;
    }
    loading[version] = [cb];
    var s = document.createElement('script');
    var root = (baseUrl || '').replace(/\/$/, '');
    s.src = root + '/bible/' + version + '.js';
    s.onload = function () {
      var data = getData(version);
      var waiters = loading[version] || [];
      delete loading[version];
      waiters.forEach(function (fn) {
        fn(data ? null : new Error('Falha ao carregar bíblia'), data);
      });
    };
    s.onerror = function () {
      var waiters = loading[version] || [];
      delete loading[version];
      waiters.forEach(function (fn) {
        fn(new Error('Não foi possível baixar a bíblia'));
      });
    };
    document.head.appendChild(s);
  }

  function bookCount(version) {
    var data = getData(version);
    return data ? data.length : 0;
  }

  function bookName(version, bookIndex) {
    var data = getData(version);
    if (!data || !data[bookIndex]) return 'Livro ' + (bookIndex + 1);
    return data[bookIndex].name || data[bookIndex].abbrev || 'Livro';
  }

  function chapterCount(version, bookIndex) {
    var data = getData(version);
    if (!data || !data[bookIndex]) return 0;
    return (data[bookIndex].chapters || []).length;
  }

  function verseCount(version, bookIndex, chapterIndex) {
    var data = getData(version);
    if (!data || !data[bookIndex]) return 0;
    var ch = data[bookIndex].chapters[chapterIndex];
    return ch ? ch.length : 0;
  }

  function passageLabel(version, b, c, from, to) {
    var name = bookName(version, b);
    var label = name + ' ' + (c + 1) + ':' + (from + 1);
    if (to > from) label += '-' + (to + 1);
    return label;
  }

  function scriptureToHtml(opts) {
    opts = opts || {};
    var version = opts.version === 'nvi' ? 'nvi' : 'acf';
    var data = getData(version);
    if (!data) return '';
    var b = Number(opts.b) || 0;
    var c = Number(opts.c) || 0;
    var from = Number(opts.from) || 0;
    var to = Number(opts.to) != null ? Number(opts.to) : from;
    if (to < from) to = from;
    var bg = ' data-background="' + (opts.bg || 'imagens/fundo.jpg') + '"';
    var html = '';
    for (var i = from; i <= to; i++) {
      var text = data[b].chapters[c][i];
      if (!text) continue;
      var label = data[b].name + ' ' + (c + 1) + ':' + (i + 1);
      var refverse = 'b' + b + 'c' + c + 'v' + i;
      var labelEsc = String(label).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      html +=
        '<section' +
        bg +
        ' data-state="scriptures ' +
        refverse +
        '" data-background-transition="none">\n<style>\n.' +
        refverse +
        ' footer.scripturetitle small:after{ content: "' +
        labelEsc +
        '"; }\n.' +
        refverse +
        ' footer.scripturetitle{ display: block; }\n</style>\n<p>' +
        text +
        '</p>\n</section>\n';
    }
    if (opts.closingHtml) html += opts.closingHtml;
    return html;
  }

  function previewText(version, b, c, from, to, limit) {
    var data = getData(version);
    if (!data) return '';
    limit = limit || 4;
    var lines = [];
    for (var i = from; i <= to && lines.length < limit; i++) {
      var t = data[b].chapters[c][i];
      if (t) lines.push(i + 1 + '. ' + t);
    }
    if (to - from + 1 > limit) lines.push('…');
    return lines.join('\n');
  }

  global.MobileBible = {
    ensureLoaded: ensureLoaded,
    getData: getData,
    bookCount: bookCount,
    bookName: bookName,
    chapterCount: chapterCount,
    verseCount: verseCount,
    passageLabel: passageLabel,
    scriptureToHtml: scriptureToHtml,
    previewText: previewText,
  };
})(window);
