# Tool Pool: Dokumentation

Stand: 5. November 2026 · Projekt MATTER MATTERS · HSD PBSA, FB Design

Tool Pool ist eine Sammlung gestalterischer Web-Tools und ein Baukasten, in dem Besucher aus Puzzleteilen Plakate bauen. Für die Ausstellung kommt die Mac-App **Tool Pool Regie** dazu: Sie hostet alles auf einem Mac mini und steuert Stationen, Bildschirm, Licht und Druck.

Diese Dokumentation gibt es als Datei `DOKUMENTATION.md` im Projektordner und in der App unter **Dokumentation**, dort auch ohne Internet.

## Überblick

| Teil | Was es ist | Wo es läuft |
|---|---|---|
| Webseite Tool Pool | Archiv, Baukasten, Notizen, Ranking, Drucken, Vorstufe | Browser |
| Tool Pool Regie | Mac-App: Server, Druckserver, Bildschirm, Licht, Rechner für die Plakate | Mac mini |
| Stationen | Laptops mit der Webseite im Vollbild, HDMI zum ATEM | Laptops |
| `server.py` | Einfacher Server für Entwicklung und Raspberry Pi | Mac, Pi |
| `atem-steuerung` | Eigenes, früheres Projekt für den ATEM, weiterhin nutzbar | Mac |

## Aufbau der Ausstellung

```
Laptops ── Netz ──► Switch ◄── Mac mini: App Tool Pool Regie, Drucker per USB
   │                  ├── ATEM Mini
   │ HDMI             ├── Astera PowerBox oder DataLink ── DMX ──► Titan Tube
   └────► ATEM Mini   └── Accesspoint: nur für Geräte ohne Kabel
             │ HDMI
             ▼
          großer Bildschirm
```

Alles bleibt im lokalen Netz. Die Ausstellung braucht kein Internet.

### Was wo gerechnet wird

| Aufgabe | Mac mini | Laptop |
|---|---|---|
| Seite und Offline-Kopien ausliefern | ja | |
| Plakate und Baustein-Vorschauen rechnen | ja | nur als Rückfall |
| Druck-PDF erzeugen und drucken | ja | nur als Rückfall |
| Bildwechsel, ATEM, Licht | ja | |
| Bedienung: ziehen, Regler, Anzeige | | ja |

Der Laptop schickt nur, was der Besucher gebaut hat, und zeigt die fertigen Bilder. Antwortet der Mac mini 3 Sekunden nicht, rechnet der Laptop selbst weiter und wechselt von allein zurück, sobald der Mac mini wieder da ist. Unter **Stationen > Plakate rechnet** lässt sich das Rechnen ganz auf die Laptops legen.

### Empfohlene Adressen

Ein Accesspoint und ein Switch vergeben von sich aus oft keine Adressen. Es braucht deshalb eines von beidem:

- Der Accesspoint läuft als Router mit DHCP und vergibt feste Adressen je Gerät. Das ist am einfachsten.
- Alle Geräte bekommen ihre Adresse von Hand.

| Gerät | Adresse |
|---|---|
| Mac mini | 192.168.10.10 |
| Laptop 1 bis 4 | 192.168.10.21 bis .24 |
| ATEM Mini | 192.168.10.240 (Werkseinstellung) |
| Accesspoint | 192.168.10.2 |
| PowerBox oder DataLink | per DHCP vom Accesspoint |

Der ATEM stand zuletzt auf `169.254.88.2`. So eine 169.254-Adresse vergibt sich ein Gerät selbst, wenn es keine bekommt, und sie liegt nicht im Bereich 192.168.10.x. In ATEM Software Control deshalb eine feste Adresse einstellen.

Die Astera-Datenblätter nennen für die Netzbuchse die Bereiche 2.x, 10.x und DHCP. Ohne DHCP braucht der Mac mini eine zusätzliche Adresse im Bereich der Box.

Laptops möglichst per Kabel anschließen. Eine Station braucht bei voller Bewegung rund 5 MB/s (40 Mbit/s), vier Stationen also rund 160 Mbit/s. Über WLAN **Bildqualität** und **Laststufe** senken.

Das WLAN mit Passwort schützen. Wer im Netz ist, kann die Stationsseite öffnen und im Rahmen der Regeln drucken. Die Steuerung selbst geht nur auf dem Mac mini.

## App installieren

### Paket bauen

Auf einem Mac mit Xcode 16 oder neuer:

```bash
zsh mac-app/Scripts/paket-bauen.sh
```

Das Ergebnis liegt in `dist/`: `Tool-Pool-Regie.dmg` und die fertige App. Das Paket enthält die Webseite und alle Offline-Kopien. Auf dem Mac mini braucht es weder Xcode noch Python.

Zum Entwickeln: `mac-app/ToolPoolRegie.xcodeproj` in Xcode öffnen und auf Run klicken. Die Webseite wird bei jedem Build neu in die App kopiert.

### Auf dem Mac mini

1. `Tool-Pool-Regie.dmg` per USB-Stick kopieren, öffnen und die App auf **Programme** ziehen.
2. App öffnen. Sie läuft ab macOS 14.
3. Meldet macOS, der Entwickler sei nicht verifiziert: In den Systemeinstellungen unter **Datenschutz & Sicherheit** auf **Trotzdem öffnen** klicken. Das kommt vor, weil die App nicht bei Apple beglaubigt ist. Per AirDrop oder Download kopierte Apps sind davon eher betroffen als per USB-Stick kopierte.
4. Die Frage nach dem **lokalen Netzwerk** mit **Erlauben** beantworten. Ohne das erreicht die App weder ATEM noch Licht.
5. Ist die Firewall an: **Eingehende Verbindungen erlauben**.

### Einrichtung in der App

Beim ersten Start öffnet sich **Einrichtung**. Sie führt von oben nach unten durch alles, ein grüner Haken zeigt den erledigten Schritt:

1. **Netzwerk:** feste Adresse für den Mac mini.
2. **Drucker:** per USB anschließen, in den Systemeinstellungen hinzufügen, Testseite.
3. **ATEM:** Adresse eintragen, Verbinden.
4. **Licht:** Adresse von PowerBox oder DataLink.
5. **Laptops:** Startdateien speichern und auf die Laptops kopieren.
6. **Dauerbetrieb:** beim Anmelden starten, wach halten.

Für den Dauerbetrieb zusätzlich in den Systemeinstellungen die automatische Anmeldung und unter Energie den Start nach Stromausfall einschalten. Die App braucht einen angeschlossenen Monitor oder einen HDMI-Dummy, damit macOS normal läuft.

### Laptops

**Startdateien für die Laptops speichern** erzeugt pro Station eine Datei für Mac (`.command`) und Windows (`.bat`). Doppelklick wartet auf den Mac mini und öffnet Google Chrome im Vollbild. Empfohlen ist Chrome.

Ohne Startdatei geht es von Hand im Browser:

```
http://192.168.10.10:8431/?station=1
```

Die Nummer merkt sich der Browser. `?station=0` meldet ihn wieder ab. HDMI des Laptops an den ATEM-Eingang mit derselben Nummer, Abweichungen werden auf der Karte der Station eingestellt. Der HDMI-Ausgang muss das Vollbild zeigen, also Bildschirm spiegeln.

## App bedienen

Die App läuft weiter, wenn das Fenster zu ist. Das Puzzle-Symbol in der Menüleiste öffnet das Fenster und bietet die wichtigsten Schalter. Beenden stoppt Server, Druck, Bildwechsel und Licht.

### Übersicht

Eine Karte pro Station: aktuelles Plakat, letzte Bedienung, wer rechnet, Zeit pro Bild, Bilder pro Sekunde und Datenmenge. Über 33 ms wird der Wert orange: Eine Station schafft dann keine 30 Bilder pro Sekunde mehr. **Auf den Bildschirm** schaltet sie durch, im Menü daneben stehen **Zurücksetzen**, **Neu laden**, **Nummer auf dem Laptop zeigen** und **Adresse kopieren**.

### Stationen

- **Museumsmodus:** nur der Baukasten im Vollbild, kein Upload, kein Export. Nach 3 Minuten ohne Bedienung zurück zum Startzustand. Der Startzustand ist das Board, das beim Einschalten des Modus auf der Station war.
- **Plakate rechnet:** Mac mini oder Laptops.
- **Laststufe:** Normal 30 Bilder/s. Sparsam 20 Bilder/s ohne Baustein-Vorschau. Minimal 12 Bilder/s in halber Auflösung. Druck und Export bleiben in voller Größe.
- **Bildqualität:** JPEG-Qualität der Bilder zu den Laptops.

### Bildschirm

| Modus | Verhalten |
|---|---|
| Aus | Die App schaltet nicht |
| Von Hand | Schaltet nur auf Klick. Ein Klick stoppt auch jede Automatik |
| Reihe | Verbundene Stationen nacheinander |
| Zufall | Zufällig unter den verbundenen Stationen |
| Aktivität | Wer in den letzten 30 Sekunden bedient wurde, kommt zuerst. Sonst zufällig |

Dazu die Dauer pro Bild und der Übergang: Schnitt oder Blende mit einstellbarer Länge. Getrennte Laptops werden übersprungen.

### Licht

Die App sendet Art-Net auf Port 6454, 25-mal pro Sekunde. Szenen: Aus, Farbe, Atmen, Farbwechsel, Aktivität (heller, wenn jemand bedient). Optional blitzt das Licht bei jedem Druck.

Art-Net meldet nichts zurück. „Pakete gesendet“ heißt nicht, dass das Licht sie erhält.

1. Titan Tube per Kabel an PowerBox oder DataLink, die Box ans Netz.
2. An der Titan oder in der AsteraApp ein DMX-Profil und eine Adresse wählen.
3. In der App dieselbe Adresse, dasselbe Universum und dieselbe Belegung (RGB, RGBW, DRGB, DRGBW) eintragen. Das Universum zählt ab 0. Zählt die Box ab 1, hier 1 weniger einstellen.

**Noch offen:** Das passende DMX-Profil am Gerät prüfen. Nur mit AsteraBox statt PowerBox oder DataLink ist unklar, ob Art-Net ankommt.

### Druckserver

Der Drucker hängt am Mac mini. Alle Stationen drucken über eine Warteschlange:

- **Jetzt drucken** auf der Station: Der Mac mini rechnet das Plakat in 200 dpi, baut das PDF mit Fußzeile (Datum, verwendete Tools) und reiht es ein. Aufträge gehen einzeln nacheinander zum Drucker.
- **Regeln:** Live-Druck an oder aus, A4 oder A3, Kopien, Pause je Station (Standard 30 Sekunden), Tageslimit.
- **Warteschlange:** bis 30 offene Aufträge. Anhalten, Abbrechen, Nochmal, PDF ansehen. PDFs lassen sich in den Bereich oder auf das App-Symbol ziehen.
- **Probelauf:** Nichts geht an den Drucker, die PDFs landen nur im Archiv. Beim Testen einschalten.
- **Archiv:** Jede Druckdatei bleibt unter `~/Library/Application Support/Tool Pool Regie/Druckarchiv/<Datum>/`. Die App löscht dort nichts. Ausgeschaltet entfernt sie nur ihre eigene Zwischenablage nach dem Druck.
- **Freigabe im Netz:** Macht den Drucker über die Druckfreigabe von macOS im Netz sichtbar, damit auch andere Programme auf den Laptops direkt drucken können. Diese Aufträge laufen am Regelwerk der App vorbei. macOS fragt nach dem Passwort.

Der Zustand des Druckers steht in der App: bereit, druckt, Papier leer, Papierstau, Klappe offen, meldet sich nicht.

### Einstellungen sichern

Unter **Einrichtung** lässt sich alles in eine Datei sichern und laden, praktisch beim Tausch des Mac mini. Sie liegen sonst in `~/Library/Application Support/Tool Pool Regie/konfiguration.json`, das Protokoll daneben in `protokoll.log`.

## Die Webseite

### Archiv

Die Tool-Sammlung aus dem Board, dazu die 52 Tools von playgrnd.tools. Ansichten: Drift, Index, Kategorien. Filter, Suche und Random. Links führen ins Netz oder zu den Offline-Kopien, umschaltbar unter ⚙.

### Baukasten

Das prozedurale Herzstück, gedacht wie TouchDesigner, bedient wie Scratch:

- Bausteine aus der Liste ziehen oder anklicken. Neue Teile landen vor dem Output.
- Ein Baustein nimmt seinen Nachbarn links oder oben als Eingang. Unter **Bezug auf** lässt sich jeder andere wählen, per Liste oder mit **⌖ zeigen**.
- Ebenen sind durchsichtig. Ein Effekt verändert nur, was in seinem Eingang steckt, zum Beispiel nur den Text und nicht den Hintergrund.
- Nur was mit dem **Output** verbunden ist, landet im Plakat. Der Rest wird abgedunkelt.
- Rechtsklick, Ziehen, Mehrfachauswahl, Pfeiltasten und Entf funktionieren. Leertaste startet und stoppt die Bewegung.
- **reset**, **random**, **neue Variation**. Plakatformate: A hoch, A quer, Quadrat, Story.
- Mini-Vorschau: in den Bausteinen klein, groß oder aus, in der Liste an oder aus.

Es gibt 96 Bausteine, nach Technik (Vektor, Pixel, Shader) und Familie gefiltert. Darunter die Tools von playgrnd.tools und die Nodes aus Moldaw. Shader laufen über WebGL.

### Export

**Export …** speichert das Plakat als PNG, GIF, WebM (VP9), MP4 (H.264) oder PNG-Folge. Bilder werden einzeln gerechnet, deshalb ruckelt das Ergebnis nicht. Über eine unverschlüsselte Netz-Adresse sperrt der Browser die dafür nötige Schnittstelle. WebM und MP4 werden dann in Echtzeit aufgenommen, bei schweren Plakaten kann das ruckeln. Auf `localhost` gilt das nicht.

### Notizen und Ranking

**Hochladen** legt das Plakat in den Notizen ab, gespeichert im Browser. **Ranking** vergleicht immer zwei Tools und führt daraus eine Rangliste.

### Drucken

Druckdialog mit Format bis A1, Hoch- oder Querformat, Doppelseite, Ränder, **Auf Seite vergrößern**. Gerechnet wird beim Drucken mit rund 300 dpi.

### Vorstufe

Druckvorstufe mit Ausschießen, in sechs Schritten: Quelle (Plakat aus dem Baukasten, PDF, Bilder), Endformat, Ausschießen, Marken, Auflage und Papier, Auftrag. Die Prüfung läuft dabei mit.

- **Schemata:** Einzelseiten, Schön- und Widerdruck, Rückstichheftung mit Bundzuwachs, Schneiden und Stapeln.
- **Bögen:** Digitaldruck, Offset Heidelberg, SRA3, A3, Großformat bis A1, eigenes Format.
- **Ausgabe:** Druckdaten-PDF mit Beschnitt, Druckbogen-PDF, Schema-Blatt und das ausgefüllte Auftragsformular der Grafischen Werkstatt.
- **HSD PBSA-Modus** (⚙): Kursleitung und Kurse aus dem Vorlesungsverzeichnis FB Design als Auswahl, Freifeld für Personen außerhalb der Liste. Aktualisieren einmal pro Semester mit `python3 hsd_holen.py`, Stand ist WiSe 26/27.

### Offline-Kopien

Zehn Tool-Seiten liegen in `offline/` und laufen im Offline-Modus jeweils auf einem eigenen Port (8432 bis 8441), weil sie an der Wurzel ihrer Domain erwartet werden. Einmal mit Internet holt `python3 offline_holen.py` sie neu. `server.py` lädt fehlende Dateien bei Bedarf aus dem Netz nach, die App nicht: Sie bleibt strikt lokal.

Manche Kopien könnten über `http://IP` eingeschränkt sein, weil Browser einige Funktionen nur auf `localhost` oder mit HTTPS erlauben. Das ist nicht einzeln geprüft.

## Technik

### Bestandteile der App

| Datei | Aufgabe |
|---|---|
| `Kern/HTTPServer.swift` | HTTP-Server ohne Zusatzpakete, statische Dateien, Datenströme |
| `Kern/Regie.swift` | Mitte der App: Einstellungen, Stationen, Bildwechsel, Schnittstelle |
| `Kern/RenderFarm.swift` | Eine unsichtbare Seite pro Station rechnet die Plakate |
| `Kern/AtemClient.swift` | ATEM-Protokoll über UDP 9910 |
| `Kern/LichtMotor.swift` | Art-Net und Lichtszenen |
| `Kern/Druckserver.swift` | Warteschlange und Anbindung an das Drucksystem von macOS |
| `Kern/StationStarter.swift` | Startdateien für die Laptops |
| `Ansichten/` | Oberfläche in SwiftUI |
| `ToolPoolRegieTests/` | Unit-Tests |
| `Werkzeuge/atem_simulator.py` | ATEM-Simulator zum Testen ohne Gerät |

### Rechnen auf dem Mac mini

Je Station startet die App eine unsichtbare Seite `render.html` in einem eigenen Prozess, mit derselben Engine wie die Laptops. Der Takt kommt aus der App, damit macOS die nie sichtbare Seite nicht bremst.

```
Laptop                         Mac mini
js/fern.js ── Board als JSON ──► POST /api/render/zustand ──► render.js
#out-Canvas ◄── JPEG-Pakete ─── GET /api/render/strom ◄───── RenderFarm
```

Stürzt eine Seite ab oder hängt sie länger als 15 Sekunden, wird sie neu geladen und bekommt das letzte Board wieder. Ohne Abruf schließt sie nach 2 Minuten. Weil die Seiten im Dauerbetrieb im Speicher wachsen (gemessen rund 5 MB pro Minute und Station), lädt die App sie jede Stunde neu, wenn gerade niemand an der Station arbeitet, spätestens nach 4 Stunden. Laufende Simulationen im Plakat beginnen dabei von vorn. Enthält ein Board ein Bild aus dem **Bild**-Baustein, rechnet der Laptop selbst, weil das Bild nur dort liegt. Im Museumsmodus ist dieser Baustein ausgeblendet.

### Schnittstellen

| Adresse | Zweck | Zugriff |
|---|---|---|
| `POST /api/station/puls` | Station meldet sich alle 2 s, holt Einstellungen und Befehle | Netz |
| `POST /api/render/zustand` | Board und Maus zum Rechner | Netz |
| `GET /api/render/strom` | Bilder zum Laptop | Netz |
| `POST /api/druck/auftrag` | Der Mac mini rechnet und druckt das Plakat | Netz |
| `POST /api/drucken` | Fertiges PDF einreihen | Netz |
| `GET /api/drucker` | Drucker und Standard | Netz |
| `/api/regie/*` | Status und Steuerung für eigene Skripte | Nur der Mac mini selbst |

Fremde Webseiten im selben Browser können nichts auslösen: POST-Anfragen mit fremder Herkunft werden abgelehnt.

### ATEM

Die App spricht direkt mit dem Gerät. Der Ablauf folgt der Bibliothek PyATEMMax, mit der `atem-steuerung` am ATEM läuft: Anmeldung, Bestätigung jedes Pakets, Nachfordern verlorener Startpakete, Neuverbindung nach 5 Sekunden Stille. Ein Schnitt, den der ATEM nicht bestätigt, wird bis zu zweimal wiederholt.

PyATEMMax steht unter der GPL. Für den internen Einsatz spielt das keine Rolle. Soll die App weitergegeben werden, vorher die Lizenzfrage klären.

Fällt die App-Anbindung aus, bleibt `atem-steuerung` als Ersatz: Der ATEM nimmt mehrere Programme gleichzeitig an. In der App dann den Bildschirm-Modus auf **Aus** stellen.

### Ohne App: `server.py`

Der Python-Server bleibt für Entwicklung und Raspberry Pi. Er kann alles außer dem Rechnen auf dem Server und dem Druckserver mit Warteschlange.

```bash
python3 server.py
```

```bash
python3 server.py --netz --drucken
```

```bash
python3 server.py --regie
```

`--regie` bietet eine einfache Regie im Browser unter `/regie.html` und spricht den ATEM über `atem-steuerung` an. Der Doppelklick-Starter dafür ist `Regie starten.command`. Für den Raspberry Pi 3 B+ gibt es `pi/installieren.sh` und `pi/auf-den-pi.sh nutzer@host`. Als Server taugt der Pi, als Arbeitsgerät ist er mit 1 GB Arbeitsspeicher zu schwach. Die Pi-Skripte sind nicht auf einem echten Pi getestet.

## Testen

Unit-Tests in Xcode mit Cmd+U oder so:

```bash
xcodebuild -project mac-app/ToolPoolRegie.xcodeproj -scheme ToolPoolRegie test
```

ATEM-Simulator statt echtem Gerät, in der App als Adresse `127.0.0.1` eintragen:

```bash
python3 mac-app/Werkzeuge/atem_simulator.py
```

### Teststand

Getestet auf einem MacBook Pro mit M3 Max und macOS 27:

| Bereich | Wie getestet | Ergebnis |
|---|---|---|
| Plakate in der App | Alle Bausteine in Chrome und in der App verglichen | Sehen gleich aus, kleine Abweichungen bei Korn und Kanten |
| ATEM-Pakete | App und PyATEMMax gegen denselben Simulator, drei Betriebsarten | Bytes bis auf die Sitzungsnummer identisch |
| Bildschirm-Modi | Reihe, Zufall, Aktivität am Simulator | Stimmt |
| Licht | Art-Net-Empfänger auf demselben Rechner | Pakete, Belegung, Blitz stimmen |
| Druckserver | Probelauf: Warteschlange, Pause, Limit, Anhalten, PDF prüfen | Stimmt |
| Station über Netz-Adresse | Browser über `http://IP`, 30 Bilder/s, Laptop rechnet nichts | Stimmt |
| Ausfall | App hart beendet, Station rechnet weiter, App wieder da, Station kommt zurück | Stimmt |
| Vier Stationen | Ein Browser und drei simulierte Laptops, Wert siehe unten | Stimmt |
| Unit-Tests | Protokolle, Einstellungen, Druckertexte, Server | Alle bestanden |

Last bei vier gleichzeitigen Stationen mit dem Startboard: 30 Bilder/s je Station, die Rechnerseiten zusammen rund 170 % eines Kerns und rund 500 MB Arbeitsspeicher, die App selbst rund 15 % und 160 MB. Über 8 Minuten blieb die Bildrate stabil. Der Speicher der Rechnerseiten stieg dabei langsam, deshalb werden sie regelmäßig neu geladen. Auf einem Mac mini sind die Werte je nach Chip höher. Die Karte in der Übersicht zeigt sie im Betrieb.

### Noch nicht getestet

- [ ] Echter ATEM an der App
- [ ] Echte Titan Tube und das passende DMX-Profil
- [ ] Druck auf Papier über die App, Testseite und Plakat
- [ ] Freigabe im Netz: ändert eine Systemeinstellung und wurde deshalb nicht ausgeführt
- [ ] Beim Anmelden automatisch starten
- [ ] Echte Laptops, echte Mac-mini-Leistung, Start auf macOS 14 bis 26
- [ ] Startdateien auf Windows
- [ ] Dauerlauf über mehrere Tage

### Prüfliste vor der Eröffnung

- [ ] Jeder Laptop erscheint als Karte, mit Plakat und Zahlen
- [ ] Jeder Laptop schaltet auf den richtigen ATEM-Eingang, mit **Nummer auf dem Laptop zeigen** prüfen
- [ ] Reihe, Zufall und Aktivität einmal durchlaufen lassen
- [ ] Licht: Farbe, Helligkeit, Blitz beim Druck
- [ ] Probelauf aus, Testseite, dann ein echtes Plakat von jeder Station
- [ ] Netzwerkkabel ziehen und wieder stecken: Die Station rechnet weiter und meldet sich zurück
- [ ] Mac mini neu starten: Alles kommt von selbst wieder
- [ ] Mehrere Stunden Dauerlauf

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| Port 8431 ist belegt | Läuft noch `server.py` oder eine zweite App? Beenden. Die App versucht es alle 3 Sekunden neu und übernimmt, sobald der Port frei ist |
| ATEM wird nicht gefunden | Adresse in ATEM Software Control prüfen. Beide im selben Adressbereich? Unter Datenschutz > Lokales Netzwerk die App erlauben |
| ATEM ist voll | Andere Programme wie ATEM Software Control schließen |
| Licht bleibt dunkel | Szene nicht auf Aus? Adresse, Universum, Belegung und Profil vergleichen. Box im selben Adressbereich? |
| Farben stimmen nicht | Belegung passt nicht zum DMX-Profil der Titan |
| Laptop findet den Mac mini nicht | Adresse prüfen, Firewall erlauben, beide im selben Netz, Client-Isolation am Accesspoint aus |
| Station zeigt „Laptop“ statt „Mac mini“ | Verbindung bricht ab, oder das Board enthält ein eigenes Bild |
| Bild ruckelt | Laststufe senken, Bildqualität senken, Laptop per Kabel |
| Druck kommt nicht | Bereich Druckserver: Probelauf aus? Warteschlange nicht angehalten? Was sagt der Zustand des Druckers? |
| Falsche Seitengröße | Papierfach und Format in der App vergleichen |
| Station bleibt beim alten Stand | In der App **Neu laden** |
| Mac mini geht schlafen | Einrichtung > wach halten, Systemeinstellungen > Energie |

## GitHub

Der Quelltext liegt öffentlich im Gruppen-Repository [matter-matters-archive](https://github.com/qqdcc8mm8q-droid/matter-matters-archive), Branch `stand/nils`, Ordner `toolpool/`. Der Rest des Repositorys ist das Archiv der Gruppe und bleibt unberührt.

- **Hochladen:** Doppelklick auf `Auf GitHub hochladen.command`. Das Skript fragt, was sich geändert hat, und speichert den Stand als `JJJJ-MM-TT HH:MM — Stand nils: …`. So steht es in den Regeln der Gruppe, `.cursor/rules/git-stands.mdc`.
- **Gearbeitet wird weiter in diesem Ordner.** Das Skript kopiert nach `../matter-matters-archive/toolpool/` und lädt von dort hoch. Dort nichts direkt ändern, denn beim nächsten Hochladen wird der Ordner neu befüllt.
- **Nicht auf GitHub:** Offline-Kopien, `dist/` und ZIP-Dateien, festgelegt in `.gitignore`. Die Offline-Kopien enthalten fremde Seiten und Adobe-Schriften und gehören nicht in ein öffentliches Repository.
- **Nach dem Herunterladen von GitHub** einmal mit Internet `python3 offline_holen.py` ausführen, dann ist der Offline-Modus wieder da. Ohne die Kopien läuft die Webseite über die Online-Links.
- **Auf einem anderen Mac einrichten:** `brew install gh`, dann `gh auth login` und `gh auth setup-git`. Git braucht außerdem Namen und E-Mail: `git config --global user.name` und `git config --global user.email`, am besten die private Adresse von GitHub unter Settings > Emails.
- **Regeln der Gruppe:** Nicht auf `main` arbeiten und nie mit Force pushen. Nach `main` kommen nur fertige Stände, per Pull Request oder Merge.

## Dateien

```
toolpool/
├── index.html             Webseite
├── js/                    app, engine, shader, playgrnd, moldaw, vorstufe, export,
│                          museum, station, fern, druckpdf, render, hsd, data, vendor
├── css/style.css
├── render.html            Rechnerseite für die App
├── doku.html              Diese Dokumentation in der App
├── offline/               Offline-Kopien, ports.json, manifest.js
├── assets/                Auftragsformular der Werkstatt
├── server.py, regie.py    Python-Server und Browser-Regie
├── regie.html             Browser-Regie
├── offline_holen.py       Offline-Kopien neu holen
├── hsd_holen.py           Vorlesungsverzeichnis neu holen
├── pi/                    Skripte für den Raspberry Pi
├── mac-app/               Xcode-Projekt der App
│   └── Scripts/           web-einbetten.sh, paket-bauen.sh
├── dist/                  Fertige App und Installationspaket
├── Tool-Pool-Webseite.zip Nur die Webseite als Paket, mit Server, Offline-Kopien und LIESMICH.txt
├── .gitignore             Was nicht auf GitHub kommt
└── *.command              Doppelklick-Starter und Auf GitHub hochladen
```

## Arbeitsprotokoll

### 3. November 2026

- Webseite angelegt: Bausteine wie in Scratch statt Nodes, Tools nach Pixel, Vektor und Shader geordnet, Gestaltung nach Vorschlag.
- Eingabe vereinfacht: Bezug wird gewählt, statt dass alles auf alles wirkt.
- Prozedurales System wie in TouchDesigner: Effekte wirken nur auf ihren Eingang.
- Output-Node: Nur Verbundenes verändert das Ergebnis.
- Besseres Ziehen, Rechtsklick, Auswählen, Darkmode. Neue Teile landen vor dem Output.
- Alle Tools von playgrnd.tools gesichtet, Kategorien überarbeitet, als Bausteine eingebaut, Shader inklusive.
- Offline-Betrieb: alle Tool-Seiten lokal, Umschalter online und offline, Favicon.
- Druckvorstufe mit Ausschießen, Übergabe aus dem Baukasten, Schärfe korrigiert.
- HSD PBSA-Modus: Auftragsformular, Auswahl der Lehrenden, Freifeld.
- Export als GIF und Video, Mini-Vorschau in den Bausteinen.

### 5. November 2026

- Offline-Hinweis aus der Oberfläche entfernt, die Funktion bleibt.
- Moldaw als Bausteine ergänzt.
- A1 und **Auf Seite vergrößern** ergänzt.
- Leere Druckseite bei importierten Bildern behoben. Wichtig: Plakat- und Bilder-PDFs aus der Vorstufe von vor dieser Korrektur waren leer und müssen neu erzeugt werden.
- Raspberry Pi 3 B+ bewertet, Skripte für den Pi geschrieben.
- Server vom MacBook aus im Netz erreichbar gemacht.
- Museumsmodus und Live-Druck.
- Ausstellungsplan: Mac mini, Laptops, ATEM, Licht. Erste Regie im Browser.
- Native Mac-App mit Xcode: Server, Druckserver mit Warteschlange, direkte ATEM- und Art-Net-Anbindung, Rechnen auf dem Mac mini, Einrichtung, ATEM-Simulator, Unit-Tests, Installationspaket, diese Dokumentation.
- Die Webseite allein als ZIP gepackt. `server.py` läuft dafür auch ohne `regie.py`.

### 8. November 2026

- Auf GitHub: Branch `stand/nils` im Gruppen-Repository, Ordner `toolpool/`, ohne Offline-Kopien und Pakete. Hochladen per Doppelklick.

## Offene Fragen

Diese Angaben entscheiden über die letzten Einstellungen:

- Wie viele Laptops, mit welchem Betriebssystem? Der ATEM Mini hat 4 HDMI-Eingänge, für mehr braucht es ein größeres Modell.
- Welcher Mac mini? Das Paket enthält Apple-Chip und Intel und ist für macOS 14 oder neuer gebaut. Gestartet wurde es bisher nur auf einem M3 Max mit macOS 27.
- Welche Astera-Hardware steht bereit: PowerBox, DataLink oder nur AsteraBox?
- Kann der Accesspoint DHCP mit festen Zuweisungen?
- Welcher Drucker, welche Papierformate?
