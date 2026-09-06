# SPEC-01 — Relay LAN e roles

## Objetivo

Substituir `postMessage` entre janelas pelo relay WebSocket no mini PC, com roles e snapshot de estado.

## Atores

- Servidor Node no Zorin
- Cliente `view`
- Cliente `controller` / `admin` / `observer`

## Fluxos

1. Cliente abre WS em `ws://<host>:3080/ws`.
2. Envia `hello` com `role` e opcionalmente `pin`.
3. Servidor valida PIN, registra cliente, envia `stateSnapshot` + `networkInfo`.
4. Controllers enviam comandos; servidor atualiza estado e retransmite para `view` e demais clientes.

## Critérios de aceite

- [ ] `view` e `mobile` sincronizam slides sem `window.opener`.
- [ ] Reconnect WS restaura o último slide.
- [ ] Role inválida ou PIN errado é rejeitado com mensagem clara.

## Fora de escopo

- TLS / autenticação na internet pública.

## Dependências

SPEC-09 (pareamento), F1 servidor.
