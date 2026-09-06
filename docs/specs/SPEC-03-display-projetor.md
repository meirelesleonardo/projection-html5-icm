# SPEC-03 — Display e resolução do projetor

## Objetivo

Evitar cortes de texto/imagem/vídeo no projetor do mini PC Zorin.

## Atores

Operador de culto, mini PC, projetor HDMI.

## Fluxos

1. Servidor expõe `displayProfile` (`720p` | `1080p`).
2. `view` aplica largura/altura Reveal e letterbox (`object-fit: contain`).
3. Checklist Zorin: resolução HDMI, kiosk Chrome só na `view`.

## Critérios de aceite

- [ ] Estrofes longas não cortam em 1080p e 720p.
- [ ] Vídeo com letterbox, sem crop indesejado.
- [ ] Doc de instalação descreve kiosk e resolução.

## Fora de escopo

Calibração automática por EDID.

## Dependências

SPEC-06.
