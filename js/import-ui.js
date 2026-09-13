/* global $, libraryServerMode, libraryVersion, ensureLibraryPin, fetchLibraryFromServer, applyLibraryFromObject, callLibraryArchiveApi, applyLibraryApiResult */
(function () {
  'use strict';

  var currentImportId = null;
  var currentDetail = null;

  function statusLabel(st) {
    var map = {
      NEW: 'Novo',
      UPDATE: 'Atualização',
      UNCHANGED: 'Sem alteração',
      CONFLICT: 'Conflito',
      REVIEW: 'Revisar',
      SKIP: 'Ignorado',
      ERROR: 'Erro',
    };
    return map[st] || st;
  }

  function statusBadge(st) {
    var cls = 'secondary';
    if (st === 'NEW') cls = 'success';
    else if (st === 'UPDATE') cls = 'primary';
    else if (st === 'UNCHANGED') cls = 'light text-dark';
    else if (st === 'CONFLICT' || st === 'ERROR') cls = 'danger';
    else if (st === 'REVIEW') cls = 'warning text-dark';
    else if (st === 'SKIP') cls = 'secondary';
    return '<span class="badge badge-' + cls + '">' + statusLabel(st) + '</span>';
  }

  function importHeaders(pin, json) {
    var h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (pin) h['X-Room-Pin'] = pin;
    return h;
  }

  function requireHttp() {
    if (!libraryServerMode) {
      alert('Importar coletânea só funciona via http(s):// (abra pelo servidor / IP do mini PC).');
      return false;
    }
    return true;
  }

  function showUploadStep() {
    $('#ciStepUpload').show();
    $('#ciStepReview').hide();
    $('#ciRejectBtn, #ciAnalyzeBtn, #ciApplyBtn').hide();
    $('#ciApplyResult').hide();
    currentImportId = null;
    currentDetail = null;
  }

  function showReviewStep(detail) {
    currentDetail = detail;
    currentImportId = detail.job && detail.job.id;
    $('#ciStepUpload').hide();
    $('#ciStepReview').show();
    $('#ciRejectBtn, #ciAnalyzeBtn, #ciApplyBtn').show();
    $('#ciLibraryName').val(detail.job.libraryName || '');
    $('#ciLang').val(detail.job.lang || 'pt');
    var preview = detail.preview || {};
    $('#ciFolderOp').val(preview.folderOp || '—');
    var st = preview.statistics || detail.job.statistics || {};
    $('#ciStats').html(
      '<strong>' +
        (st.found || 0) +
        '</strong> louvores · ' +
        '<span class="text-success">novos ' +
        (st.new || 0) +
        '</span> · ' +
        '<span class="text-primary">atualizar ' +
        (st.update || 0) +
        '</span> · ' +
        'inalterados ' +
        (st.unchanged || 0) +
        ' · ' +
        '<span class="text-danger">conflitos ' +
        (st.conflict || 0) +
        '</span> · ' +
        'revisar ' +
        (st.review || 0) +
        '<br><small class="text-muted">Job ' +
        (detail.job.id || '') +
        ' · status ' +
        (detail.job.status || '') +
        '</small>'
    );
    renderSongsTable(preview.items || []);
  }

  function renderSongsTable(items) {
    var $tb = $('#ciSongsTable tbody');
    $tb.empty();
    items.forEach(function (it) {
      var actions = '';
      if (it.status === 'CONFLICT' || it.status === 'REVIEW') {
        actions =
          '<button type="button" class="btn btn-sm btn-outline-secondary ci-keep" data-key="' +
          it.key +
          '">Manter</button> ' +
          '<button type="button" class="btn btn-sm btn-outline-primary ci-use" data-key="' +
          it.key +
          '">Usar importado</button>';
      }
      var title = it.resolvedTitle || it.incomingTitle || '';
      var slides = it.incomingSlides != null ? it.incomingSlides : '—';
      if (it.matchSlides != null && it.status === 'CONFLICT') {
        slides = it.matchSlides + ' → ' + it.incomingSlides;
      }
      $tb.append(
        '<tr data-key="' +
          it.key +
          '">' +
          '<td><input type="checkbox" class="ci-sel" data-key="' +
          it.key +
          '"' +
          (it.selected !== false ? ' checked' : '') +
          '></td>' +
          '<td>' +
          statusBadge(it.status) +
          '</td>' +
          '<td class="small">' +
          $('<div>').text(title).html() +
          (it.matchTitle && it.matchTitle !== title
            ? '<br><span class="text-muted">atual: ' +
              $('<div>').text(it.matchTitle).html() +
              '</span>'
            : '') +
          '</td>' +
          '<td>' +
          slides +
          '</td>' +
          '<td class="text-nowrap">' +
          actions +
          '</td>' +
          '</tr>'
      );
    });
  }

  function uploadFile(file) {
    if (!requireHttp()) return;
    $('#ciUploadStatus').text('Enviando e processando… (PPTX grande pode demorar)');
    ensureLibraryPin().then(function (pin) {
      var fd = new FormData();
      fd.append('file', file);
      return fetch('/api/imports', {
        method: 'POST',
        headers: importHeaders(pin, false),
        body: fd,
      }).then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, body: j };
        });
      });
    }).then(function (res) {
      if (!res.ok) {
        $('#ciUploadStatus').text(res.body.error || 'Falha no upload');
        alert(res.body.error || 'Falha na importação');
        return;
      }
      $('#ciUploadStatus').text('Processado.');
      showReviewStep(res.body);
    }).catch(function (e) {
      $('#ciUploadStatus').text(String(e.message || e));
    });
  }

  function patchAndRefresh(body) {
    if (!currentImportId) return Promise.resolve();
    return ensureLibraryPin().then(function (pin) {
      return fetch('/api/imports/' + encodeURIComponent(currentImportId), {
        method: 'PATCH',
        headers: importHeaders(pin, true),
        body: JSON.stringify(body),
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error || 'PATCH failed');
          showReviewStep(j);
          return j;
        });
      });
    });
  }

  $('#importCollection').on('click', function () {
    if (!requireHttp()) return;
    showUploadStep();
    $('#ciFileInput').val('');
    $('#ciUploadStatus').text('');
    $('#collectionImportModal').modal('show');
  });

  $('#ciFileInput').on('change', function () {
    var f = this.files && this.files[0];
    if (f) uploadFile(f);
  });

  $('#ciDropZone').on('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });
  $('#ciDropZone').on('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var f = e.originalEvent.dataTransfer.files[0];
    if (f) uploadFile(f);
  });

  $('#ciSelectAll').on('change', function () {
    var on = this.checked;
    var selection = {};
    $('#ciSongsTable .ci-sel').each(function () {
      this.checked = on;
      selection[$(this).data('key')] = on;
    });
    patchAndRefresh({ selection: selection, libraryName: $('#ciLibraryName').val(), lang: $('#ciLang').val() });
  });

  $('#ciSongsTable').on('change', '.ci-sel', function () {
    var selection = {};
    selection[$(this).data('key')] = this.checked;
    patchAndRefresh({ selection: selection });
  });

  $('#ciSongsTable').on('click', '.ci-keep', function () {
    var key = $(this).data('key');
    var decisions = {};
    decisions[key] = 'keep';
    patchAndRefresh({ decisions: decisions });
  });

  $('#ciSongsTable').on('click', '.ci-use', function () {
    var key = $(this).data('key');
    var decisions = {};
    decisions[key] = 'useImported';
    patchAndRefresh({ decisions: decisions });
  });

  $('#ciAnalyzeBtn').on('click', function () {
    patchAndRefresh({
      libraryName: $('#ciLibraryName').val(),
      lang: $('#ciLang').val(),
    });
  });

  $('#ciRejectBtn').on('click', function () {
    if (!currentImportId) return;
    if (!confirm('Rejeitar esta importação? A biblioteca oficial não será alterada.')) return;
    ensureLibraryPin().then(function (pin) {
      return fetch('/api/imports/' + encodeURIComponent(currentImportId) + '/reject', {
        method: 'POST',
        headers: importHeaders(pin, true),
        body: '{}',
      });
    }).then(function () {
      alert('Importação rejeitada.');
      $('#collectionImportModal').modal('hide');
    });
  });

  $('#ciApplyBtn').on('click', function () {
    if (!currentImportId) return;
    var name = $('#ciLibraryName').val();
    if (!confirm('Aplicar importação na biblioteca "' + name + '"?\nUm backup será criado automaticamente.')) {
      return;
    }
    $('#ciApplyBtn').prop('disabled', true);
    patchAndRefresh({
      libraryName: name,
      lang: $('#ciLang').val(),
    })
      .then(function () {
        return ensureLibraryPin().then(function (pin) {
          return fetch('/api/imports/' + encodeURIComponent(currentImportId) + '/apply', {
            method: 'POST',
            headers: importHeaders(pin, true),
            body: JSON.stringify({ version: libraryVersion }),
          }).then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, status: r.status, body: j };
            });
          });
        });
      })
      .then(function (res) {
        $('#ciApplyBtn').prop('disabled', false);
        if (!res.ok) {
          alert(res.body.error || 'Falha ao aplicar');
          if (res.body.items) {
            return patchAndRefresh({});
          }
          return;
        }
        var rep = res.body.report || res.body;
        $('#ciApplyResult')
          .show()
          .html(
            '<strong>Importação concluída</strong><br>' +
              'Inseridos: ' +
              (rep.inserted != null ? rep.inserted : '—') +
              ' · Atualizados: ' +
              (rep.updated != null ? rep.updated : '—') +
              ' · Inalterados: ' +
              (rep.unchanged != null ? rep.unchanged : '—') +
              '<br>Backup: ' +
              (rep.backup || '—') +
              '<br>Versão: ' +
              (res.body.version || '—')
          );
        $('#ciRejectBtn, #ciAnalyzeBtn, #ciApplyBtn').hide();
        return fetchLibraryFromServer().then(function (loaded) {
          if (typeof applyLibraryFromObject === 'function') {
            applyLibraryFromObject(loaded.library, { version: loaded.version });
          } else {
            window.location.reload();
          }
        });
      })
      .catch(function (e) {
        $('#ciApplyBtn').prop('disabled', false);
        alert(String(e.message || e));
      });
  });

  $('#btnLibraryBackups').on('click', function () {
    if (!requireHttp()) return;
    ensureLibraryPin()
      .then(function (pin) {
        return fetch('/api/library/backups', { headers: importHeaders(pin, false) }).then(function (r) {
          return r.json();
        });
      })
      .then(function (data) {
        var $list = $('#ciBackupsList');
        $list.empty();
        (data.backups || []).forEach(function (b) {
          $list.append(
            '<li class="list-group-item d-flex justify-content-between align-items-center">' +
              '<span class="small">' +
              $('<div>').text(b.name).html() +
              '<br><span class="text-muted">' +
              (b.mtime || '') +
              ' · ' +
              Math.round((b.size || 0) / 1024) +
              ' KiB</span></span>' +
              '<button type="button" class="btn btn-sm btn-warning ci-restore" data-name="' +
              $('<div>').text(b.name).html() +
              '">Restaurar</button>' +
              '</li>'
          );
        });
        if (!(data.backups || []).length) {
          $list.append('<li class="list-group-item text-muted">Nenhum backup ainda.</li>');
        }
        $('#libraryBackupsModal').modal('show');
      })
      .catch(function (e) {
        alert(String(e.message || e));
      });
  });

  $('#ciBackupsList').on('click', '.ci-restore', function () {
    var name = $(this).data('name');
    if (!confirm('Restaurar backup?\n' + name + '\n\nA biblioteca atual será substituída (com backup prévio).')) {
      return;
    }
    ensureLibraryPin()
      .then(function (pin) {
        return fetch('/api/library/restore', {
          method: 'POST',
          headers: importHeaders(pin, true),
          body: JSON.stringify({ backup: name, version: libraryVersion }),
        }).then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, body: j };
          });
        });
      })
      .then(function (res) {
        if (!res.ok) {
          alert(res.body.error || 'Falha ao restaurar');
          return;
        }
        return fetchLibraryFromServer().then(function (loaded) {
          if (typeof applyLibraryFromObject === 'function') {
            applyLibraryFromObject(loaded.library, { version: loaded.version });
          } else {
            window.location.reload();
          }
          $('#libraryBackupsModal').modal('hide');
          alert('Backup restaurado. Versão ' + (res.body.version || ''));
        });
      });
  });

  function setMaintStatus(text, isError) {
    var $el = $('#maintStatus');
    $el.text(text || '');
    $el.toggleClass('text-danger', !!isError);
    $el.toggleClass('text-muted', !isError);
  }

  function renderMaintenanceLists(data) {
    var $folders = $('#maintArchivedFolders');
    var $songs = $('#maintArchivedSongs');
    $folders.empty();
    $songs.empty();

    (data.folders || []).forEach(function (f) {
      $folders.append(
        '<div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-start">' +
          '<div class="small"><strong>' +
          $('<div>').text(f.name).html() +
          '</strong><br><span class="text-muted">' +
          (f.archivedAt || '') +
          (f.archiveReason ? ' · ' + $('<div>').text(f.archiveReason).html() : '') +
          ' · ' +
          (f.songCount || 0) +
          ' louvores</span></div>' +
          '<div class="btn-group-vertical btn-group-sm">' +
          '<button type="button" class="btn btn-outline-primary maint-restore-folder" data-fi="' +
          f.folderIndex +
          '" data-name="' +
          $('<div>').text(f.name).html() +
          '">Restaurar</button>' +
          '<button type="button" class="btn btn-outline-danger maint-purge-folder" data-fi="' +
          f.folderIndex +
          '" data-name="' +
          $('<div>').text(f.name).html() +
          '">Excluir</button>' +
          '</div></div>'
      );
    });
    if (!(data.folders || []).length) {
      $folders.append('<p class="text-muted small">Nenhuma pasta arquivada.</p>');
    }

    (data.songs || []).forEach(function (s) {
      $songs.append(
        '<div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-start">' +
          '<div class="small"><strong>' +
          $('<div>').text(s.title).html() +
          '</strong><br><span class="text-muted">' +
          $('<div>').text(s.folderName || '').html() +
          (s.archivedAt ? ' · ' + s.archivedAt : '') +
          (s.archiveReason ? ' · ' + $('<div>').text(s.archiveReason).html() : '') +
          '</span></div>' +
          '<div class="btn-group-vertical btn-group-sm">' +
          '<button type="button" class="btn btn-outline-primary maint-restore-song" data-fi="' +
          s.folderIndex +
          '" data-si="' +
          s.songIndex +
          '" data-title="' +
          $('<div>').text(s.title).html() +
          '">Restaurar</button>' +
          '<button type="button" class="btn btn-outline-danger maint-purge-song" data-fi="' +
          s.folderIndex +
          '" data-si="' +
          s.songIndex +
          '" data-title="' +
          $('<div>').text(s.title).html() +
          '">Excluir</button>' +
          '</div></div>'
      );
    });
    if (!(data.songs || []).length) {
      $songs.append('<p class="text-muted small">Nenhum louvor arquivado.</p>');
    }
  }

  function loadMaintenance() {
    setMaintStatus('Carregando…');
    return ensureLibraryPin()
      .then(function (pin) {
        return fetch('/api/library/archived', { headers: importHeaders(pin, false) }).then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, body: j };
          });
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'Falha ao listar arquivados');
        renderMaintenanceLists(res.body);
        setMaintStatus(
          'Versão ' + (res.body.version != null ? res.body.version : libraryVersion)
        );
      })
      .catch(function (e) {
        setMaintStatus(String(e.message || e), true);
      });
  }

  $('#btnLibraryMaintenance').on('click', function () {
    if (!requireHttp()) return;
    $('#libraryMaintenanceModal').modal('show');
    loadMaintenance();
  });

  $('#btnMaintRefresh').on('click', function () {
    loadMaintenance();
  });

  function maintConfirmTitle(expected) {
    var typed = window.prompt('Digite o título/nome exato para confirmar a exclusão definitiva:\n\n' + expected);
    if (typed == null) return null;
    if (String(typed).trim() !== String(expected).trim()) {
      alert('Texto não confere. Operação cancelada.');
      return null;
    }
    return String(typed).trim();
  }

  $('#maintArchivedFolders').on('click', '.maint-restore-folder', function () {
    var fi = Number($(this).data('fi'));
    callLibraryArchiveApi('POST', '/api/library/folders/restore', {
      version: libraryVersion,
      folderIndex: fi,
    })
      .then(applyLibraryApiResult)
      .then(loadMaintenance)
      .catch(function (e) {
        alert(e.message || e);
      });
  });

  $('#maintArchivedFolders').on('click', '.maint-purge-folder', function () {
    var fi = Number($(this).data('fi'));
    var name = String($(this).data('name') || '');
    var confirmTitle = maintConfirmTitle(name);
    if (!confirmTitle) return;
    if (!confirm('Excluir DEFINITIVAMENTE a pasta e todos os louvores?\n' + name)) return;
    callLibraryArchiveApi('DELETE', '/api/library/folders', {
      version: libraryVersion,
      folderIndex: fi,
      confirmTitle: confirmTitle,
    })
      .then(applyLibraryApiResult)
      .then(loadMaintenance)
      .catch(function (e) {
        alert(e.message || e);
      });
  });

  $('#maintArchivedSongs').on('click', '.maint-restore-song', function () {
    var fi = Number($(this).data('fi'));
    var si = Number($(this).data('si'));
    callLibraryArchiveApi('POST', '/api/library/songs/restore', {
      version: libraryVersion,
      folderIndex: fi,
      songIndex: si,
    })
      .then(applyLibraryApiResult)
      .then(loadMaintenance)
      .catch(function (e) {
        alert(e.message || e);
      });
  });

  $('#maintArchivedSongs').on('click', '.maint-purge-song', function () {
    var fi = Number($(this).data('fi'));
    var si = Number($(this).data('si'));
    var title = String($(this).data('title') || '');
    var confirmTitle = maintConfirmTitle(title);
    if (!confirmTitle) return;
    if (!confirm('Excluir DEFINITIVAMENTE este louvor?\n' + title)) return;
    callLibraryArchiveApi('DELETE', '/api/library/songs', {
      version: libraryVersion,
      folderIndex: fi,
      songIndex: si,
      confirmTitle: confirmTitle,
    })
      .then(applyLibraryApiResult)
      .then(loadMaintenance)
      .catch(function (e) {
        alert(e.message || e);
      });
  });
})();
