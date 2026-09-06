# SPEC-04 — Vídeo na playlist (arquivos no PC)

## Objetivo

Incluir clips de vídeo (MP4 H.264) na lista de projeção, servidos de `/media`.

## Atores

Controller, view, pasta `media/videos` no Zorin.

## Fluxos

1. Item `type: "video"` na playlist com `src` relativo a `/media/...`.
2. View renderiza `<video>` contain; controller envia `playVideo` / `pauseVideo` / `seekVideo`.
3. Upload opcional via mobile/admin para `media/tmp` ou `media/videos`.

## Critérios de aceite

- [ ] Play/pause/seek refletem no projetor.
- [ ] Formato recomendado documentado (MP4 H.264 + AAC).

## Fora de escopo

YouTube embed (pode ser fase posterior).

## Dependências

SPEC-01, SPEC-02.
