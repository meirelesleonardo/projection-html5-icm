# ProjecaoICM.exe no Windows

O zip `dist/ProjecaoICM-win64.zip` é gerado no Linux com `npm run pack:win`. Descompacte no PC do projetor e execute `ProjecaoICM.exe`.

O console fica aberto de propósito: mostra o endereço da rede e o PIN. Fechar essa janela encerra o servidor. Um segundo duplo clique, com o servidor já no ar, só reabre a view.

A biblioteca fica em `data/data.json`, ao lado do exe. `server/config.json` guarda porta, PIN, `syncUrl` e `syncToken`.

## Primeira execução

O Windows SmartScreen pode bloquear o exe porque ele não é assinado. Em **Mais informações**, escolha **Executar assim mesmo**.

Na primeira escuta, o firewall pergunta se o aplicativo pode se comunicar. Permita em **rede privada**. As portas são TCP `3080` (ou a do config) e UDP `41234` (descoberta na rede local). O exe não pede administrador e não cria a regra sozinho.

## Checklist do culto

- [ ] Duplo clique abre o console e o navegador padrão em `/view.html`, com o QR.
- [ ] Segundo duplo clique não encerra o servidor; a view volta ao foco.
- [ ] O celular, no mesmo hotspot, abre o painel ao escanear o QR.
- [ ] Um louvor gravado no painel continua em `data/data.json` depois de fechar e abrir o exe.
- [ ] Com o firewall permitido, o celular alcança `http://<ip-do-pc>:3080/mobile.html`.

Slides PPTX/PDF precisam do LibreOffice (`soffice.exe`) e do Poppler (`pdftoppm.exe` no PATH). Eles não vêm dentro do exe. A câmera do celular exige `"https": true` no config; o certificado é gerado em `server/certs/` na primeira subida com HTTPS.
