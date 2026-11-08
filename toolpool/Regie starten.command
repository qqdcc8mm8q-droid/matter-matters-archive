#!/bin/zsh
# Doppelklick auf dem Mac mini: startet Tool Pool, die ATEM Steuerung und die Regie.
# Der Rechner bleibt wach, solange das Fenster offen ist. Fenster schließen beendet alles.
cd "$(dirname "$0")" || exit 1
ATEM="../atem-steuerung"
if [ -x "$ATEM/.venv/bin/python" ]; then
  if ! lsof -nP -iTCP:8460 -sTCP:LISTEN >/dev/null 2>&1; then
    ( cd "$ATEM" && exec .venv/bin/python server.py --kein-browser ) &
    ATEM_PID=$!
    trap 'kill $ATEM_PID 2>/dev/null' EXIT
  fi
else
  echo "ATEM Steuerung fehlt: Ordner atem-steuerung neben toolpool legen und einmal mit Internet starten."
fi
caffeinate -dims python3 -B server.py --regie
