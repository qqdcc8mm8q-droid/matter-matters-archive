#!/bin/bash
# Auf dem Raspberry Pi ausführen: richtet Tool Pool als Dienst ein, der beim Einschalten von selbst startet.
set -e
ORDNER="$(cd "$(dirname "$0")/.." && pwd)"
NUTZER="$(id -un)"
command -v python3 >/dev/null || { echo "python3 fehlt: sudo apt install python3"; exit 1; }

sudo tee /etc/systemd/system/toolpool.service >/dev/null <<UNIT
[Unit]
Description=Tool Pool
After=network.target

[Service]
User=$NUTZER
WorkingDirectory=$ORDNER
Environment=PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8
ExecStart=/usr/bin/env python3 "$ORDNER/server.py" --netz --drucken
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable toolpool >/dev/null 2>&1
sudo systemctl restart toolpool
sleep 2
if systemctl is-active --quiet toolpool; then
  echo "Tool Pool läuft und startet ab jetzt von selbst."
  echo "Im Browser eines anderen Geräts öffnen: http://$(hostname).local:8431/"
  echo "Oder mit der IP-Adresse: http://$(hostname -I | awk '{print $1}'):8431/"
  command -v lp >/dev/null || echo "Für den Live-Druck fehlt CUPS: sudo apt install cups, dann den Drucker einrichten."
else
  echo "Start fehlgeschlagen. Meldungen ansehen mit: journalctl -u toolpool -n 30"
  exit 1
fi
