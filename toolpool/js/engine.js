/* Tool Pool – Render-Engine
   Jeder Baustein ist ein quadratisches Puzzleteil auf einem Raster.
   Das Bild fließt nach rechts und nach unten: Ein Teil bekommt die Ausgabe
   seines linken Nachbarn und seines oberen Nachbarn als Eingang. */
(function () {
  const TP = (window.TP = window.TP || {});

  // ---------- Zufall & Noise ----------
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const P = new Uint8Array(512);
  {
    const r = mulberry(1337), p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  }
  function h3(x, y, z) { return P[P[P[x] + y] + z]; }
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let u = x - xi, v = y - yi, w = z - zi;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
    const X = xi & 255, Y = yi & 255, Z = zi & 255;
    const a = h3(X, Y, Z), b = h3(X + 1, Y, Z), c = h3(X, Y + 1, Z), d = h3(X + 1, Y + 1, Z);
    const e = h3(X, Y, Z + 1), f = h3(X + 1, Y, Z + 1), g = h3(X, Y + 1, Z + 1), hh = h3(X + 1, Y + 1, Z + 1);
    const l1 = a + (b - a) * u, l2 = c + (d - c) * u, l3 = e + (f - e) * u, l4 = g + (hh - g) * u;
    const m1 = l1 + (l2 - l1) * v, m2 = l3 + (l4 - l3) * v;
    return (m1 + (m2 - m1) * w) / 255;
  }
  function fbm(x, y, z, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f + i * 7.1); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }

  // ---------- Helfer ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hex(c) {
    c = String(c || '#000').replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d', { willReadFrequently: true });
    return c;
  }
  const _tmp = {};
  function tmp(k, w, h) {
    let c = _tmp[k];
    if (!c) c = _tmp[k] = canvas(w, h);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  const lum = (d, i) => (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
  function grain(ctx, w, h, amt, color, seed) {
    const im = ctx.getImageData(0, 0, w, h), d = im.data, r = mulberry(seed);
    for (let i = 0; i < d.length; i += 4) {
      if (color) { d[i] += (r() - 0.5) * amt; d[i + 1] += (r() - 0.5) * amt; d[i + 2] += (r() - 0.5) * amt; }
      else { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    }
    ctx.putImageData(im, 0, 0);
  }
  // Pixel-Verschiebung: map(x,y) liefert Quellkoordinaten in out[0], out[1]
  function remap(ctx, w, h, map, box) {
    const im = ctx.getImageData(0, 0, w, h), d = im.data, src = new Uint8ClampedArray(d), o = [0, 0];
    const x0 = box ? box[0] : 0, y0 = box ? box[1] : 0, x1 = box ? box[2] : w, y1 = box ? box[3] : h;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!map(x, y, o)) continue;
      const sx = clamp(o[0] | 0, 0, w - 1), sy = clamp(o[1] | 0, 0, h - 1);
      const si = (sy * w + sx) * 4, di = (y * w + x) * 4;
      d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2]; d[di + 3] = src[si + 3];
    }
    ctx.putImageData(im, 0, 0);
  }

  // Erzeuger: Grund nur füllen, wenn gewünscht – sonst bleibt alles außer der Form durchsichtig
  function bg(ctx, w, h, p) {
    if (p.fuellen) { ctx.fillStyle = p.grund; ctx.fillRect(0, 0, w, h); } else ctx.clearRect(0, 0, w, h);
  }
  const FILL = (on) => [Bo('fuellen', 'Grund füllen', on), C('grund', 'Grund', TP.PAPER)];

  TP.util = { mulberry, noise3, fbm, clamp, hex, canvas, tmp };
  // Bausteine für weitere Node-Dateien (playgrnd.js, shader.js) – wird unten ergänzt
  TP.k = { mulberry, noise3, fbm, clamp, hex, canvas, tmp, lum, grain, remap, bg };
  TP.PAPER = '#f4f1ec';

  // ---------- Kategorien ----------
  // Technik (Farbe des Bausteins):
  //   Vektor = baut Formen und Pfade, bleibt bei jeder Größe scharf (bei playgrnd: SVG-Export)
  //   Pixel  = rechnet Bildpunkt für Bildpunkt: Körnung, Dither, Verschmieren (bei playgrnd: nur PNG)
  //   Shader = rechnet jeden Bildpunkt auf der Grafikkarte (WebGL), in Echtzeit
  TP.CATS = {
    vektor: { name: 'Vektor' },
    pixel: { name: 'Pixel' },
    shader: { name: 'Shader' },
    kombi: { name: 'Kombinieren' },
    output: { name: 'Output' },
  };
  // Familie: was der Baustein macht
  TP.FAMS = {
    schrift: 'Schrift', feld: 'Feld & Verlauf', muster: 'Muster', opart: 'Op-Art', organisch: 'Organisch',
    raster: 'Raster & Dither', glitch: 'Glitch', druck: 'Druck', zeichen: 'Zeichen', farbe: 'Farbe',
    raum: 'Bewegung & Raum', bild: 'Bild', kombi: 'Kombinieren', output: 'Output',
  };

  TP.PALETTES = {
    pool: ['#1d1a3a', '#5b4bd6', '#f39a6b', '#f4f1ec'],
    riso: ['#0f2a6b', '#0078bf', '#ff48b0', '#ffe800', '#fbf8f0'],
    nacht: ['#050508', '#3a2d6e', '#00d39b', '#f4f1ec'],
    thermo: ['#000000', '#6b0bb8', '#ff4d00', '#ffd500', '#ffffff'],
    blau: ['#0a1a4a', '#2f5bff', '#bfe0ff'],
    bonbon: ['#7c6cf0', '#ff5fa2', '#ffd36e', '#7ee0c3'],
    mono: ['#111111', '#f4f1ec'],
  };

  // ---------- Parameter-Kurzformen ----------
  const R = (k, l, min, max, d, step) => ({ k, l, t: 'range', min, max, d, step: step || (max - min > 20 ? 1 : 0.01) });
  const S = (k, l, opts, d) => ({ k, l, t: 'select', opts, d });
  const C = (k, l, d) => ({ k, l, t: 'color', d });
  const T = (k, l, d) => ({ k, l, t: 'text', d });
  const Bo = (k, l, d) => ({ k, l, t: 'bool', d });

  const B = (TP.BLOCKS = {});
  function def(id, o) {
    o.id = id;
    if (o.kind === 'gen') o.params.push(S('mix', 'Über Eingang', ['normal', 'multiply', 'screen', 'difference'], 'normal'));
    B[id] = o;
  }
  TP.defaults = function (type) {
    const p = {};
    B[type].params.forEach((q) => (p[q.k] = q.d));
    return p;
  };

  // ======================================================
  //  ERZEUGER (gen) – zeichnen etwas Neues
  // ======================================================
  def('text', {
    name: 'Text', cat: 'schrift', kind: 'gen', tool: 'Space Type Generator · Stoer Editor',
    params: [T('text', 'Text', 'TOOL POOL'), S('schrift', 'Schrift', ['grotesk', 'mono', 'serif', 'kursiv'], 'grotesk'),
      R('groesse', 'Größe', 10, 400, 64, 1), R('lauf', 'Laufweite', -0.2, 0.6, -0.03), R('zeilen', 'Zeilen', 1, 30, 1, 1),
      R('dreh', 'Drehung', -90, 90, 0, 1), R('tempo', 'Laufband', -3, 3, 0), C('farbe', 'Farbe', '#151515'), ...FILL(false)],
    run(ctx, w, h, p, env) {
      const s = env.s, size = p.groesse * s;
      const fonts = {
        grotesk: `600 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`,
        mono: `500 ${size}px ui-monospace, Menlo, monospace`,
        serif: `400 ${size}px "Times New Roman", Georgia, serif`,
        kursiv: `italic 400 ${size}px Georgia, serif`,
      };
      bg(ctx, w, h, p);
      const txt = String(p.text || '');
      if (!txt) return;
      ctx.save();
      ctx.font = fonts[p.schrift] || fonts.grotesk; ctx.fillStyle = p.farbe; ctx.textBaseline = 'middle';
      const tr = p.lauf * size;
      const widths = [...txt].map((ch) => ctx.measureText(ch).width + tr);
      const tw = widths.reduce((a, b) => a + b, 0);
      const draw = (x, y) => { let cx = x; [...txt].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i]; }); };
      ctx.translate(w / 2, h / 2); ctx.rotate((p.dreh * Math.PI) / 180);
      if (p.zeilen <= 1 && !p.tempo) {
        draw(-tw / 2, 0);
      } else {
        const span = Math.hypot(w, h), n = Math.max(1, p.zeilen), lh = n > 1 ? span / n : 0;
        const unit = tw + size * 0.4;
        for (let i = 0; i < n; i++) {
          const y = n > 1 ? -span / 2 + (i + 0.5) * lh : 0;
          const dir = i % 2 ? -1 : 1;
          let off = (env.t * p.tempo * 60 * s * dir + i * unit * 0.37) % unit;
          if (off > 0) off -= unit;
          for (let x = -span / 2 + off; x < span / 2; x += unit) {
            let cx = x; [...txt].forEach((ch, k) => { ctx.fillText(ch, cx, y); cx += widths[k]; });
          }
        }
      }
      ctx.restore();
    },
  });

  def('verlauf', {
    name: 'Verlauf', cat: 'grund', kind: 'gen', tool: 'Gradientor',
    params: [C('c1', 'Farbe 1', '#5b4bd6'), C('c2', 'Farbe 2', '#f39a6b'), C('c3', 'Farbe 3', TP.PAPER),
      S('typ', 'Typ', ['linear', 'radial', 'kegel'], 'linear'), R('winkel', 'Winkel', 0, 360, 200, 1), R('tempo', 'Tempo', 0, 2, 0.2), R('korn', 'Körnung', 0, 80, 10, 1)],
    run(ctx, w, h, p, env) {
      const a = ((p.winkel + env.t * p.tempo * 40) * Math.PI) / 180, cx = w / 2, cy = h / 2;
      let g;
      if (p.typ === 'radial') {
        const ox = cx + Math.cos(a) * w * 0.25, oy = cy + Math.sin(a) * h * 0.25;
        g = ctx.createRadialGradient(ox, oy, 0, cx, cy, Math.hypot(w, h) * 0.6);
      } else if (p.typ === 'kegel' && ctx.createConicGradient) {
        g = ctx.createConicGradient(a, cx, cy);
      } else {
        const r = Math.hypot(w, h) / 2;
        g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      if (p.typ === 'kegel') { g.addColorStop(0, p.c1); g.addColorStop(0.33, p.c2); g.addColorStop(0.66, p.c3); g.addColorStop(1, p.c1); }
      else { g.addColorStop(0, p.c1); g.addColorStop(0.5, p.c2); g.addColorStop(1, p.c3); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (p.korn > 0) grain(ctx, w, h, p.korn, false, 1);
    },
  });

  def('noise', {
    name: 'Noise-Feld', cat: 'grund', kind: 'gen', tool: 'TERRAIN · playgrnd',
    params: [R('skala', 'Skala', 20, 400, 140, 1), R('okt', 'Oktaven', 1, 5, 3, 1), R('baender', 'Bänder', 0, 16, 0, 1),
      R('kontrast', 'Kontrast', 0.5, 4, 1.4), R('tempo', 'Tempo', 0, 2, 0.25), R('seed', 'Seed', 0, 99, 3, 1), Bo('alpha', 'Hell = durchsichtig', false)],
    run(ctx, w, h, p, env) {
      const q = 2, sw = Math.ceil(w / q), sh = Math.ceil(h / q), tc = tmp('noise', sw, sh), tx = tc.getContext('2d');
      const im = tx.createImageData(sw, sh), d = im.data, sc = (p.skala * env.s) / q, z = env.t * p.tempo * 0.4 + p.seed * 17.3;
      const n = p.baender;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        let v = clamp((fbm(x / sc, y / sc, z, p.okt) - 0.5) * p.kontrast * 2 + 0.5, 0, 1);
        if (n === 1) v = v > 0.5 ? 1 : 0;
        else if (n > 1) v = Math.min(n - 1, Math.floor(v * n)) / (n - 1);
        const i = (y * sw + x) * 4, c = v * 255;
        if (p.alpha) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255 - c; }
        else { d[i] = d[i + 1] = d[i + 2] = c; d[i + 3] = 255; }
      }
      tx.putImageData(im, 0, 0);
      ctx.imageSmoothingEnabled = n === 0;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(tc, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
    },
  });

  def('streifen', {
    name: 'Streifen', cat: 'grund', kind: 'gen', tool: 'OPTIC · WHORL · playgrnd',
    params: [S('form', 'Form', ['horizontal', 'vertikal', 'kreis'], 'kreis'), R('linien', 'Linien', 4, 140, 46, 1), R('dicke', 'Dicke', 0.05, 1, 0.5),
      R('welle', 'Welle', 0, 80, 14, 1), R('freq', 'Frequenz', 0, 12, 3, 1), R('stoer', 'Störung', 0, 1, 0.4), R('tempo', 'Tempo', 0, 3, 0.6),
      C('farbe', 'Farbe', '#151515'), ...FILL(true)],
    run(ctx, w, h, p, env) {
      const s = env.s, t = env.t * p.tempo, A = p.welle * s, n = p.linien;
      bg(ctx, w, h, p);
      ctx.strokeStyle = p.farbe; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (p.form === 'kreis') {
        const cx = w / 2, cy = h / 2, R0 = Math.hypot(w, h) * 0.55, gap = R0 / n;
        ctx.lineWidth = Math.max(0.5, gap * p.dicke);
        for (let i = 1; i <= n; i++) {
          const r = i * gap, steps = Math.max(48, Math.ceil(r / 2 / s) * s);
          ctx.beginPath();
          for (let k = 0; k <= steps; k++) {
            const a = (k / steps) * Math.PI * 2;
            const nz = p.stoer ? (noise3(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5 + 5, i * 0.05 + t * 0.3) - 0.5) * 2 : 0;
            const rr = r + A * Math.sin(a * p.freq + t * 2 + i * 0.15) * (i / n) + nz * p.stoer * A * 2;
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
      } else {
        const vert = p.form === 'vertikal', L = vert ? w : h, M = vert ? h : w, gap = L / n, st = 3 * s;
        ctx.lineWidth = Math.max(0.5, gap * p.dicke);
        for (let i = 0; i < n; i++) {
          const o = (i + 0.5) * gap;
          ctx.beginPath();
          for (let m = -st; m <= M + st; m += st) {
            const nz = p.stoer ? (noise3(m / (120 * s), o / (120 * s), t * 0.3) - 0.5) * 2 : 0;
            const off = o + A * Math.sin((m / M) * p.freq * Math.PI * 2 + t * 2 + i * 0.25) + nz * p.stoer * A * 2;
            const x = vert ? off : m, y = vert ? m : off;
            m === -st ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    },
  });

  function shape(ctx, f, r) {
    r = Math.max(0, r);
    ctx.beginPath();
    if (f === 'kreis') ctx.arc(0, 0, r, 0, Math.PI * 2);
    else if (f === 'quadrat') ctx.rect(-r, -r, 2 * r, 2 * r);
    else if (f === 'dreieck') { ctx.moveTo(0, -r); ctx.lineTo(r * 0.94, r * 0.7); ctx.lineTo(-r * 0.94, r * 0.7); ctx.closePath(); }
    else if (f === 'kreuz') { const q = r * 0.34; ctx.rect(-r, -q, 2 * r, 2 * q); ctx.rect(-q, -r, 2 * q, 2 * r); }
    else if (f === 'bogen') { ctx.moveTo(-r, r); ctx.arc(-r, r, 2 * r, -Math.PI / 2, 0); ctx.closePath(); }
    ctx.fill('nonzero');
  }
  def('raster', {
    name: 'Formen-Raster', cat: 'grund', kind: 'gen', tool: 'Book of Shapes',
    params: [S('form', 'Form', ['kreis', 'quadrat', 'dreieck', 'kreuz', 'bogen', 'mix'], 'mix'), R('spalten', 'Spalten', 2, 40, 8, 1),
      R('groesse', 'Größe', 0.1, 1.6, 0.9), R('var', 'Variation', 0, 1, 0.7), R('dreh', 'Drehung', 0, 1, 0.25), R('tempo', 'Tempo', 0, 2, 0.3),
      C('farbe', 'Farbe', '#151515'), ...FILL(false)],
    run(ctx, w, h, p, env) {
      bg(ctx, w, h, p); ctx.fillStyle = p.farbe;
      const cs = w / p.spalten, rows = Math.ceil(h / cs), oy = (h - rows * cs) / 2, z = env.t * p.tempo * 0.5;
      const forms = ['kreis', 'quadrat', 'dreieck', 'kreuz', 'bogen'];
      for (let j = 0; j < rows; j++) for (let i = 0; i < p.spalten; i++) {
        const n = noise3(i * 0.31 + 0.5, j * 0.31 + 0.5, z), n2 = noise3(i * 0.27 + 40, j * 0.27 + 40, z * 0.7);
        const sz = cs * p.groesse * (1 - p.var + p.var * n * 1.6) * 0.5;
        const f = p.form === 'mix' ? forms[Math.floor(n2 * 4.999)] : p.form;
        ctx.save(); ctx.translate((i + 0.5) * cs, (j + 0.5) * cs + oy); ctx.rotate(p.dreh * n2 * Math.PI * 4);
        shape(ctx, f, sz); ctx.restore();
      }
    },
  });

  def('fluss', {
    name: 'Fluss', cat: 'grund', kind: 'gen', tool: 'Hypha',
    params: [R('anzahl', 'Linien', 50, 2000, 600, 10), R('laenge', 'Länge', 5, 200, 60, 1), R('skala', 'Skala', 30, 500, 170, 1),
      R('dicke', 'Dicke', 0.2, 5, 0.9), R('wirbel', 'Wirbel', 0.5, 6, 2), R('tempo', 'Tempo', 0, 2, 0.2), R('seed', 'Seed', 0, 99, 7, 1),
      C('farbe', 'Farbe', '#151515'), ...FILL(false)],
    run(ctx, w, h, p, env) {
      const s = env.s, r = mulberry(p.seed * 999 + 1), z = env.t * p.tempo * 0.3, sc = p.skala * s, st = 2 * s;
      bg(ctx, w, h, p);
      ctx.strokeStyle = p.farbe; ctx.lineWidth = p.dicke * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let k = 0; k < p.anzahl; k++) {
        let x = r() * w, y = r() * h;
        ctx.moveTo(x, y);
        for (let i = 0; i < p.laenge; i++) {
          const a = noise3(x / sc, y / sc, z) * Math.PI * 2 * p.wirbel;
          x += Math.cos(a) * st; y += Math.sin(a) * st; ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    },
  });

  def('bild', {
    name: 'Bild', cat: 'bild', kind: 'gen', tool: 'eigene Datei', needsImage: true,
    params: [S('fit', 'Einpassen', ['füllen', 'einpassen'], 'füllen'), R('zoom', 'Zoom', 1, 4, 1), R('x', 'Versatz X', -1, 1, 0), R('y', 'Versatz Y', -1, 1, 0), ...FILL(false)],
    run(ctx, w, h, p, env) {
      bg(ctx, w, h, p);
      const img = env.image;
      if (!img) {
        ctx.fillStyle = '#9a9994'; ctx.font = `${14 * env.s}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Bild wählen →', w / 2, h / 2); ctx.textAlign = 'start';
        return;
      }
      const iw0 = img.naturalWidth || img.width, ih0 = img.naturalHeight || img.height;
      const sc = (p.fit === 'füllen' ? Math.max(w / iw0, h / ih0) : Math.min(w / iw0, h / ih0)) * p.zoom;
      const iw = iw0 * sc, ih = ih0 * sc;
      ctx.drawImage(img, (w - iw) / 2 + (p.x * w) / 2, (h - ih) / 2 + (p.y * h) / 2, iw, ih);
    },
  });

  // ======================================================
  //  VERÄNDERER (fx) – bearbeiten den Eingang
  // ======================================================
  def('pixel', {
    name: 'Pixel', cat: 'bild', kind: 'fx', tool: 'ODDGRID · playgrnd',
    params: [R('groesse', 'Größe', 2, 80, 10, 1), S('form', 'Form', ['quadrat', 'kreis', 'raute', 'balken'], 'quadrat'),
      R('luecke', 'Lücke', 0, 0.6, 0), R('stufen', 'Farbstufen', 0, 8, 0, 1), ...FILL(false)],
    run(ctx, w, h, p, env) {
      const g = Math.max(1, p.groesse * env.s), d = ctx.getImageData(0, 0, w, h).data;
      bg(ctx, w, h, p);
      const q = p.stufen > 1 ? 255 / (p.stufen - 1) : 0;
      for (let y = 0; y < h; y += g) for (let x = 0; x < w; x += g) {
        const sx = Math.min(w - 1, (x + g / 2) | 0), sy = Math.min(h - 1, (y + g / 2) | 0), i = (sy * w + sx) * 4;
        let r = d[i], gg = d[i + 1], b = d[i + 2];
        if (d[i + 3] < 8) continue;
        if (q) { r = Math.round(r / q) * q; gg = Math.round(gg / q) * q; b = Math.round(b / q) * q; }
        ctx.fillStyle = `rgba(${r},${gg},${b},${(d[i + 3] / 255).toFixed(3)})`;
        const m = (g * p.luecke) / 2, sz = g - m * 2, cx = x + g / 2, cy = y + g / 2;
        if (p.form === 'kreis') { ctx.beginPath(); ctx.arc(cx, cy, sz / 2, 0, Math.PI * 2); ctx.fill(); }
        else if (p.form === 'raute') { ctx.beginPath(); ctx.moveTo(cx, cy - sz / 2); ctx.lineTo(cx + sz / 2, cy); ctx.lineTo(cx, cy + sz / 2); ctx.lineTo(cx - sz / 2, cy); ctx.fill(); }
        else if (p.form === 'balken') { const k = 1 - lum(d, i), bh = Math.max(1, sz * k); ctx.fillRect(x + m, y + m + sz - bh, sz, bh); }
        else ctx.fillRect(x + m, y + m, sz + (m ? 0 : 0.5), sz + (m ? 0 : 0.5));
      }
    },
  });

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  def('dither', {
    name: 'Dither', cat: 'bild', kind: 'fx', tool: 'Dither Garden',
    params: [S('methode', 'Methode', ['atkinson', 'floyd', 'bayer', 'zufall'], 'atkinson'), R('skala', 'Pixel', 1, 10, 2, 1),
      R('schwelle', 'Schwelle', -0.5, 0.5, 0), R('kontrast', 'Kontrast', 0.3, 3, 1.1), C('tinte', 'Tinte', '#151515'), C('papier', 'Papier', TP.PAPER), Bo('papierWeg', 'Papier durchsichtig', false)],
    run(ctx, w, h, p, env) {
      const k = Math.max(1, Math.round(p.skala * env.s)), sw = Math.ceil(w / k), sh = Math.ceil(h / k);
      const tc = tmp('dither', sw, sh), tx = tc.getContext('2d');
      tx.imageSmoothingEnabled = true; tx.clearRect(0, 0, sw, sh); tx.drawImage(ctx.canvas, 0, 0, sw, sh);
      const im = tx.getImageData(0, 0, sw, sh), d = im.data, L = new Float32Array(sw * sh);
      for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = clamp((lum(d, j) - 0.5) * p.kontrast + 0.5 - p.schwelle, 0, 1);
      const ink = hex(p.tinte), pap = hex(p.papier), r = mulberry(5);
      const put = (i, x, y, v) => {
        if (i < 0 || x < 0 || x >= sw || y >= sh) return;
        L[y * sw + x] += v;
      };
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const i = y * sw + x, v = L[i];
        let on;
        if (p.methode === 'bayer') on = v < (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        else if (p.methode === 'zufall') on = v < r();
        else {
          on = v < 0.5;
          const e = v - (on ? 0 : 1);
          if (p.methode === 'floyd') { put(i, x + 1, y, (e * 7) / 16); put(i, x - 1, y + 1, (e * 3) / 16); put(i, x, y + 1, (e * 5) / 16); put(i, x + 1, y + 1, e / 16); }
          else { const a = e / 8; put(i, x + 1, y, a); put(i, x + 2, y, a); put(i, x - 1, y + 1, a); put(i, x, y + 1, a); put(i, x + 1, y + 1, a); put(i, x, y + 2, a); }
        }
        const c = on ? ink : pap, j = i * 4, vis = d[j + 3] >= 128 && (on || !p.papierWeg);
        d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = vis ? 255 : 0;
      }
      tx.putImageData(im, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, w, h); ctx.drawImage(tc, 0, 0, w, h); ctx.imageSmoothingEnabled = true;
    },
  });

  def('glitch', {
    name: 'Glitch', cat: 'bild', kind: 'fx', tool: 'Mosh · playgrnd',
    params: [R('staerke', 'Stärke', 0, 1, 0.35), R('streifen', 'Streifen', 0, 80, 18, 1), R('kanal', 'RGB-Versatz', 0, 40, 6, 1),
      R('sort', 'Pixel-Sort', 0, 1, 0), R('tempo', 'Tempo', 0, 12, 3), R('seed', 'Seed', 0, 99, 1, 1)],
    run(ctx, w, h, p, env) {
      const im = ctx.getImageData(0, 0, w, h), d = im.data, r = mulberry(p.seed * 7919 + Math.floor(env.t * p.tempo) + 1);
      let src = new Uint8ClampedArray(d);
      for (let k = 0; k < p.streifen; k++) {
        const y0 = (r() * h) | 0, hh = (r() * h * 0.08 + 1) | 0, dx = Math.round((r() - 0.5) * w * p.staerke);
        for (let y = y0; y < Math.min(h, y0 + hh); y++) {
          const row = y * w * 4;
          for (let x = 0; x < w; x++) {
            const sx = (((x - dx) % w) + w) % w, si = row + sx * 4, di = row + x * 4;
            d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2]; d[di + 3] = src[si + 3];
          }
        }
      }
      const ks = Math.round(p.kanal * env.s);
      if (ks) {
        src = new Uint8ClampedArray(d);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const ri = (y * w + Math.min(w - 1, x + ks)) * 4, bi = (y * w + Math.max(0, x - ks)) * 4;
          d[i] = src[ri]; d[i + 2] = src[bi + 2];
          d[i + 3] = Math.max(src[i + 3], src[ri + 3], src[bi + 3]);
        }
      }
      if (p.sort > 0) {
        const th = 1 - p.sort;
        for (let y = 0; y < h; y++) {
          if (r() > p.staerke + 0.15) continue;
          let x = 0;
          while (x < w) {
            while (x < w && lum(d, (y * w + x) * 4) < th) x++;
            const a = x;
            while (x < w && lum(d, (y * w + x) * 4) >= th) x++;
            if (x - a > 2) {
              const run = [];
              for (let k = a; k < x; k++) { const i = (y * w + k) * 4; run.push([lum(d, i), d[i], d[i + 1], d[i + 2], d[i + 3]]); }
              run.sort((u, v) => u[0] - v[0]);
              for (let k = a; k < x; k++) { const i = (y * w + k) * 4, q = run[k - a]; d[i] = q[1]; d[i + 1] = q[2]; d[i + 2] = q[3]; d[i + 3] = q[4]; }
            }
          }
        }
      }
      ctx.putImageData(im, 0, 0);
    },
  });

  def('farbe', {
    name: 'Farbe', cat: 'bild', kind: 'fx', tool: 'Gradientor · SEAR · playgrnd',
    params: [S('palette', 'Palette', Object.keys(TP.PALETTES), 'pool'), R('stufen', 'Stufen', 0, 12, 0, 1), R('verschieb', 'Verschiebung', 0, 1, 0),
      R('tempo', 'Tempo', 0, 2, 0), Bo('umkehren', 'Umkehren', false)],
    run(ctx, w, h, p, env) {
      const pal = (TP.PALETTES[p.palette] || TP.PALETTES.pool).map(hex), lut = new Uint8Array(256 * 3);
      for (let i = 0; i < 256; i++) {
        const v = (i / 255) * (pal.length - 1), a = Math.floor(v), b = Math.min(pal.length - 1, a + 1), f = v - a;
        for (let c = 0; c < 3; c++) lut[i * 3 + c] = pal[a][c] + (pal[b][c] - pal[a][c]) * f;
      }
      const im = ctx.getImageData(0, 0, w, h), d = im.data, sh = (p.verschieb + env.t * p.tempo * 0.2) % 1, n = p.stufen;
      for (let i = 0; i < d.length; i += 4) {
        let v = lum(d, i);
        if (p.umkehren) v = 1 - v;
        if (sh) v = (v + sh) % 1;
        if (n > 1) v = Math.min(n - 1, Math.floor(v * n)) / (n - 1);
        const k = ((v * 255) | 0) * 3;
        d[i] = lut[k]; d[i + 1] = lut[k + 1]; d[i + 2] = lut[k + 2];
      }
      ctx.putImageData(im, 0, 0);
    },
  });

  def('kontrast', {
    name: 'Kontrast', cat: 'bild', kind: 'fx', tool: '—',
    params: [R('kontrast', 'Kontrast', 0.2, 4, 1.4), R('hell', 'Helligkeit', -1, 1, 0), R('saett', 'Sättigung', 0, 3, 1), Bo('invert', 'Invertieren', false)],
    run(ctx, w, h, p) {
      const im = ctx.getImageData(0, 0, w, h), d = im.data, hb = p.hell * 255;
      for (let i = 0; i < d.length; i += 4) {
        const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        for (let c = 0; c < 3; c++) {
          let v = l + (d[i + c] - l) * p.saett;
          v = (v - 128) * p.kontrast + 128 + hb;
          d[i + c] = p.invert ? 255 - v : v;
        }
      }
      ctx.putImageData(im, 0, 0);
    },
  });

  def('spiegel', {
    name: 'Spiegel', cat: 'bild', kind: 'fx', tool: '—',
    params: [S('modus', 'Modus', ['kaleido', 'links→rechts', 'oben→unten', 'vier'], 'kaleido'), R('segmente', 'Segmente', 2, 16, 6, 1),
      R('dreh', 'Drehung', 0, 360, 0, 1), R('tempo', 'Tempo', 0, 2, 0.2)],
    run(ctx, w, h, p, env) {
      const cx = w / 2, cy = h / 2, seg = (Math.PI * 2) / p.segmente, rot = (p.dreh * Math.PI) / 180 + env.t * p.tempo * 0.5;
      remap(ctx, w, h, (x, y, o) => {
        if (p.modus === 'kaleido') {
          const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
          let a = Math.atan2(dy, dx) - rot;
          a = ((a % seg) + seg) % seg;
          if (a > seg / 2) a = seg - a;
          o[0] = cx + r * Math.cos(a + rot); o[1] = cy + r * Math.sin(a + rot);
          o[0] = ((o[0] % w) + w) % w; o[1] = ((o[1] % h) + h) % h;
          return true;
        }
        const lr = p.modus !== 'oben→unten', ou = p.modus !== 'links→rechts';
        o[0] = lr && x >= cx ? w - 1 - x : x; o[1] = ou && y >= cy ? h - 1 - y : y;
        return true;
      });
    },
  });

  def('halftone', {
    name: 'Halftone', cat: 'druck', kind: 'fx', tool: 'BENDAY · playgrnd',
    params: [R('raster', 'Raster', 3, 40, 8, 1), R('winkel', 'Winkel', 0, 90, 45, 1), S('form', 'Form', ['punkt', 'linie', 'quadrat'], 'punkt'),
      R('kontrast', 'Kontrast', 0.3, 3, 1.2), C('tinte', 'Tinte', '#151515'), Bo('fuellen', 'Papier füllen', false), C('grund', 'Papier', TP.PAPER)],
    run(ctx, w, h, p, env) {
      const d = ctx.getImageData(0, 0, w, h).data, g = p.raster * env.s, a = (p.winkel * Math.PI) / 180;
      const ca = Math.cos(a), sa = Math.sin(a), D = Math.hypot(w, h), cx = w / 2, cy = h / 2;
      bg(ctx, w, h, p); ctx.fillStyle = p.tinte; ctx.beginPath();
      const poly = (x, y, pts) => { pts.forEach(([du, dv], i) => { const px = x + du * ca - dv * sa, py = y + du * sa + dv * ca; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); };
      for (let v = -D / 2; v < D / 2; v += g) for (let u = -D / 2; u < D / 2; u += g) {
        const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
        if (x < -g || y < -g || x > w + g || y > h + g) continue;
        const i = (clamp(y | 0, 0, h - 1) * w + clamp(x | 0, 0, w - 1)) * 4;
        const k = (1 - clamp((lum(d, i) - 0.5) * p.kontrast + 0.5, 0, 1)) * (d[i + 3] / 255);
        if (k < 0.02) continue;
        if (p.form === 'punkt') { const r = Math.sqrt(k) * g * 0.71; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
        else if (p.form === 'quadrat') { const r = Math.sqrt(k) * g * 0.5; poly(x, y, [[-r, -r], [r, -r], [r, r], [-r, r]]); }
        else { const t = k * g * 0.5, q = g / 2 + 0.3; poly(x, y, [[-q, -t], [q, -t], [q, t], [-q, t]]); }
      }
      ctx.fill();
    },
  });

  def('riso', {
    name: 'Riso', cat: 'druck', kind: 'fx', tool: 'RISO · playgrnd',
    params: [C('f1', 'Farbe 1', '#0078bf'), C('f2', 'Farbe 2', '#ff48b0'), R('versatz', 'Versatz', 0, 30, 5, 1), R('winkel', 'Richtung', 0, 360, 40, 1),
      R('trennung', 'Trennung', 0, 1, 0.5), R('korn', 'Körnung', 0, 1, 0.35), Bo('fuellen', 'Papier füllen', false), C('papier', 'Papier', '#f7f2e8')],
    run(ctx, w, h, p, env) {
      const im = ctx.getImageData(0, 0, w, h), d = im.data, src = new Uint8ClampedArray(d);
      const c1 = hex(p.f1).map((v) => v / 255), c2 = hex(p.f2).map((v) => v / 255), pp = hex(p.papier);
      const off = p.versatz * env.s, a = (p.winkel * Math.PI) / 180, ox = Math.round(Math.cos(a) * off), oy = Math.round(Math.sin(a) * off);
      const r = mulberry(11), tr = p.trennung, kn = p.korn;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, j = (clamp(y - oy, 0, h - 1) * w + clamp(x - ox, 0, w - 1)) * 4;
        const l1 = lum(src, i), l2 = lum(src, j);
        let k1 = (1 - l1) * (1 - tr) + (1 - src[i] / 255) * tr;
        let k2 = (1 - l2) * (1 - tr) + (1 - src[j + 1] / 255) * tr;
        k1 = clamp(k1 * 1.1 + (r() - 0.5) * kn, 0, 1) * (src[i + 3] / 255); k2 = clamp(k2 * 1.1 + (r() - 0.5) * kn, 0, 1) * (src[j + 3] / 255);
        if (p.fuellen) { for (let c = 0; c < 3; c++) d[i + c] = pp[c] * (1 - k1 * (1 - c1[c])) * (1 - k2 * (1 - c2[c])); d[i + 3] = 255; }
        else {
          const a = 1 - (1 - k1) * (1 - k2);
          for (let c = 0; c < 3; c++) d[i + c] = a > 0 ? (255 * (1 - k1 * (1 - c1[c])) * (1 - k2 * (1 - c2[c])) - 255 * (1 - a)) / a : 0;
          d[i + 3] = a * 255;
        }
      }
      ctx.putImageData(im, 0, 0);
    },
  });

  def('korn', {
    name: 'Körnung', cat: 'druck', kind: 'fx', tool: 'Grainrad',
    params: [R('menge', 'Menge', 0, 1, 0.35), R('groesse', 'Größe', 1, 6, 1, 1), Bo('farbig', 'Farbig', false), Bo('flimmern', 'Flimmern', true)],
    run(ctx, w, h, p, env) {
      const g = Math.max(1, Math.round(p.groesse * env.s)), cw = Math.ceil(w / g), ch = Math.ceil(h / g);
      const r = mulberry(p.flimmern ? Math.floor(env.t * 24) + 1 : 1), n = new Float32Array(cw * ch * 3);
      for (let i = 0; i < n.length; i++) n[i] = (r() - 0.5) * p.menge * 255;
      const im = ctx.getImageData(0, 0, w, h), d = im.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, k = (((y / g) | 0) * cw + ((x / g) | 0)) * 3;
        if (p.farbig) { d[i] += n[k]; d[i + 1] += n[k + 1]; d[i + 2] += n[k + 2]; }
        else { d[i] += n[k]; d[i + 1] += n[k]; d[i + 2] += n[k]; }
      }
      ctx.putImageData(im, 0, 0);
    },
  });

  def('welle', {
    name: 'Welle', cat: 'bewegung', kind: 'fx', tool: 'WARP · playgrnd',
    params: [S('richtung', 'Richtung', ['horizontal', 'vertikal', 'beide', 'strudel'], 'horizontal'), R('amp', 'Amplitude', 0, 120, 14, 1),
      R('freq', 'Frequenz', 0, 20, 3), R('tempo', 'Tempo', 0, 4, 1)],
    run(ctx, w, h, p, env) {
      const A = p.amp * env.s, ph = env.t * p.tempo * 2, f = p.freq * Math.PI * 2, cx = w / 2, cy = h / 2, D = Math.hypot(w, h) / 2;
      remap(ctx, w, h, (x, y, o) => {
        o[0] = x; o[1] = y;
        if (p.richtung === 'strudel') {
          const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), an = (A / 100) * Math.sin((r / D) * f - ph);
          const c = Math.cos(an), s = Math.sin(an);
          o[0] = cx + dx * c - dy * s; o[1] = cy + dx * s + dy * c;
          return true;
        }
        if (p.richtung !== 'vertikal') o[0] = x + A * Math.sin((y / h) * f + ph);
        if (p.richtung !== 'horizontal') o[1] = y + A * Math.sin((x / w) * f + ph * 1.3);
        return true;
      });
    },
  });

  def('echo', {
    name: 'Echo', cat: 'bewegung', kind: 'fx', tool: 'Visual Echoes',
    params: [R('nach', 'Nachleuchten', 0, 0.98, 0.85), R('zoom', 'Zoom', 0.9, 1.1, 1.02), R('dreh', 'Drehung', -5, 5, 0.5),
      R('dx', 'Drift X', -10, 10, 0), R('dy', 'Drift Y', -10, 10, 0), S('modus', 'Modus', ['darken', 'lighten', 'normal', 'difference', 'multiply'], 'darken')],
    run(ctx, w, h, p, env) {
      const st = env.state;
      if (st.prev) {
        ctx.save();
        ctx.globalAlpha = p.nach; ctx.globalCompositeOperation = p.modus === 'normal' ? 'source-over' : p.modus;
        ctx.translate(w / 2 + p.dx * env.s, h / 2 + p.dy * env.s); ctx.rotate((p.dreh * Math.PI) / 180); ctx.scale(p.zoom, p.zoom);
        ctx.drawImage(st.prev, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      if (!env.export) {
        if (!st.prev || st.prev.width !== w || st.prev.height !== h) st.prev = canvas(w, h);
        const px = st.prev.getContext('2d'); px.clearRect(0, 0, w, h); px.drawImage(ctx.canvas, 0, 0);
      }
    },
  });

  def('maus', {
    name: 'Maus-Lupe', cat: 'bewegung', kind: 'fx', tool: 'weirde Interaktion',
    params: [R('radius', 'Radius', 20, 400, 130, 1), R('staerke', 'Stärke', -1, 1, 0.7), R('wirbel', 'Wirbel', -6, 6, 0), Bo('folgen', 'Folgt der Maus', true)],
    run(ctx, w, h, p, env) {
      const m = p.folgen && env.mouse ? env.mouse : { x: 0.5, y: 0.5 };
      const mx = m.x * w, my = m.y * h, R0 = p.radius * env.s;
      const box = [Math.max(0, (mx - R0) | 0), Math.max(0, (my - R0) | 0), Math.min(w, Math.ceil(mx + R0)), Math.min(h, Math.ceil(my + R0))];
      if (box[2] <= box[0] || box[3] <= box[1]) return;
      remap(ctx, w, h, (x, y, o) => {
        const dx = x - mx, dy = y - my, dist = Math.hypot(dx, dy);
        if (dist >= R0) return false;
        const f = 1 - dist / R0, ff = f * f, sc = 1 - p.staerke * ff, an = p.wirbel * ff, c = Math.cos(an), s = Math.sin(an);
        o[0] = mx + (dx * c - dy * s) * sc; o[1] = my + (dx * s + dy * c) * sc;
        return true;
      }, box);
    },
  });

  def('flaeche', {
    name: 'Fläche', cat: 'grund', kind: 'gen', tool: '—',
    params: [C('farbe', 'Farbe', '#f39a6b'), R('deck', 'Deckkraft', 0, 1, 1)],
    run(ctx, w, h, p) { ctx.clearRect(0, 0, w, h); ctx.globalAlpha = p.deck; ctx.fillStyle = p.farbe; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; },
  });

  def('transform', {
    name: 'Transformieren', cat: 'bewegung', kind: 'fx', tool: '—',
    params: [R('x', 'X', -1, 1, 0), R('y', 'Y', -1, 1, 0), R('skala', 'Größe', 0.1, 4, 1), R('dreh', 'Drehung', -180, 180, 0, 1),
      R('tempo', 'Dreh-Tempo', -2, 2, 0), R('puls', 'Pulsieren', 0, 1, 0), Bo('kacheln', 'Kacheln', false)],
    run(ctx, w, h, p, env) {
      const tc = tmp('transform', w, h), tx = tc.getContext('2d');
      tx.clearRect(0, 0, w, h); tx.drawImage(ctx.canvas, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const sc = p.skala * (1 + p.puls * 0.3 * Math.sin(env.t * 3));
      const a = ((p.dreh + env.t * p.tempo * 60) * Math.PI) / 180;
      ctx.save();
      ctx.translate(w / 2 + (p.x * w) / 2, h / 2 + (p.y * h) / 2); ctx.rotate(a); ctx.scale(sc, sc);
      if (p.kacheln) { for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) ctx.drawImage(tc, -w / 2 + i * w, -h / 2 + j * h); }
      else ctx.drawImage(tc, -w / 2, -h / 2);
      ctx.restore();
    },
  });

  // Zwei Eingänge: A (links) + B (oben), frei wählbar
  def('mischen', {
    name: 'Mischen', cat: 'kombi', kind: 'mix', tool: '—', two: true,
    params: [S('modus', 'Modus', ['normal', 'multiply', 'screen', 'difference', 'overlay', 'darken', 'lighten', 'exclusion'], 'normal'), R('deck', 'Deckkraft B', 0, 1, 1)],
  });
  def('maske', {
    name: 'Maske', cat: 'kombi', kind: 'mix', tool: '—', two: true,
    params: [S('quelle', 'Maske aus', ['Form (Alpha)', 'Helligkeit'], 'Form (Alpha)'), Bo('umkehren', 'Umkehren', false), R('weich', 'Schwelle', 0, 1, 0.5), R('kante', 'Härte', 1, 20, 4)],
  });

  // Endpunkt: nur was hier ankommt, landet auf dem Plakat
  def('output', {
    name: 'Output', cat: 'output', kind: 'out', tool: '—',
    params: [],
  });

  const TECH = { text: 'vektor', verlauf: 'vektor', noise: 'pixel', streifen: 'vektor', raster: 'vektor', fluss: 'vektor', bild: 'pixel', pixel: 'vektor',
    dither: 'pixel', glitch: 'pixel', farbe: 'pixel', kontrast: 'pixel', spiegel: 'pixel', halftone: 'vektor', riso: 'pixel', korn: 'pixel', welle: 'pixel',
    echo: 'pixel', maus: 'pixel', flaeche: 'vektor', transform: 'pixel', mischen: 'kombi', maske: 'kombi', output: 'output' };
  const FAM = { text: 'schrift', verlauf: 'feld', noise: 'feld', flaeche: 'feld', streifen: 'opart', raster: 'muster', fluss: 'organisch', bild: 'bild',
    pixel: 'raster', dither: 'raster', halftone: 'raster', glitch: 'glitch', farbe: 'farbe', kontrast: 'farbe', spiegel: 'raum', riso: 'druck', korn: 'druck',
    welle: 'raum', echo: 'raum', maus: 'raum', transform: 'raum', mischen: 'kombi', maske: 'kombi', output: 'output' };
  Object.values(B).forEach((d) => { d.cat = TECH[d.id] || d.cat; d.fam = FAM[d.id] || d.fam; });
  Object.assign(TP.k, { R, S, C, T, Bo, FILL, def, shape, BAYER });

  // ======================================================
  //  Auswertung des Rasters
  // ======================================================
  const caches = {};
  function pieceCanvas(key, id, w, h) {
    const m = (caches[key] = caches[key] || {});
    let c = m[id];
    if (!c || c.width !== w || c.height !== h) c = m[id] = canvas(w, h);
    return c;
  }

  function runMix(ctx, w, h, p, def, L, Tp) {
    const base = L || Tp, top = L && Tp ? Tp : null;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (def.id === 'mischen') {
      if (!top && !L) { ctx.globalAlpha = p.deck; ctx.drawImage(base, 0, 0); ctx.globalAlpha = 1; return; }
      ctx.drawImage(base, 0, 0);
      if (top) {
        ctx.globalAlpha = p.deck; ctx.globalCompositeOperation = p.modus === 'normal' ? 'source-over' : p.modus;
        ctx.drawImage(top, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }
    // Maske: A bleibt nur dort sichtbar, wo B eine Form hat (oder dunkel ist)
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(base, 0, 0);
    if (!top) return;
    const im = ctx.getImageData(0, 0, w, h), d = im.data, b = top.getContext('2d').getImageData(0, 0, w, h).data;
    const byLum = p.quelle === 'Helligkeit';
    for (let i = 0; i < d.length; i += 4) {
      let m = byLum ? (1 - lum(b, i)) * (b[i + 3] / 255) : b[i + 3] / 255;
      if (p.umkehren) m = 1 - m;
      m = clamp((m - (1 - p.weich)) * p.kante + 0.5, 0, 1);
      d[i + 3] *= m;
    }
    ctx.putImageData(im, 0, 0);
  }

  // Eingänge auflösen. pc.src / pc.src2:
  //   'auto'  = Nachbar (src: links, sonst oben · src2: oben)
  //   null    = kein Eingang
  //   '<id>'  = ein bestimmter Baustein
  TP.srcDefault = (pc) => (B[pc.type] && B[pc.type].kind === 'gen' ? null : 'auto');
  TP.inputs = function (pc, pieces, at) {
    if (!at) { at = {}; pieces.forEach((q) => (at[q.c + ',' + q.r] = q)); }
    const def = B[pc.type], left = at[pc.c - 1 + ',' + pc.r], up = at[pc.c + ',' + (pc.r - 1)];
    const byId = (id) => pieces.find((q) => q.id === id && q !== pc) || null;
    const one = (v, auto) => (v === 'auto' ? auto || null : v ? byId(v) : null);
    const a = one(pc.src === undefined ? TP.srcDefault(pc) : pc.src, def.kind === 'mix' ? left : left || up);
    const b = def.kind === 'mix' ? one(pc.src2 === undefined ? 'auto' : pc.src2, up) : null;
    return [a, b];
  };
  // Der Output-Node (es gibt höchstens einen)
  TP.output = (pieces) => pieces.find((q) => q.type === 'output') || null;
  // Alle Nodes, die mit dem Output verbunden sind (nur die verändern das Plakat)
  TP.upstream = function (pieces) {
    const at = {}, seen = new Set();
    pieces.forEach((q) => (at[q.c + ',' + q.r] = q));
    (function walk(pc) {
      if (!pc || seen.has(pc.id)) return;
      seen.add(pc.id);
      TP.inputs(pc, pieces, at).forEach(walk);
    })(TP.output(pieces));
    return seen;
  };
  // Nodes, die niemand weiterverwendet (für alte Boards ohne Output)
  TP.unused = function (pieces) {
    const used = new Set();
    pieces.forEach((q) => TP.inputs(q, pieces).forEach((x) => x && used.add(x.id)));
    return pieces.filter((q) => !used.has(q.id));
  };

  // liefert {out: id→canvas, sinks: [piece]}
  TP.evaluate = function (pieces, w, h, env, key) {
    key = key || 'live';
    const at = {};
    pieces.forEach((pc) => (at[pc.c + ',' + pc.r] = pc));
    const out = {}, busy = new Set();
    env.states = env.states || {};
    function run(pc) {
      if (!pc) return null;
      if (out[pc.id]) return out[pc.id];
      if (busy.has(pc.id)) return null; // Kreis → kein Eingang
      busy.add(pc.id);
      const def = B[pc.type];
      const [ia, ib] = TP.inputs(pc, pieces, at);
      const L = run(ia), Tp = run(ib);
      const c = pieceCanvas(key, pc.id, w, h), ctx = c.getContext('2d');
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const p = Object.assign(TP.defaults(pc.type), pc.p);
      const benv = Object.assign({}, env, { state: (env.states[pc.id] = env.states[pc.id] || {}), image: env.images && env.images[pc.id], hasInput: !!L, id: pc.id });
      try {
        if (def.kind === 'mix') {
          ctx.clearRect(0, 0, w, h);
          if (L || Tp) runMix(ctx, w, h, p, def, L, Tp);
        } else {
          ctx.clearRect(0, 0, w, h);
          if (L) ctx.drawImage(L, 0, 0);
          if (def.kind === 'gen' && L) {
            const tc = tmp('gen', w, h), tx = tc.getContext('2d');
            tx.globalCompositeOperation = 'source-over'; tx.globalAlpha = 1;
            def.run(tx, w, h, p, benv);
            ctx.globalCompositeOperation = p.mix === 'normal' ? 'source-over' : p.mix;
            ctx.drawImage(tc, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
          } else if (def.run) def.run(ctx, w, h, p, benv);
        }
      } catch (e) { console.warn(def.id, e); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      busy.delete(pc.id);
      return (out[pc.id] = c);
    }
    pieces.filter((pc) => B[pc.type]).sort((a, b) => a.r - b.r || a.c - b.c).forEach(run);
    return { out, output: TP.output(pieces) };
  };

  // Plakat zusammensetzen: alle gezeigten Bausteine werden übereinander gelegt
  TP.compose = function (target, pieces, env, opt) {
    const w = target.width, h = target.height, ctx = target.getContext('2d');
    const res = TP.evaluate(pieces, w, h, env, opt.key);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = opt.paper || TP.PAPER; ctx.fillRect(0, 0, w, h);
    if (res.output) ctx.drawImage(res.out[res.output.id], 0, 0);
    else {
      ctx.fillStyle = '#9a9994'; ctx.font = `${13 * (env.s || 1)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Kein Output-Node', w / 2, h / 2 - 10 * (env.s || 1));
      ctx.fillText('→ Output aus der Liste anhängen', w / 2, h / 2 + 10 * (env.s || 1));
      ctx.textAlign = 'start';
    }
    return res;
  };
})();
