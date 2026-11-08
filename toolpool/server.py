#!/usr/bin/env python3
"""Tool Pool – lokaler Server.

Aufruf:  python3 server.py            (öffnet den Browser)
         python3 server.py --kein-browser
         python3 server.py --netz      (für andere Geräte im Netz erreichbar, z. B. auf dem Raspberry Pi)
         python3 server.py --netz --drucken   (andere Geräte dürfen auch auf den Druckern dieses Rechners drucken)
         python3 server.py --druck-probe      (Live-Druck ohne Papier: speichert die PDFs nur im Temp-Ordner)
         python3 server.py --regie            (Ausstellung: wie --netz --drucken, dazu die Regie auf /regie.html)

Port 8431: die Tool-Pool-Seite selbst.
Ab Port 8432: jede Offline-Kopie aus offline/<domain>/ auf ihrem eigenen Port
(Zuordnung in offline/ports.json). So laufen die Kopien wie im Original an der
Wurzel ihrer Domain, auch Seiten, die mit /assets/... oder einem Router arbeiten.
Fehlt in einer Kopie eine Datei und es gibt Internet, wird sie einmal geholt und gespeichert.
"""
import http.server, json, os, posixpath, shutil, socket, socketserver, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request, webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
OFF = os.path.join(ROOT, 'offline')
PORT = 8431
HOST = '127.0.0.1'   # --netz: 0.0.0.0
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_POST(self):  # Analyse- und API-Aufrufe der Kopien still ablehnen
        self.send_response(204)
        self.end_headers()


# ---------- Live-Druck ----------
DRUCK_NETZ = False     # --drucken: auch andere Geräte dürfen drucken (sonst nur dieser Rechner)
DRUCK_PROBE = False    # --druck-probe: nichts an den Drucker schicken
DRUCK_PAUSE = 15       # Sekunden zwischen zwei Aufträgen
DRUCK_MAX = 80 << 20
FORMATE = ('A4', 'A3')
druck_lock = threading.Lock()
druck_zuletzt = 0.0
REGIE = None           # --regie: siehe regie.py
regie = None           # das Modul wird nur mit --regie geladen, die Webseite läuft auch ohne die Datei
JSON_MAX = 300_000


def drucker_liste():
    """Drucker dieses Rechners: (Namen, Standarddrucker)."""
    if DRUCK_PROBE:
        return ['Probedrucker'], 'Probedrucker'
    env = dict(os.environ, LC_ALL='C')
    try:
        a = subprocess.run(['lpstat', '-a'], capture_output=True, text=True, timeout=5, env=env).stdout
        d = subprocess.run(['lpstat', '-d'], capture_output=True, text=True, timeout=5, env=env).stdout
    except (OSError, subprocess.SubprocessError):
        return [], ''
    namen = [z.split()[0] for z in a.splitlines() if z.strip()]
    std = d.rsplit(':', 1)[1].strip() if ':' in d else ''
    return namen, std


class PoolHandler(Quiet):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def antwort(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def darf_drucken(self):
        return DRUCK_NETZ or self.client_address[0] in ('127.0.0.1', '::1')

    def do_GET(self):
        if self.path.split('?')[0] == '/api/drucker':
            namen, std = drucker_liste()
            return self.antwort(200, {'drucker': namen, 'standard': std, 'erlaubt': self.darf_drucken(), 'probe': DRUCK_PROBE})
        if self.path.split('?')[0] == '/api/regie/status':
            if not REGIE:
                return self.antwort(404, {'fehler': 'Server ohne --regie gestartet'})
            if not self.ist_lokal():
                return self.antwort(403, {'fehler': 'Die Regie geht nur auf dem Mac mini selbst'})
            return self.antwort(200, REGIE.status())
        super().do_GET()

    def ist_lokal(self):
        return self.client_address[0] in ('127.0.0.1', '::1')

    def fremde_herkunft(self):
        # Fremde Webseiten im selben Browser dürfen nichts auslösen
        origin = self.headers.get('Origin')
        return bool(origin) and urllib.parse.urlparse(origin).netloc != self.headers.get('Host')

    def do_POST(self):
        pfad = self.path.split('?')[0]
        if pfad == '/api/drucken':
            return self.drucken()
        if pfad == '/api/station/puls' or pfad.startswith('/api/regie/'):
            return self.regie_post(pfad)
        return super().do_POST()

    def regie_post(self, pfad):
        if not REGIE:
            return self.antwort(404, {'fehler': 'Server ohne --regie gestartet'})
        if self.fremde_herkunft():
            return self.antwort(403, {'fehler': 'Fremde Herkunft'})
        if pfad != '/api/station/puls' and not self.ist_lokal():
            return self.antwort(403, {'fehler': 'Die Regie geht nur auf dem Mac mini selbst'})
        try:
            laenge = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            laenge = -1
        if not 0 <= laenge <= JSON_MAX:
            self.close_connection = True
            return self.antwort(413, {'fehler': 'Zu groß'})
        try:
            d = json.loads(self.rfile.read(laenge) or b'{}')
            if not isinstance(d, dict):
                raise regie.Fehler('Ungültige Anfrage')
            if pfad == '/api/station/puls':
                return self.antwort(200, REGIE.puls(d))
            if pfad == '/api/regie/setzen':
                REGIE.setzen(d)
            elif pfad == '/api/regie/befehl':
                REGIE.befehl(d.get('ziel'), d.get('cmd'))
            elif pfad == '/api/regie/schnitt':
                REGIE.schneide(d.get('station'))
            elif pfad == '/api/regie/atem':
                REGIE.verbinde_atem(d.get('ip', ''))
            else:
                return self.antwort(404, {'fehler': 'Unbekannte Adresse'})
            self.antwort(200, REGIE.status())
        except regie.Fehler as e:
            self.antwort(400, {'fehler': str(e)})
        except ValueError:
            self.antwort(400, {'fehler': 'Ungültige Anfrage'})

    def drucken(self):
        global druck_zuletzt
        if not self.darf_drucken():
            return self.antwort(403, {'fehler': 'Drucken übers Netz ist am Server aus (Start mit --drucken)'})
        if self.fremde_herkunft():
            return self.antwort(403, {'fehler': 'Fremde Herkunft'})
        if REGIE and not REGIE.druck_erlaubt() and not self.ist_lokal():
            return self.antwort(403, {'fehler': 'Live-Druck ist in der Regie aus'})
        if (self.headers.get('Content-Type') or '').split(';')[0].strip() != 'application/pdf':
            return self.antwort(415, {'fehler': 'Nur PDF'})
        try:
            laenge = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            laenge = 0
        if not 0 < laenge <= DRUCK_MAX:
            self.close_connection = True
            return self.antwort(413, {'fehler': 'Datei zu groß'})
        pdf = self.rfile.read(laenge)
        if not pdf.startswith(b'%PDF-'):
            return self.antwort(400, {'fehler': 'Keine PDF-Datei'})
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        drucker, fmt = (q.get('drucker') or [''])[0], (q.get('format') or ['A4'])[0]
        namen, std = drucker_liste()
        drucker = drucker or std
        if drucker not in namen:
            return self.antwort(400, {'fehler': 'Drucker nicht gefunden'})
        if fmt not in FORMATE:
            return self.antwort(400, {'fehler': 'Format nicht erlaubt'})
        with druck_lock:
            warte = DRUCK_PAUSE - (time.time() - druck_zuletzt)
            if warte > 0:
                return self.antwort(429, {'fehler': 'Kurz warten', 'warte': int(warte) + 1})
            druck_zuletzt = time.time()
        fd, pfad = tempfile.mkstemp(prefix='toolpool-', suffix='.pdf')
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(pdf)
            if DRUCK_PROBE:
                ziel = os.path.join(tempfile.gettempdir(), 'toolpool-druck-probe')
                os.makedirs(ziel, exist_ok=True)
                ablage = os.path.join(ziel, 'druck-%d.pdf' % time.time())
                shutil.copy(pfad, ablage)
                print('  Probe-Druck (%s, %s): %s' % (drucker, fmt, ablage))
                if REGIE:
                    REGIE.gedruckt()
                return self.antwort(200, {'ok': True, 'auftrag': 'Probe', 'probe': True})
            r = subprocess.run(['lp', '-d', drucker, '-t', 'Tool Pool', '-o', 'media=' + fmt, pfad], capture_output=True, text=True, timeout=60)
            if r.returncode:
                return self.antwort(500, {'fehler': (r.stderr or 'lp fehlgeschlagen').strip()[:200]})
            print('  Druck an %s (%s)' % (drucker, fmt))
            if REGIE:
                REGIE.gedruckt()
            return self.antwort(200, {'ok': True, 'auftrag': r.stdout.strip()})
        except (OSError, subprocess.SubprocessError) as e:
            return self.antwort(500, {'fehler': str(e)[:200]})
        finally:
            os.unlink(pfad)


def site_handler(host):
    folder = os.path.join(OFF, host)

    class SiteHandler(Quiet):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=folder, **kw)

        def learn(self, path, dest):
            """Datei aus dem Netz nachholen (nur wenn online)."""
            try:
                req = urllib.request.Request('https://%s%s' % (host, path), headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=4) as r:
                    if 'html' in (r.headers.get('Content-Type') or '') and posixpath.splitext(path)[1] not in ('', '.html', '.htm'):
                        return False
                    data = r.read(60 << 20)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, 'wb') as f:
                    f.write(data)
                print('  nachgeholt:', host + path)
                return True
            except Exception:
                return False

        def fix(self):
            path = urllib.parse.unquote(self.path.split('?')[0].split('#')[0])
            if '..' in path:
                return
            local = os.path.join(folder, path.lstrip('/'))
            if os.path.exists(local):
                return
            if posixpath.splitext(path)[1]:
                self.learn(path, local)
            else:  # Router-Pfad einer App -> Startseite
                self.path = '/index.html'

        def do_GET(self):
            self.fix()
            super().do_GET()

        def do_HEAD(self):
            self.fix()
            super().do_HEAD()

    return SiteHandler


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def serve(port, handler):
    try:
        srv = Server((HOST, port), handler)
    except OSError as e:
        print('  Port %d belegt (%s)' % (port, e))
        return None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def netz_adressen():
    """So erreichen andere Geräte diesen Rechner."""
    name = socket.gethostname()
    urls = ['http://%s:%d/' % (name if '.' in name else name + '.local', PORT)]
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))   # sendet nichts, wählt nur die Netzwerkkarte
        urls.append('http://%s:%d/' % (s.getsockname()[0], PORT))
        s.close()
    except OSError:
        pass
    return urls


def main():
    global HOST, DRUCK_NETZ, DRUCK_PROBE, REGIE, regie
    mit_regie = '--regie' in sys.argv
    if mit_regie:
        try:
            import regie
        except ImportError:
            sys.exit('--regie braucht die Datei regie.py, sie gehört nicht zu diesem Paket.')
    netz = '--netz' in sys.argv or mit_regie
    DRUCK_NETZ = '--drucken' in sys.argv or mit_regie
    DRUCK_PROBE = '--druck-probe' in sys.argv
    if netz:
        HOST = '0.0.0.0'
    http.server.SimpleHTTPRequestHandler.extensions_map.update({'.mjs': 'text/javascript', '.wasm': 'application/wasm', '.obj': 'text/plain'})
    ports = {}
    try:
        ports = json.load(open(os.path.join(OFF, 'ports.json')))
    except Exception:
        print('Keine Offline-Kopien gefunden – einmal mit Internet: python3 offline_holen.py')
    for host, port in ports.items():
        if os.path.isdir(os.path.join(OFF, host)):
            serve(port, site_handler(host))
    if not serve(PORT, PoolHandler):
        sys.exit(1)
    url = 'http://localhost:%d/' % PORT
    print('Tool Pool läuft auf %s (%d Offline-Kopien) – beenden mit Ctrl+C' % (url, len(ports)))
    if netz:
        print('Im Netz erreichbar: ' + '  oder  '.join(netz_adressen()))
    if DRUCK_PROBE:
        print('Druck-Probe: es geht nichts an den Drucker')
    elif DRUCK_NETZ:
        print('Live-Druck: Geräte im Netz dürfen auf den Druckern dieses Rechners drucken')
    if mit_regie:
        REGIE = regie.Regie(netz_adressen())
        REGIE.starten()
        url += 'regie.html'
        print('Regie: ' + url)
    if (mit_regie or not netz) and '--kein-browser' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
