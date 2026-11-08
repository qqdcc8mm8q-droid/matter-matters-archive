#!/bin/bash
# Doppelklick: startet Tool Pool so, dass andere Geräte im selben Netz darauf zugreifen können.
# Die Adresse steht im Fenster. Fenster schließen oder Ctrl+C beendet den Server.
cd "$(dirname "$0")"
python3 -B server.py --netz --drucken
