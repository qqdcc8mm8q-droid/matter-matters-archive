#!/bin/zsh
# Doppelklick auf einem Laptop: öffnet Tool Pool im Vollbild als Station.
# Beim ersten Mal werden die Adresse des Mac mini und die Nummer der Station gefragt.
DATEI="$HOME/.toolpool-station"
[ -f "$DATEI" ] && source "$DATEI"
if [ -z "$MINI" ] || [ -z "$NUMMER" ]; then
  read "MINI?Adresse des Mac mini (z. B. 192.168.10.10): "
  read "NUMMER?Nummer dieser Station (entspricht dem ATEM-Eingang, z. B. 1): "
  print -r -- "MINI=${(q)MINI}" > "$DATEI"
  print -r -- "NUMMER=${(q)NUMMER}" >> "$DATEI"
fi
URL="http://$MINI:8431/?station=$NUMMER"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -x "$CHROME" ]; then
  echo "Google Chrome fehlt. Ohne Chrome von Hand öffnen: $URL"
  exit 1
fi
# Hält den Laptop wach und öffnet den Browser ohne Leisten
exec caffeinate -dims "$CHROME" --kiosk --noerrdialogs --disable-session-crashed-bubble --no-first-run --user-data-dir="$HOME/.toolpool-chrome" "$URL"
