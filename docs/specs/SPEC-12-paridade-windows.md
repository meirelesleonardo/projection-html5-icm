# SPEC-12 — Paridade no Windows

## Objetivo

Slides e HTTPS da câmera funcionam no PC Windows sem `sh` e sem `openssl` no PATH.

## Atores

Operador, LibreOffice, Poppler, celular que transmite câmera.

## Fluxos

1. A busca de `soffice` e `pdftoppm` percorre o PATH sem shell. No Windows também olha `C:\Program Files\LibreOffice\program\soffice.exe` e a pasta `(x86)`.
2. Se a ferramenta falta, a mensagem cita o instalador do sistema em uso (apt no Linux, PATH ou Program Files no Windows).
3. O certificado autoassinado é gerado em JavaScript (PEM com SAN para `localhost`, `projection-icm.local` e `127.0.0.1`) e gravado em `server/certs/`. Um par já existente é reutilizado.
4. HTTP continua sendo o padrão do `config.json`.
5. O manual [windows-exe.md](../windows-exe.md) explica o aviso do SmartScreen, o firewall nas portas TCP 3080 e UDP 41234, e que fechar o console encerra o servidor.

## Critérios de aceite

- [ ] Teste acha um executável no PATH sem invocar `sh`.
- [ ] Teste acha `soffice.exe` num caminho informado, no modo Windows.
- [ ] Teste gera um certificado que o Node aceita em `tls.createSecureContext` e não chama openssl.
- [ ] O manual cobre firewall e SmartScreen.

## Fora de escopo

Embutir LibreOffice, Poppler ou Chrome no exe. Elevar o processo para criar regra de firewall.

## Dependências

SPEC-03, SPEC-08, SPEC-10.
