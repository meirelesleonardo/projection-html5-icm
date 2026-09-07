# Arquitetura — Projeção ICM Mobile (LAN)

## Visão geral

O sistema deixa de depender de `window.open` + `postMessage` no mesmo navegador e passa a usar um **relay HTTP + WebSocket** no mini PC (Zorin). Celulares controlam; a `view.html` exibe no projetor.

```
[Android controller(s)] --WS--> [Node server no Zorin] --WS--> [view.html / projetor]
                                      |
                                 /media, /api, data.json
```

## Componentes

| Componente | Caminho | Função |
|------------|---------|--------|
| Servidor | `server/` | HTTP estático, `/ws`, `/api/info`, mídia, biblioteca |
| View | `view.html` | Reveal.js + overlay de pareamento + WS |
| Mobile | `mobile.html` | Painel touch enxuto |
| Transport | `js/transport.js` | Abstrai postMessage (legado) e WebSocket |
| Desktop | `index.html` + `js/core.js` | Edição pesada; pode usar WS em modo rede |

## Roles WebSocket

- `view` — display de projeção (geralmente 1)
- `controller` — celular/painel com comando
- `observer` — só recebe estado (sem enviar comandos de slide)
- `admin` — desktop com edição + controle

## Protocolo de mensagens

Envelope JSON:

```json
{
  "host": "projection-html5",
  "function": "changeSlide",
  "data": 3,
  "clientId": "uuid",
  "role": "controller"
}
```

Funções principais: `hello`, `reloadReveal`, `changeSlide`, `changeTheme`, `changeFontSize`, `clearProjection`, `showLogo`, `showPairing`, `hidePairing`, `stateSnapshot`, `takeControl`, `controlChanged`, `playVideo`, `pauseVideo`, `seekVideo`, `networkInfo`, `webrtc-signal`, `playlistUpdate`.

## Descoberta (hotspot, sem IP fixo)

1. Overlay QR + IP na `view` (`/api/info`)
2. Hostname mDNS `projection-icm.local` (Avahi)
3. Beacon UDP (opcional)
4. Entrada manual + histórico no mobile

## Estado no servidor

O relay guarda o último snapshot: slides HTML, índice, tema, fonte, playlist, quem tem o comando, perfil de display. Novos clientes recebem `stateSnapshot` no `hello`.

### Fila de culto vs slides na tela

| Conceito | Onde vive | API / evento |
|----------|-----------|--------------|
| **Fila do culto** (lista de itens a projetar) | `room.state.playlist` | `GET/POST /api/playlist`, WS `playlistUpdate` |
| **O que está na tela** | `room.state.slidesHtml` + `slideIndex` | WS `reloadReveal` / `changeSlide` |

Desktop (`#projections` / `sharedPlaylist`) e mobile (`state.playlist`) compartilham a mesma fila. O formato canônico é o do mobile (`song`, `bible`, `image`, `warning`, `video`, `deck`, …). O desktop mapeia `s`/`b`/`i`/`w` para esses tipos; itens só-mobile (vídeo/deck) aparecem na lista desktop como linhas informativas e são preservados no round-trip.

A biblioteca de louvores continua em `GET/PUT /api/library` (não confundir com a playlist do culto).

O painel desktop, em modo HTTP, usa `ensureDesktopControl` antes de `reloadReveal`/`hidePairing` (paridade com o mobile), para o projetor e o preview do `index` atualizarem juntos via broadcast WS.

## Biblioteca de louvores (fonte da verdade no servidor)

Em modo LAN (`http(s)://`), o documento oficial é `data/data.json` no mini PC.

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/library` | Lê o array de pastas/songs; headers `X-Library-Version`, `ETag` |
| PUT | `/api/library` | Body `{ version, library }`; exige `X-Room-Pin` (= `roomPin`); gravação atômica + backup |
| GET | `/api/library/backups` | Lista backups (PIN) |

Persistência: [`server/library-store.js`](../server/library-store.js) (tmp → rename), meta em `data/library-meta.json`, backups em `data/backups/` (últimos 5). Validação em [`server/library-validate.js`](../server/library-validate.js). Conflito de versão → **409**.

O desktop (`index.html`) carrega/salva via API. `localStorage.data` é só cache; divergência abre modal de migração. **Exportar** = backup/portabilidade, não o fluxo normal de persistência.

Avisos, imagens do usuário e bíblia **não** fazem parte deste documento (continuam separados).

## Segurança na LAN

PIN de sala (`roomPin` em `server/config.json`): WebSocket `hello` e **escrita** da biblioteca (`X-Room-Pin`). Leitura da biblioteca é aberta na LAN. Preferir HTTPS (`npm run start:https`) para câmera/WebRTC. Não expor a porta na internet pública.
