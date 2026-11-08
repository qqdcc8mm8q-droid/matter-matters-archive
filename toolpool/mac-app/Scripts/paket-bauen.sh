#!/bin/zsh
# Baut die fertige App und ein Installations-Abbild (.dmg) für den Mac mini.
# Aufruf: zsh mac-app/Scripts/paket-bauen.sh
set -euo pipefail
cd "$(dirname "$0")/.."
AUSGABE="$(cd .. && pwd)/dist"
BAU="$(mktemp -d)"
trap 'rm -rf "$BAU"' EXIT
xcodebuild -project ToolPoolRegie.xcodeproj -scheme ToolPoolRegie -configuration Release \
  -derivedDataPath "$BAU/dd" -quiet build
APP="$BAU/dd/Build/Products/Release/Tool Pool Regie.app"
mkdir -p "$AUSGABE"
rm -rf "$AUSGABE/Tool Pool Regie.app" "$AUSGABE/Tool-Pool-Regie.dmg"
ditto "$APP" "$AUSGABE/Tool Pool Regie.app"
INHALT="$BAU/dmg"
mkdir -p "$INHALT"
ditto "$APP" "$INHALT/Tool Pool Regie.app"
ln -s /Applications "$INHALT/Programme"
hdiutil create -quiet -volname "Tool Pool Regie" -srcfolder "$INHALT" -ov -format UDZO "$AUSGABE/Tool-Pool-Regie.dmg"
echo "Fertig: $AUSGABE/Tool-Pool-Regie.dmg"
du -sh "$AUSGABE/Tool-Pool-Regie.dmg" "$AUSGABE/Tool Pool Regie.app"
