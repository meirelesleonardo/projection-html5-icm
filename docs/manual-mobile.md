# Manual — Painel mobile

## Antes do culto

1. No celular que **compartilha a internet**, ative o **hotspot**.
2. Confirme que o mini PC Zorin conectou a esse Wi‑Fi (ícone de rede).
3. O projetor deve mostrar a tela **Projeção ICM** com QR, IP e PIN.

## Conectar o controle

1. No celular de operação, conecte-se ao **mesmo hotspot** (se for outro aparelho) **ou** use o próprio celular do hotspot.
2. Escaneie o QR com a câmera / botão **Escanear QR** no painel, **ou** digite o IP grande da tela.
3. Informe o PIN (padrão de fábrica na config: `1234` — altere em produção).
4. Escolha **Controlar** ou **Só observar**.

Se a página já abriu via QR na mesma origem, a conexão é automática.

## Operação

- **Ao vivo:** anterior / próximo, tap no slide, swipe.
- **Lista:** itens do culto; toque para projetar.
- **Louvores:** busca na biblioteca do servidor (`data.json`); toque adiciona à lista e projeta.
- **Mídia:**
  - Enviar vídeo (mantém o **nome original**; se já existir, grava `nome_2.mp4`, `nome_3.mp4`…).
  - **Projetar**, **Renomear**, **Apagar** cada arquivo no PC.
  - **Usar como fundo de letra** / **Limpar fundo de letra**.
  - Contain / Cover / Tela cheia do vídeo projetado.
- **Mais:** assumir comando, QR no projetor, tela preta, logo, fonte, perfil 720p/1080p, **Tela cheia View** / **Sair tela cheia**.

### Tela cheia da View

O botão **Tela cheia View** pede fullscreen no navegador do projetor. Se o Chrome bloquear (sem gesto local), aparece na View a faixa **“Toque aqui para tela cheia”** — toque uma vez no PC/projetor. No culto, o mais estável é abrir a View com Chrome `--kiosk` (veja `install-zorin.md`).

## Dois celulares

Só um **controla** por vez. No outro, toque **Assumir comando**.

## Sem QR / IP mudou

Use **Tentar último / .local** ou digite o IP novo que aparecer no projetor. Não há IP fixo no modelo hotspot.
