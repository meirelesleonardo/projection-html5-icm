# Projeção ICM

Projeção para Igreja Cristã Maranata. Idiomas: português (pt-BR), inglês (en) e italiano (it).

Painel desktop | Projeção
:-------------:|:--------:
![](/docs/assets/img/painel.gif) | ![](/docs/assets/img/projecao.gif)

## Modos de uso

### A) Desktop clássico (mesmo PC)

1. Abra `index.html` no Firefox (recomendado).
2. Permita pop-ups para abrir `view.html`.
3. No Chrome/Opera, importe `data/data.json` manualmente se necessário.

### B) LAN / hotspot (celular controla o mini PC Zorin)

O mini PC roda o servidor Node; o projetor mostra `view.html`; o Android usa `mobile.html`.

```bash
npm install
npm start
# Câmera / WebRTC no celular:
npm run start:https
# View (projetor):  http(s)://127.0.0.1:3080/view.html
# Mobile:           http(s)://<ip-do-pc>:3080/mobile.html
```

Sem IP fixo: o projetor exibe **QR + IP** para pareamento no hotspot.

PIN padrão: `1234` (altere em `server/config.json`).

## Documentação

| Doc | Conteúdo |
|-----|----------|
| [docs/architecture.md](docs/architecture.md) | Arquitetura LAN / WebSocket |
| [docs/specs/](docs/specs/README.md) | SPECs 01–09 |
| [docs/install-zorin.md](docs/install-zorin.md) | Instalação no Zorin (hotspot, systemd, kiosk) |
| [docs/manual-mobile.md](docs/manual-mobile.md) | Uso do painel no celular |
| [docs/manual-video.md](docs/manual-video.md) | Vídeos MP4 na playlist |
| [docs/app-android-pwa.md](docs/app-android-pwa.md) | PWA e Capacitor |
| [docs/manual.md](docs/manual.md) | Manual do painel desktop |

## Características

* Edição de louvores (linha vazia separa slides)
* Pastas por idioma, avisos, imagens, bíblias (ACF/NVI)
* **Painel mobile** com multi-controle e pareamento QR
* **Vídeos** locais (`media/videos`) e stream WebRTC do celular
* Biblioteca compartilhada via servidor (`/api/library`)

## Stack

Bootstrap, jsTree, Reveal.js, jQuery, FontAwesome, **Node (Express + ws)**

## Config rápida

`server/config.json` — porta, PIN, perfil `720p`/`1080p`, hostname mDNS.
