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

Na aba **Mídia** → escolher arquivo(s) → **Enviar para o PC**.

- No Android o navegador **não** abre uma pasta fixa (ex. `/Movies/Culto`) sozinho. Use o seletor → **Arquivos** / Pastas → navegue até a pasta → selecione um ou vários vídeos.
- O arquivo é salvo com o **nome original** (caracteres especiais viram `_`).
- Se já existir o mesmo nome: `louvor_2.mp4`, `louvor_3.mp4`, etc.
- **Renomear** / **Apagar** na lista de vídeos.
- **Usar como fundo de letra** e **Limpar fundo** controlam o vídeo atrás das estrofes.

Uploads temporários de fallback WebRTC vão para `media/tmp/`.

## Transmitir câmera (WebRTC)

Em HTTP puro na LAN o Chrome **bloqueia** a câmera. No PC:

```bash
npm run start:https
```

Abra o painel pelo QR/`https://IP:3080/mobile.html`, aceite o certificado uma vez, depois **Transmitir câmera**. Se falhar, use **Enviar para o PC** (mais estável no culto).

## Na playlist / projeção

- **Projetar** adiciona à lista e exibe no projetor.
- **Play** / **Pause**, **Contain** / **Cover** (só enquadramento, sem reiniciar), **Tela cheia vídeo**.
- O slide usa `<video>` com `object-fit` conforme o modo escolhido.

## Letras + vídeo de fundo

1. Em Mídia, toque **Usar como fundo de letra** no clipe desejado.
2. Projete um louvor na biblioteca — as estrofes usam esse vídeo de fundo.
3. **Limpar fundo** volta ao fundo estático `imagens/fundo.jpg`.
