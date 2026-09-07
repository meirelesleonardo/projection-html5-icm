var dados = [];
var projecao = [];
var imagens = [];
var avisos = [];
var pastaAtiva = 0;
var louvorAtivo = 0;
var projecaoAtiva = 0;
var windowView;
var iframeView = document.getElementById("iframeProjection").contentWindow;
var viewSlides = "";
var configuracoes = {};
var ref_selected = "0_0";
var telaPadrao = ">\n<h1>"+TRANSLATIONS[config.lang]['maranata_title']+"</h1>\n<h3>"+TRANSLATIONS[config.lang]['maranata_slogan']+"</h3>\n</section>\n";

var isFirefox = typeof InstallTrigger !== 'undefined';

/** Server-backed library sync (HTTP mode). */
var libraryVersion = null;
var libraryDirty = false;
var libraryRoomPin = '';
var libraryServerMode = location.protocol.indexOf('http') === 0;
var _pendingServerLibrary = null;
var _pendingLocalLibrary = null;

/** Shared projection queue (desktop ↔ mobile via room.state.playlist). */
var sharedPlaylist = [];
var applyingRemotePlaylist = false;
var playlistSyncTimer = null;
var playlistReadyToSync = false;
var desktopControlWaiters = [];
var lastReloadRevealOk = null;

function escapeProjectionLabel(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Desktop row (s/b/i/w) → canonical playlist item. */
function projecaoItemToPlaylist(item) {
  if (!item) return item;
  if (item.type === 's') {
    var title = 'Louvor';
    try {
      if (dados[item.folderId] && dados[item.folderId].songs && dados[item.folderId].songs[item.id]) {
        title = dados[item.folderId].songs[item.id].title || title;
      }
    } catch (e) {}
    return { type: 'song', folderId: item.folderId, id: item.id, title: title };
  }
  if (item.type === 'b') {
    var bTitle = 'Bíblia';
    try {
      if (typeof bible !== 'undefined' && bible && bible[item.b]) {
        bTitle =
          bible[item.b].name +
          ' ' +
          (item.c + 1) +
          ':' +
          (item.from + 1) +
          (item.from < item.to ? '-' + (item.to + 1) : '');
      }
    } catch (e) {}
    return {
      type: 'bible',
      title: bTitle,
      b: item.b,
      c: item.c,
      from: item.from,
      to: item.to,
      version: item.version,
      bible: { b: item.b, c: item.c, from: item.from, to: item.to, version: item.version },
    };
  }
  if (item.type === 'i') {
    var imgName = (imagens[item.id] && imagens[item.id].name) || 'Imagem';
    return { type: 'image', id: item.id, title: imgName, name: imgName };
  }
  if (item.type === 'w') {
    var warnName = (avisos[item.id] && avisos[item.id].name) || 'Aviso';
    return { type: 'warning', id: item.id, title: warnName, name: warnName };
  }
  return item;
}

/** Canonical playlist item → desktop row (preserves video/deck/html round-trip). */
function playlistItemToDesktopRow(item) {
  if (!item) return item;
  if (item.type === 's' || item.type === 'b' || item.type === 'i' || item.type === 'w') return item;
  if (item.type === 'song') {
    if (item.folderId != null && item.id != null) {
      return { type: 's', folderId: item.folderId, id: item.id };
    }
    return item;
  }
  if (item.type === 'bible') {
    var b = item.bible || item;
    return {
      type: 'b',
      b: b.b,
      c: b.c,
      from: b.from,
      to: b.to,
      version: b.version != null ? b.version : item.version,
    };
  }
  if (item.type === 'image') return { type: 'i', id: item.id };
  if (item.type === 'warning') return { type: 'w', id: item.id };
  return item;
}

function deriveProjecaoFromShared() {
  projecao = (sharedPlaylist || []).map(playlistItemToDesktopRow);
}

function applyRemotePlaylist(pl) {
  applyingRemotePlaylist = true;
  sharedPlaylist = Array.isArray(pl) ? pl.slice() : [];
  deriveProjecaoFromShared();
  reloadProjectionList({ generate: false, sync: false });
  applyingRemotePlaylist = false;
  playlistReadyToSync = true;
}

function syncDesktopPlaylistNow() {
  if (applyingRemotePlaylist) return;
  if (!playlistReadyToSync) return;
  if (location.protocol.indexOf('http') !== 0) return;
  ensureDesktopControl(function () {
    var t = window.projectionNet;
    if (t && typeof t.send === 'function') {
      t.send('playlistUpdate', sharedPlaylist);
    }
    fetch('/api/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlist: sharedPlaylist }),
    }).catch(function () {});
  });
}

function scheduleSyncDesktopPlaylist() {
  if (!playlistReadyToSync) return;
  if (playlistSyncTimer) clearTimeout(playlistSyncTimer);
  playlistSyncTimer = setTimeout(function () {
    playlistSyncTimer = null;
    syncDesktopPlaylistNow();
  }, 150);
}

function addDesktopProjectionItem(desktopItem) {
  playlistReadyToSync = true;
  sharedPlaylist.push(projecaoItemToPlaylist(desktopItem));
  deriveProjecaoFromShared();
  reloadProjectionList({ generate: true, sync: true, fromShared: true });
}

function flushDesktopControlWaiters() {
  var queue = desktopControlWaiters.slice();
  desktopControlWaiters = [];
  queue.forEach(function (fn) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

/** Wait until desktop has control, then run fn (parity with mobile ensureControl). */
function ensureDesktopControl(fn) {
  var t = window.projectionNet;
  if (!t || !t.connected) {
    updateDesktopControlStatus();
    return;
  }
  if (t.youControl || (t.clientId && t.clientId === t.controllerId)) {
    t.youControl = true;
    fn();
    return;
  }
  desktopControlWaiters.push(fn);
  updateDesktopControlStatus();
  if (typeof t.takeControl === 'function') t.takeControl();
  setTimeout(function () {
    if (!desktopControlWaiters.length) return;
    if (t.youControl || (t.clientId && t.clientId === t.controllerId)) {
      t.youControl = true;
      flushDesktopControlWaiters();
    } else {
      desktopControlWaiters = [];
      updateDesktopControlStatus();
    }
  }, 800);
}

function updateDesktopControlStatus() {
  var el = document.getElementById('desktopControlStatus');
  if (!el) return;
  var t = window.projectionNet;
  if (!t || !t.connected) {
    el.textContent = 'Desconectado';
    el.style.color = '#f66';
    return;
  }
  if (t.youControl) {
    if (lastReloadRevealOk === false) {
      el.textContent = 'No comando (View: falha)';
      el.style.color = '#fc6';
    } else {
      el.textContent = 'No comando';
      el.style.color = '#8f8';
    }
  } else {
    el.textContent = desktopControlWaiters.length ? 'Assumindo comando…' : 'Sem comando';
    el.style.color = '#fc6';
  }
}

function setLibrarySyncStatus(text, kind) {
  var el = document.getElementById('librarySyncStatus');
  if (!el) return;
  el.textContent = text || 'Biblioteca: —';
  el.style.color = kind === 'ok' ? '#8f8' : kind === 'bad' ? '#f88' : kind === 'warn' ? '#fc6' : '';
}

function markLibraryDirty() {
  libraryDirty = true;
  setLibrarySyncStatus(
    libraryServerMode
      ? 'Biblioteca: alterações não salvas' + (libraryVersion != null ? ' (v' + libraryVersion + ')' : '')
      : 'Biblioteca: local (file://)',
    'warn'
  );
  var msg = document.getElementById('msgSave');
  if (msg) $(msg).show();
}

function markLibraryClean(version) {
  libraryDirty = false;
  if (version != null) libraryVersion = version;
  setLibrarySyncStatus(
    libraryServerMode
      ? 'Biblioteca: salva no servidor (v' + libraryVersion + ')'
      : 'Biblioteca: local',
    'ok'
  );
  var msg = document.getElementById('msgSave');
  if (msg) $(msg).hide();
}

function applyLibraryFromObject(library, opts) {
  opts = opts || {};
  dados = library;
  if (!opts.skipLocalCache) {
    try {
      localStorage.setItem('data', JSON.stringify(dados));
    } catch (e) {
      console.warn('[library] localStorage cheio', e);
    }
  }
  atualizaListasFromJSON(dados);
  if (opts.version != null) libraryVersion = opts.version;
  if (opts.dirty) markLibraryDirty();
  else markLibraryClean(libraryVersion);
}

function fetchLibraryFromServer() {
  return fetch('/api/library', { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var ver = r.headers.get('X-Library-Version');
    return r.json().then(function (lib) {
      return {
        library: lib,
        version: ver != null ? Number(ver) : null,
      };
    });
  });
}

function ensureLibraryPin() {
  if (libraryRoomPin) return Promise.resolve(libraryRoomPin);
  return fetch('/api/pairing')
    .then(function (r) {
      return r.json();
    })
    .then(function (info) {
      libraryRoomPin = info.pin != null ? String(info.pin) : '';
      return libraryRoomPin;
    })
    .catch(function () {
      return '';
    });
}

function saveLibraryToServer() {
  if (!libraryServerMode) {
    alert('Salvar no servidor só funciona via http(s):// (abra pelo IP do mini PC).');
    return Promise.reject(new Error('not_http'));
  }
  setLibrarySyncStatus('Biblioteca: salvando…', '');
  return ensureLibraryPin().then(function (pin) {
    var headers = { 'Content-Type': 'application/json' };
    if (pin) headers['X-Room-Pin'] = pin;
    return fetch('/api/library', {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify({ version: libraryVersion, library: dados }),
    }).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, status: r.status, body: j };
      });
    });
  }).then(function (res) {
    if (res.ok) {
      try {
        localStorage.setItem('data', JSON.stringify(dados));
      } catch (e) {}
      markLibraryClean(res.body.version);
      return res.body;
    }
    if (res.status === 409) {
      setLibrarySyncStatus('Biblioteca: conflito — atualize antes de salvar', 'bad');
      alert(
        (res.body && res.body.error) ||
          'A biblioteca foi alterada por outro dispositivo. Atualize (F5) antes de salvar.'
      );
      throw new Error('conflict');
    }
    if (res.status === 403) {
      setLibrarySyncStatus('Biblioteca: PIN rejeitado', 'bad');
      alert('PIN incorreto para gravar a biblioteca.');
      throw new Error('bad_pin');
    }
    setLibrarySyncStatus('Biblioteca: falha ao salvar', 'bad');
    alert(
      'Erro ao salvar no servidor.\n' +
        ((res.body && res.body.error) || res.status) +
        '\n\nSuas alterações continuam nesta tela, mas NÃO estão na biblioteca oficial.'
    );
    throw new Error('save_failed');
  }).catch(function (e) {
    if (e && e.message === 'conflict') throw e;
    if (e && e.message === 'bad_pin') throw e;
    if (e && e.message === 'save_failed') throw e;
    setLibrarySyncStatus('Biblioteca: servidor indisponível', 'bad');
    alert(
      'Servidor indisponível.\nSuas alterações continuam nesta tela, mas NÃO foram salvas na biblioteca oficial.'
    );
    throw e;
  });
}

function librariesEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
}

function showLibraryMigrateModal(serverPayload, localLib) {
  _pendingServerLibrary = serverPayload;
  _pendingLocalLibrary = localLib;
  $('#libraryMigrateModal').modal('show');
}

function loadJSON(callback, onError) {   
  var xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', 'data/data.json', true); 
  xobj.onreadystatechange = function () {
    if (xobj.readyState != 4) return;
    if (xobj.status == 200) {
      callback(xobj.responseText);
    } else if (onError) {
      onError();
    }
  };
  xobj.onerror = function () {
    if (onError) onError();
  };
  xobj.send(null);   
}

function carregaLouvores(){
  if (libraryServerMode) {
    setLibrarySyncStatus('Biblioteca: carregando…', '');
    ensureLibraryPin();
    fetchLibraryFromServer()
      .then(function (payload) {
        var localRaw = localStorage.getItem('data');
        var localLib = null;
        if (localRaw) {
          try {
            localLib = JSON.parse(localRaw);
          } catch (e) {
            localLib = null;
          }
        }
        if (localLib && !librariesEqual(localLib, payload.library)) {
          showLibraryMigrateModal(payload, localLib);
          // Default view: server (official) until user chooses
          applyLibraryFromObject(payload.library, { version: payload.version, dirty: false });
          setLibrarySyncStatus('Biblioteca: divergência local × servidor', 'warn');
          return;
        }
        applyLibraryFromObject(payload.library, { version: payload.version, dirty: false });
      })
      .catch(function () {
        setLibrarySyncStatus('Biblioteca: falha ao carregar servidor', 'bad');
        var localRaw = localStorage.getItem('data');
        if (localRaw) {
          try {
            applyLibraryFromObject(JSON.parse(localRaw), { dirty: true });
            alert(
              'Não foi possível ler a biblioteca do servidor.\nUsando cópia local temporária — NÃO está confirmada como oficial.'
            );
            return;
          } catch (e) {}
        }
        $('#carregarModal').modal('toggle');
      });
    return;
  }

  // Legado file://
  if (localStorage.getItem('data') === null) {
    if (isFirefox) {
      loadJSON(function (response) {
        atualizaListaArquivos(response);
        markLibraryClean(null);
      }, function () {
        $('#carregarModal').modal('toggle');
      });
    } else {
      $('#carregarModal').modal('toggle');
    }
  } else {
    atualizaListaArquivos(localStorage.getItem('data'));
    markLibraryClean(null);
  }
}

$("#filedata").change(function() {
    var file = this.files[0];

    var reader = new FileReader();

    reader.onload = function(event) {
      var contents = event.target.result;
      atualizaListaArquivos(contents);
      if (libraryServerMode) markLibraryDirty();
    }

    // when the file is read it triggers the onload event above.
    reader.readAsText(file);    
    $('#carregarModal').modal('toggle')
});

function returnFlag(lang_code){
  var htmlflag = '&nbsp;<img src="imagens/';
  switch(lang_code){
    case "pt": {
      htmlflag+='brazil';
      break;
    }
    case "en": {
      htmlflag+='united-states';
      break;
    }
    case "it": {
      htmlflag+='italy';
      break;
    }    
  }
  return htmlflag+='.svg" class="flag-sm">';
}

function atualizaListaArquivos(newData){
    dados = JSON.parse(newData);
    
    localStorage.setItem('data', JSON.stringify(dados));

    var songList = [];

    // Teste de avisos
    if(localStorage.getItem("warnings") != null)
        avisos = JSON.parse(localStorage.getItem("warnings"));
    if(avisos.length > 0){  
      songList.push({id: "0",text:TRANSLATIONS[config.lang]['warnings'],state:{opened: true},children:[], type:"f-open2"});
      $.each(avisos, function(i, aviso) {
        songList[0].children.push({id: "0_"+i, text:aviso.name, type:"warning", data:aviso});
      });
    }

    // Teste inicio de utilização de imagens na lista
    if(localStorage.getItem("images") != null)
        images = JSON.parse(localStorage.getItem("images"));    
    if(imagens.length > 0){
      var idImageFolder = "0";
      if(songList.length > 0) idImageFolder = "1";
      songList.push({id: idImageFolder,text:TRANSLATIONS[config.lang]['images'],state:{opened: true},children:[], type:"f-open1"});
      $.each(imagens, function(i, imagem) {
        songList[idImageFolder].children.push({id: idImageFolder+"_"+i, text:imagem.name, type:"image", data:imagem});
      });
    }

    $('#listaDePastas').html("");

    $.each(dados, function(i, dado) {
      if(imagens.length > 0) i++;
      if(avisos.length > 0) i++;
      if(dado.type == "s"){
        songList.push({id: ""+i,text:dado.name+returnFlag(dado.lang),state:{opened: false},children:[]});
        $.each(dado.songs, function(f, louvor) {
            songList[i].children.push({id: i+"_"+f, text:louvor.title, type:"song", data:louvor});
        });        
      }

      $('#listaDePastas').append('<a class="dropdown-item" data-id="'+i+'">'+dado.name+'</a>');

    });

    $('#songList').jstree(true).settings.core.data = songList;
    $('#songList').jstree(true).refresh();

    $('#title').val(dados[0].songs[0].title);    
    $('#content').val(dados[0].songs[0].content);

    $('#listaDePastas > a').click(function(){
      console.log("Tentou criar música");

      var pastaSelecionada = parseInt($(this).attr("data-id"));

      if(imagens.length > 0) pastaSelecionada--;
      if(avisos.length > 0) pastaSelecionada--;

      dados[pastaSelecionada].songs.push({title: "", content: ""});

      lastAdded = dados[pastaSelecionada].songs.length - 1;
       
      atualizaListasFromJSON(dados);
      markLibraryDirty();

      if(imagens.length > 0) pastaSelecionada++;
      if(avisos.length > 0) pastaSelecionada++;

      ref_selected = pastaSelecionada+"_"+lastAdded;     

      $('#guias a[href="#edit"]').tab('show');

    });

}

function atualizaListasFromJSON(newData){
    dados = newData;

    var songList = [];

    // Teste inicio de utilização de imagens na lista
    if(localStorage.getItem("warnings") != null)
        avisos = JSON.parse(localStorage.getItem("warnings"));
    if(avisos.length > 0){
      songList.push({id: "0",text:TRANSLATIONS[config.lang]['warnings'],state:{opened: true},children:[], type:"f-open2"});
      $.each(avisos, function(i, aviso) {
        songList[0].children.push({id: "0_"+i, text:aviso.name, type:"warning", data:aviso});
      });
    }

    if(localStorage.getItem("images") != null)
        images = JSON.parse(localStorage.getItem("images")); 
    if(imagens.length > 0){
      var idImageFolder = "0";
      if(songList.length > 0) idImageFolder = "1";
      songList.push({id: idImageFolder,text:TRANSLATIONS[config.lang]['images'],state:{opened: true},children:[], type:"f-open1"});
      $.each(imagens, function(i, imagem) {
        songList[idImageFolder].children.push({id: idImageFolder+"_"+i, text:imagem.name, type:"image", data:imagem});
      });
    }

    $('#listaDePastas').html("");

    $.each(dados, function(i, dado) {
      if(imagens.length > 0) i++;
      if(avisos.length > 0) i++;
      if(dado.type == "s"){
        songList.push({id: ""+i,text:dado.name+returnFlag(dado.lang),state:{opened: false},children:[]});
        $.each(dado.songs, function(f, louvor) {
            var newSong = { id: i+"_"+f, text:louvor.title, type:"song", data:louvor };
            if(ref_selected == i+"_"+f){
              newSong.state = {selected: true};
            } 
            songList[i].children.push(newSong);
        });        
      }

      $('#listaDePastas').append('<a class="dropdown-item" data-id="'+i+'">'+dado.name+'</a>');
    });

    // console.log(songList);

    $('#songList').jstree(true).settings.core.data = songList;
    $('#songList').jstree(true).refresh();

    $('#listaDePastas > a').click(function(){
      console.log("Tentou criar música");

      var pastaSelecionada = parseInt($(this).attr("data-id"));

      if(imagens.length > 0) pastaSelecionada--;
      if(avisos.length > 0) pastaSelecionada--;

      dados[pastaSelecionada].songs.push({title: "", content: ""});
      
      lastAdded = dados[pastaSelecionada].songs.length - 1;  

      if(imagens.length > 0) pastaSelecionada++;
      if(avisos.length > 0) pastaSelecionada++;

      ref_selected = pastaSelecionada+"_"+lastAdded;

      atualizaListasFromJSON(dados);
      markLibraryDirty();

      $('#guias a[href="#edit"]').tab('show');     

    });

    reloadProjectionList();
}

function reloadProjectionList(opts){
  opts = opts || {};
  var doGenerate = opts.generate !== false;
  var doSync = opts.sync !== false && !applyingRemotePlaylist;

  if (!applyingRemotePlaylist && opts.fromShared !== true) {
    // Callers that only mutate sharedPlaylist already derived; keep in sync
    deriveProjecaoFromShared();
  }

  if(projecao.length == 0){
    $("#no-projection-msg").show();
  } else {
    $("#no-projection-msg").hide();
  }
  $("#projections tbody").html("");
  $.each(projecao, function(i, item) {
    if(item.type == "s") {
      var songTitle = 'Louvor';
      try {
        if (dados[item.folderId] && dados[item.folderId].songs && dados[item.folderId].songs[item.id]) {
          songTitle = dados[item.folderId].songs[item.id].title;
        }
      } catch (e) {}
      $('#projections tbody').append('<tr data-id="'+i+'"><td>'+escapeProjectionLabel(songTitle)+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>');
    } else if(item.type == "b") {
      var label = (typeof bible !== 'undefined' && bible && bible[item.b])
        ? (bible[item.b].name+" "+(item.c+1)+":"+(item.from+1) + (item.from < item.to ? "-" + (item.to+1) : ""))
        : ("Bíblia " + (item.b + 1) + ":" + (item.c + 1));
      $('#projections tbody').append('<tr data-id="'+i+'"><td>'+escapeProjectionLabel(label)+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>');
    } else if(item.type == "i") {
      var imagem = imagens[item.id];
      var imgLabel = (imagem && imagem.name) || ('Imagem ' + item.id);
      $('#projections tbody').append('<tr data-id="'+i+'"><td><i class="fas fa-image"></i>&nbsp;'+escapeProjectionLabel(imgLabel)+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>');
    } else if(item.type == "w") {
      var aviso = avisos[item.id];
      var warnLabel = (aviso && aviso.name) || ('Aviso ' + item.id);
      $('#projections tbody').append('<tr data-id="'+i+'"><td><i class="fas fa-exclamation-triangle"></i>&nbsp;'+escapeProjectionLabel(warnLabel)+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>');
    } else {
      var remoteTitle = item.title || item.name || (item.song && (item.song.name || item.song.title)) || item.type || 'Item';
      var icon = item.type === 'video' ? 'fa-video' : item.type === 'deck' ? 'fa-images' : 'fa-mobile-alt';
      $('#projections tbody').append(
        '<tr data-id="'+i+'"><td><i class="fas '+icon+'"></i>&nbsp;'+escapeProjectionLabel(remoteTitle)+
        ' <small class="text-muted">(compartilhado)</small></td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>'
      );
    }
  });
  $(".btn-x").off('click').click(function(){
    var id = parseInt($(this).closest('tr').attr("data-id"), 10);
    if (isNaN(id)) return;
    playlistReadyToSync = true;
    sharedPlaylist.splice(id, 1);
    deriveProjecaoFromShared();
    reloadProjectionList({ generate: true, sync: true, fromShared: true });
  });
  $("#projections tbody tr td:first-child").off('click').click(function(){
      var goto = parseInt($(this).attr("data-goto"));
      if (isNaN(goto)) return;
      projecaoAtiva = goto;
      mudaProjecaoAtiva();
  });
  if (doGenerate) {
    generateLiveList();
  }
  if (doSync) {
    scheduleSyncDesktopPlaylist();
  }
}

$("#btnAbrirConf").click(function(){   
    $('#confModal').modal('toggle');
});


$("#deleteFromTree").click(function(){
  var selecionado = $.jstree.reference('#songList').get_node($.jstree.reference('#songList').get_selected());
    if(selecionado.parent == "#"){
      $('#excluirModal').find('.modal-body p').html(TRANSLATIONS[config.lang]['delFolder_msg_start']+"<strong>"+selecionado.text+"</strong>"+TRANSLATIONS[config.lang]['delFolder_msg_end']);
    } else {
      $('#excluirModal').find('.modal-body p').html(TRANSLATIONS[config.lang]['delSong_msg_start']+"<strong>"+selecionado.text+"</strong> ?");
    }    
    $('#excluirModal').modal('toggle');
});

$("#newFolder").click(function(){   
    $('#makeFolderModal').modal('toggle');
    $('#folderName').val("");
});


$("#confirmMakeFolder").click(function(){   
    var name = $('#folderName').val();
    var lang = $('#selectLangFolder').val();
    console.log("tentou criar pasta com o nome: "+name+"na lingua: "+lang);
    dados.push({name: name, type: "s", lang: lang, songs: []});
    atualizaListasFromJSON(dados);
    markLibraryDirty();
    $('#makeFolderModal').modal('toggle');
});


$("#confirmDeleteFromTree").click(function(){
  var selecionado = $.jstree.reference('#songList').get_node($.jstree.reference('#songList').get_selected());
    if(selecionado.parent == "#"){
      var firstItem = $.jstree.reference('#songList').get_node(selecionado.children[0]);
      console.log(firstItem.type);
      if(firstItem.type == "song") {        
        var folderDelId = parseInt(selecionado.id);
        if(avisos.length > 0) folderDelId--;
        if(imagens.length > 0) folderDelId--;
        dados.splice(folderDelId, 1);
      }
    } else {
      console.log(selecionado);
      if(selecionado.type == "song"){
        dados[pastaAtiva].songs.splice(louvorAtivo, 1);
      }      
      if(selecionado.type == "image"){
        var idImage = selecionado.id.split("_")[1];
        imagens.splice(idImage, 1);
      }
      if(selecionado.type == "warning"){
        var idWarning = selecionado.id.split("_")[1];
        avisos.splice(idWarning, 1);
      }
      ref_selected = "0_0";
    }
    localStorage.setItem('warnings', JSON.stringify(avisos));
    localStorage.setItem('data', JSON.stringify(dados));
    atualizaListasFromJSON(dados);    
    if (dados[0] && dados[0].songs && dados[0].songs[0]) {
      $('#title').val(dados[0].songs[0].title);    
      $('#content').val(dados[0].songs[0].content);
    }
    markLibraryDirty();
    $('#excluirModal').modal('toggle');   
});

$("#save").click(function(){
  dados[pastaAtiva].songs[louvorAtivo].title = $("#title").val();
  dados[pastaAtiva].songs[louvorAtivo].content = $("#content").val();
  ref_selected = pastaAtiva+"_"+louvorAtivo;
  atualizaListasFromJSON(dados);
  localStorage.setItem('data', JSON.stringify(dados));
  markLibraryDirty();
  if (libraryServerMode) {
    saveLibraryToServer().catch(function () {});
  } else {
    $("#msgSave").show();
  }
});

$("#btnSaveLibraryServer").click(function () {
  // Persist current edit fields first
  if (dados[pastaAtiva] && dados[pastaAtiva].songs && dados[pastaAtiva].songs[louvorAtivo]) {
    dados[pastaAtiva].songs[louvorAtivo].title = $("#title").val();
    dados[pastaAtiva].songs[louvorAtivo].content = $("#content").val();
  }
  saveLibraryToServer().catch(function () {});
});

$("#btnUseServerLibrary").click(function () {
  if (_pendingServerLibrary) {
    applyLibraryFromObject(_pendingServerLibrary.library, {
      version: _pendingServerLibrary.version,
      dirty: false,
    });
  }
  $('#libraryMigrateModal').modal('hide');
});

$("#btnUploadLocalLibrary").click(function () {
  if (!_pendingLocalLibrary) {
    $('#libraryMigrateModal').modal('hide');
    return;
  }
  applyLibraryFromObject(_pendingLocalLibrary, {
    version: _pendingServerLibrary ? _pendingServerLibrary.version : libraryVersion,
    dirty: true,
  });
  $('#libraryMigrateModal').modal('hide');
  saveLibraryToServer().catch(function () {});
});

$("#export").click(function(){
  console.log("Tentou exportar");
  // downloadObjectAsJson(louvores, "data");
  $("<a />", {
    "download": "data.json",
    "href" : "data:application/json," + encodeURIComponent(JSON.stringify(dados))
  }).appendTo("body")
  .click(function() {
     $(this).remove()
  })[0].click()  
});

$("#import").click(function(){
  console.log("Tentou importar");  
  $('#importModal').modal('toggle');
});

$("#fileImport").change(function() {
    var file = this.files[0];
    var reader = new FileReader();

    reader.onload = function(event) {
      var contents = event.target.result;
      atualizaListaArquivos(contents);
      if (libraryServerMode) markLibraryDirty();
    }

    // when the file is read it triggers the onload event above.
    reader.readAsText(file);    
    $('#importModal').modal('toggle')
});

$("#btnCreateWarn").click(function(){
  console.log("Tentou criar aviso");  
   $('#newWarningModal').find('.modal-body').css({
        width:'auto', //probably not needed
        height:'auto', //probably not needed 
        'max-height':'100%'
   });
  $('#newWarningModal').modal('toggle');
});

$("#confirmCreateWarning").click(function(){   
    var name = $('#warningName').val();
    var title = $('.warning-title').html();
    var body = $('.warning-body').html();
    var content = {title: title, body: body};

    avisos.push({name: name, warning: {content: content, type: "regular"}});
    localStorage.setItem('warnings', JSON.stringify(avisos));
    atualizaListasFromJSON(dados);

    $('#newWarningModal').modal('toggle');
});

$("#btnLaunchView").click(function(){
  console.log("Tentou abrir tela de projeção");  
  startProjection();  
});

$("#newImage").click(function(){
  console.log("Tentou criar nova imagem");  
  $('#newImageModal').modal('toggle');
});

$("#confirmCreateImage").click(function(){   
    var name = $('#imageName').val();
    var file = $("#fileimage").prop('files')[0];
    if (file) {
      var reader = new FileReader();

      reader.onload = function(e) {
        var base64 = e.target.result;
        imagens.push({name: name, image: base64});
        atualizaListasFromJSON(dados);
      }

      reader.readAsDataURL(file);
    }
    
    $('#newImageModal').modal('toggle');
});

$("#search").on("keyup", function() {
    var value = $(this).val();

    // Hide all table tbody rows
    $('#songs tbody tr').hide();

    // Searching text in columns and show match row
    $('#songs tbody tr td:contains("'+value+'")').each(function(){
     $(this).closest('tr').show();
    });  
});

// Case-insensitive searching (Note - remove the below script for Case sensitive search )
$.expr[":"].contains = $.expr.createPseudo(function(arg) {
 return function( elem ) {
  return $(elem).text().toUpperCase().indexOf(arg.toUpperCase()) >= 0;
 };
});

// Gerar lista ao vivo
function generateLiveList(){  
  var telaPadraoPainel = '<td>'+TRANSLATIONS[config.lang]['default_screen']+'</td><td></td>';
  $("#livesongs tbody").html("");      
  $('#livesongs tbody').append('<tr data-id="0">'+telaPadraoPainel+'</tr>');
  viewSlides="<section"+getBackgroundForSection(1)+telaPadrao;
  var f = 1;
  $.each(projecao, function(i, item) { 
    if(item.type == "s"){
      if (!dados[item.folderId] || !dados[item.folderId].songs || !dados[item.folderId].songs[item.id]) {
        return;
      }
      var lang = "-"+dados[item.folderId].lang;
      if(lang == '-pt'){
        lang = "";
      }
      var parsed = dados[item.folderId].songs[item.id].content.split('\n\n');
      $.each(parsed, function(j, estrofe) {        
        var estrofeEsp = estrofe.replace(/\n/g,"<br>");
        $('#livesongs tbody').append('<tr data-id="'+f+'"><td>'+dados[item.folderId].songs[item.id].title+'</td><td>'+estrofeEsp+'</td></tr>');
        // viewSlides+="<section data-background-transition=\"fade\" data-background=\"imagens/fundo.jpg\">\n<h2>"+estrofeEsp+"</h2>\n</section>\n";
        var fimState = "";
        var fimStyle = "";
        if(j+1 == parsed.length){
          fimState = " showfim";
          fimStyle = "<style>.showfim footer{ display: block; }</style>\n"         
        }       
        if(j == 0){
          if(dados[item.folderId].songs[item.id].title.length > 32){
            var titulodividido = dados[item.folderId].songs[item.id].title.split(" ");
            var indexDivision = Math.round(titulodividido.length/2);
            var nome = dados[item.folderId].songs[item.id].title.replace(titulodividido[indexDivision],titulodividido[indexDivision]+"<br>");
            viewSlides+="<section"+getBackgroundForSection(2)+" data-state=\"showtitle"+item.folderId+"_"+item.id+fimState+"\">\n<style>\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+" #titulo:before { content: \""+nome.split("<br>")[0]+"\"; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+" #titulo:after { content: \""+nome.split("<br>")[1]+"\"; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+"{ display: table; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+" #titulo{ display: table; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+" #logo{ display: table; }</style>\n"+fimStyle;              
          }else{
            viewSlides+="<section"+getBackgroundForSection(2)+" data-state=\"showtitle"+item.folderId+"_"+item.id+fimState+"\">\n<style>\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle"+lang+" #titulo:after { content: \""+dados[item.folderId].songs[item.id].title+"\"; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle"+lang+"{ display: table; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle"+lang+" #logo{ display: table; }</style>\n"+fimStyle;
          } 
          $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
        } else {
          viewSlides+="<section"+getBackgroundForSection(2)+" data-state=\"showlogo"+item.folderId+"_"+item.id+"_"+j+fimState+"\" data-background-transition=\"none\">\n<style>\n.showlogo"+item.folderId+"_"+item.id+"_"+j+" header.whitelogo"+lang+"{ display: block; }\n.showlogo"+item.folderId+"_"+item.id+"_"+j+" header.whitelogo"+lang+" #logo{ display: block; }</style>\n"+fimStyle;
        }
        viewSlides+=estrofeEsp+"\n</section>\n";
        
        f++;
      });
      $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
      f++;
      viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao;
    }
    if(item.type == "b"){
      if (!bible || !bible[item.b]) {
        if (typeof ensureBibleScripts === "function") ensureBibleScripts(function () { reloadProjectionList(); });
        return;
      }
      $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
      for (var i = item.from; i <= item.to; i++) {
        var label = bible[item.b].name+" "+(item.c+1)+":"+(i+1);
        var scripture = bible[item.b].chapters[item.c][i];
        var refverse = "b"+item.b+"c"+item.c+"v"+i;
        $('#livesongs tbody').append('<tr data-id="'+f+'"><td>'+label+'</td><td>'+scripture+'</td></tr>');
        viewSlides+="<section"+getBackgroundForSection(3)+" data-state=\"scriptures "+refverse+"\" data-background-transition=\"none\">\n<style>\n."+refverse+" footer.scripturetitle small:after{ content: \""+label+"\"; }\n."+refverse+" footer.scripturetitle{ display: block; }\n</style>\n<p>"+scripture+"</p>\n</section>\n";
        f++;
      }
      $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
      f++;
      viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao;      
    }
    if(item.type == "i"){
      var imagem = imagens[item.id];
      $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
      $('#livesongs tbody').append('<tr data-id="'+f+'"><td><i class="fas fa-image"></i>&nbsp;'+imagem.name+'</td><td><img class="responsive-img" src='+imagem.image+'></td></tr>');
      viewSlides+="<section data-background=\"#000000\">\n<img src="+imagem.image+">\n</section>\n";
      f++;
      $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
      f++;
      viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao;      
    }
    if(item.type == "w"){
      var aviso = avisos[item.id];
      $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
      $('#livesongs tbody').append('<tr data-id="'+f+'"><td><i class="fas fa-exclamation-triangle"></i>&nbsp;'+aviso.name+'</td><td><strong>'+aviso.warning.content.title+'</strong><br>'+aviso.warning.content.body+'</td></tr>');
      viewSlides+="<section data-background=\"imagens/madeira_bg.jpg\">\n<table class=\"reveal warning-table\">\n<tr height=\"10vh\">\n<td class=\"warning-title\" width=\"80%\">"+aviso.warning.content.title+"</td>\n<td width=\"20%\"><div id=\"fancypart\" class=\"warning-logo\"><i class=\""+TRANSLATIONS[config.lang]['logo_icon']+"\"></i></div></td>\n</tr>\n<tr>\n<td colspan=\"2\">\n<div style=\"display: table;\">\n<div class=\"warning-body\">"+aviso.warning.content.body+"</div>\n</div>\n</td>\n</tr>\n</table>\n</section>\n";
      f++;
      $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
      f++;
      viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao;      
    }
  });

  $('#livesongs > tbody > tr').click(function() {    
    $( this ).parent().find( 'tr.active' ).removeClass( 'active' );
    $( this ).addClass( 'active' );
    projecaoAtiva = parseInt($(this).attr("data-id"));
    mudaSlide();
  });

  projecaoAtiva = 0;
  mudaProjecaoAtiva();

  updateViewSlides();
}

function mudaProjecaoAtiva(){
  $('#livesongs > tbody > tr.active').removeClass( 'active' );
  var $row = $('#livesongs > tbody > tr[data-id="'+projecaoAtiva+'"]');
  $row.addClass( 'active' );
  try {
    if ($row.length && $row.offset() && $('#scrollblock').offset()) {
      $('#scrollblock').scrollTop(
          $row.offset().top - $('#scrollblock').offset().top + $('#scrollblock').scrollTop()
      );
    }
  } catch (e) {}
  mudaSlide();
}

function postToProjectionViews(fn, data) {
  var payload = JSON.stringify({
    host: 'projection-html5',
    function: fn,
    url: window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search,
    data: data
  });
  try {
    if (typeof windowView !== 'undefined' && windowView && !windowView.closed) {
      windowView.postMessage(payload, '*');
    }
  } catch (e) {}
  try {
    var iframe = document.getElementById('iframeProjection');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(payload, '*');
    } else if (iframeView) {
      iframeView.postMessage(payload, '*');
    }
  } catch (e) {}
}

function sendProjectionNet(fn, data) {
  ensureDesktopControl(function () {
    var t = window.projectionNet;
    if (!t || typeof t.send !== 'function') return;
    t.send(fn, data);
  });
  return true;
}

function updateViewSlides(){
  postToProjectionViews('reloadReveal', viewSlides);
  ensureDesktopControl(function () {
    var t = window.projectionNet;
    if (!t || typeof t.send !== 'function') {
      lastReloadRevealOk = false;
      updateDesktopControlStatus();
      return;
    }
    var ok = t.send('reloadReveal', viewSlides);
    lastReloadRevealOk = !!ok;
    if (ok) {
      t.send('hidePairing', true);
    }
    updateDesktopControlStatus();
  });
}

function mudaSlide(){
  postToProjectionViews('changeSlide', projecaoAtiva);
  ensureDesktopControl(function () {
    var t = window.projectionNet;
    if (!t || typeof t.send !== 'function') return;
    t.send('changeSlide', projecaoAtiva);
  });
}

$(document).on('keydown', function(e) {
    var rows = $('#livesongs > tbody > tr');
    var tag = e.target.tagName.toLowerCase();
    var tabName = $('#guias a[aria-selected="true"]').attr('aria-controls');
    
    if (tabName == "live" && tag != "input" && tag != "textarea" && tag != "a"){
       switch(e.keyCode) {
          case 37: // left
          {
            if(projecaoAtiva > 0){
              projecaoAtiva--;
              mudaProjecaoAtiva();
            }           
            break;
          }          
          break;

          case 38: // up
          {
            if(projecaoAtiva > 0){
              projecaoAtiva--;
              mudaProjecaoAtiva();
            }           
            break;
          }
          case 39: // right
          {
            if(rows.length > projecaoAtiva + 1){
              projecaoAtiva++;
              mudaProjecaoAtiva();
            }          
            break;  
          }          
          break;

          case 40: // down
          {
            if(rows.length > projecaoAtiva + 1){
              projecaoAtiva++;
              mudaProjecaoAtiva();
            }          
            break;  
          }
          case 27: // esc
          {            
            projecaoAtiva = 0;
            mudaProjecaoAtiva();
            break;  
          }
          default: return; // exit this handler for other keys
      }

      e.preventDefault(); // prevent the default action (scroll / move caret)     
    }

    if ((e.ctrlKey || e.metaKey) && tabName == "edit") {
        switch (String.fromCharCode(e.which).toLowerCase()) {
        case 's':
            e.preventDefault();
            $("#save").click()
            // alert('ctrl-s');
            break;
        }
    }

});

$(window).keypress(function(event) {
    // var tag = e.target.tagName.toLowerCase();
    // if(tag == "textarea"){
      if (!(event.which == 115 && event.ctrlKey) && !(event.which == 19)) return true;
      alert("Ctrl-S pressed");
      event.preventDefault();
      return false;
    // }    
});

// Inicia a projeção (nova janela / foco). Não chamar no boot — pop-up é bloqueado sem clique do usuário.
function startProjection() {
  try {
    if (windowView && !windowView.closed) {
      try {
        windowView.focus();
      } catch (e) {}
      updateViewSlides();
      mudaSlide();
      return windowView;
    }
  } catch (e) {
    windowView = undefined;
  }

  windowView = window.open('view.html', 'projectionView');
  if (!windowView) {
    alert(
      'O navegador bloqueou a janela de projeção.\n' +
        'Permita pop-ups para este site ou abra manualmente:\n' +
        location.origin +
        '/view.html'
    );
    return null;
  }

  // A view avisa "opened"; reforça slides após o WebSocket conectar
  setTimeout(function () {
    updateViewSlides();
    mudaSlide();
  }, 600);
  setTimeout(function () {
    updateViewSlides();
    mudaSlide();
  }, 1500);
  return windowView;
}
$('#startProjection').click(function(){
  startProjection();
});

$('#rplYI').click(function(){
  $('#content')
    .selection('insert', {text: '<font color="yellow"><i>', mode: 'before'})
    .selection('insert', {text: '</i></font>', mode: 'after'});
});

$('#rplBis').click(function(){
  $('#content')
    .selection('insert', {text: '<blockquote class="chave-bis">', mode: 'before'})
    .selection('insert', {text: '</blockquote>', mode: 'after'});
});

$('#rplBis-small').click(function(){
  $('#content')
    .selection('insert', {text: '<blockquote class="chave-bis-small">', mode: 'before'})
    .selection('insert', {text: '</blockquote>', mode: 'after'});
});

$('.rplanyx').click(function(){
  var times = $(this).attr("data-times");
  $('#content')
    .selection('insert', {text: '<blockquote class="chave-'+times+'">', mode: 'before'})
    .selection('insert', {text: '</blockquote>', mode: 'after'});
});

// $('#rpl2x').click(function(){
//   $('#content')
//     .selection('insert', {text: '<blockquote class="chave-2x">', mode: 'before'})
//     .selection('insert', {text: '</blockquote>', mode: 'after'});
// });

$("#msgSave").hide();

$(function () { 
  $('#songList').jstree({ 'core' : {
      'data' : []
  },
  "types" : {
      "default" : {
        "icon" : "fas fa-folder fa-fw pt-2"
      },
      'f-open' : {
          'icon' : 'fas fa-folder-open fa-fw pt-2'
      },
      'f-closed' : {
          'icon' : 'fas fa-folder fa-fw pt-2'
      },
      'f-open1' : {
          'icon' : 'fas fa-images fa-fw pt-2'
      },
      'f-closed1' : {
          'icon' : 'fas fa-images fa-fw pt-2'
      },
      'f-open2' : {
          'icon' : 'fas fa-clipboard fa-fw pt-2'
      },
      'f-closed2' : {
          'icon' : 'fas fa-clipboard fa-fw pt-2'
      },
      "song" : {
        "icon" : "fas fa-file-alt fa-fw pt-2"
      },
      "image" : {
        "icon" : "fas fa-file-image fa-fw pt-2"
      },
      "warning" : {
        "icon" : "fas fa-exclamation-triangle fa-fw pt-2"
      }
    },
  "search":{
    "show_only_matches" : true,
    search_callback : function (str, node) {
      if(node.data != null && node.type == "song" && /^\d+$/.test(str) === false){
        return node.text.toUpperCase().includes(str.toUpperCase()) || node.data.content.toUpperCase().includes(str.toUpperCase());
      } else {        
        return node.text.toUpperCase().includes(str.toUpperCase());  
      }
    }    
  },
  "plugins" : [ "search", "types" ]
   });

  var to = false;
  $('#treesearch').keyup(function () {
    if(to) { clearTimeout(to); }
    to = setTimeout(function () {
      var v = $('#treesearch').val();
      $('#songList').jstree(true).search(v);
    }, 250);
  });

  /* Toggle between folder open and folder closed */
  $("#songList").on('open_node.jstree', function (event, data) {
      if(data.node.text == TRANSLATIONS['en']['warnings'] || data.node.text == TRANSLATIONS['pt-br']['warnings'] || data.node.text == TRANSLATIONS['it']['warnings']){
         data.instance.set_type(data.node,'f-open2');
      } else if(data.node.text == TRANSLATIONS['en']['images'] || data.node.text == TRANSLATIONS['pt-br']['images'] || data.node.text == TRANSLATIONS['it']['images']){
         data.instance.set_type(data.node,'f-open1');
      } else {
        data.instance.set_type(data.node,'f-open');
      }      
  });
  $("#songList").on('close_node.jstree', function (event, data) {      
      if(data.node.text == TRANSLATIONS['en']['warnings'] || data.node.text == TRANSLATIONS['pt-br']['warnings'] || data.node.text == TRANSLATIONS['it']['warnings']){
         data.instance.set_type(data.node,'f-closed2');
      } else if(data.node.text == TRANSLATIONS['en']['images'] || data.node.text == TRANSLATIONS['pt-br']['images'] || data.node.text == TRANSLATIONS['it']['images']){
         data.instance.set_type(data.node,'f-closed1');
      } else {
        data.instance.set_type(data.node,'f-closed');
      }
  });

  $('#songList').on("changed.jstree", function (e, data) {
    if(data.node != undefined && data.node != null && data.node.data != null && data.node.type == 'song'){
        louvor = data.node.data;        
        pastaAtiva = parseInt(data.node.id.split("_")[0]);        
        louvorAtivo = parseInt(data.node.id.split("_")[1]);

        if(avisos.length > 0){
          pastaAtiva--;
        }
        if(imagens.length > 0){
          pastaAtiva--;
        }
        // ref_selected = pastaAtiva+"_"+louvorAtivo;

        $('#title').val(louvor.title);    
        $('#content').val(louvor.content);
    }
  });

  $('#songList').bind("dblclick.jstree", function (e) {
      var instance = $.jstree.reference(this),
      node = instance.get_node(e.target);
     // Do my action
     if(node.data != null && node.type == 'song'){
      addDesktopProjectionItem({ id: louvorAtivo, folderId: pastaAtiva, type: "s" });
     }

     if(node.data != null && node.type == 'image'){
      var idImage = node.id.split("_")[1];
      addDesktopProjectionItem({ id: idImage, type: "i" });
     }

     if(node.data != null && node.type == 'warning'){
      var idWarning = node.id.split("_")[1];
      addDesktopProjectionItem({ id: idWarning, type: "w" });
     }
  });

  $('#songList').bind('refresh.jstree', function(e, data) {
        $('#songList').jstree(true).deselect_all();        
        $('#songList').jstree(true).select_node(ref_selected);
        var nodeEl = $("#songList #"+ref_selected)[0];
        if (nodeEl && nodeEl.scrollIntoView) nodeEl.scrollIntoView();
  })

  $("#btnAbout").click(function(){
    var title = '<i class="fas fa-info-circle"></i>&nbsp;'+TRANSLATIONS[config.lang]['btn_about']['title'];
    $('#modalNotImplemented > .modal-dialog > .modal-content > .modal-header > h5').html(title);
    $('#modalNotImplemented > .modal-dialog > .modal-content > .modal-body').html('<p><strong>Desenvolvido por:</strong> Ítalo Carvalho Zaina</p><p><strong>Revisores:</strong></p><ul><li>Ítalo</li><li>Sinvaldo</li><li>Geff</li></ul><h5>Contatos</h5><p><strong><i class="fas fa-envelope"></i></strong> <a href="MAILTO:italoczaina@gmail.com">italoczaina@gmail.com</a></p><p><strong><i class="fab fa-skype"></i></strong> <a href="skype:italozo?chat">italozo</a></p>');
    $('#modalNotImplemented').modal('toggle');
  });

  // Boot depois do jstree — evita corrida com DOMContentLoaded que quebrava a lista/projeção
  bootPainel();
});

function defaultConfigurations(){
  if(localStorage.getItem("settings") === null){  
    configuracoes = {
      images: [
        {file: "fundo.jpg"},
        {file: "campo-uva.jpg"},
        {file: "madeira_bg.jpg"}
      ],
      themes: [
               {id: 1, name: "Padrão Azul", file: "icm"},
               {id: 2, name: "Santa Ceia", file: "ceia"}
              ],
      active_theme: 1,
      backgrounds: [
        {
          id: 1, // 1 - Tela Padrão
          type: 1, // 1 - Imagem de fundo
          color: "#000000",
          image_file: "fundo.jpg"
        },
        {
          id: 2, // 2 - Tela Louvor
          type: 1, // 1 - Imagem de fundo
          color: "#000000",
          image_file: "fundo.jpg"
        },
        {
          id: 3, // 3 - Tela Bíblia
          type: 2, // 2 - Cor de fundo
          color: "#000000",
          image_file: "madeira_bg.jpg"
        }
      ],
      fontSize: 2
    };    
    localStorage.setItem('settings', JSON.stringify(configuracoes));
  } else {
    configuracoes = JSON.parse(localStorage.getItem("settings"));
  }

  var selectTheme = $("#selectTheme");
  configuracoes.themes.forEach(function (theme){
    var option = new Option(theme.name, theme.id); 
    selectTheme.append($(option));
  });

  // Font size
  $('#fontSizeRange').val(configuracoes.fontSize);
  $('#currentFontSize').text(configuracoes.fontSize);
  atualizaFontSizeText();
  changeFontSize();

  // Atualiza background config
  configuracoes.backgrounds.forEach(function (bg){
    if(bg.type == 1){
      $("#image_"+bg.id).show();
      $("#color_"+bg.id).hide();
    } else{
      $("#image_"+bg.id).hide();
      $("#color_"+bg.id).show();
    }
    $("#image_"+bg.id).css("background", "url('imagens/"+bg.image_file+"')");
    $("#color_"+bg.id).val(bg.color);
  });

  generateLiveList();
}

$("#selectTheme").change(function() {
  var selectedTheme = $(this).val(); 
  configuracoes.active_theme = selectedTheme;
  changeThemeImages();
  changeTheme();
  localStorage.setItem('settings', JSON.stringify(configuracoes));
});

$('#confirmConf').click(function (){
  $('#confModal').modal('toggle');
});

function changeTheme(){
  configuracoes.themes.forEach(function (theme){
    if (theme.id == configuracoes.active_theme) {
      postToProjectionViews('changeTheme', theme.file);
      sendProjectionNet('changeTheme', theme.file);
      generateLiveList();      
    }
  });  
}

function changeThemeImages(){
  // Trocar fundo e texto
  var old1 = getBackground(1);
  var imagem = configuracoes.images[1].file;
  // Se tema padrão
  if(configuracoes.active_theme == 1){              
    imagem = configuracoes.images[0].file;
    // $("#activeTextStandartScr").click(); //Still bug
  } else if(configuracoes.active_theme == 2){ // Se tema santa ceia
    imagem = configuracoes.images[1].file;
    // $("#activeTextStandartScr2").click(); //Still bug
  }
  setBackground(1,1,old1.color, imagem);
  $("#image_1").css("background", "url('imagens/"+imagem+"')");
}

function changeFontSize(){
  postToProjectionViews('changeFontSize', configuracoes.fontSize);
  sendProjectionNet('changeFontSize', configuracoes.fontSize);
}

$('#fontSizeRange').on('input change', function () {
    var size = parseFloat($(this).val());    
    configuracoes.fontSize = size;    
    $('#currentFontSize').text(configuracoes.fontSize);
    atualizaFontSizeText();
    changeFontSize();
    localStorage.setItem('settings', JSON.stringify(configuracoes));
});

function atualizaFontSizeText(){
  if(configuracoes.fontSize == 1) $('#currentFontSize').text($('#currentFontSize').text()+" - Menor");
  if(configuracoes.fontSize == 2) $('#currentFontSize').text($('#currentFontSize').text()+" - Normal");
  if(configuracoes.fontSize == 4) $('#currentFontSize').text($('#currentFontSize').text()+" - Maior");
}

$("#activeTextStandartScr").click(function(e) {
    if($(this).is(':checked')){
      $("#activeTextStandartScr2").prop('checked', false);
     telaPadrao = ">\n<h1>"+TRANSLATIONS[config.lang]['maranata_title']+"</h1>\n<h3>"+TRANSLATIONS[config.lang]['maranata_slogan']+"</h3>\n</section>\n";
    }
    else
      telaPadrao = ">\n</section>\n";
    generateLiveList();
});

$("#activeTextStandartScr2").click(function(e) {      
    if($(this).is(':checked')){
     $("#activeTextStandartScr").prop('checked', false);
     telaPadrao = " data-state=\"show_backlay1\"><style>\n.show_backlay1 header.backlay1-"+config.lang+" .backlay_1-"+config.lang+"{display: block}\n</style>\n<h1>Santa Ceia</h1><br>\n</section>\n";
    }
    else
      telaPadrao = ">\n</section>\n";
    generateLiveList();
});

$('input[type=radio][name=imgColor_1]').change(function() {  
  var old = getBackground(1);
  if(this.value == 1){    
    $("#image_1").show();
    $("#color_1").hide();
    setBackground(1,1,old.color, old.image_file);
  } else {
    $("#image_1").hide();
    $("#color_1").show();
    setBackground(1,2,old.color, old.image_file);
  }
  generateLiveList();
});

$('input[type=radio][name=imgColor_2]').change(function() { 
  var old = getBackground(2); 
  if(this.value == 1){    
    $("#image_2").show();
    $("#color_2").hide();
    setBackground(2,1,old.color, old.image_file);
  } else {
    $("#image_2").hide();
    $("#color_2").show();
    setBackground(2,2,old.color, old.image_file);
  }
  generateLiveList();
});

$('input[type=radio][name=imgColor_3]').change(function() {  
  var old = getBackground(3); 
  if(this.value == 1){    
    $("#image_3").show();
    $("#color_3").hide();
    setBackground(3,1,old.color, old.image_file);
  } else {
    $("#image_3").hide();
    $("#color_3").show();
    setBackground(3,2,old.color, old.image_file);
  }
  generateLiveList();
});

// Cria botoes de imagem ao abrir o modal
$('#selectImageModal').on('show.bs.modal', function (e) {
  reloadListOfImages();
});

function reloadListOfImages(){
  $('#images').html("");
  configuracoes.images.forEach(function (imagem){
    $('#images').append('<div style="background: url(\'imagens/'+imagem.file+'\');" data-file="'+imagem.file+'"></div>');
  });

  $("div#images > div").click(function (){
    var tipo = parseInt($("div#images").attr("data-type"));
    var old = getBackground(tipo);
    var file = $(this).attr("data-file");
    setBackground(tipo,1,old.color, file);
    $("#image_"+tipo).css("background", "url('imagens/"+file+"')");
    generateLiveList();
    $('#selectImageModal').modal('toggle');
  });
}

$('.image-select').click(function() {
  var valor_id = $(this).attr('id')[$(this).attr('id').length - 1];
  $("div#images").attr("data-type", valor_id);
  $('#selectImageModal').modal('toggle');
});

function getBackgroundForSection(id){
  var resp = "";
  configuracoes.backgrounds.forEach(function (bg){    
    if(bg.id == id){         
      if(bg.type == 1){        
        resp = " data-background=\"imagens/"+bg.image_file+"\"";
      } else{
        resp = " data-background=\""+bg.color+"\"";
      }
    }         
  });
  return resp;
}

function getBackground(id){
  var oldbg = {};
  configuracoes.backgrounds.forEach(function (bg){    
    if(bg.id == id){ 
      oldbg = bg;
    }     
  });
  return oldbg;
}

function setBackground(id, tipo, cor, arquivo){
  configuracoes.backgrounds.forEach(function (bg){    
    if(bg.id == id){ 
      bg.type = tipo;
      bg.color = cor;
      bg.image_file = arquivo;
    }     
  });
  localStorage.setItem('settings', JSON.stringify(configuracoes));
}

$('input[type="color"]').change(function (){
  var tipo = parseInt($(this).attr("id").split("_")[1]);
  var old = getBackground(tipo);
  var color = $(this).val();
  setBackground(tipo,2,color, old.file);
  generateLiveList();
});

$('#addNewImage').click(function(){
    var filename = $('#imagesToAdd')[0].files[0].name;
    configuracoes.images.push({file: filename});
    localStorage.setItem('settings', JSON.stringify(configuracoes));
    reloadListOfImages();
    $('#imagesToAdd').val('');
});

function hideLoadingOverlay() {
  var el = document.getElementById("loading");
  if (el) el.style.display = "none";
}

function bootPainel() {
  if (window.__painelBooted) return;
  window.__painelBooted = true;
  try {
    defaultConfigurations();
    carregaLouvores();
    reloadProjectionList();
  } catch (err) {
    console.error("[painel] falha no boot", err);
  } finally {
    hideLoadingOverlay();
  }
}

// Segurança: nunca deixar o overlay eterno (ex.: erro cedo no boot)
setTimeout(hideLoadingOverlay, 8000);

(function(){
    window.addEventListener( 'message', function( event ) { 
        var data = JSON.parse( event.data );         
        if(data.host === 'projection-html5-painel' && data.function === 'opened'){
          recarrega(data.data);
        }
    } );

    function recarrega(data) {
      reloadProjectionList();
      changeFontSize();
      changeTheme();
    }
})()

/** LAN mode: when served over HTTP, also drive remote view via WebSocket */
(function initProjectionNet() {
  if (typeof ProjectionTransport === 'undefined') return;
  if (location.protocol.indexOf('http') !== 0) return;

  function loadSharedPlaylistFromApi() {
    fetch('/api/playlist', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && Array.isArray(data.playlist)) {
          applyRemotePlaylist(data.playlist);
        } else {
          playlistReadyToSync = true;
        }
      })
      .catch(function () {
        playlistReadyToSync = true;
      });
  }

  fetch('/api/pairing')
    .then(function (r) { return r.json(); })
    .then(function (info) {
      var t = new ProjectionTransport({
        role: 'admin',
        name: 'desktop-admin',
        pin: info.pin || '',
      });
      t.on('open', function () {
        console.log('[projectionNet] connected as admin');
        updateDesktopControlStatus();
        loadSharedPlaylistFromApi();
      });
      t.on('close', function () {
        updateDesktopControlStatus();
      });
      t.on('welcome', function (data) {
        if (data && data.youControl) {
          t.youControl = true;
          flushDesktopControlWaiters();
        }
        updateDesktopControlStatus();
      });
      t.on('controlChanged', function (data) {
        if (data && t.clientId && data.controllerId === t.clientId) {
          t.youControl = true;
          flushDesktopControlWaiters();
        } else {
          t.youControl = false;
        }
        updateDesktopControlStatus();
      });
      t.on('stateSnapshot', function (snap) {
        if (snap && Array.isArray(snap.playlist)) {
          applyRemotePlaylist(snap.playlist);
        }
      });
      t.on('playlistUpdate', function (pl) {
        applyRemotePlaylist(pl);
      });
      t.on('error', function (data) {
        if (data && data.code === 'no_control') {
          if (typeof t.takeControl === 'function') t.takeControl();
        }
        if (data && data.code === 'no_control') {
          lastReloadRevealOk = false;
        }
        updateDesktopControlStatus();
      });
      t.connect();
      window.projectionNet = t;
      updateDesktopControlStatus();

      var btn = document.getElementById('btnTakeControlDesktop');
      if (btn) {
        btn.addEventListener('click', function () {
          if (!window.projectionNet) {
            updateDesktopControlStatus();
            return;
          }
          if (!window.projectionNet.connected) {
            updateDesktopControlStatus();
            alert('Desconectado do servidor. Verifique a rede e recarregue o painel.');
            return;
          }
          ensureDesktopControl(function () {
            if (!viewSlides || !String(viewSlides).trim()) {
              generateLiveList();
            }
            updateViewSlides();
            mudaSlide();
            updateDesktopControlStatus();
          });
        });
      }
    })
    .catch(function () {
      updateDesktopControlStatus();
    });
})();

try {
  var ps = new PerfectScrollbar('#scrollblock');
} catch (e) {
  console.warn('[painel] PerfectScrollbar:', e);
}