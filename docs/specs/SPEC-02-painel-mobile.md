# SPEC-02 — Painel mobile enxuto

## Objetivo

UI touch-first para controlar o culto no celular, sem o layout desktop do `index.html`.

## Atores

Operador com Android (Chrome).

## Fluxos

1. Tela Conectar (descoberta / QR / manual).
2. Lista do culto + Ao vivo (tap / swipe).
3. Controles: tela preta, logo, fonte, tema, assumir comando, mostrar pareamento.
4. Controles de vídeo quando o item for mídia.
5. Preview do slide atual via snapshot.

## Critérios de aceite

- [ ] Avançar/voltar slide com botões grandes e swipe.
- [ ] Indicador “você controla” / “outro celular controla”.
- [ ] Funciona em viewport de smartphone em portrait.

## Fora de escopo

Editor completo de letras, importação massiva, árvore de pastas complexa.

## Dependências

SPEC-01, SPEC-09.
