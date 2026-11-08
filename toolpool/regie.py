"""Tool Pool – Regie für die Ausstellung (läuft nur mit server.py --regie).

Der Mac mini hostet alles und steuert von hier aus:
  Stationen  melden sich alle 2 Sekunden (js/station.js) und holen sich Einstellungen und Befehle ab.
  Monitor    wählt, welche Station auf dem Bildschirm läuft, und schaltet über die vorhandene
             ATEM Steuerung (Ordner atem-steuerung, http://127.0.0.1:8460).
  Licht      sendet Art-Net an die Astera PowerBox oder DataLink, von dort per DMX zur Titan Tube.
"""
import colorsys, ipaddress, json, math, os, random, socket, struct, threading, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
DATEI = os.path.join(ROOT, 'regie-daten.json')
ATEM_URL = 'http://127.0.0.1:8460'
ONLINE_S = 8          # so lange gilt eine Station nach dem letzten Puls als da
AKTIV_S = 30          # so lange gilt eine Station nach der letzten Bedienung als aktiv
STATION_MAX = 32
BILD_MAX = 200_000
MODI = ('aus', 'manuell', 'reihe', 'zufall', 'aktivitaet')
SZENEN = ('aus', 'farbe', 'atmen', 'wechsel', 'aktivitaet')
LAYOUTS = {'RGB': 'rgb', 'RGBW': 'rgbw', 'DRGB': 'drgb', 'DRGBW': 'drgbw'}
STUFEN = ('normal', 'sparsam', 'minimal')
FORMATE = ('A4', 'A3')

STANDARD = {
    'ausstellung': {'museum': True, 'live': True, 'drucker': '', 'format': 'A4', 'leistung': 'normal'},
    'monitor': {'modus': 'aus', 'sekunden': 15},
    'licht': {'ziel': '', 'universum': 0, 'adresse': 1, 'layout': 'RGBW', 'anzahl': 1, 'szene': 'aus',
              'farbe': '#ffffff', 'hell': 100, 'druck_blitz': True},
    'namen': {},       # Station -> Name
    'eingaenge': {},   # Station -> ATEM-Eingang (ohne Eintrag: gleiche Nummer)
}


class Fehler(Exception):
    """Text wird direkt in der Regie angezeigt."""


def _zahl(wert, lo, hi, was):
    if isinstance(wert, bool) or not isinstance(wert, (int, float)):
        raise Fehler(was + ' muss eine Zahl sein')
    return max(lo, min(hi, int(wert)))


def _wahl(wert, erlaubt, was):
    if wert not in erlaubt:
        raise Fehler('Unbekannt: ' + was)
    return wert


def station_id(wert):
    if isinstance(wert, bool) or not isinstance(wert, int) or not 1 <= wert <= STATION_MAX:
        raise Fehler('Ungültige Station')
    return wert


def _ip(wert):
    wert = str(wert).strip()
    if not wert:
        return ''
    try:
        return str(ipaddress.IPv4Address(wert))
    except ValueError:
        raise Fehler('Das ist keine gültige IP-Adresse')


def _farbe(wert):
    wert = str(wert)
    if len(wert) != 7 or wert[0] != '#':
        raise Fehler('Ungültige Farbe')
    int(wert[1:], 16)
    return wert.lower()


def _atem(pfad, daten=None):
    """Anfrage an die ATEM Steuerung. Liefert (Antwort, Fehlertext)."""
    body = None if daten is None else json.dumps(daten).encode()
    req = urllib.request.Request(ATEM_URL + pfad, data=body, headers={'Content-Type': 'application/json'})
    # System-Proxy umgehen: Ziel ist immer dieser Rechner
    oeffner = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with oeffner.open(req, timeout=2) as r:
            return json.load(r), ''
    except urllib.error.HTTPError as e:
        try:
            return None, json.load(e).get('error') or 'Fehler %d' % e.code
        except ValueError:
            return None, 'Fehler %d' % e.code
    except (OSError, ValueError):
        return None, 'ATEM Steuerung läuft nicht'


class Regie:
    def __init__(self, adressen=()):
        self.lock = threading.RLock()
        self.adressen = list(adressen)
        self.cfg = json.loads(json.dumps(STANDARD))
        try:
            with open(DATEI, encoding='utf-8') as f:
                alt = json.load(f)
            for k, v in alt.items():
                if k in self.cfg and isinstance(v, dict):
                    self.cfg[k].update(v)
        except FileNotFoundError:
            pass
        except (ValueError, OSError) as e:
            print('regie-daten.json wird ignoriert:', e)
        self.stationen = {}
        self.drucke = 0
        self.atem = {'verbunden': False, 'modell': '', 'programm': None, 'ip': '', 'fehler': ''}
        self.monitor_fehler = ''
        self.naechster = 0.0
        self.aktuell = None        # Station, die die Automatik zuletzt gewählt hat
        self.blitz_bis = 0.0
        self.licht_fehler = ''
        self.licht_pakete = 0
        self.licht_rgb = (0.0, 0.0, 0.0)

    def starten(self):
        threading.Thread(target=self._monitor_schleife, daemon=True).start()
        threading.Thread(target=self._licht_schleife, daemon=True).start()

    def _speichern(self):
        tmp = DATEI + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.cfg, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DATEI)

    # ---------- Stationen ----------
    def puls(self, d):
        sid = station_id(d.get('id'))
        jetzt = time.time()
        with self.lock:
            s = self.stationen.setdefault(sid, {'bild': '', 'befehle': []})
            s['zuletzt'] = jetzt
            if 'ruhe' in d:   # fehlt, solange an dieser Station noch niemand etwas gemacht hat
                s['bedient'] = jetzt - _zahl(d['ruhe'], 0, 86400, 'Ruhe')
            s['ms'] = _zahl(d.get('ms', 0), 0, 100000, 'ms')
            s['fps'] = _zahl(d.get('fps', 0), 0, 240, 'fps')
            bild = d.get('bild')
            if isinstance(bild, str) and bild.startswith('data:image/jpeg;base64,') and len(bild) < BILD_MAX:
                s['bild'] = bild
            befehle, s['befehle'] = s['befehle'], []
            a = self.cfg['ausstellung']
            return {'ausstellung': dict(a), 'befehle': befehle, 'name': self.cfg['namen'].get(str(sid), '')}

    def befehl(self, ziel, cmd):
        _wahl(cmd, ('reset', 'neuladen', 'zeigen'), 'Befehl')
        with self.lock:
            ziele = list(self.stationen) if ziel == 'alle' else [station_id(ziel)]
            for sid in ziele:
                if sid in self.stationen:
                    self.stationen[sid]['befehle'].append(cmd)

    def _online(self):
        grenze = time.time() - ONLINE_S
        return sorted(i for i, s in self.stationen.items() if s.get('zuletzt', 0) >= grenze)

    def _eingang(self, sid):
        return self.cfg['eingaenge'].get(str(sid), sid)

    # ---------- Monitor ----------
    def schneide(self, sid):
        """Von Hand: Station auf den Monitor. Die Automatik geht dabei auf Manuell."""
        station_id(sid)
        with self.lock:
            eingang = self._eingang(sid)
            self.cfg['monitor']['modus'] = 'manuell'
            self.aktuell = sid
            self._speichern()
        _, fehler = _atem('/api/switch', {'input': eingang})
        if fehler:
            raise Fehler(fehler)

    def verbinde_atem(self, ip):
        ip = _ip(ip)
        if not ip:
            raise Fehler('Bitte die IP-Adresse des ATEM eintragen')
        _, fehler = _atem('/api/connect', {'ip': ip})
        if fehler:
            raise Fehler(fehler)

    def _waehle(self, modus, online):
        if modus == 'reihe':
            return next((i for i in online if self.aktuell is None or i > self.aktuell), online[0])
        andere = [i for i in online if i != self.aktuell]
        if modus == 'aktivitaet':
            jetzt = time.time()
            aktiv = [i for i in online if jetzt - self.stationen[i].get('bedient', 0) < AKTIV_S]
            if aktiv:
                # Wer gerade bedient, kommt dran. Sind es mehrere, wird gewechselt.
                andere_aktiv = [i for i in aktiv if i != self.aktuell]
                return random.choice(andere_aktiv) if andere_aktiv else self.aktuell
        return random.choice(andere or online)

    def _monitor_schritt(self):
        st, fehler = _atem('/api/status')
        with self.lock:
            self.atem = {
                'verbunden': bool(st and st.get('connected')), 'modell': (st or {}).get('model', ''),
                'programm': (st or {}).get('program'), 'ip': ((st or {}).get('settings') or {}).get('ip', ''),
                'fehler': fehler,
            }
            modus, online = self.cfg['monitor']['modus'], self._online()
            if modus in ('aus', 'manuell') or not self.atem['verbunden'] or not online or time.time() < self.naechster:
                return
            self.aktuell = self._waehle(modus, online)
            eingang = self._eingang(self.aktuell)
            self.naechster = time.time() + self.cfg['monitor']['sekunden']
        # Die eigene Automatik der ATEM Steuerung darf nicht dazwischenfunken
        if st.get('auto', {}).get('running'):
            _atem('/api/auto', {'running': False})
        _, fehler = _atem('/api/switch', {'input': eingang})
        with self.lock:
            self.monitor_fehler = fehler

    def _monitor_schleife(self):
        while True:
            try:
                self._monitor_schritt()
            except Exception as e:   # die Schleife darf nie enden, sonst steht die Ausstellung
                self.monitor_fehler = 'Interner Fehler: %s' % e
            time.sleep(1)

    # ---------- Licht ----------
    def _lichtfarbe(self, t):
        l = self.cfg['licht']
        h = l['farbe']
        basis = tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
        szene = l['szene']
        if szene == 'aus':
            k, c = 0.0, basis
        elif szene == 'atmen':
            k, c = 0.25 + 0.75 * (0.5 + 0.5 * math.sin(2 * math.pi * t / 6)), basis
        elif szene == 'wechsel':
            k, c = 1.0, colorsys.hsv_to_rgb((t / 60) % 1, 1, 1)
        elif szene == 'aktivitaet':
            jetzt = time.time()
            online = self._online()
            frisch = max((math.exp(-(jetzt - self.stationen[i].get('bedient', 0)) / 20) for i in online), default=0.0)
            k, c = 0.2 + 0.8 * frisch, basis
        else:
            k, c = 1.0, basis
        k *= l['hell'] / 100
        rgb = tuple(x * k for x in c)
        rest = self.blitz_bis - time.time()
        if rest > 0 and l['druck_blitz']:
            m = min(1.0, rest / 0.6)
            rgb = tuple(x + (1 - x) * m for x in rgb)
        return rgb

    @staticmethod
    def _kanaele(rgb, layout):
        r, g, b = rgb
        if 'w' in layout:   # Weißanteil auf den eigenen Kanal legen
            w = min(r, g, b)
            r, g, b = r - w, g - w, b - w
        else:
            w = 0.0
        werte = {'d': 1.0, 'r': r, 'g': g, 'b': b, 'w': w}
        return bytes(max(0, min(255, round(werte[k] * 255))) for k in layout)

    def _dmx(self, rgb):
        l = self.cfg['licht']
        kanal = self._kanaele(rgb, LAYOUTS[l['layout']])
        daten = bytearray(512)
        for i in range(l['anzahl']):
            start = l['adresse'] - 1 + i * len(kanal)
            if start + len(kanal) > 512:
                break
            daten[start:start + len(kanal)] = kanal
        return bytes(daten)

    @staticmethod
    def _artdmx(universum, seq, daten):
        return (b'Art-Net\0' + struct.pack('<H', 0x5000) + b'\x00\x0e' +
                bytes((seq, 0, universum & 0xFF, (universum >> 8) & 0x7F)) + struct.pack('>H', len(daten)) + daten)

    def _licht_schleife(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        seq, t0 = 0, time.monotonic()
        while True:
            try:
                with self.lock:
                    ziel, uni = self.cfg['licht']['ziel'], self.cfg['licht']['universum']
                    rgb = self._lichtfarbe(time.monotonic() - t0)
                    dmx = self._dmx(rgb)
                    self.licht_rgb = rgb
                if ziel:
                    seq = seq % 255 + 1
                    sock.sendto(self._artdmx(uni, seq, dmx), (ziel, 6454))
                    self.licht_pakete += 1
                self.licht_fehler = ''
            except OSError as e:
                self.licht_fehler = 'Senden geht nicht: %s' % e.strerror
                time.sleep(1)
            except Exception as e:
                self.licht_fehler = 'Interner Fehler: %s' % e
                time.sleep(1)
            time.sleep(0.04)

    # ---------- Druck ----------
    def druck_erlaubt(self):
        return self.cfg['ausstellung']['live']

    def gedruckt(self):
        with self.lock:
            self.drucke += 1
            self.blitz_bis = time.time() + 1.2

    # ---------- Einstellungen ----------
    def setzen(self, p):
        with self.lock:
            neu = json.loads(json.dumps(self.cfg))
            a, m, l = p.get('ausstellung') or {}, p.get('monitor') or {}, p.get('licht') or {}
            for k in ('museum', 'live'):
                if k in a:
                    neu['ausstellung'][k] = bool(a[k])
            if 'drucker' in a:
                neu['ausstellung']['drucker'] = str(a['drucker'])[:200]
            if 'format' in a:
                neu['ausstellung']['format'] = _wahl(a['format'], FORMATE, 'Format')
            if 'leistung' in a:
                neu['ausstellung']['leistung'] = _wahl(a['leistung'], STUFEN, 'Leistungsstufe')
            if 'modus' in m:
                neu['monitor']['modus'] = _wahl(m['modus'], MODI, 'Modus')
                self.naechster = 0.0
            if 'sekunden' in m:
                neu['monitor']['sekunden'] = _zahl(m['sekunden'], 3, 3600, 'Dauer')
            if 'ziel' in l:
                neu['licht']['ziel'] = _ip(l['ziel'])
            if 'universum' in l:
                neu['licht']['universum'] = _zahl(l['universum'], 0, 32767, 'Universum')
            if 'adresse' in l:
                neu['licht']['adresse'] = _zahl(l['adresse'], 1, 512, 'Adresse')
            if 'anzahl' in l:
                neu['licht']['anzahl'] = _zahl(l['anzahl'], 1, 100, 'Anzahl')
            if 'hell' in l:
                neu['licht']['hell'] = _zahl(l['hell'], 0, 100, 'Helligkeit')
            if 'layout' in l:
                neu['licht']['layout'] = _wahl(l['layout'], LAYOUTS, 'DMX-Belegung')
            if 'szene' in l:
                neu['licht']['szene'] = _wahl(l['szene'], SZENEN, 'Szene')
            if 'farbe' in l:
                try:
                    neu['licht']['farbe'] = _farbe(l['farbe'])
                except ValueError:
                    raise Fehler('Ungültige Farbe')
            if 'druck_blitz' in l:
                neu['licht']['druck_blitz'] = bool(l['druck_blitz'])
            if 'name' in p:
                sid = station_id(p['name'].get('id'))
                neu['namen'][str(sid)] = str(p['name'].get('name', '')).strip()[:30]
            if 'eingang' in p:
                sid = station_id(p['eingang'].get('id'))
                neu['eingaenge'][str(sid)] = _zahl(p['eingang'].get('eingang'), 1, 8, 'Eingang')
            self.cfg = neu
            self._speichern()

    def status(self):
        jetzt = time.time()
        with self.lock:
            online = set(self._online())
            ids = sorted(set(self.stationen) | set(range(1, 5)))
            stationen = []
            for i in ids:
                s = self.stationen.get(i, {})
                eingang = self._eingang(i)
                stationen.append({
                    'id': i, 'name': self.cfg['namen'].get(str(i), ''), 'online': i in online,
                    'ruhe': round(jetzt - s['bedient']) if s.get('bedient') else None,
                    'ms': s.get('ms', 0), 'fps': s.get('fps', 0), 'bild': s.get('bild', ''),
                    'eingang': eingang, 'auf_monitor': self.atem['programm'] == eingang,
                })
            return {
                'stationen': stationen, 'cfg': self.cfg, 'atem': self.atem, 'drucke': self.drucke,
                'monitor_fehler': self.monitor_fehler, 'adressen': self.adressen,
                'naechster': max(0, round(self.naechster - jetzt)),
                'licht': {'fehler': self.licht_fehler, 'pakete': self.licht_pakete,
                          'rgb': [round(x * 255) for x in self.licht_rgb]},
            }
