#!/usr/bin/env python3
"""Tool Pool – holt alle Tool-Webseiten aus js/data.js in den Ordner offline/.

Aufruf (einmal mit Internet):  python3 offline_holen.py
Danach laufen die Seiten im Offline-Modus ohne Internet (am besten über python3 server.py).
Schreibt offline/manifest.js mit der Zuordnung Online-Link -> lokale Kopie.
"""
import hashlib, json, os, posixpath, re, sys, time
import urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'offline')
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
MAX_FILES = 800          # pro Seite
MAX_BYTES = 40 << 20     # pro Datei
ASSET_EXT = ('.js', '.mjs', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.woff', '.woff2',
             '.ttf', '.otf', '.json', '.wasm', '.mp4', '.webm', '.mp3', '.wav', '.ogg', '.glb', '.gltf', '.txt', '.flf', '.obj', '.mtl', '.bin', '.hdr', '.frag', '.vert', '.glsl')
SKIP = ('_vercel/insights', 'googletagmanager', 'google-analytics', 'plausible.io', 'umami', 'hotjar', 'cloudflareinsights')


def tool_urls():
    src = open(os.path.join(ROOT, 'js', 'data.js'), encoding='utf-8').read()
    urls = re.findall(r"\['[^']*', '(https?://[^']+)'", src)
    names = re.search(r"const playgrnd = \((.*?)\)\.split", src, re.S).group(1)
    names = ''.join(re.findall(r"'([^']*)'", names)).split()
    urls += ['https://www.playgrnd.tools/' + n.lower() + '/index.html' for n in names]
    urls.append('https://www.playgrnd.tools/index.html')
    return urls


def local_path(url):
    """Online-Adresse -> Pfad relativ zu offline/."""
    u = urllib.parse.urlsplit(url)
    host = u.netloc.lower()
    if host.startswith('www.'):
        host = host[4:]
    path = urllib.parse.unquote(u.path) or '/'
    if path.endswith('/'):
        path += 'index.html'
    elif '.' not in posixpath.basename(path):
        path += '/index.html'
    if u.query:
        stem, ext = posixpath.splitext(path)
        path = stem + '_' + hashlib.md5(u.query.encode()).hexdigest()[:8] + (ext or '')
    path = re.sub(r'[<>:"|?*]', '_', path)
    return host + path


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read(MAX_BYTES + 1)
        return r.geturl(), (r.headers.get('Content-Type') or ''), data


ATTR = re.compile(r'''(\s(?:src|href|data-src|poster|content)\s*=\s*)(["'])([^"']+)\2''', re.I)
SRCSET = re.compile(r'''(\ssrcset\s*=\s*)(["'])([^"']+)\2''', re.I)
CSSURL = re.compile(r'''url\(\s*(["']?)([^"')]+)\1\s*\)''', re.I)
CSSIMPORT = re.compile(r'''@import\s+(["'])([^"']+)\1''', re.I)
JSSTR = re.compile(r'''["'`]((?:\.{0,2}/)?[\w\-./@]+\.(?:%s))["'`]''' % '|'.join(e[1:] for e in ASSET_EXT), re.I)
JSIMPORT = re.compile(r'''(?:import|from)\s*\(?\s*["']([^"']+)["']''')


class Site:
    def __init__(self, start):
        self.start = start
        self.files = {}          # url -> lokaler Pfad
        self.queue = []
        self.errors = []
        self.optional = set()    # aus Skripten geraten: 404 ist kein Fehler

    def guess(self, url, base):
        """Pfad aus einem Skript: relativ zur Datei, zur Startseite und zur Domain probieren."""
        if url.startswith(('http://', 'https://', '/')):
            bases = [base]
        else:
            u = urllib.parse.urlsplit(self.start)
            bases = [base, self.start if self.start.endswith('/') else self.start + '/', '%s://%s/' % (u.scheme, u.netloc)]
        for b in bases:
            absu = urllib.parse.urljoin(b, url)
            if absu not in self.files:
                self.optional.add(absu)
            self.want(url, b)

    def want(self, url, base, page_link=False):
        if not url or url.startswith(('data:', 'blob:', 'mailto:', 'tel:', 'javascript:', '#', 'about:')):
            return None
        absu = urllib.parse.urljoin(base, url.strip())
        absu = urllib.parse.urldefrag(absu)[0]
        if not absu.startswith(('http://', 'https://')) or any(s in absu for s in SKIP):
            return None
        if page_link:
            return None
        if absu not in self.files and len(self.files) < MAX_FILES:
            self.files[absu] = local_path(absu)
            self.queue.append(absu)
        return self.files.get(absu)

    def rel(self, from_local, to_local):
        return posixpath.relpath(to_local, posixpath.dirname(from_local))

    def rewrite_css(self, text, url, me):
        def sub_url(m):
            lp = self.want(m.group(2), url)
            return 'url("%s")' % self.rel(me, lp) if lp else m.group(0)
        def sub_imp(m):
            lp = self.want(m.group(2), url)
            return '@import "%s"' % self.rel(me, lp) if lp else m.group(0)
        return CSSIMPORT.sub(sub_imp, CSSURL.sub(sub_url, text))

    def rewrite_html(self, text, url, me):
        text = re.sub(r'<script[^>]*(?:_vercel/insights|vercel-analytics|googletagmanager)[^>]*>\s*</script>', '', text, flags=re.I)

        def sub_attr(m):
            val = m.group(3)
            tag_start = text.rfind('<', 0, m.start())
            tag = text[tag_start:m.start()].lower()
            name = m.group(1).strip().lower()
            if name.startswith('content') and not re.match(r'https?://\S+\.(png|jpe?g|svg|webp)$', val):
                return m.group(0)
            # Links zu anderen Seiten (<a href>) bleiben online, auch <link rel=canonical/preconnect>
            if tag.startswith('<a') or re.search(r'rel=["\']?(canonical|preconnect|dns-prefetch|alternate)', tag):
                return m.group(0)
            lp = self.want(val, url)
            return m.group(1) + m.group(2) + self.rel(me, lp) + m.group(2) if lp else m.group(0)

        def sub_srcset(m):
            parts = []
            for p in m.group(3).split(','):
                bits = p.strip().split()
                if bits:
                    lp = self.want(bits[0], url)
                    if lp:
                        bits[0] = self.rel(me, lp)
                parts.append(' '.join(bits))
            return m.group(1) + m.group(2) + ', '.join(parts) + m.group(2)

        text = SRCSET.sub(sub_srcset, ATTR.sub(sub_attr, text))
        text = re.sub(r'(<style[^>]*>)(.*?)(</style>)', lambda m: m.group(1) + self.rewrite_css(m.group(2), url, me) + m.group(3), text, flags=re.S | re.I)
        text = re.sub(r'(style\s*=\s*")([^"]*)(")', lambda m: m.group(1) + self.rewrite_css(m.group(2), url, me) + m.group(3), text, flags=re.I)
        # Skripte im HTML: referenzierte Dateien mitnehmen (Pfade bleiben, Struktur ist gleich)
        for block in re.findall(r'<script[^>]*>(.*?)</script>', text, flags=re.S | re.I):
            self.scan_js(block, url)
        return text

    def scan_js(self, text, url):
        for m in JSSTR.finditer(text):
            self.guess(m.group(1), url)
        for m in JSIMPORT.finditer(text):
            if m.group(1).startswith(('.', '/', 'http')):
                self.guess(m.group(1), url)

    def run(self):
        self.want(self.start, self.start)
        page = None
        while self.queue:
            url = self.queue.pop(0)
            me = self.files[url]
            try:
                final, ctype, data = fetch(url)
            except Exception as e:
                if url not in self.optional:
                    self.errors.append('%s (%s)' % (url, e))
                continue
            if len(data) > MAX_BYTES:
                self.errors.append('%s (zu groß)' % url)
                continue
            is_html = 'html' in ctype or me.endswith(('.html', '.htm'))
            if is_html and url in self.optional and me.lower().endswith(ASSET_EXT):
                continue  # geratener Pfad, Server liefert nur seine Startseite
            if is_html and not me.endswith(('.html', '.htm')):
                me = self.files[url] = me + '.html'
            if 'css' in ctype or me.endswith('.css'):
                data = self.rewrite_css(data.decode('utf-8', 'replace'), final, me).encode('utf-8')
            elif is_html:
                data = self.rewrite_html(data.decode('utf-8', 'replace'), final, me).encode('utf-8')
            elif 'javascript' in ctype or me.endswith(('.js', '.mjs')):
                self.scan_js(data.decode('utf-8', 'replace'), final)
            dest = os.path.join(OUT, me)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, 'wb') as f:
                f.write(data)
            if page is None:
                page = me
        return page


def main():
    urls = tool_urls()
    os.makedirs(OUT, exist_ok=True)
    print('Hole %d Seiten nach %s …' % (len(urls), OUT))
    result = {}

    def job(u):
        s = Site(u)
        page = s.run()
        n = sum(1 for p in s.files.values() if os.path.exists(os.path.join(OUT, p)))
        print(('  ok   ' if page else '  FEHLT') + ' %-55s %3d Dateien%s' % (u, n, ('  (%d Fehler)' % len(s.errors)) if s.errors else ''))
        return u, page, n, s.errors

    with ThreadPoolExecutor(8) as ex:
        for u, page, n, errs in ex.map(job, urls):
            result[u] = {'page': ('offline/' + page) if page else None, 'files': n, 'errors': len(errs), 'errlist': errs}

    # Jede Kopie bekommt einen festen Port für server.py (bestehende bleiben gleich)
    pf = os.path.join(OUT, 'ports.json')
    try:
        ports = json.load(open(pf))
    except Exception:
        ports = {}
    for r in result.values():
        if r['page']:
            host = r['page'].split('/')[1]
            if host not in ports:
                ports[host] = max([8431] + list(ports.values())) + 1
    json.dump(ports, open(pf, 'w'), indent=1)

    stamp = time.strftime('%Y-%m-%d %H:%M')
    with open(os.path.join(OUT, 'fehler.txt'), 'w', encoding='utf-8') as f:
        for u, r in result.items():
            for e in r['errlist']:
                f.write(u + '  ->  ' + e + '\n')
    with open(os.path.join(OUT, 'manifest.js'), 'w', encoding='utf-8') as f:
        f.write('/* automatisch erzeugt von offline_holen.py – %s */\n' % stamp)
        f.write('window.TP = window.TP || {};\nTP.OFFLINE = %s;\nTP.OFFLINE_PORTS = %s;\nTP.OFFLINE_STAND = %s;\n' % (
            json.dumps({u: r['page'] for u, r in result.items() if r['page']}, indent=1), json.dumps(ports), json.dumps(stamp)))
    ok = sum(1 for r in result.values() if r['page'])
    print('Fertig: %d von %d Seiten lokal gespeichert.' % (ok, len(urls)))


if __name__ == '__main__':
    main()
