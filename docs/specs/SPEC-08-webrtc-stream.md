# SPEC-08 — Stream de vídeo do celular para o PC

## Objetivo

Transmitir câmera ou arquivo do celular para a `view` via WebRTC, com fallback de upload.

## Fluxos

1. Controller inicia stream; sinalização `webrtc-signal` via WS.
2. View recebe MediaStream e exibe fullscreen contain.
3. Se WebRTC falhar: upload para `/media/tmp` + `playVideo`.

## Critérios de aceite

- [ ] Câmera do Android aparece no projetor na mesma LAN/hotspot.
- [ ] Fallback upload reproduz o arquivo.

## Fora de escopo

Gravação persistente do culto no servidor.
