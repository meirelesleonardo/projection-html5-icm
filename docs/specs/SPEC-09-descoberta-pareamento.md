# SPEC-09 — Descoberta de rede e pareamento (hotspot)

## Objetivo

Conectar o celular ao mini PC sem IP fixo, tipicamente via hotspot Android.

## Fluxos

1. Servidor expõe `GET /api/info` com `ips[]`, porta, hostname, PIN.
2. View em pareamento mostra QR (`http://ip:port/mobile.html?pin=...`) e IP grande.
3. Mobile: último host, `.local`, escanear QR, scan rede, manual.
4. DHCP atrasado: view atualiza QR periodicamente.

## Critérios de aceite

- [ ] Culto em local novo sem configurar IP no Zorin.
- [ ] QR abre o painel no IP correto da sessão.

## Fora de escopo

Reserva DHCP em roteador de igreja.
