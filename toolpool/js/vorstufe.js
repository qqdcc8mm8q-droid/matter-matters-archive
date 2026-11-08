/* Tool Pool – Druckvorstufe & Ausschießen
   Quelle (PDF, Bilder oder das Plakat aus dem Baukasten) → Prüfung → Ausschießen auf Druckbogen
   → Druckdaten-PDF (Einzelnutzen mit Beschnitt), Druckbogen-PDF und das ausgefüllte Auftragsformular
   der Grafischen Werkstatt (HSD, FB Design). Alles läuft lokal mit pdf-lib (js/vendor). */
(function () {
  const TP = window.TP, A = TP.app, L = window.PDFLib;
  if (!A) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PT = 72 / 25.4;                       // mm → pt
  const r1 = (x) => Math.round(x * 10) / 10;

  // ---------- Vorgaben ----------
  const ENDFORMATE = {
    auto: null, A6: [105, 148], A5: [148, 210], A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841],
    DL: [99, 210], Postkarte: [148, 105], Quadrat: [210, 210], Visitenkarte: [85, 55], Plakat: null, eigen: null,
  };
  const BOEGEN = {
    digital: { l: 'Digitaldruck · max. 450 × 320', w: 450, h: 320, rand: 4, greifer: 0 },
    offset: { l: 'Offset Heidelberg · max. 500 × 350', w: 500, h: 350, rand: 4, greifer: 10 },
    SRA3: { l: 'SRA3 · 450 × 320', w: 450, h: 320, rand: 4, greifer: 0 },
    A3: { l: 'A3 · 420 × 297', w: 420, h: 297, rand: 4, greifer: 0 },
    gross: { l: 'Großformat bis A1 · 900 × 650 (Plot)', w: 900, h: 650, rand: 4, greifer: 0 },
    eigen: { l: 'eigenes Format', w: 450, h: 320, rand: 4, greifer: 0 },
  };
  const SCHEMA = {
    einzel: { l: 'Einzelseiten · Nutzen wiederholen', d: 'Jede Seite bekommt eine eigene Form, die Nutzen auf dem Bogen sind gleich. Einseitig.', duplex: false },
    schoenwider: { l: 'Schön- & Widerdruck', d: 'Seite 1 vorne, Seite 2 hinten, umschlagen. Für Flyer, Karten und Einzelblätter (Draht-/Klebebindung).', duplex: true },
    heft: { l: 'Broschüre · Rückstichheftung', d: 'Seiten werden zu Bögen mit je 4 Seiten sortiert, ineinandergelegt, gefalzt und geheftet. Mit Bundzuwachs.', duplex: true },
    stapel: { l: 'Schneiden & Stapeln', d: 'Verschiedene Seiten auf einem Bogen, so sortiert, dass nach dem Schneiden fertige Stapel entstehen.', duplex: false },
  };
  // Optionen genau wie im Formular der Werkstatt
  const KONF = ['keine', 'Klammerheftung (bis ca. 40 Seiten)', 'Drahtkammbindung', 'Heißklebelbindung (ab ca. 80 Seiten)', 'Fälzelbindung', 'Fadenbindung (nur in Eigenarbeit)', 'Fadenheftung (nur in Eigenarbeit)'];
  const SONDER = ['keine', 'weiß (Spotfarbe als "White" anlegen)', 'Lack (Spotfarbe als "Clear" anlegen)', 'neongelb (Spotfarbe als "Special" anlegen)', 'neonpink (Spotfarbe als "Special" anlegen)'];
  const FARBE = ['cmyk', 'nur schwarz'];

  const DEF = {
    quelle: 'plakat', end: 'auto', endW: 420, endH: 594, bleed: 3, anpassen: true,
    schema: 'einzel', bogen: 'digital', bogenW: 450, bogenH: 320, lage: 'auto', drehen: 'auto',
    steg: 6, rand: 4, greifer: 0, cols: 0, rows: 0, creep: 0,
    marken: { schnitt: true, falz: true, pass: true, farbe: true, info: true },
    auflage: 50, zuschuss: 5, papier: '', gInhalt: '', gUmschlag: '', umschlag: 0,
    farbe: 'cmyk', sonder: 'keine', konf: 'keine', titel: '',
    person: { name: '', tel: '', mail: '', kurs: '', leitung: '' },
    check: {},
  };
  const V = Object.assign({}, DEF, A.store.get('toolpool.vorstufe', {}));
  V.marken = Object.assign({}, DEF.marken, V.marken); V.person = Object.assign({}, DEF.person, V.person);
  if (V.v !== 2) { if (V.end === 'Plakat') V.end = 'auto'; V.v = 2; }   // alte Einstellung: A2 passt auf keinen Bogen
  const save = () => A.store.set('toolpool.vorstufe', V);
  const MARK = 4;   // Platz für Schneidemarken außerhalb des Beschnitts (1 mm Abstand + 3 mm Linie)

  // „Plakat passend“: Seitenverhältnis des Plakats, so groß wie es mit Beschnitt und Marken auf den Bogen passt
  function platz() {
    const b = V.bogen === 'eigen' ? { w: V.bogenW, h: V.bogenH } : BOEGEN[V.bogen];
    const m = V.bleed + MARK;
    return { L: Math.max(b.w, b.h) - 2 * V.rand - 2 * m, S: Math.min(b.w, b.h) - V.rand - Math.max(V.rand, V.greifer) - 2 * m };
  }
  function autoEnd() {
    const p = A.poster();
    let { L, S } = platz();
    if (V.bogen === 'gross') { L = Math.min(L, 841); S = Math.min(S, 594); }   // Großformat geht bis A1
    const k = Math.min(L / Math.max(p.w, p.h), S / Math.min(p.w, p.h));   // füllt den Bogen, auch wenn das Plakat dafür größer werden muss
    V.endW = Math.floor(p.w * k * 2) / 2; V.endH = Math.floor(p.h * k * 2) / 2;
  }

  // Quelle im Speicher (nicht gespeichert, PDFs können groß sein)
  let SRC = null;      // { kind, name, bytes?, doc?, pages:[{w,h,trim:{x,y,w,h}, bleed:{l,r,b,t}, thumb?}], producer, pdfx, files }
  let srcDoc = null;   // PDFDocument der Quelle (für Plakat/Bilder selbst erzeugt)
  let formIx = 0;

  // ======================================================
  //  Quelle laden
  // ======================================================
  async function loadPlakat() {
    const p = A.poster();
    if (V.end === 'Plakat') { V.endW = p.w; V.endH = p.h; }
    if (V.end === 'auto') autoEnd();
    // Auflösung: 300 dpi im Endformat, reicht bis A1
    const px = Math.min(10400, (Math.max(V.endW, V.endH) + 2 * V.bleed) / 25.4 * 300 * 1.02), scale = px / Math.max(p.w, p.h);
    const c = A.renderHi(scale);
    await rasterSource([{ canvas: c, name: 'Plakat (Baukasten)' }], 'plakat', 'Plakat aus dem Baukasten');
  }

  async function rasterSource(items, kind, name) {
    const doc = await L.PDFDocument.create();
    const pages = [];
    for (const it of items) {
      const c = it.canvas;
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
      const img = await doc.embedJpg(await blob.arrayBuffer());
      // Seite = Endformat + Beschnitt, Bild deckend eingepasst
      const W = V.endW + 2 * V.bleed, H = V.endH + 2 * V.bleed;
      const pg = doc.addPage([W * PT, H * PT]);
      const k = Math.max(W / c.width, H / c.height);
      const dw = c.width * k, dh = c.height * k;
      pg.drawImage(img, { x: ((W - dw) / 2) * PT, y: ((H - dh) / 2) * PT, width: dw * PT, height: dh * PT });
      pg.setTrimBox(V.bleed * PT, V.bleed * PT, V.endW * PT, V.endH * PT);
      pg.setBleedBox(0, 0, W * PT, H * PT);
      const th = thumbOf(c);
      // effektive Auflösung im Endformat
      const dpi = Math.min(c.width / (dw / 25.4), c.height / (dh / 25.4));
      pages.push({ w: W, h: H, trim: { x: V.bleed, y: V.bleed, w: V.endW, h: V.endH }, bleed: { l: V.bleed, r: V.bleed, b: V.bleed, t: V.bleed }, thumb: th, full: c, dpi, name: it.name, ox: 0, oy: 0 });
    }
    await doc.flush();   // pdf-lib schreibt Bilder sonst erst beim Speichern, embedPages würde leere Seiten übernehmen
    srcDoc = doc;
    SRC = { kind, name, pages, producer: 'Tool Pool', pdfx: false, files: items.map((i) => i.name) };
  }

  function thumbOf(c) {
    const k = 360 / Math.max(c.width, c.height), t = document.createElement('canvas');
    t.width = Math.max(1, Math.round(c.width * k)); t.height = Math.max(1, Math.round(c.height * k));
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    return t;
  }

  async function loadImages(files) {
    const items = [];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      items.push({ canvas: c, name: f.name });
    }
    await rasterSource(items, 'bilder', files.length === 1 ? files[0].name : files.length + ' Bilder');
  }

  async function loadPdf(file) {
    const bytes = await file.arrayBuffer();
    const doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = doc.getPages().map((pg) => {
      const mb = pg.getMediaBox(), tb = pg.getTrimBox(), bb = pg.getBleedBox();
      const mm = (v) => v / PT;
      let trim = { x: mm(tb.x - mb.x), y: mm(tb.y - mb.y), w: mm(tb.width), h: mm(tb.height) };
      const W = mm(mb.width), H = mm(mb.height);
      // Ohne TrimBox: wenn die Seite Endformat + Beschnitt groß ist, Endformat mittig annehmen
      const hasTrim = Math.abs(tb.width - mb.width) > 0.5 || Math.abs(tb.height - mb.height) > 0.5;
      if (!hasTrim && Math.abs(W - V.endW - 2 * V.bleed) < 1 && Math.abs(H - V.endH - 2 * V.bleed) < 1) trim = { x: (W - V.endW) / 2, y: (H - V.endH) / 2, w: V.endW, h: V.endH };
      const bx = mm(bb.x - mb.x), by = mm(bb.y - mb.y), bw = mm(bb.width), bh = mm(bb.height);
      const bleed = { l: Math.max(0, trim.x - Math.max(0, bx)), b: Math.max(0, trim.y - Math.max(0, by)), r: Math.max(0, Math.min(W, bx + bw) - trim.x - trim.w), t: Math.max(0, Math.min(H, by + bh) - trim.y - trim.h) };
      return { w: W, h: H, trim, bleed, rot: pg.getRotation().angle || 0, ox: mm(mb.x), oy: mm(mb.y) };
    });
    let pdfx = false;
    try {
      const oi = doc.catalog.lookup(L.PDFName.of('OutputIntents'));
      pdfx = !!(oi && oi.size && oi.size());
    } catch (e) { /* ohne Output-Intent */ }
    srcDoc = doc;
    SRC = { kind: 'pdf', name: file.name, pages, producer: [doc.getProducer(), doc.getCreator()].filter(Boolean).join(' / '), pdfx, files: [file.name] };
    // Endformat aus der ersten Seite übernehmen, wenn noch „Plakat“ eingestellt ist
    const p0 = pages[0];
    if (p0 && (V.end === 'Plakat' || V.end === 'auto' || V.quelle !== 'pdf')) { V.end = 'eigen'; V.endW = r1(p0.trim.w); V.endH = r1(p0.trim.h); }
  }

  // ======================================================
  //  Ausschießen (Geometrie in mm, Ursprung oben links)
  // ======================================================
  function pageCount() { return SRC ? SRC.pages.length : 0; }

  function fit(sw, sh, uw, uh, m) {
    const ax = sw - 2 * V.rand, ay = sh - V.rand - Math.max(V.rand, V.greifer);
    const c = Math.floor((ax - 2 * m + V.steg) / (uw + V.steg) + 1e-6), r = Math.floor((ay - 2 * m + V.steg) / (uh + V.steg) + 1e-6);
    return { cols: Math.max(0, c), rows: Math.max(0, r) };
  }

  function layout() {
    const heft = V.schema === 'heft';
    const uw0 = heft ? V.endW * 2 : V.endW, uh0 = V.endH;
    const m = V.bleed + (V.marken.schnitt || V.marken.pass || V.marken.falz ? MARK : 0);   // Platz für Marken außerhalb des Beschnitts
    const bw = V.bogen === 'eigen' ? V.bogenW : BOEGEN[V.bogen].w, bh = V.bogen === 'eigen' ? V.bogenH : BOEGEN[V.bogen].h;
    const lagen = V.lage === 'hoch' ? [[Math.min(bw, bh), Math.max(bw, bh)]] : V.lage === 'quer' ? [[Math.max(bw, bh), Math.min(bw, bh)]] : [[Math.max(bw, bh), Math.min(bw, bh)], [Math.min(bw, bh), Math.max(bw, bh)]];
    const rots = V.drehen === 'nie' ? [0] : V.drehen === 'immer' ? [90] : [0, 90];
    let best = null;
    for (const [sw, sh] of lagen) for (const rot of rots) {
      const uw = rot ? uh0 : uw0, uh = rot ? uw0 : uh0;
      let { cols, rows } = fit(sw, sh, uw, uh, m);
      if (V.cols > 0) cols = Math.min(cols, V.cols);
      if (V.rows > 0) rows = Math.min(rows, V.rows);
      const n = cols * rows;
      if (!best || n > best.n) best = { sw, sh, uw, uh, rot, cols, rows, n, m };
    }
    const g = best;
    g.blockW = g.cols * g.uw + Math.max(0, g.cols - 1) * V.steg;
    g.blockH = g.rows * g.uh + Math.max(0, g.rows - 1) * V.steg;
    const ay0 = V.rand, ay1 = g.sh - Math.max(V.rand, V.greifer);
    g.bx = (g.sw - g.blockW) / 2;
    g.by = ay0 + (ay1 - ay0 - g.blockH) / 2;
    g.inner = V.steg >= 2 * V.bleed ? V.bleed : V.steg / 2;   // Beschnitt zwischen den Nutzen
    g.heft = heft;
    g.forms = buildForms(g);
    return g;
  }

  // Seite p (1-basiert, null = Vakat) in einer Zelle platzieren
  function cellRects(g, col, row, back) {
    let x = g.bx + col * (g.uw + V.steg);
    const y = g.by + row * (g.uh + V.steg);
    if (back) x = g.sw - x - g.uw;   // Umschlagen: an der senkrechten Mitte gespiegelt
    const b = { l: col === 0 ? V.bleed : g.inner, r: col === g.cols - 1 ? V.bleed : g.inner, t: row === 0 ? V.bleed : g.inner, bt: row === g.rows - 1 ? V.bleed : g.inner };
    if (back) [b.l, b.r] = [b.r, b.l];
    return { x, y, w: g.uw, h: g.uh, b };
  }

  function buildForms(g) {
    const P = pageCount(), n = g.n, forms = [];
    if (!P || !n) return forms;
    const cells = [];
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) cells.push([c, r]);
    const place = (pages, back, creep) => cells.map(([c, r], i) => {
      const cr = cellRects(g, c, r, back), rot = back ? (360 - g.rot) % 360 : g.rot;
      const pg = typeof pages === 'function' ? pages(i) : pages;
      if (!g.heft) return [{ page: pg, x: cr.x, y: cr.y, w: cr.w, h: cr.h, rot, b: cr.b }];
      // Broschüre: Druckbogen-Einheit ist die Doppelseite, Bundsteg ohne Beschnitt
      const [lp, rp] = pg, half = V.endW;
      if (!g.rot) {
        return [
          { page: lp, x: cr.x, y: cr.y, w: half, h: cr.h, rot, b: Object.assign({}, cr.b, { r: 0 }), dx: creep, spine: 'r' },
          { page: rp, x: cr.x + half, y: cr.y, w: half, h: cr.h, rot, b: Object.assign({}, cr.b, { l: 0 }), dx: -creep, spine: 'l' },
        ];
      }
      // gedreht: Doppelseite steht hochkant, linke Seite unten (90°) bzw. oben (270°)
      const top = rot === 90 ? rp : lp, bot = rot === 90 ? lp : rp;
      return [
        { page: top, x: cr.x, y: cr.y, w: cr.w, h: half, rot, b: Object.assign({}, cr.b, { bt: 0 }), dy: creep, spine: 'b' },
        { page: bot, x: cr.x, y: cr.y + half, w: cr.w, h: half, rot, b: Object.assign({}, cr.b, { t: 0 }), dy: -creep, spine: 't' },
      ];
    }).flat();
    const pg = (i) => (i >= 1 && i <= P ? i : null);
    if (V.schema === 'einzel') {
      for (let p = 1; p <= P; p++) forms.push({ name: 'Seite ' + p, sides: [{ l: 'Schöndruck', cells: place(p, false) }], bogen: Math.ceil(V.auflage / n) });
    } else if (V.schema === 'schoenwider') {
      for (let p = 1; p <= P; p += 2) forms.push({ name: 'Seiten ' + p + (p + 1 <= P ? '/' + (p + 1) : ''), sides: [{ l: 'Schöndruck', cells: place(p, false) }, { l: 'Widerdruck', cells: place(pg(p + 1), true) }], bogen: Math.ceil(V.auflage / n) });
    } else if (V.schema === 'stapel') {
      const F = Math.ceil(P / n);
      for (let s = 0; s < F; s++) forms.push({ name: 'Bogen ' + (s + 1), sides: [{ l: 'Schöndruck', cells: place((i) => pg(i * F + s + 1), false) }], bogen: V.auflage });
    } else if (V.schema === 'heft') {
      const N = Math.ceil(P / 4) * 4, S = N / 4;
      for (let i = 0; i < S; i++) {
        const creep = S > 1 ? (V.creep / 2) * (i / (S - 1)) : 0;   // innere Bögen Richtung Bund
        forms.push({
          name: 'Bogen ' + (i + 1) + ' · S. ' + [N - 2 * i, 2 * i + 1, 2 * i + 2, N - 2 * i - 1].join('/'),
          sides: [{ l: 'Schöndruck', cells: place([pg(N - 2 * i), pg(2 * i + 1)], false, creep) }, { l: 'Widerdruck', cells: place([pg(2 * i + 2), pg(N - 2 * i - 1)], true, creep) }],
          bogen: Math.ceil(V.auflage / n),
        });
      }
    }
    return forms;
  }

  function numbers(g) {
    const sides = SCHEMA[V.schema].duplex ? 2 : 1;
    const bogen = g.forms.reduce((s, f) => s + f.bogen, 0), mit = Math.ceil(bogen * (1 + V.zuschuss / 100));
    const P = pageCount(), N = V.schema === 'heft' ? Math.ceil(P / 4) * 4 : P;
    return { sides, bogen, mit, klicks: mit * sides, vakat: N - P, N };
  }

  // ======================================================
  //  Prüfung (Regeln aus dem Merkblatt der Werkstatt)
  // ======================================================
  function preflight(g) {
    const out = [], add = (lvl, t, d) => out.push({ lvl, t, d });
    if (!SRC) { add('bad', 'Keine Quelle', 'PDF oder Bilder laden, oder das Plakat aus dem Baukasten nehmen.'); return out; }
    const P = SRC.pages.length;
    add('ok', P + (P === 1 ? ' Seite' : ' Seiten') + ' geladen', SRC.name);
    // Seitengrößen
    const sizes = new Set(SRC.pages.map((p) => r1(p.trim.w) + '×' + r1(p.trim.h)));
    if (sizes.size > 1) add('bad', 'Unterschiedliche Seitenformate', 'Die Werkstatt nimmt keine gemischten Formate an: ' + [...sizes].join(', ') + ' mm.');
    const p0 = SRC.pages[0];
    const match = Math.abs(p0.trim.w - V.endW) < 0.6 && Math.abs(p0.trim.h - V.endH) < 0.6;
    const swapped = Math.abs(p0.trim.w - V.endH) < 0.6 && Math.abs(p0.trim.h - V.endW) < 0.6;
    if (match) add('ok', 'Endformat ' + r1(V.endW) + ' × ' + r1(V.endH) + ' mm passt');
    else if (swapped) add('bad', 'Hoch- und Querformat vertauscht', 'Seite ist ' + r1(p0.trim.w) + ' × ' + r1(p0.trim.h) + ' mm.');
    else add(V.anpassen ? 'warn' : 'bad', 'Seite ist ' + r1(p0.trim.w) + ' × ' + r1(p0.trim.h) + ' mm', V.anpassen ? 'Wird auf das Endformat skaliert. Besser im Layout richtig anlegen.' : 'Endformat stimmt nicht mit der Seite überein.');
    const minB = Math.min(...SRC.pages.map((p) => Math.min(p.bleed.l, p.bleed.r, p.bleed.t, p.bleed.b)));
    if (minB >= V.bleed - 0.2) add('ok', 'Beschnitt ' + r1(minB) + ' mm vorhanden');
    else add('bad', 'Beschnitt fehlt', 'Nur ' + r1(minB) + ' mm statt ' + V.bleed + ' mm rundum. Hintergründe bis 3 mm über den Rand ziehen.');
    if (V.bleed !== 3) add('warn', 'Beschnitt ist ' + V.bleed + ' mm', 'Die Werkstatt verlangt 3 mm.');
    // Herkunft
    if (/word|powerpoint|excel|microsoft|office|libreoffice|pages|keynote|google docs/i.test(SRC.producer || '')) add('bad', 'PDF aus einer Office-Anwendung', 'Wird nicht angenommen (' + SRC.producer + ').');
    if (SRC.kind === 'pdf') SRC.pdfx ? add('ok', 'PDF mit Output-Intent (PDF/X)') : add('warn', 'Kein PDF/X-Output-Intent', 'Als PDF/X-4 mit ISO Coated v2 300 % exportieren.');
    else add('warn', 'RGB-Bilddaten', 'Das Plakat und Bilder sind RGB. Für die Abgabe in InDesign/Acrobat nach ISO Coated v2 300 % (PDF/X-4) wandeln.');
    // Auflösung
    const dpis = SRC.pages.filter((p) => p.dpi).map((p) => p.dpi);
    if (dpis.length) { const d = Math.min(...dpis); add(d >= 290 ? 'ok' : d >= 200 ? 'warn' : 'bad', 'Auflösung ' + Math.round(d) + ' dpi', d >= 290 ? 'im Endformat' : 'Ziel sind 300 dpi in Druckgröße.'); }
    // Dateinamen
    const badName = SRC.kind === 'plakat' ? [] : SRC.files.filter((f) => /[^A-Za-z0-9._\-]/.test(f));
    if (badName.length) add('warn', 'Dateiname mit Umlaut, Leer- oder Sonderzeichen', badName.join(', '));
    // Ausschießen
    if (!g.n) add('bad', 'Passt nicht auf den Bogen', 'Endformat + Beschnitt + Marken ist größer als der Druckbogen.');
    else add('ok', g.n + (g.n === 1 ? ' Nutzen' : ' Nutzen') + ' pro Bogen', g.cols + ' × ' + g.rows + (g.rot ? ', gedreht' : ''));
    const bw = Math.max(g.sw, g.sh), bh = Math.min(g.sw, g.sh);
    if (V.bogen === 'gross') add('warn', 'Großformat', 'Digital max. 450 × 320, Offset max. 500 × 350 mm. Nur für Plotter, vorher mit der Werkstatt klären.');
    if (V.bogen === 'eigen' && (bw > 500 || bh > 350)) add('bad', 'Bogen größer als die Maschinen', 'Digital max. 450 × 320, Offset max. 500 × 350 mm.');
    if (V.steg > 0 && V.steg < 2 * V.bleed) add('warn', 'Steg kleiner als 2 × Beschnitt', 'Zwischen den Nutzen wird der Beschnitt auf ' + r1(g.inner) + ' mm gekürzt.');
    if (V.steg === 0 && g.n > 1) add('warn', 'Steg 0: Nutzen stoßen aneinander', 'Nur bei Motiven ohne randabfallende Flächen.');
    // Weiterverarbeitung
    const nn = numbers(g);
    if (V.schema === 'heft') {
      if (nn.vakat) add('warn', nn.vakat + ' Vakatseite' + (nn.vakat > 1 ? 'n' : '') + ' ergänzt', 'Heftung braucht ein Vielfaches von 4 Seiten (' + nn.N + '). Vakatseiten im Dokument mit anlegen.');
      if (nn.N > 40) add('warn', nn.N + ' Seiten für Klammerheftung', 'Die Werkstatt heftet bis ca. 40 Seiten. Ab ca. 80 Seiten Klebebindung.');
      if (V.konf !== KONF[1]) add('warn', 'Konfektionierung passt nicht', 'Für Rückstichheftung im Formular „' + KONF[1] + '“ wählen.');
      if (nn.N > 8 && !V.creep) add('warn', 'Kein Bundzuwachs', 'Bei ' + nn.N + ' Seiten verdrängen die inneren Bögen. Etwa 0,1 mm pro Bogen ansetzen.');
    }
    if (V.konf === KONF[3] && nn.N < 80) add('warn', 'Klebebindung unter 80 Seiten', 'Die Werkstatt empfiehlt sie ab ca. 80 Seiten.');
    if (V.sonder !== 'keine') add('warn', 'Sonderfarbe: ' + V.sonder, 'Als Spotfarbe exakt definieren. Für diese Farbe hier keine Kontrolle möglich.');
    if (!V.titel) add('warn', 'Titel der Drucksache fehlt', 'Für das Auftragsformular.');
    if (hsdOn() && V.person.leitung && !leitungP()) add('warn', 'Kursleitung nicht im Vorlesungsverzeichnis', 'Die Werkstatt verlangt eine hauptamtlich lehrende Person (' + TP.HSD.semester + ').');
    if (!V.person.name || !V.person.mail || !V.person.leitung) add('warn', 'Angaben zur Person unvollständig', 'Name, E-Mail und Kursleitung sind Pflicht im Formular.');
    return out;
  }
  // Was sich nicht automatisch prüfen lässt
  const HAND = [
    ['x4', 'PDF/X-4 exportiert, ISO Coated v2 300 %'],
    ['font', 'Schriften eingebettet bzw. in Pfade gewandelt'],
    ['line', 'Linien mindestens 0,25 pt'],
    ['safe', 'Wichtiges mindestens 3 mm vom Endformat entfernt'],
    ['tif', 'Pixelbilder in Druckgröße mit 300 dpi'],
    ['marks', 'Nur Schneidemarken, keine Falz- und Passmarken'],
    ['usb', 'Daten auf USB-Stick, Formular unterschrieben'],
  ];

  // ======================================================
  //  Vorschau
  // ======================================================
  let G = null;
  function draw() {
    const cv = $('#vsCanvas'), stage = $('#vsStage');
    if (!cv || !G) return;
    const f = G.forms[formIx] || null;
    const sides = f ? f.sides : [{ l: 'Schöndruck', cells: [] }];
    const W = stage.clientWidth, H = stage.clientHeight, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue('--ink').trim(), mute = cs.getPropertyValue('--mute').trim(), acc = cs.getPropertyValue('--accent').trim();
    const gap = 40, n = sides.length;
    const k = Math.min((W - 60 - gap * (n - 1)) / (G.sw * n), (H - 70) / G.sh);
    const totalW = G.sw * k * n + gap * (n - 1);
    sides.forEach((side, si) => {
      const ox = (W - totalW) / 2 + si * (G.sw * k + gap), oy = (H - G.sh * k) / 2 + 8;
      const X = (mm) => ox + mm * k, Y = (mm) => oy + mm * k;
      ctx.fillStyle = mute; ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
      ctx.fillText(side.l.toUpperCase() + '  ' + G.sw + ' × ' + G.sh + ' mm', ox, oy - 10);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 18; ctx.fillStyle = '#fff'; ctx.fillRect(ox, oy, G.sw * k, G.sh * k); ctx.restore();
      // Greifer
      if (V.greifer > 0) {
        ctx.fillStyle = 'rgba(255,90,31,.08)'; const gy = si === 0 ? G.sh - V.greifer : G.sh - V.greifer;
        ctx.fillRect(X(0), Y(gy), G.sw * k, V.greifer * k);
        ctx.fillStyle = '#c9744f'; ctx.font = '9px ui-monospace, Menlo, monospace'; ctx.fillText('GREIFER ' + V.greifer + ' mm', X(3), Y(G.sh - 2.5));
      }
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#d0cfca'; ctx.lineWidth = 1;
      ctx.strokeRect(X(V.rand), Y(V.rand), (G.sw - 2 * V.rand) * k, (G.sh - V.rand - Math.max(V.rand, V.greifer)) * k); ctx.setLineDash([]);
      // Nutzen
      side.cells.forEach((c) => {
        const bx = c.x - c.b.l, by = c.y - c.b.t, bw = c.w + c.b.l + c.b.r, bh = c.h + c.b.t + c.b.bt;
        ctx.fillStyle = 'rgba(255,90,31,.16)'; ctx.fillRect(X(bx), Y(by), bw * k, bh * k);
        const pg = c.page && SRC && SRC.pages[c.page - 1];
        ctx.save(); ctx.beginPath(); ctx.rect(X(bx), Y(by), bw * k, bh * k); ctx.clip();
        if (pg && pg.thumb) {
          ctx.translate(X(c.x + c.w / 2 + (c.dx || 0)), Y(c.y + c.h / 2 + (c.dy || 0)));
          ctx.rotate((-c.rot * Math.PI) / 180);
          const sw = c.rot % 180 ? c.h : c.w, sh = c.rot % 180 ? c.w : c.h;
          const fw = (sw / pg.trim.w) * pg.w, fh = (sh / pg.trim.h) * pg.h;   // ganze Seite inkl. Beschnitt
          const offx = ((pg.w / 2 - pg.trim.x - pg.trim.w / 2) * sw) / pg.trim.w, offy = ((pg.h / 2 - (pg.h - pg.trim.y - pg.trim.h) - pg.trim.h / 2) * sh) / pg.trim.h;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(pg.full || pg.thumb, (-fw / 2 + offx) * k, (-fh / 2 + offy) * k, fw * k, fh * k);   // volle Auflösung, sonst wird die Vorschau weich
        } else {
          ctx.fillStyle = c.page ? '#f2f1ee' : '#fafaf8'; ctx.fillRect(X(c.x), Y(c.y), c.w * k, c.h * k);
        }
        ctx.restore();
        // Seitenzahl (zeigt auch die Drehung)
        ctx.save(); ctx.translate(X(c.x + c.w / 2), Y(c.y + c.h / 2)); ctx.rotate((-c.rot * Math.PI) / 180);
        const fs = Math.max(10, Math.min(c.w, c.h) * k * (pg && pg.thumb ? 0.12 : 0.28));
        ctx.font = `600 ${fs}px Inter, Helvetica, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.fillStyle = c.page ? '#151515' : '#b5b4af';
        const t = c.page ? String(c.page) : 'vakat';
        ctx.strokeText(t, 0, 0); ctx.fillText(t, 0, 0);
        ctx.font = `${Math.max(8, fs * 0.28)}px ui-monospace, Menlo, monospace`; ctx.fillStyle = '#8b8a85';
        ctx.fillText('▲', 0, -fs * 0.85);
        ctx.restore();
        ctx.strokeStyle = '#151515'; ctx.lineWidth = 0.8; ctx.strokeRect(X(c.x), Y(c.y), c.w * k, c.h * k);
        if (c.spine) {   // Bund
          ctx.setLineDash([4, 3]); ctx.strokeStyle = acc; ctx.beginPath();
          const sx = c.spine === 'r' ? c.x + c.w : c.spine === 'l' ? c.x : null, sy = c.spine === 'b' ? c.y + c.h : c.spine === 't' ? c.y : null;
          if (sx != null) { ctx.moveTo(X(sx), Y(c.y)); ctx.lineTo(X(sx), Y(c.y + c.h)); } else { ctx.moveTo(X(c.x), Y(sy)); ctx.lineTo(X(c.x + c.w), Y(sy)); }
          ctx.stroke(); ctx.setLineDash([]);
        }
      });
      // Marken
      marks(side, (a) => {
        ctx.strokeStyle = '#151515'; ctx.fillStyle = '#151515'; ctx.lineWidth = 0.7;
        if (a.t === 'line') { ctx.setLineDash(a.dash ? [3, 2] : []); ctx.beginPath(); ctx.moveTo(X(a.x1), Y(a.y1)); ctx.lineTo(X(a.x2), Y(a.y2)); ctx.stroke(); ctx.setLineDash([]); }
        if (a.t === 'circle') { ctx.beginPath(); ctx.arc(X(a.x), Y(a.y), a.r * k, 0, Math.PI * 2); ctx.stroke(); }
        if (a.t === 'rect') { ctx.fillStyle = a.rgb; ctx.fillRect(X(a.x), Y(a.y), a.w * k, a.h * k); }
        if (a.t === 'text') { ctx.font = Math.max(7, a.size * k * 0.9) + 'px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(a.s, X(a.x), Y(a.y)); }
      }, si);
    });
    if (!f) {
      ctx.fillStyle = ink; ctx.font = '13px Inter, Helvetica, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(SRC ? 'Passt nicht auf den Bogen – kleineres Endformat wählen' : 'Quelle wählen', W / 2, H / 2);
    }
  }

  // Marken als Liste von Zeichenbefehlen (mm). Gleiche Liste für Vorschau und PDF.
  function marks(side, emit, si) {
    if (!side.cells.length) return;
    const g = G, off = V.bleed + 1, len = MARK - 1;
    const xs = new Set(), ys = new Set();
    side.cells.forEach((c) => { xs.add(r1(c.x)); xs.add(r1(c.x + c.w)); ys.add(r1(c.y)); ys.add(r1(c.y + c.h)); });
    const minX = Math.min(...side.cells.map((c) => c.x)), maxX = Math.max(...side.cells.map((c) => c.x + c.w));
    const minY = Math.min(...side.cells.map((c) => c.y)), maxY = Math.max(...side.cells.map((c) => c.y + c.h));
    // Bundlinien (Falz) nicht als Schnitt markieren
    const spX = new Set(side.cells.filter((c) => c.spine === 'r').map((c) => r1(c.x + c.w)));
    const spY = new Set(side.cells.filter((c) => c.spine === 'b').map((c) => r1(c.y + c.h)));
    if (V.marken.schnitt) {
      xs.forEach((x) => { if (spX.has(x)) return; emit({ t: 'line', x1: x, y1: minY - off, x2: x, y2: minY - off - len }); emit({ t: 'line', x1: x, y1: maxY + off, x2: x, y2: maxY + off + len }); });
      ys.forEach((y) => { if (spY.has(y)) return; emit({ t: 'line', x1: minX - off, y1: y, x2: minX - off - len, y2: y }); emit({ t: 'line', x1: maxX + off, y1: y, x2: maxX + off + len, y2: y }); });
    }
    if (V.marken.falz && g.heft) {
      spX.forEach((x) => { emit({ t: 'line', x1: x, y1: minY - off, x2: x, y2: minY - off - len, dash: true }); emit({ t: 'line', x1: x, y1: maxY + off, x2: x, y2: maxY + off + len, dash: true }); });
      spY.forEach((y) => { emit({ t: 'line', x1: minX - off, y1: y, x2: minX - off - len, y2: y, dash: true }); emit({ t: 'line', x1: maxX + off, y1: y, x2: maxX + off + len, y2: y, dash: true }); });
    }
    if (V.marken.pass) {
      const d = off + len / 2, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      [[cx, minY - d], [cx, maxY + d], [minX - d, cy], [maxX + d, cy]].forEach(([x, y]) => {
        if (x < 3 || y < 3 || x > g.sw - 3 || y > g.sh - 3) return;
        emit({ t: 'circle', x, y, r: 1.6 }); emit({ t: 'line', x1: x - 2.6, y1: y, x2: x + 2.6, y2: y }); emit({ t: 'line', x1: x, y1: y - 2.6, x2: x, y2: y + 2.6 });
      });
    }
    if (V.marken.farbe) {
      const bar = [['#00a0e9', [1, 0, 0, 0]], ['#e5007e', [0, 1, 0, 0]], ['#ffed00', [0, 0, 1, 0]], ['#151515', [0, 0, 0, 1]], ['#2e3192', [1, 1, 0, 0]], ['#00a651', [1, 0, 1, 0]], ['#e30613', [0, 1, 1, 0]], ['#231f20', [1, 1, 1, 0]], ['#9d9d9c', [0, 0, 0, 0.5]], ['#dadada', [0, 0, 0, 0.2]]];
      const s = 4, y = maxY + off + len + 1.5, w = bar.length * s;
      if (y + s < g.sh - 1.5) { const x0 = Math.max(V.rand, (minX + maxX) / 2 + 12); if (x0 + w < g.sw - 2) bar.forEach(([rgb, cmyk], i) => emit({ t: 'rect', x: x0 + i * s, y, w: s, h: s, rgb, cmyk })); }
    }
    if (V.marken.info) {
      const f = G.forms[formIx] || G.forms[0];
      const s = ['TOOL POOL', V.titel || 'ohne Titel', f ? f.name : '', ['Schöndruck', 'Widerdruck'][si] || '', g.sw + 'x' + g.sh + ' mm', new Date().toLocaleDateString('de-DE')].filter(Boolean).join('  ·  ');
      const y = minY - off - len - 1.5;
      if (y > 2.5) emit({ t: 'text', x: minX, y, s, size: 2.2 });
      else if (minY - off - 1 > 2.5) emit({ t: 'text', x: minX + (maxX - minX) / 2 + 8, y: minY - off - 1, s, size: 2.2 });
    }
  }

  // ======================================================
  //  PDF: ausgeschossene Druckbögen
  // ======================================================
  const pdfText = (s) => String(s).replace(/[–—]/g, '-').replace(/[^\x20-\x7E -ÿ]/g, '');

  async function embedCache(out) {
    const cache = new Map(), srcPages = srcDoc.getPages();
    return async (pi, bb) => {
      const key = pi + ':' + bb.map((v) => v.toFixed(2)).join(',');
      if (!cache.has(key)) cache.set(key, (await out.embedPages([srcPages[pi]], [{ left: bb[0], bottom: bb[1], right: bb[2], top: bb[3] }]))[0]);
      return cache.get(key);
    };
  }

  // Seite pi in die Platzierung c (mm, oben links) zeichnen; Beschnitt per BoundingBox begrenzt
  async function drawPlaced(page, embed, c, sheetH) {
    const sp = SRC.pages[c.page - 1], pi = c.page - 1;
    const rot = c.rot || 0, sw = rot % 180 ? c.h : c.w, sh = rot % 180 ? c.w : c.h;
    const s = V.anpassen ? Math.min(sw / sp.trim.w, sh / sp.trim.h) : 1;
    // Beschnitt der Platzierung (PDF-Richtung: l, r, unten, oben) → Seiten der Quelle
    const PL = { l: c.b.l, r: c.b.r, b: c.b.bt, t: c.b.t };
    if (c.dx > 0) PL.l += c.dx; if (c.dx < 0) PL.r -= c.dx; if (c.dy > 0) PL.t += c.dy; if (c.dy < 0) PL.b -= c.dy;
    const S = rot === 90 ? { t: PL.l, b: PL.r, l: PL.b, r: PL.t } : rot === 270 ? { t: PL.r, b: PL.l, l: PL.t, r: PL.b } : PL;
    const tx = sp.trim.x, ty = sp.trim.y, tw = sp.trim.w, th = sp.trim.h;
    // Platz um den Endformat-Rahmen der Quelle (nur so viel, wie die Quelle hat)
    const cw = (sw / s - tw) / 2, ch = (sh / s - th) / 2;   // Rand, wenn die Seite kleiner skaliert wird
    const bb = [
      Math.max(0, tx - cw - S.l / s), Math.max(0, ty - ch - S.b / s),
      Math.min(sp.w, tx + tw + cw + S.r / s), Math.min(sp.h, ty + th + ch + S.t / s),
    ].map((v) => v * PT);
    const cx = (tx + tw / 2) * PT - bb[0], cy = (ty + th / 2) * PT - bb[1];   // Mitte des Endformats im XObject
    const ep = await embed(pi, [bb[0] + sp.ox * PT, bb[1] + sp.oy * PT, bb[2] + sp.ox * PT, bb[3] + sp.oy * PT]);   // Mitte des Endformats im XObject
    const PX = (c.x + c.w / 2 + (c.dx || 0)) * PT, PY = (sheetH - c.y - c.h / 2 - (c.dy || 0)) * PT;
    const k = s;
    if (rot === 90) page.drawPage(ep, { x: PX + cy * k, y: PY - cx * k, xScale: k, yScale: k, rotate: L.degrees(90) });
    else if (rot === 270) page.drawPage(ep, { x: PX - cy * k, y: PY + cx * k, xScale: k, yScale: k, rotate: L.degrees(270) });
    else page.drawPage(ep, { x: PX - cx * k, y: PY - cy * k, xScale: k, yScale: k });
  }

  function drawMarksPdf(page, side, si, sheetH, font) {
    const reg = L.cmyk(1, 1, 1, 1), th = 0.25;
    marks(side, (a) => {
      if (a.t === 'line') page.drawLine({ start: { x: a.x1 * PT, y: (sheetH - a.y1) * PT }, end: { x: a.x2 * PT, y: (sheetH - a.y2) * PT }, thickness: th, color: reg, dashArray: a.dash ? [2, 1.5] : undefined });
      if (a.t === 'circle') page.drawCircle({ x: a.x * PT, y: (sheetH - a.y) * PT, size: a.r * PT, borderWidth: th, borderColor: reg });
      if (a.t === 'rect') page.drawRectangle({ x: a.x * PT, y: (sheetH - a.y - a.h) * PT, width: a.w * PT, height: a.h * PT, color: L.cmyk(...a.cmyk) });
      if (a.t === 'text') page.drawText(pdfText(a.s), { x: a.x * PT, y: (sheetH - a.y) * PT, size: 6, font, color: reg });
    }, si);
  }

  async function buildImposed() {
    const out = await L.PDFDocument.create();
    out.setTitle(pdfText((V.titel || 'Druckbogen') + ' - Druckbogen')); out.setCreator('Tool Pool · Vorstufe'); out.setProducer('Tool Pool (pdf-lib)');
    const font = await out.embedFont(L.StandardFonts.Helvetica), bold = await out.embedFont(L.StandardFonts.HelveticaBold);
    const embed = await embedCache(out);
    await jobSheet(out, font, bold);
    for (let fi = 0; fi < G.forms.length; fi++) {
      const f = G.forms[fi];
      for (let si = 0; si < f.sides.length; si++) {
        const page = out.addPage([G.sw * PT, G.sh * PT]);
        const keep = formIx; formIx = fi;
        for (const c of f.sides[si].cells) if (c.page) await drawPlaced(page, embed, c, G.sh);
        drawMarksPdf(page, f.sides[si], si, G.sh, font);
        formIx = keep;
      }
    }
    return out.save();
  }

  // Auftrags- und Schemablatt als erste Seite
  async function jobSheet(out, font, bold) {
    const W = 210, H = 297, page = out.addPage([W * PT, H * PT]), nn = numbers(G);
    let y = 22;
    const T = (s, x, sz = 9, f = font, col = L.rgb(0.08, 0.08, 0.08)) => page.drawText(pdfText(s), { x: x * PT, y: (H - y) * PT, size: sz, font: f, color: col });
    T('TOOL POOL  ·  AUSSCHIESSSCHEMA', 18, 8, bold, L.rgb(1, 0.35, 0.12)); y += 9;
    T(V.titel || 'ohne Titel', 18, 18, bold); y += 12;
    const rows = [
      ['Endformat', r1(V.endW) + ' x ' + r1(V.endH) + ' mm, Beschnitt ' + V.bleed + ' mm'],
      ['Schema', SCHEMA[V.schema].l],
      ['Druckbogen', G.sw + ' x ' + G.sh + ' mm (' + (BOEGEN[V.bogen] || {}).l + ')'],
      ['Nutzen', G.n + ' (' + G.cols + ' x ' + G.rows + (G.rot ? ', gedreht' : '') + '), Steg ' + V.steg + ' mm'],
      ['Seiten', pageCount() + (nn.vakat ? ' + ' + nn.vakat + ' vakat' : '')],
      ['Formen', G.forms.length + (nn.sides === 2 ? ' (Schön- und Widerdruck, umschlagen)' : ' (einseitig)')],
      ['Auflage', V.auflage + ' Ex.'],
      ['Druckbogen', nn.bogen + ' + ' + V.zuschuss + ' % Zuschuss = ' + nn.mit + ' Bogen, ' + nn.klicks + ' Drucke'],
      ['Papier', [V.papier, V.gInhalt && V.gInhalt + ' g/m2'].filter(Boolean).join(', ') || '-'],
      ['Farbe', V.farbe + (V.sonder !== 'keine' ? ', Sonderfarbe ' + V.sonder : '')],
      ['Weiterverarbeitung', V.konf],
      ['Bundzuwachs', V.schema === 'heft' ? V.creep + ' mm gesamt' : '-'],
      ['Auftraggeber:in', [V.person.name, V.person.mail].filter(Boolean).join(', ') || '-'],
    ];
    rows.forEach(([k, v]) => { T(k, 18, 8, font, L.rgb(0.45, 0.45, 0.43)); T(v, 60, 9); y += 6.2; });
    y += 6; T('FORMEN', 18, 8, bold); y += 6;
    G.forms.forEach((f, i) => {
      if (y > H - 15) return;
      const pages = f.sides.map((s) => s.l.slice(0, 6) + ': ' + s.cells.filter((c, j, arr) => arr.findIndex((d) => d.page === c.page) === j).map((c) => c.page || 'v').join(' ')).join('   ');
      T(String(i + 1).padStart(2, '0'), 18, 8, font, L.rgb(0.45, 0.45, 0.43)); T(f.name, 28, 8, bold); T(pages.slice(0, 95), 75, 8); y += 5;
    });
  }

  // ======================================================
  //  PDF: Druckdaten als Einzelnutzen (so will es die Werkstatt)
  // ======================================================
  async function buildSingles() {
    const out = await L.PDFDocument.create();
    out.setTitle(pdfText(V.titel || 'Druckdaten')); out.setCreator('Tool Pool · Vorstufe'); out.setProducer('Tool Pool (pdf-lib)');
    const embed = await embedCache(out);
    const P = pageCount(), N = V.schema === 'heft' ? Math.ceil(P / 4) * 4 : P;
    const m = V.marken.schnitt ? V.bleed + 9 : V.bleed;   // Einzelnutzen: Marken mit normaler Länge     // Platz für Schneidemarken
    const W = V.endW + 2 * m, H = V.endH + 2 * m;
    for (let p = 1; p <= N; p++) {
      const page = out.addPage([W * PT, H * PT]);
      page.setTrimBox(m * PT, m * PT, V.endW * PT, V.endH * PT);
      page.setBleedBox((m - V.bleed) * PT, (m - V.bleed) * PT, (V.endW + 2 * V.bleed) * PT, (V.endH + 2 * V.bleed) * PT);
      if (p <= P) await drawPlaced(page, embed, { page: p, x: m, y: m, w: V.endW, h: V.endH, rot: 0, b: { l: V.bleed, r: V.bleed, t: V.bleed, bt: V.bleed } }, H);
      if (V.marken.schnitt) {
        const reg = L.cmyk(1, 1, 1, 1), o = V.bleed + 2, len = 5;
        [[m, m], [m + V.endW, m], [m, m + V.endH], [m + V.endW, m + V.endH]].forEach(([x, y], i) => {
          const sx = i % 2 ? 1 : -1, sy = i < 2 ? -1 : 1;
          page.drawLine({ start: { x: x * PT, y: (H - y - sy * o) * PT }, end: { x: x * PT, y: (H - y - sy * (o + len)) * PT }, thickness: 0.25, color: reg });
          page.drawLine({ start: { x: (x + sx * o) * PT, y: (H - y) * PT }, end: { x: (x + sx * (o + len)) * PT, y: (H - y) * PT }, thickness: 0.25, color: reg });
        });
      }
    }
    return out.save();
  }

  // ======================================================
  //  Auftragsformular der Grafischen Werkstatt ausfüllen
  // ======================================================
  async function buildAuftrag() {
    const bytes = await (await fetch('assets/hsd-auftrag-digitaldruck.pdf')).arrayBuffer();
    const doc = await L.PDFDocument.load(bytes);
    const form = doc.getForm(), nn = G ? numbers(G) : { N: pageCount() };
    const set = (name, val) => { try { form.getTextField(name).setText(pdfText(val || '')); } catch (e) { console.warn('Feld', name, e); } };
    const pick = (name, val) => { try { form.getDropdown(name).select(val); } catch (e) { console.warn('Feld', name, e); } };
    const inhalt = Math.max(0, (nn.N || 0) - (V.umschlag || 0));
    set('Auftraggeber', V.person.name); set('Telefon', V.person.tel); set('E-Mail', V.person.mail);
    set('Kursbeschreibung', V.person.kurs); set('Kursleitung', V.person.leitung); set('Titel der Drucksache', V.titel);
    set('Endformat', r1(V.endW) + ' x ' + r1(V.endH));
    set('Auflage', String(V.auflage));
    set('Seitenzahl/Inhalt', inhalt ? String(inhalt) : ''); set('Seitenzahl/Umschlag', V.umschlag ? String(V.umschlag) : '');
    set('Grammatur/Inhalt', V.gInhalt); set('Grammatur/Umschlag', V.umschlag ? V.gUmschlag : '');
    set('Papierbezeichnung', V.papier);
    pick('Dropdown21', V.farbe); pick('Dropdown Sonderfarben', V.sonder); pick('Dropdown Konfektionierung', V.konf);
    form.updateFieldAppearances(await doc.embedFont(L.StandardFonts.Helvetica));
    doc.setTitle(pdfText('Auftrag Digitaldruck - ' + (V.titel || '')));
    return doc.save();
  }

  function download(bytes, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function preview(bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    window.open(url, '_blank');
  }
  const slug = () => (V.titel || 'tool-pool').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'tool-pool';

  async function run(kind, show) {
    const btn = $('#vs-' + kind); if (btn) btn.disabled = true;
    try {
      if (kind !== 'auftrag' && !SRC) throw new Error('Keine Quelle geladen');
      if (kind === 'bogen' && !G.forms.length) throw new Error('Nichts auszuschießen');
      const bytes = kind === 'bogen' ? await buildImposed() : kind === 'daten' ? await buildSingles() : await buildAuftrag();
      const name = slug() + (kind === 'bogen' ? '_druckbogen' : kind === 'daten' ? '_druckdaten' : '_auftrag-digitaldruck') + '.pdf';
      show ? preview(bytes) : download(bytes, name);
      A.toast(show ? 'PDF geöffnet' : name + ' gespeichert');
    } catch (e) {
      console.error(e); A.toast('Fehler: ' + e.message);
    } finally { if (btn) btn.disabled = false; }
  }

  // ======================================================
  //  Oberfläche
  // ======================================================
  function sel(key, opts, val, attrs = '') {
    return `<select class="line-select" data-k="${key}" ${attrs}>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }
  const num = (key, val, unit, step = 1, extra = '') => `<label class="vs-num"><input class="line-input num" type="number" step="${step}" data-k="${key}" value="${val}" ${extra}>${unit ? `<span>${unit}</span>` : ''}</label>`;
  const txt = (key, val, ph = '') => `<input class="line-input" data-k="${key}" value="${esc(val || '')}" placeholder="${esc(ph)}">`;
  const row = (label, html) => `<div class="vs-row"><span class="mono">${label}</span><div>${html}</div></div>`;

  // HSD-PBSA-Modus: Kursleitung und Kurs aus dem Vorlesungsverzeichnis (js/hsd.js)
  const hsdOn = () => !!(TP.settings && TP.settings.hsd && TP.HSD);
  const haupt = () => TP.HSD.lehrende.filter((p) => p.haupt);
  const leitungP = () => haupt().find((p) => p.name === V.person.leitung);
  function hsdLeitung() {
    const groups = [...new Set(haupt().map((p) => p.gruppe))];
    const frei = V.person.leitungFrei || (V.person.leitung && !leitungP());
    const opts = `<option value="">auswählen …</option>` + groups.map((g) => `<optgroup label="${esc(g)}">${haupt().filter((p) => p.gruppe === g).map((p) =>
      `<option value="${esc(p.name)}"${!frei && p.name === V.person.leitung ? ' selected' : ''}>${esc(p.nach + ', ' + p.vor + (p.titel ? ' · ' + p.titel : ''))}</option>`).join('')}</optgroup>`).join('') +
      `<option value="__frei"${frei ? ' selected' : ''}>andere Person …</option>`;
    return row('Kursleitung', `<select class="line-select" data-k="p.leitung">${opts}</select>`) + (frei ? row('', txt('pf.leitung', V.person.leitung, 'Name der Kursleitung')) : '');
  }
  function hsdKurs() {
    const p = leitungP(), kurse = p ? p.kurse : [];
    const label = (c) => c.titel;
    const frei = V.person.kursFrei || !p || (V.person.kurs && !kurse.some((c) => label(c) === V.person.kurs));
    if (!p) return row('Kurs', txt('p.kurs', V.person.kurs, 'Kursbeschreibung'));
    const opts = `<option value="">auswählen …</option>` + kurse.map((c) => `<option value="${esc(label(c))}"${!frei && label(c) === V.person.kurs ? ' selected' : ''}>${esc(c.titel)}${c.art !== 'wöchentlich' ? ' · ' + esc(c.art) : ''}</option>`).join('') +
      `<option value="__frei"${frei ? ' selected' : ''}>anderer Kurs …</option>`;
    return row('Kurs', `<select class="line-select" data-k="p.kurs">${opts}</select>`) + (frei ? row('', txt('pf.kurs', V.person.kurs, 'Kursbeschreibung')) : '');
  }

  function renderSide() {
    const side = $('#vsSide');
    const mk = (k, l) => `<label class="check"><input type="checkbox" data-m="${k}"${V.marken[k] ? ' checked' : ''}> ${l}</label>`;
    side.innerHTML = `
      <section><h3>1 · Quelle</h3>
        <div class="vs-seg" id="vsQuelle">
          <button data-q="plakat" class="${V.quelle === 'plakat' ? 'on' : ''}">Plakat</button>
          <button data-q="pdf" class="${V.quelle === 'pdf' ? 'on' : ''}">PDF</button>
          <button data-q="bilder" class="${V.quelle === 'bilder' ? 'on' : ''}">Bilder</button>
        </div>
        <div class="mono mute vs-src">${SRC ? esc(SRC.name) + ' · ' + SRC.pages.length + ' S.' : V.quelle === 'plakat' ? 'Plakat aus dem Baukasten' : 'noch nichts geladen'}</div>
        <input type="file" id="vsFile" hidden>
      </section>
      <section><h3>2 · Endformat</h3>
        ${row('Format', sel('end', Object.keys(ENDFORMATE).map((k) => [k, k === 'auto' ? 'Plakat, passend zum Bogen' : k === 'Plakat' ? 'Plakat in Originalgröße' : k === 'eigen' ? 'eigenes' : k + (ENDFORMATE[k] ? ' · ' + ENDFORMATE[k].join('×') : '')]), V.end))}
        ${row('B × H', num('endW', V.endW, '', 0.5) + '<span class="mute">×</span>' + num('endH', V.endH, 'mm', 0.5) + '<button class="link mono" id="vsSwap" title="Hoch/Quer">⇄</button>')}
        ${row('Beschnitt', num('bleed', V.bleed, 'mm', 0.5, 'min="0"'))}
        ${row('', `<label class="check"><input type="checkbox" data-k="anpassen"${V.anpassen ? ' checked' : ''}> Seiten aufs Endformat skalieren</label>`)}
      </section>
      <section><h3>3 · Ausschießen</h3>
        ${row('Schema', sel('schema', Object.entries(SCHEMA).map(([k, s]) => [k, s.l]), V.schema))}
        <p class="mono mute vs-hint">${esc(SCHEMA[V.schema].d)}</p>
        ${row('Druckbogen', sel('bogen', Object.entries(BOEGEN).map(([k, b]) => [k, b.l]), V.bogen))}
        ${V.bogen === 'eigen' ? row('Bogen B × H', num('bogenW', V.bogenW, '') + '<span class="mute">×</span>' + num('bogenH', V.bogenH, 'mm')) : ''}
        ${row('Lage', sel('lage', [['auto', 'automatisch'], ['quer', 'quer'], ['hoch', 'hoch']], V.lage))}
        ${row('Nutzen drehen', sel('drehen', [['auto', 'wenn mehr passen'], ['nie', 'nie'], ['immer', 'immer']], V.drehen))}
        ${row('Spalten × Zeilen', num('cols', V.cols, '', 1, 'min="0"') + '<span class="mute">×</span>' + num('rows', V.rows, '', 1, 'min="0"') + '<span class="mono mute">0 = max</span>')}
        ${row('Steg', num('steg', V.steg, 'mm', 0.5, 'min="0"'))}
        ${row('Rand / Greifer', num('rand', V.rand, '', 0.5, 'min="0"') + '<span class="mute">/</span>' + num('greifer', V.greifer, 'mm', 0.5, 'min="0"'))}
        ${V.schema === 'heft' ? row('Bundzuwachs', num('creep', V.creep, 'mm gesamt', 0.05, 'min="0"')) : ''}
      </section>
      <section><h3>4 · Marken</h3>
        <div class="vs-checks">${mk('schnitt', 'Schneidemarken')}${mk('falz', 'Falzmarken')}${mk('pass', 'Passkreuze')}${mk('farbe', 'Farbkontrollstreifen')}${mk('info', 'Bogeninfo')}</div>
      </section>
      <section><h3>5 · Auflage & Papier</h3>
        ${row('Auflage', num('auflage', V.auflage, 'Ex.', 1, 'min="1"'))}
        ${row('Zuschuss', num('zuschuss', V.zuschuss, '%', 1, 'min="0"'))}
        ${row('Papier', txt('papier', V.papier, 'z. B. Munken Pure'))}
        ${row('Grammatur', num('gInhalt', V.gInhalt, 'g/m² Inhalt', 5) + '')}
        ${row('Umschlag', sel('umschlag', [[0, 'kein eigener'], [4, '4 Seiten']], V.umschlag) + (V.umschlag ? num('gUmschlag', V.gUmschlag, 'g/m²', 5) : ''))}
        ${row('Farbigkeit', sel('farbe', FARBE.map((x) => [x, x]), V.farbe))}
        ${row('Sonderfarben', sel('sonder', SONDER.map((x) => [x, x]), V.sonder))}
        ${row('Konfektionierung', sel('konf', KONF.map((x) => [x, x]), V.konf))}
      </section>
      <section><h3>6 · Auftrag ${hsdOn() ? '<span class="mono mute">HSD PBSA · ' + esc(TP.HSD.semester) + '</span>' : ''}</h3>
        ${row('Titel', txt('titel', V.titel, 'Bezeichnung der Drucksache'))}
        ${row('Name', txt('p.name', V.person.name, 'Auftraggeber:in'))}
        ${row('Telefon', txt('p.tel', V.person.tel))}
        ${row('E-Mail', txt('p.mail', V.person.mail))}
        ${hsdOn() ? hsdLeitung() + hsdKurs() : row('Kurs', txt('p.kurs', V.person.kurs, 'Kursbeschreibung')) + row('Kursleitung', txt('p.leitung', V.person.leitung, 'Kursleitung'))}
      </section>`;
  }

  function renderInfo() {
    const info = $('#vsInfo'), nn = G ? numbers(G) : null, pf = preflight(G || { n: 0, cols: 0, rows: 0, forms: [], sw: 0, sh: 0 });
    const ico = { ok: '✓', warn: '!', bad: '×' };
    const bad = pf.filter((p) => p.lvl === 'bad').length, warn = pf.filter((p) => p.lvl === 'warn').length;
    info.innerHTML = `
      <section class="vs-kpi">
        <div><b>${G ? G.n : 0}</b><span class="mono">Nutzen</span></div>
        <div><b>${G ? G.forms.length : 0}</b><span class="mono">Formen</span></div>
        <div><b>${nn ? nn.mit : 0}</b><span class="mono">Bogen</span></div>
        <div><b>${nn ? nn.klicks : 0}</b><span class="mono">Drucke</span></div>
      </section>
      <section><h3>Prüfung <span class="mono mute">${bad ? bad + ' Fehler · ' : ''}${warn} Hinweise</span></h3>
        <ul class="vs-pf">${pf.map((p) => `<li class="${p.lvl}"><i>${ico[p.lvl]}</i><div><b>${esc(p.t)}</b>${p.d ? `<span>${esc(p.d)}</span>` : ''}</div></li>`).join('')}</ul>
        <div class="vs-hand">${HAND.map(([k, l]) => `<label class="check"><input type="checkbox" data-h="${k}"${V.check[k] ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      </section>
      <section class="vs-out"><h3>Ausgabe</h3>
        <div class="vs-btn"><button class="btn dark" id="vs-daten">Druckdaten-PDF</button><button class="link mono" data-show="daten">ansehen</button></div>
        <p class="mono mute">Einzelnutzen mit ${V.bleed} mm Beschnitt${V.marken.schnitt ? ' und Schneidemarken' : ''}, TrimBox gesetzt${V.schema === 'heft' ? ', Vakatseiten ergänzt' : ''}. So will es die Werkstatt.</p>
        <div class="vs-btn"><button class="btn" id="vs-bogen">Druckbogen-PDF</button><button class="link mono" data-show="bogen">ansehen</button></div>
        <p class="mono mute">Ausgeschossen, ${G ? G.forms.length * (nn ? nn.sides : 1) : 0} Bogenseiten + Schema-Blatt. Für Eigenarbeit und zur Absprache.</p>
        ${hsdOn() ? `<div class="vs-btn"><button class="btn" id="vs-auftrag">Auftragsformular HSD</button><button class="link mono" data-show="auftrag">ansehen</button></div>
        <p class="mono mute">Offizielles Formular der Grafischen Werkstatt, ausgefüllt und weiter bearbeitbar. Ausdrucken, unterschreiben lassen, zum Termin mitbringen.</p>
        <a class="mono mute" href="mailto:druck.design@hs-duesseldorf.de?subject=${encodeURIComponent('Terminanfrage Digitaldruck: ' + (V.titel || ''))}">druck.design@hs-duesseldorf.de ↗</a>` : '<p class="mono mute">Das Auftragsformular der HSD gibt es im HSD-PBSA-Modus (Einstellungen oben rechts).</p>'}
      </section>`;
  }

  function renderBar() {
    const bar = $('#vsBar'), strip = $('#vsStrip');
    const F = G ? G.forms : [];
    if (formIx >= F.length) formIx = Math.max(0, F.length - 1);
    bar.innerHTML = `<button class="link" id="vsPrev">←</button><span>Form ${F.length ? formIx + 1 : 0} / ${F.length}${F[formIx] ? ' · ' + esc(F[formIx].name) : ''}</span><button class="link" id="vsNext">→</button>
      <span class="grow"></span><span class="mute">${G ? G.sw + ' × ' + G.sh + ' mm · ' + G.cols + ' × ' + G.rows + (G.rot ? ' gedreht' : '') : ''}</span>`;
    strip.innerHTML = F.map((f, i) => `<button class="mono${i === formIx ? ' on' : ''}" data-f="${i}">${String(i + 1).padStart(2, '0')}</button>`).join('');
  }

  function update(full) {
    G = layout();
    if (full) renderSide();
    renderBar(); renderInfo(); draw();
  }

  async function setQuelle(q, files) {
    V.quelle = q; save();
    try {
      if (q === 'plakat') await loadPlakat();
      else if (files && files.length) q === 'pdf' ? await loadPdf(files[0]) : await loadImages([...files]);
      else { SRC = null; srcDoc = null; }
    } catch (e) { console.error(e); A.toast('Konnte nicht geladen werden: ' + e.message); SRC = null; }
    save(); formIx = 0; update(true);
  }

  // Ereignisse
  function bind() {
    const side = $('#vsSide');
    side.addEventListener('click', (e) => {
      const q = e.target.closest('#vsQuelle button');
      if (q) {
        const k = q.dataset.q;
        if (k === 'plakat') return setQuelle('plakat');
        const f = $('#vsFile'); f.accept = k === 'pdf' ? 'application/pdf' : 'image/*'; f.multiple = k === 'bilder';
        f.onchange = () => setQuelle(k, f.files); f.value = ''; f.click();
      }
      if (e.target.id === 'vsSwap') { [V.endW, V.endH] = [V.endH, V.endW]; V.end = 'eigen'; save(); reloadRaster(); }
    });
    side.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.m) { V.marken[t.dataset.m] = t.checked; save(); return V.end === 'auto' ? reloadRaster() : update(false); }
      const k = t.dataset.k; if (!k) return;
      let v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? parseFloat(t.value) || 0 : t.value;
      if (k === 'p.leitung' && t.tagName === 'SELECT') {
        V.person.leitungFrei = v === '__frei'; V.person.leitung = v === '__frei' ? '' : v;
        V.person.kurs = ''; V.person.kursFrei = false;
        const p = leitungP(); if (p && p.kurse.length === 1) V.person.kurs = p.kurse[0].titel;
        save(); return update(true);
      }
      if (k === 'p.kurs' && t.tagName === 'SELECT') { V.person.kursFrei = v === '__frei'; V.person.kurs = v === '__frei' ? '' : v; save(); return update(true); }
      if (k.startsWith('pf.')) { V.person[k.slice(3)] = v; save(); return update(false); }
      if (k.startsWith('p.')) { V.person[k.slice(2)] = v; save(); return update(false); }
      if (k === 'umschlag') v = +v;
      V[k] = v;
      if (k === 'end' && ENDFORMATE[v]) { [V.endW, V.endH] = ENDFORMATE[v]; }
      if (k === 'end' && v === 'Plakat') { const p = A.poster(); V.endW = p.w; V.endH = p.h; }
      if (k === 'end' && (ENDFORMATE[v] || v === 'Plakat')) {
        const q = platz();
        if (Math.max(V.endW, V.endH) > q.L || Math.min(V.endW, V.endH) > q.S) {
          V.bogen = 'gross'; V.rand = BOEGEN.gross.rand; V.greifer = BOEGEN.gross.greifer;
          A.toast('Passt nicht auf den Druckbogen, Bogen auf Großformat gestellt');
        }
      }
      if (V.end === 'auto' && ['end', 'bogen', 'bogenW', 'bogenH', 'bleed', 'rand', 'greifer'].includes(k)) {
        if (k === 'bogen' && BOEGEN[v]) { V.rand = BOEGEN[v].rand; V.greifer = BOEGEN[v].greifer; }
        autoEnd(); save(); return reloadRaster();
      }
      if (k === 'endW' || k === 'endH') V.end = 'eigen';
      if (k === 'bogen' && BOEGEN[v]) { V.rand = BOEGEN[v].rand; V.greifer = BOEGEN[v].greifer; }
      if (k === 'schema') { if (v === 'heft') V.konf = KONF[1]; else if (V.konf === KONF[1]) V.konf = 'keine'; }
      save();
      if (['end', 'endW', 'endH', 'bleed'].includes(k)) return reloadRaster();
      update(['schema', 'bogen', 'end', 'umschlag'].includes(k));
    });
    $('#vsInfo').addEventListener('change', (e) => { const k = e.target.dataset.h; if (k) { V.check[k] = e.target.checked; save(); } });
    $('#vsInfo').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.show) run(b.dataset.show, true);
      else if (b.id && b.id.startsWith('vs-')) run(b.id.slice(3), false);
    });
    $('#vsBar').addEventListener('click', (e) => {
      if (!G) return;
      if (e.target.id === 'vsPrev') formIx = Math.max(0, formIx - 1);
      if (e.target.id === 'vsNext') formIx = Math.min(G.forms.length - 1, formIx + 1);
      renderBar(); draw();
    });
    $('#vsStrip').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { formIx = +b.dataset.f; renderBar(); draw(); } });
    window.addEventListener('resize', () => { if ($('#view-vorstufe').classList.contains('on')) draw(); });
    window.addEventListener('keydown', (e) => {
      if (!$('#view-vorstufe').classList.contains('on') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || !G) return;
      if (e.key === 'ArrowRight') { formIx = Math.min(G.forms.length - 1, formIx + 1); renderBar(); draw(); }
      if (e.key === 'ArrowLeft') { formIx = Math.max(0, formIx - 1); renderBar(); draw(); }
    });
  }

  // Plakat/Bilder hängen vom Endformat ab und werden neu aufgebaut, PDFs nicht
  async function reloadRaster() {
    if (SRC && SRC.kind === 'plakat') await loadPlakat();
    else if (SRC && SRC.kind === 'bilder') {
      const items = SRC.pages.map((p) => ({ canvas: p.full, name: p.name }));
      await rasterSource(items, 'bilder', SRC.name);
    }
    update(true);
  }

  let bound = false;
  TP.vorstufe = {
    async open() {
      if (!bound) { bind(); bound = true; }
      try {
        if (V.quelle === 'plakat' || !SRC) { V.quelle = 'plakat'; await loadPlakat(); }
      } catch (e) { console.error('Vorstufe', e); SRC = null; }
      update(true);
    },
    // auch von außen nutzbar (z. B. zum Testen): Quelle laden und PDFs bauen
    load: (files, kind) => setQuelle(kind || 'pdf', files),
    refresh: () => { if (bound) update(true); },
    pdf: (kind) => (kind === 'bogen' ? buildImposed() : kind === 'daten' ? buildSingles() : buildAuftrag()),
    state: () => ({ V, G, SRC }),
  };
  if (location.hash === '#vorstufe') setTimeout(() => TP.vorstufe.open(), 0);
})();
