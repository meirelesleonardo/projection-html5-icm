# SPEC-10 — Pacote Windows

## Objetivo

Gerar neste Linux um `ProjecaoICM.exe` que contém o servidor e deixa a biblioteca, a mídia e o `config.json` graváveis na pasta ao lado do executável.

## Atores

- Quem gera o zip neste Linux
- Operador no PC Windows do projetor

## Fluxos

1. `resolveAppRoot` usa a pasta de `process.execPath` quando `process.pkg` está definido e a pasta do repositório em `npm start`.
2. `server/config.json`, `data/`, `media/` e `server/certs/` ficam nessa raiz externa.
3. `npm run pack:win` monta `dist/ProjecaoICM-win64/`, empacota `server/index.js` com `@yao-pkg/pkg` no alvo `node22-win-x64` e grava `dist/ProjecaoICM-win64.zip`. Se o Node do sistema for anterior ao 22, o script baixa um Node 22 só para rodar o empacotador.
4. O token de sincronização não entra no zip. `npm start` no Zorin continua igual.

## Critérios de aceite

- [ ] Teste de `resolveAppRoot` cobre exe e desenvolvimento.
- [ ] O zip contém o exe, as páginas, `css/`, `js/`, `data/data.json`, `media/` e `server/config.json`.
- [ ] O script falha com mensagem clara se o download do Node de Windows não ocorrer.
- [ ] `node_modules` de produção não é copiado para a pasta: fica dentro do exe.

## Fora de escopo

Instalador, assinatura de código e atalho no Menu Iniciar.

## Dependências

SPEC-11, SPEC-14 (a base sincronizada é a pasta externa).
