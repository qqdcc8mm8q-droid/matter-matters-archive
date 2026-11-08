#!/bin/bash
# Kopiert die Webseite und die Offline-Kopien in die App. Läuft bei jedem Build.
set -euo pipefail
QUELLE="${SRCROOT}/.."
ZIEL="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/web"
mkdir -p "$ZIEL"
cd "$QUELLE"
rsync -a --delete \
  --exclude '.DS_Store' --exclude '__pycache__' --exclude '*.pyc' \
  --exclude 'js/regie.js' --exclude 'css/regie.css' \
  index.html render.html doku.html DOKUMENTATION.md favicon.svg css js assets offline \
  "$ZIEL/"
