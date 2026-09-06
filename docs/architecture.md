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

## Segurança na LAN

PIN de sala (opcional). Sem TLS na LAN do hotspot (HTTP). Não expor a porta na internet pública.
