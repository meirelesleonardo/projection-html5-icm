# Manual — Painel mobile

## Antes do culto

1. No celular que **compartilha a internet**, ative o **hotspot**.
2. Confirme que o mini PC Zorin conectou a esse Wi‑Fi (ícone de rede).
3. No PC, inicie o servidor. Para **Transmitir câmera**, use HTTPS:
   ```bash
   npm run start:https
   ```
   (ou `"https": true` em `server/config.json`). Na primeira vez o celular pedirá para aceitar o certificado autoassinado — avance em “Avançado / Continuar”.
4. O projetor deve mostrar a tela **Projeção ICM** com QR, IP e PIN (o QR aponta para `https://…` quando HTTPS está ativo).

## Conectar o controle

1. No celular de operação, conecte-se ao **mesmo hotspot** (se for outro aparelho) **ou** use o próprio celular do hotspot.
2. Escaneie o QR com a câmera / botão **Escanear QR** no painel, **ou** digite o IP grande da tela (com HTTPS, use o link `https://IP:3080/mobile.html`).
3. Informe o PIN (padrão de fábrica na config: `1234` — altere em produção).
4. Escolha **Controlar** ou **Só observar**.

Se a página já abriu via QR na mesma origem, a conexão é automática.

## Operação

- **Ao vivo:** anterior / próximo, tap no slide; **Logo / padrão** interrompe qualquer fluxo (vídeo, louvor, stream) e mostra a tela Maranata. Com vídeo projetado, aparecem pause / ±10s / contain / cover / tela cheia / **Som** / **Mudo**.
- **Lista:** itens do culto; toque para **transmitir**. Use **↑ / ↓** para reordenar e **Remover** para tirar da lista.
- **Louvores:** busca na biblioteca oficial do servidor (`GET /api/library`); toque **só adiciona à lista** (não transmite). Edição de louvores no mobile fica para etapa futura — use o painel desktop + **Salvar no servidor**.
- **Bíblia:** escolha versão (ACF/NVI), livro, capítulo e versículos; **Adicionar à lista**. Projete pela Lista.
- **Slides:** envie `.pptx` ou `.pdf`; o PC converte (LibreOffice + pdftoppm) em imagens. **Adicionar à lista** ou **Projetar**; navegue no Ao vivo com anterior/próximo.
- **Mídia:**
  - Enviar um ou mais vídeos (Android: use **Arquivos** e navegue até a pasta; o navegador **não** abre pasta fixa sozinho).
  - Nome original no PC; se já existir: `louvor_2.mp4`, etc.
  - **Projetar**, **Renomear**, **Apagar**; fundo de letra.
  - **Transmitir câmera** / arquivo (WebRTC): exige **HTTPS**; senão use upload.
  - Contain / Cover (só enquadramento) / Tela cheia / **Som** / **Mudo**.
- **Mais:** assumir comando, QR no projetor, tela preta, logo, fonte, perfil 720p/1080p, **Tela cheia View** / **Sair tela cheia**, **Limpar sessão**.

Se o celular **bloquear** ou sair do navegador no meio do culto, o projetor **não volta ao QR**: vai para a **tela logo / padrão**. O QR só aparece no início (sala vazia) ou quando você toca **QR no projetor**.

Os módulos no topo mostram **vários de uma vez**; deslize a faixa se não couberem todos (Bíblia, Slides, Mídia, Mais…).

### Apresentações (PPTX)

O navegador não abre PowerPoint direto. O fluxo é: upload → conversão no mini PC → slides em PNG em `/media/decks/…`. Instale as dependências em `install-zorin.md` (LibreOffice + poppler-utils). PDF exportado costuma converter mais rápido e fiel.

### Sessão e puxar para atualizar

O painel evita o “puxar para baixo = F5” com `overscroll-behavior` e grava lista/conexão em `sessionStorage`. Se precisar zerar de propósito, use **Limpar sessão** em Mais (com confirmação).

### Tela cheia da View

O botão **Tela cheia View** pede fullscreen no navegador do projetor. Se o Chrome bloquear (sem gesto local), aparece na View a faixa **“Toque aqui para tela cheia”** — toque uma vez no PC/projetor. No culto, o mais estável é abrir a View com Chrome `--kiosk` (veja `install-zorin.md`).

## Dois celulares

Só um **controla** por vez. No outro, toque **Assumir comando**.

## Sem QR / IP mudou

Use **Tentar último / .local** ou digite o IP novo que aparecer no projetor. Não há IP fixo no modelo hotspot.
