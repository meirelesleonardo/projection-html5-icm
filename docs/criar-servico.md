# Criar serviço systemd — Projeção ICM

## Criar o arquivo de serviço

```bash
sudo tee /etc/systemd/system/projection-icm.service > /dev/null <<'EOF'
[Unit]
Description=Projecao ICM LAN server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=meireles
WorkingDirectory=/home/meireles/projetos/projection-html5-icm
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
```

## Habilitar e iniciar

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now projection-icm
sudo systemctl status projection-icm
```

## Comandos úteis

```bash
# Ver status
sudo systemctl status projection-icm

# Parar
sudo systemctl stop projection-icm

# Iniciar
sudo systemctl start projection-icm

# Reiniciar
sudo systemctl restart projection-icm

# Desabilitar (não inicia mais com o boot)
sudo systemctl disable projection-icm

# Ver logs
sudo journalctl -u projection-icm -f
```

## Observações

- O serviço roda `npm start` (`node server/index.js`) na porta `3080`
- Inicia automaticamente com o boot
- Reinicia sozinho se falhar
- O PIN padrão do servidor está em `server/config.json` (`roomPin`)
- Firewall (se usar UFW): `sudo ufw allow 3080/tcp`
