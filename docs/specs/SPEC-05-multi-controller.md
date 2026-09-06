# SPEC-05 — Multi-controller

## Objetivo

Permitir mais de um celular na mesma sala, com posse de comando explícita.

## Atores

Controllers A/B, observer, servidor.

## Fluxos

1. Vários `hello` com `role=controller`.
2. Primeiro controller (ou quem chama `takeControl`) recebe o token.
3. Broadcast `controlChanged`; quem não tem o token vê UI de “assumir comando”.
4. Comandos de slide de quem não tem controle são ignorados (exceto `takeControl`).

## Critérios de aceite

- [ ] Dois celulares conectados; só um avança slides por vez.
- [ ] “Assumir comando” transfere o controle em &lt; 1s.

## Fora de escopo

Fila de aprovação / moderação humana.

## Dependências

SPEC-01, SPEC-02.
