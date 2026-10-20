# SPEC-11 — Abrir a view

## Objetivo

O executável sobe o servidor e abre o navegador padrão em `/view.html`. Um segundo clique, com a porta já em uso, só reabre essa página.

## Atores

Operador do projetor, navegador padrão do Windows, view de pareamento.

## Fluxos

1. `OPEN_VIEW=1` força a abertura. `OPEN_VIEW=0` impede. Sem a variável, só o processo empacotado abre o navegador.
2. Se a abertura está ligada e a porta já responde, o processo abre a view e sai com código 0.
3. Se a porta está livre, o servidor escuta em `0.0.0.0` e, no `listen`, abre `http://127.0.0.1:<porta>/view.html` (ou `https://` quando `protocol` é https).
4. No Windows o comando é `cmd /c start "" "<url>"`.
5. O QR continua com o IP da LAN (`/mobile.html`).

## Critérios de aceite

- [ ] Testes cobrem `shouldOpenView`, a URL, o comando `start` e a decisão `exit-open` / `listen`.
- [ ] `npm start` sem `OPEN_VIEW=1` não abre navegador.
- [ ] O console do exe permanece visível, com URL da LAN e PIN.

## Fora de escopo

Modo kiosk e ícone de bandeja.

## Dependências

SPEC-09, SPEC-10.
