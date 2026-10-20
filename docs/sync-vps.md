# Sincronizar a base de louvores com a VPS

A VPS Debian guarda a cópia canônica de `data.json` e da versão. O PC grava primeiro no disco local. Com internet, a troca acontece sozinha; sem internet, o culto segue na cópia local.

Só a base de louvores entra na troca. Vídeo, imagem, playlist e importação ficam no PC.

## Serviço na Debian

No servidor, copie este repositório (ou só `server/` e as dependências de produção) e crie `server/sync-config.json` a partir de [server/sync-config.example.json](../server/sync-config.example.json):

```json
{
  "port": 3090,
  "token": "um-token-longo-diferente-do-pin",
  "dataDir": "/var/lib/projecao-icm"
}
```

```bash
node server/sync-server.js
```

Publique a porta 3090 só em localhost e termine o TLS no Caddy ou no nginx, com Let's Encrypt. O aplicativo de projeção não fica exposto. O cliente envia `Authorization: Bearer <token>`.

Rotas:

- `GET /api/library/sync` — versão, data e hash
- `GET /api/library/sync/blob` — o mesmo, com a biblioteca
- `PUT /api/library/sync` — corpo `{ "baseHash": "<sha256 ou null>", "library": [] }`

`baseHash` null só é aceito quando a VPS ainda não tem arquivo. Se o hash de partida não for o atual, a resposta é 409.

Exemplo de proxy no Caddy:

```caddy
louvor.exemplo.com {
  reverse_proxy 127.0.0.1:3090
}
```

## No PC

Em `server/config.json`:

```json
"syncUrl": "https://louvor.exemplo.com",
"syncToken": "um-token-longo-diferente-do-pin"
```

URL ou token vazio desliga a sincronização. O zip do exe sai com o token em branco.

A troca roda ao subir, depois de cada gravação e a cada 3 minutos. O botão **Sincronizar** no painel dispara na hora. Se os dois lados mudaram, aparecem **Enviar esta base** e **Baixar da VPS**. Uma cópia da base local fica em `data/sync-conflicts/`.
