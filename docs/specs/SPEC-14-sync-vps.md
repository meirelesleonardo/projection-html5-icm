# SPEC-14 — Sync com a VPS

## Objetivo

Com internet, trocar `data.json` e a versão com uma VPS Debian sem atrasar a projeção. Sem rede, o culto segue na cópia local.

## Atores

PC do projetor (exe ou `npm start`), serviço mínimo na Debian, operador no painel.

## Fluxos

1. A identidade da troca é o SHA-256 do JSON da biblioteca, mais `syncedHash` no `library-meta.json`. O `version` inteiro continua sendo a trava entre controles no mesmo PC.
2. Hashes iguais: nada a fazer. PC limpo e VPS diferente: baixar e adotar `version` e `updatedAt`. PC sujo e a VPS ainda no hash de partida: enviar. Os dois mudaram, ou nunca houve troca e os conteúdos diferem: não sobrescrever, guardar cópia em `data/sync-conflicts/` e avisar.
3. VPS vazia: o PC envia a base inicial.
4. Gatilhos, em segundo plano: ao subir, depois de gravar a biblioteca, a cada 3 minutos, e pelo botão **Sincronizar**. `syncUrl` ou `syncToken` vazio desliga tudo.
5. No conflito, o painel oferece **Enviar esta base** e **Baixar da VPS**.
6. Depois de pull, push ou gravação local, os clientes recebem `libraryUpdated` e recarregam. Um painel com edição não salva não é sobrescrito.
7. Na Debian, `node server/sync-server.js` expõe só `GET/PUT /api/library/sync` com `Authorization: Bearer`. Caddy ou nginx terminam o HTTPS. O PIN da sala não autentica essa rota.

## Critérios de aceite

- [ ] A matriz idle / pull / push / conflito / base vazia tem teste.
- [ ] Um servidor falso cobre push, pull, conflito e pull forçado.
- [ ] Falha de rede devolve `offline` e não altera a base local.
- [ ] O zip do exe não inclui `syncToken`.

## Fora de escopo

Vídeo, imagem, playlist, pasta de importação e merge louvor a louvor. Publicar o aplicativo de projeção inteiro na VPS.

## Dependências

SPEC-10. Manual: [sync-vps.md](../sync-vps.md).
