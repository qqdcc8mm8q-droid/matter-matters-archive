#!/bin/bash
# Auf dem Raspberry Pi ausführen: nimmt den Dienst wieder heraus. Die Dateien bleiben liegen.
sudo systemctl disable --now toolpool
sudo rm -f /etc/systemd/system/toolpool.service
sudo systemctl daemon-reload
echo "Dienst entfernt."
