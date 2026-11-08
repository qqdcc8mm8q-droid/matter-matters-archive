#!/bin/bash
# Lädt den aktuellen Stand von Tool Pool nach GitHub hoch:
# Repository qqdcc8mm8q-droid/matter-matters-archive, Branch stand/nils, Ordner toolpool/.
# Was nicht mit hochgeht, steht in .gitignore (Offline-Kopien, fertige Pakete).
# Doppelklick genügt. Im Terminal geht auch: ./"Auf GitHub hochladen.command" "Was sich geändert hat"

set -uo pipefail

QUELLE="$(cd "$(dirname "$0")" && pwd)"
REPO="${TOOLPOOL_REPO:-$(dirname "$QUELLE")/matter-matters-archive}"
URL="https://github.com/qqdcc8mm8q-droid/matter-matters-archive.git"
BRANCH="stand/nils"
ORDNER="toolpool"

abbruch() { echo; echo "Abgebrochen: $1"; exit 1; }

command -v git >/dev/null || abbruch "git fehlt. Im Terminal: xcode-select --install"
[ -n "$(git config user.email)" ] || abbruch "Git kennt deinen Namen noch nicht. Siehe DOKUMENTATION.md, Abschnitt GitHub."

BESCHREIBUNG="${1:-}"
if [ -z "$BESCHREIBUNG" ] && [ -t 0 ]; then
  read -r -p "Was hat sich geändert? (Enter für „Tool Pool aktualisiert“) " BESCHREIBUNG
fi
BESCHREIBUNG="${BESCHREIBUNG:-Tool Pool aktualisiert}"

# 1. Repository holen und auf den Branch stand/nils gehen
if [ ! -d "$REPO/.git" ]; then
  echo "Hole das Repository nach $REPO ..."
  git clone -q "$URL" "$REPO" || abbruch "Herunterladen ging nicht. Ist Internet da?"
fi
cd "$REPO" || abbruch "$REPO fehlt."
git fetch -q origin || abbruch "GitHub ist nicht erreichbar."

if [ "$(git branch --show-current)" != "$BRANCH" ]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout -q "$BRANCH"
  elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    git checkout -q -b "$BRANCH" --track "origin/$BRANCH"
  else
    git checkout -q -b "$BRANCH" origin/main
  fi
  [ "$(git branch --show-current)" = "$BRANCH" ] || abbruch "Konnte nicht auf $BRANCH wechseln. Gibt es in $REPO ungesicherte Änderungen?"
fi
if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  git merge -q --ff-only "origin/$BRANCH" || abbruch "Auf GitHub hat $BRANCH Änderungen, die hier fehlen und sich nicht einfach anhängen lassen. Erst zusammenführen."
fi

# 2. Dateien aus dem Arbeitsordner übernehmen. Welche, entscheidet .gitignore.
LISTE="$(mktemp)"
LEER="$(mktemp -d)"
trap 'rm -rf "$LISTE" "$LEER"' EXIT
git --git-dir="$LEER" --work-tree="$QUELLE" init -q
git --git-dir="$LEER" --work-tree="$QUELLE" ls-files -o --exclude-standard -z > "$LISTE"
[ -s "$LISTE" ] || abbruch "In $QUELLE wurden keine Dateien gefunden."

rm -rf "${REPO:?}/$ORDNER"
mkdir -p "$REPO/$ORDNER"
while IFS= read -r -d '' f; do
  mkdir -p "$REPO/$ORDNER/$(dirname "$f")"
  cp -p "$QUELLE/$f" "$REPO/$ORDNER/$f" || abbruch "Konnte $f nicht kopieren."
done < "$LISTE"

# 3. Als Stand speichern, Nachricht nach den Regeln der Gruppe, dann hochladen
git add -A -- "$ORDNER"
if git diff --cached --quiet -- "$ORDNER"; then
  echo "Keine Änderungen seit dem letzten Speichern."
else
  git commit -q -m "$(date '+%Y-%m-%d %H:%M') — Stand nils: $BESCHREIBUNG" -- "$ORDNER" || abbruch "Speichern ging nicht."
  echo "Gespeichert: $(git log -1 --format=%s)"
fi

if [ "$(git rev-list --count "origin/$BRANCH..$BRANCH" 2>/dev/null || echo 1)" = "0" ]; then
  echo "GitHub hat diesen Stand schon."
else
  echo "Lade hoch ..."
  git push -q -u origin "$BRANCH" || abbruch "Hochladen ging nicht. Bist du angemeldet? Im Terminal: gh auth status"
fi
echo
echo "Fertig: https://github.com/qqdcc8mm8q-droid/matter-matters-archive/tree/$BRANCH/$ORDNER"
