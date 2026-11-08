#!/usr/bin/env python3
"""Tool Pool – holt die Lehrenden und Kurse des FB Design (HSD PBSA) aus dem Vorlesungsverzeichnis.

Aufruf (einmal pro Semester, mit Internet):  python3 hsd_holen.py
Schreibt js/hsd.js. Hauptamtlich Lehrende = Professor*innen, Lehrer*innen für besondere
Aufgaben und wissenschaftliche Mitarbeiter*innen (ohne Lehrbeauftragte).
"""
import html, json, os, re, subprocess, time, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://vvz.design.hs-duesseldorf.de/veranstaltungssuche.php?search_type='
HAUPTAMTLICH = ('Professor*in', 'Lehrer*innen für bes. Aufgaben', 'wiss. Mitarbeiter*innen')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 Tool Pool'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode('utf-8', 'replace')
    except urllib.error.URLError:
        # Der Server liefert eine unvollständige Zertifikatskette; curl nutzt die Systemzertifikate
        return subprocess.run(['curl', '-sL', '--max-time', '30', url], capture_output=True, check=True).stdout.decode('utf-8', 'replace')


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def lehrende(page):
    sel = re.search(r'<select[^>]*name="dozent".*?</select>', page, re.S).group(0)
    out = []
    for label, body in re.findall(r'<optgroup label="([^"]*)">(.*?)</optgroup>', sel, re.S):
        label = html.unescape(label)
        for oid, name in re.findall(r'<option value="(\d+)">(.*?)</option>', body):
            parts = [p.strip() for p in html.unescape(name).split(',')]
            nach, vor = parts[0], parts[1] if len(parts) > 1 else ''
            titel = parts[2] if len(parts) > 2 else ''
            out.append({'id': oid, 'nach': nach, 'vor': vor, 'titel': titel, 'gruppe': label,
                        'name': ' '.join(x for x in (titel, vor, nach) if x), 'haupt': label in HAUPTAMTLICH})
    return out


def kurse(page, art):
    out = []
    for m in re.finditer(r'<div class="card[^"]*kurs-card"[^>]*data-search-dozent="([^"]*)"[^>]*data-search-titel="([^"]*)"[^>]*data-search-module="([^"]*)"', page):
        out.append({'dozent': html.unescape(m.group(1)), 'titel': html.unescape(m.group(2)).strip(), 'modul': html.unescape(m.group(3)).strip(), 'art': art})
    return out


def main():
    weekly = get(BASE + 'weekly')
    people = lehrende(weekly)
    sem = re.search(r'semester=_(\w+)', weekly)
    courses = kurse(weekly, 'wöchentlich')
    for art, key in (('Blockseminar', 'block'), ('Intra-/Extra-Muros', 'muros')):
        try:
            courses += kurse(get(BASE + key), art)
        except Exception as e:
            print('  übersprungen:', key, e)
    # Kurse den Lehrenden zuordnen (Vor- und Nachname im Dozent-Feld)
    for p in people:
        mine, seen = [], set()
        for c in courses:
            if p['nach'] in c['dozent'] and (not p['vor'] or p['vor'].split()[0] in c['dozent']):
                k = (c['titel'], c['modul'])
                if k not in seen:
                    seen.add(k); mine.append({'titel': c['titel'], 'modul': c['modul'], 'art': c['art']})
        p['kurse'] = sorted(mine, key=lambda c: c['titel'].lower())
    semester = sem.group(1) if sem else ''
    m = re.match(r'(wise|sose)(\d\d)(\d\d)?', semester)
    if m:
        semester = ('WiSe %s/%s' % (m.group(2), m.group(3))) if m.group(1) == 'wise' else 'SoSe %s' % m.group(2)
    data = {'semester': semester, 'stand': time.strftime('%Y-%m-%d'), 'quelle': BASE + 'weekly', 'lehrende': people}
    with open(os.path.join(ROOT, 'js', 'hsd.js'), 'w', encoding='utf-8') as f:
        f.write('/* automatisch erzeugt von hsd_holen.py – Vorlesungsverzeichnis FB Design, HSD PBSA */\n')
        f.write('window.TP = window.TP || {};\nTP.HSD = %s;\n' % json.dumps(data, ensure_ascii=False, indent=1))
    haupt = [p for p in people if p['haupt']]
    print('%s: %d Lehrende (%d hauptamtlich), %d Kurse -> js/hsd.js' % (semester, len(people), len(haupt), len(courses)))


if __name__ == '__main__':
    main()
