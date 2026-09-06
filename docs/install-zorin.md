# Instalação no mini PC (Zorin OS) — hotspot, sem IP fixo

Este guia configura o **Projeção ICM** para rodar no mini PC ligado ao projetor, com o celular compartilhando internet (hotspot). O IP do PC muda; o pareamento é por **QR na tela**.

## Requisitos

- Zorin OS (ou Ubuntu) no mini PC
- Node.js 18+ 
- Google Chrome ou Chromium
- Celular Android com hotspot

## 1. Instalar Node.js

```bash
sudo apt update
sudo apt install -y nodejs npm
node -v   # >= 18
```

Se a versão do apt for antiga, use o [NodeSource](https://github.com/nodesource/distributions) ou `nvm`.

## 1b. LibreOffice + Poppler (apresentações PPTX/PDF)

Para o módulo **Slides** no mobile (converter `.pptx` / `.pdf` em imagens no projetor):

```bash
sudo apt install -y libreoffice-impress libreoffice-draw poppler-utils
soffice --version
pdftoppm -v
```

Sem esses pacotes, o upload de apresentação retorna erro claro no celular.

## 2. Clonar / copiar o projeto

```bash
cd ~
# exemplo
git clone <url-do-repo> projection-html5-icm
cd projection-html5-icm
npm install
```

## 3. Configurar PIN e porta

Edite `server/config.json`:

```json
{
  "port": 3080,
  "roomPin": "1234",
  "displayProfile": "1080p",
  "hostname": "projection-icm.local"
}
```

Altere o `roomPin` para um código do culto. **Não use IP fixo.**

## 4. Firewall

```bash
sudo ufw allow 3080/tcp
sudo ufw allow 41234/udp
sudo ufw reload
```

## 5. Avahi (hostname opcional)

Melhor esforço para `http://projection-icm.local:3080` — pode falhar em alguns hotspots Android.

```bash
sudo apt install -y avahi-daemon
sudo hostnamectl set-hostname projection-icm
# reinicie o serviço
sudo systemctl enable --now avahi-daemon
```

## 6. Wi‑Fi: conectar automaticamente ao hotspot

1. No Zorin, conecte uma vez ao hotspot do celular e marque “conectar automaticamente”.
2. Teste: ligue só o hotspot → o mini PC deve obter DHCP sozinho.

## 7. systemd (subir com o boot)

Crie `/etc/systemd/system/projection-icm.service` (ajuste `User` e caminhos):

```ini
[Unit]
Description=Projecao ICM LAN server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=SEU_USUARIO
WorkingDirectory=/home/SEU_USUARIO/projection-html5-icm
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now projection-icm
sudo systemctl status projection-icm
```

O serviço sobe mesmo sem IP; a tela de pareamento atualiza o QR quando o DHCP chega.

## 8. Chrome em kiosk na view (projetor)

Crie um atalho de aplicação ou autostart:

```bash
chromium-browser --kiosk --app=http://127.0.0.1:3080/view.html --check-for-update-interval=31536000
# ou
google-chrome --kiosk http://127.0.0.1:3080/view.html
```

- Use a saída HDMI do projetor em **1920×1080** (ou 1280×720 e mude `displayProfile` para `720p`).
- Não abra o painel mobile nessa tela — só a `view.html`.

Autostart (exemplo `~/.config/autostart/projection-view.desktop`):

```ini
[Desktop Entry]
Type=Application
Name=Projecao View
Exec=chromium-browser --kiosk http://127.0.0.1:3080/view.html
X-GNOME-Autostart-enabled=true
```

## 9. Vídeos

Coloque arquivos **MP4 (H.264 + AAC)** em `media/videos/`. Veja [manual-video.md](manual-video.md).

## 10. Rotina do culto

1. Ligar hotspot no celular  
2. Mini PC conecta e mostra QR no projetor  
3. No celular de controle: abrir o QR (ou `/mobile.html`)  
4. Controlar a lista  

Detalhes: [manual-mobile.md](manual-mobile.md).

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| QR sem IP | Espere DHCP; confira Wi‑Fi do PC no hotspot |
| PIN incorreto | Confira `server/config.json` |
| Porta recusada | `systemctl status projection-icm` e firewall |
| PWA não abre depois | IP mudou — use o QR de novo (veja [app-android-pwa.md](app-android-pwa.md)) |
