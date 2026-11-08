#!/bin/bash
# Auf dem Mac ausführen: kopiert Tool Pool auf den Pi und richtet ihn ein. Auch für spätere Updates.
# Aufruf: pi/auf-den-pi.sh nutzer@raspberrypi.local
set -e
ZIEL="$1"
[ -n "$ZIEL" ] || { echo "Aufruf: pi/auf-den-pi.sh nutzer@raspberrypi.local"; exit 1; }
cd "$(dirname "$0")/.."
rsync -a --exclude .DS_Store --exclude __pycache__ --exclude mac-app --exclude dist --exclude '*.zip' ./ "$ZIEL:toolpool/"
ssh -t "$ZIEL" 'bash toolpool/pi/installieren.sh'
