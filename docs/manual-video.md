# Manual — Vídeos

## Formato recomendado

- Contêiner: **MP4**
- Vídeo: **H.264**
- Áudio: **AAC**
- Resolução alinhada ao projetor (1080p ou 720p)

Outros formatos (WebM, etc.) podem funcionar no Chromium, mas MP4 H.264 é o mais seguro.

## Onde colocar os arquivos

No mini PC, pasta do projeto:

```
media/videos/meu-louvor.mp4
```

O servidor expõe como `/media/videos/meu-louvor.mp4`.

## Pelo celular

Na aba **Mídia** → escolher arquivo → **Enviar para o PC** (grava em `media/videos`).

Uploads temporários de fallback WebRTC vão para `media/tmp/`.

## Na playlist

- Toque no vídeo na lista de mídia para adicionar e projetar.
- Use **Play vídeo** / **Pause** nos controles.
- O slide usa `<video>` com `object-fit: contain` para não cortar no projetor.

## Letras + vídeo (polimento)

É possível montar HTML de slide com letra sobre fundo; na prática atual, projete o vídeo como item da lista ou combine manualmente no desktop. Evoluções futuras: vídeo de fundo com estrofes sincronizadas.
