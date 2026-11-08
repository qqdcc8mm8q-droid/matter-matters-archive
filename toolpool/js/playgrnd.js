/* Tool Pool – die 52 Tools von playgrnd.tools als Nodes
   Eigene Nachbauten nach den Beschreibungen der Tools (kein Code von playgrnd).
   Technik wie bei playgrnd: Tools mit SVG-Export = Vektor, nur PNG = Pixel.
   „Feld“-Tools lesen ihren Eingang als Helligkeitsfeld; ohne Eingang erzeugen sie ein eigenes Rauschfeld. */
(function () {
  const TP = window.TP, K = TP.k;
  const { R, S, C, T, Bo, def, mulberry, noise3, fbm, clamp, hex, tmp, lum, grain, BAYER } = K;

  Object.assign(TP.PALETTES, {
    neon: ['#07060c', '#ff2e88', '#00e5ff', '#f9ff3a', '#f4f1ec'],
    riso2: ['#141414', '#1d4bff', '#ff4f00', '#ffd400', '#f4efe6'],
    erde: ['#2f4858', '#c8553d', '#f2c14e', '#86a873', '#efe6d2'],
    pastell: ['#5a4e7c', '#95b8d1', '#eac4d5', '#b8e0d2', '#fbf6ef'],
    tinte: ['#111111', '#e63946', '#f4efe6'],
    see: ['#04132b', '#0a5c8a', '#2fd3c7', '#f7f3e8'],
  });
  const PAL = () => Object.keys(TP.PALETTES);

  // ---------- Helfer ----------
  // Farben: Grund + Tinten. „dunkel“ nimmt die dunkelste Farbe als Grund.
  function gi(p) {
    const P = (TP.PALETTES[p.farben] || TP.PALETTES.pool).slice();
    const g = p.dunkel ? P.shift() : P.pop();
    return { g, k: P.length ? P : [p.dunkel ? '#ffffff' : '#000000'] };
  }
  const rgbOf = (c) => hex(c);
  function rampLUT(cols) {
    const P = cols.map(rgbOf), lut = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const v = (i / 255) * (P.length - 1), a = Math.floor(v), b = Math.min(P.length - 1, a + 1), f = v - a;
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = P[a][c] + (P[b][c] - P[a][c]) * f;
    }
    return (v, o) => { const i = (clamp(v, 0, 1) * 255 | 0) * 3; o[0] = lut[i]; o[1] = lut[i + 1]; o[2] = lut[i + 2]; return o; };
  }
  // Feld: Helligkeit des Eingangs oder eigenes Rauschen (0 = dunkel/tief, 1 = hell/hoch)
  function fieldOf(ctx, w, h, p, env, scale, oct) {
    if (env.hasInput) {
      const d = ctx.getImageData(0, 0, w, h).data;
      return (x, y) => { const i = ((clamp(y | 0, 0, h - 1)) * w + clamp(x | 0, 0, w - 1)) * 4; return d[i + 3] < 8 ? 1 : lum(d, i); };
    }
    const sc = (scale || 160) * env.s, z = env.t * (p.tempo || 0) * 0.3 + (p.seed || 0) * 13.7;
    return (x, y) => clamp((fbm(x / sc, y / sc, z, oct || 3) - 0.5) * 1.8 + 0.5, 0, 1);
  }
  // Pixelweise auf grobem Raster rechnen und hochskalieren
  function pix(ctx, w, h, q, fn, smooth) {
    const sw = Math.ceil(w / q), sh = Math.ceil(h / q), tc = tmp('pg' + q, sw, sh), tx = tc.getContext('2d');
    const im = tx.createImageData(sw, sh), d = im.data, o = [0, 0, 0, 255];
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      o[3] = 255; fn(x * q + q / 2, y * q + q / 2, o, x, y);
      const i = (y * sw + x) * 4; d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o[3];
    }
    tx.putImageData(im, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = smooth !== undefined ? smooth : q <= 2;
    ctx.clearRect(0, 0, w, h); ctx.drawImage(tc, 0, 0, w, h); ctx.restore();
  }
  // unregelmäßiger Umriss als Funktion des Winkels
  function polar(r, k) {
    const a = [], ph = [];
    for (let i = 1; i <= k; i++) { a.push((r() - 0.5) * 0.6 / i); ph.push(r() * 6.2832); }
    return (th) => { let v = 1; for (let i = 0; i < a.length; i++) v += a[i] * Math.sin((i + 2) * th + ph[i]); return Math.max(0.25, v); };
  }
  function polarPath(ctx, cx, cy, R0, f, steps) {
    ctx.beginPath();
    for (let i = 0; i <= (steps || 64); i++) {
      const th = (i / (steps || 64)) * 6.2832, rr = R0 * f(th);
      const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  const pick = (r, a) => a[(r() * a.length) | 0];
  const fill = (ctx, c) => { ctx.fillStyle = c; };
  function ground(ctx, w, h, c) { ctx.fillStyle = c; ctx.fillRect(0, 0, w, h); }

  // Gemeinsame Parameter
  const P0 = (pal, dark) => [S('farben', 'Farben', PAL(), pal), Bo('dunkel', 'Dunkler Grund', !!dark)];
  const SEED = (d) => R('seed', 'Seed', 0, 99, d || 1, 1);
  const TEMPO = (d) => R('tempo', 'Tempo', 0, 2, d === undefined ? 0.3 : d);

  function tool(id, name, tech, fam, desc, params, run, field) {
    def(id, { name, cat: tech, fam, kind: field ? 'fx' : 'gen', tool: 'playgrnd · ' + name, desc, params, run, field: !!field, pg: true });
  }

  // ======================================================
  //  VEKTOR (bei playgrnd mit SVG-Export)
  // ======================================================
  tool('pg_oddgrid', 'ODDGRID', 'vektor', 'muster', 'generative Pixel-Kompositionen auf einem Raster',
    [...P0('riso2'), R('zellen', 'Zellen', 4, 40, 14, 1), S('form', 'Form', ['quadrat', 'kreis', 'halb', 'dreieck', 'mix'], 'mix'), R('dichte', 'Dichte', 0, 1, 0.6), TEMPO(), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cs = w / p.zellen, rows = Math.ceil(h / cs), z = env.t * p.tempo * 0.4 + p.seed;
      ground(ctx, w, h, g);
      const forms = ['quadrat', 'kreis', 'halb', 'dreieck'];
      for (let j = 0; j < rows; j++) for (let i = 0; i < p.zellen; i++) {
        const n = noise3(i * 0.35, j * 0.35, z);
        if (n < 1 - p.dichte) continue;
        const n2 = noise3(i * 0.21 + 9, j * 0.21, p.seed * 0.7), x = i * cs, y = j * cs;
        fill(ctx, k[Math.floor(n2 * k.length * 0.999)]);
        const f = p.form === 'mix' ? forms[((n * 97) | 0) % 4] : p.form, rot = (((n2 * 40) | 0) % 4) * Math.PI / 2;
        ctx.save(); ctx.translate(x + cs / 2, y + cs / 2); ctx.rotate(rot); ctx.beginPath();
        if (f === 'quadrat') ctx.rect(-cs / 2, -cs / 2, cs + 0.5, cs + 0.5);
        else if (f === 'kreis') ctx.arc(0, 0, cs / 2, 0, 6.2832);
        else if (f === 'halb') { ctx.moveTo(-cs / 2, cs / 2); ctx.arc(-cs / 2, cs / 2, cs, -Math.PI / 2, 0); ctx.closePath(); }
        else { ctx.moveTo(-cs / 2, -cs / 2); ctx.lineTo(cs / 2, cs / 2); ctx.lineTo(-cs / 2, cs / 2); ctx.closePath(); }
        ctx.fill(); ctx.restore();
      }
    });

  tool('pg_quilt', 'QUILT', 'vektor', 'muster', 'gewebte Pixelmuster: Ziegel, Karo, Schach, Diagonalen, Treppen',
    [...P0('erde'), R('zelle', 'Zelle', 4, 30, 10, 1), R('baender', 'Bänder', 2, 20, 7, 1), TEMPO(0), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cs = p.zelle * env.s, cols = Math.ceil(w / cs), rows = Math.ceil(h / cs), r = mulberry(p.seed * 31 + 1);
      ground(ctx, w, h, g);
      const motifs = ['ziegel', 'karo', 'schach', 'diagonal', 'treppe'], shift = Math.floor(env.t * p.tempo * 4);
      let row = 0;
      while (row < rows) {
        const bh = Math.max(2, Math.round((rows / p.baender) * (0.5 + r()))), m = pick(r, motifs), a = pick(r, k), b = pick(r, k.concat([g]));
        for (let iy = 0; iy < bh && row + iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
          const x = ix + shift * (m === 'treppe' ? 1 : 0), y = iy;
          let v;
          if (m === 'schach') v = (x + y) % 2 ? a : b;
          else if (m === 'ziegel') v = ((x + (y % 2) * 2) % 4 === 3 || y % 3 === 2) ? b : a;
          else if (m === 'karo') v = x % 6 < 2 && y % 6 < 2 ? g : x % 6 < 2 || y % 6 < 2 ? b : a;
          else if (m === 'diagonal') v = (x + y) % 4 === 0 || ((x - y) % 4 === 0 && (x + y) % 2 === 0) ? b : a;
          else v = (((x - y) % 6) + 6) % 6 < 3 ? a : b;
          if (v === g) continue;
          fill(ctx, v); ctx.fillRect(ix * cs, (row + iy) * cs, cs + 0.5, cs + 0.5);
        }
        row += bh;
      }
    });

  tool('pg_zig', 'ZIG', 'vektor', 'muster', 'ineinandergreifende Zickzacks: runde Zähne, Chevrons, Treppen',
    [...P0('tinte'), R('baender', 'Bänder', 3, 24, 8, 1), R('zaehne', 'Zähne', 2, 30, 9, 1), R('rund', 'Rundung', 0, 1, 0.6), S('form', 'Form', ['zacke', 'treppe', 'welle', 'mix'], 'mix'), TEMPO(), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), bh = h / p.baender, tw = w / p.zaehne, r = mulberry(p.seed + 5);
      ground(ctx, w, h, g);
      ctx.lineJoin = 'round';
      for (let i = 0; i < p.baender + 1; i++) {
        const y0 = i * bh, f = p.form === 'mix' ? pick(r, ['zacke', 'treppe', 'welle']) : p.form, ph = env.t * p.tempo * tw * (i % 2 ? 1 : -1), amp = bh * 0.35;
        const yAt = (x) => {
          const u = (((x + ph) / tw) % 1 + 1) % 1;
          if (f === 'welle') return y0 + amp * Math.sin(u * 6.2832);
          if (f === 'treppe') return y0 + amp * (Math.floor(u * 4) / 1.5 - 1);
          return y0 + amp * (Math.abs(u * 2 - 1) * 2 - 1);
        };
        ctx.beginPath();
        for (let x = -tw; x <= w + tw; x += tw / 16) x === -tw ? ctx.moveTo(x, yAt(x)) : ctx.lineTo(x, yAt(x));
        for (let x = w + tw; x >= -tw; x -= tw / 16) ctx.lineTo(x, yAt(x) + bh * 0.55);
        ctx.closePath();
        fill(ctx, k[i % k.length]); ctx.fill();
        if (p.rund > 0) { ctx.lineWidth = p.rund * bh * 0.25; ctx.strokeStyle = k[i % k.length]; ctx.stroke(); }
      }
    });

  tool('pg_warp', 'WARP', 'vektor', 'opart', 'verzogene Op-Art: Schachbretter und Streifen, gebogen durch Wellen und Beulen',
    [...P0('neon', true), R('felder', 'Felder', 4, 30, 12, 1), S('form', 'Form', ['schach', 'streifen', 'schräg'], 'schach'), R('welle', 'Welle', 0, 1, 0.4), R('beule', 'Beule', -1, 1, 0.5), TEMPO(0.4)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), n = p.felder, rows = Math.round(n * h / w), t = env.t * p.tempo;
      ground(ctx, w, h, g);
      const map = (u, v) => {
        let x = u - 0.5, y = v - 0.5;
        const d = Math.hypot(x, y), b = 1 + p.beule * Math.exp(-d * d * 8);
        x *= b; y *= b;
        x += p.welle * 0.06 * Math.sin(v * 12 + t * 2); y += p.welle * 0.04 * Math.sin(u * 9 + t * 1.3);
        return [(x + 0.5) * w, (y + 0.5) * h];
      };
      const quad = (u0, v0, u1, v1) => {
        ctx.beginPath(); const st = 4;
        for (let i = 0; i <= st; i++) { const q = map(u0 + (u1 - u0) * i / st, v0); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        for (let i = 0; i <= st; i++) { const q = map(u1, v0 + (v1 - v0) * i / st); ctx.lineTo(q[0], q[1]); }
        for (let i = st; i >= 0; i--) { const q = map(u0 + (u1 - u0) * i / st, v1); ctx.lineTo(q[0], q[1]); }
        for (let i = st; i >= 0; i--) { const q = map(u0, v0 + (v1 - v0) * i / st); ctx.lineTo(q[0], q[1]); }
        ctx.fill();
      };
      for (let j = -1; j <= rows; j++) for (let i = -1; i <= n; i++) {
        const on = p.form === 'schach' ? (i + j) % 2 === 0 : p.form === 'streifen' ? i % 2 === 0 : (i + j * 2) % 3 === 0;
        if (!on) continue;
        fill(ctx, k[(((j % k.length) + k.length) % k.length)]);
        quad(i / n, j / rows, (i + 1) / n, (j + 1) / rows);
      }
    });

  tool('pg_specimen', 'SPECIMEN', 'vektor', 'muster', 'Raster abstrakter Farbblöcke: Marmorierung, Ranken, Fächer, Ringe, Zacken',
    [...P0('pastell'), R('spalten', 'Spalten', 1, 6, 3, 1), R('abstand', 'Abstand', 0, 40, 12, 1), TEMPO(0.2), SEED(3)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), s = env.s, gap = p.abstand * s, cw = (w - gap * (p.spalten + 1)) / p.spalten, rows = Math.max(1, Math.round((h - gap) / (cw + gap)));
      const ch = (h - gap * (rows + 1)) / rows, r = mulberry(p.seed * 17 + 2), t = env.t * p.tempo;
      ground(ctx, w, h, g);
      for (let j = 0; j < rows; j++) for (let i = 0; i < p.spalten; i++) {
        const x = gap + i * (cw + gap), y = gap + j * (ch + gap), a = pick(r, k), b = pick(r, k.filter((c) => c !== a).concat([g])), m = pick(r, ['marmor', 'ranke', 'faecher', 'ringe', 'zacken']);
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
        fill(ctx, a); ctx.fillRect(x, y, cw, ch); fill(ctx, b); ctx.strokeStyle = b;
        if (m === 'marmor') for (let q = 0; q < 6; q++) { ctx.beginPath(); for (let u = 0; u <= 30; u++) { const xx = x + (u / 30) * cw, yy = y + ch * (q + 0.5) / 6 + Math.sin(u / 4 + q + t) * ch * 0.08; u ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.lineWidth = ch / 14; ctx.stroke(); }
        else if (m === 'ranke') { ctx.lineWidth = 2 * s; for (let q = 0; q < 5; q++) { ctx.beginPath(); let xx = x + cw * (0.2 + 0.15 * q), yy = y + ch, an = -Math.PI / 2; ctx.moveTo(xx, yy); for (let u = 0; u < 40; u++) { an += Math.sin(u * 0.3 + q + t) * 0.15; xx += Math.cos(an) * ch / 40; yy += Math.sin(an) * ch / 40; ctx.lineTo(xx, yy); } ctx.stroke(); } }
        else if (m === 'faecher') for (let q = 0; q < 8; q += 2) { ctx.beginPath(); ctx.moveTo(x, y + ch); ctx.arc(x, y + ch, Math.max(cw, ch) * 1.2, -Math.PI / 2 + q * Math.PI / 16, -Math.PI / 2 + (q + 1) * Math.PI / 16); ctx.fill(); }
        else if (m === 'ringe') { ctx.lineWidth = Math.min(cw, ch) / 16; for (let q = 1; q < 6; q++) { ctx.beginPath(); ctx.arc(x + cw / 2, y + ch / 2, (q / 6) * Math.min(cw, ch) * 0.5 * (1 + 0.05 * Math.sin(t + q)), 0, 6.2832); ctx.stroke(); } }
        else { ctx.beginPath(); const n = 14; for (let q = 0; q <= n * 2; q++) { const an = (q / (n * 2)) * 6.2832 + t * 0.2, rr = (q % 2 ? 0.15 : 0.48) * Math.min(cw, ch); const xx = x + cw / 2 + Math.cos(an) * rr, yy = y + ch / 2 + Math.sin(an) * rr; q ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.fill(); }
        ctx.restore();
      }
    });

  tool('pg_tokens', 'TOKENS', 'vektor', 'muster', 'umrandete Kreise und Quadrate, die sich zu Formen verketten',
    [...P0('tinte'), R('raster', 'Raster', 3, 16, 7, 1), R('ketten', 'Verketten', 0, 1, 0.5), R('linie', 'Linie', 0.05, 0.4, 0.14), SEED(4)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cs = w / (p.raster + 1), cols = p.raster, rows = Math.floor(h / cs) - 1, ox = cs / 2, oy = (h - rows * cs) / 2, r = mulberry(p.seed * 7 + 3);
      ground(ctx, w, h, g);
      const cells = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cells.push({ i, j, sq: r() < 0.4, c: pick(r, k), right: r() < p.ketten, down: r() < p.ketten * 0.6 });
      const draw = (inset) => {
        cells.forEach((q) => {
          const x = ox + q.i * cs, y = oy + q.j * cs, m = cs * 0.08 + inset, rr = q.sq ? cs * 0.12 : cs / 2 - m;
          fill(ctx, inset ? g : q.c);
          ctx.beginPath(); ctx.roundRect(x + m, y + m, cs - 2 * m, cs - 2 * m, Math.max(0, rr)); ctx.fill();
          if (q.right && q.i < cols - 1) { ctx.beginPath(); ctx.rect(x + cs / 2, y + cs * 0.25 + inset, cs, cs * 0.5 - 2 * inset); ctx.fill(); }
          if (q.down && q.j < rows - 1) { ctx.beginPath(); ctx.rect(x + cs * 0.25 + inset, y + cs / 2, cs * 0.5 - 2 * inset, cs); ctx.fill(); }
        });
      };
      draw(0); draw(cs * p.linie);
    });

  tool('pg_vee', 'VEE', 'vektor', 'opart', 'gespiegelte Chevron-Streifen: Diagonalen, Quadranten, Kreuzschraffur',
    [...P0('riso2'), R('streifen', 'Streifen', 4, 60, 16, 1), S('modus', 'Modus', ['quadranten', 'band', 'gitter'], 'quadranten'), TEMPO(), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), n = p.streifen, ph = env.t * p.tempo;
      ground(ctx, w, h, g);
      const stripes = (ww, hh, off, cols, alpha) => {
        const d = (ww + hh) / n;
        for (let i = -2; i < n + 2; i++) { fill(ctx, cols[((i % cols.length) + cols.length) % cols.length]); ctx.globalAlpha = alpha; ctx.beginPath(); const x0 = i * d + ((ph * d) % (d * cols.length)) + off; ctx.moveTo(x0, 0); ctx.lineTo(x0 + d / 2, 0); ctx.lineTo(x0 + d / 2 - hh, hh); ctx.lineTo(x0 - hh, hh); ctx.fill(); }
        ctx.globalAlpha = 1;
      };
      if (p.modus === 'quadranten') {
        for (let q = 0; q < 4; q++) { ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(q % 2 ? -1 : 1, q > 1 ? -1 : 1); ctx.beginPath(); ctx.rect(0, 0, w / 2, h / 2); ctx.clip(); stripes(w / 2, h / 2, 0, k, 1); ctx.restore(); }
      } else if (p.modus === 'band') {
        const bands = 4;
        for (let b = 0; b < bands; b++) { ctx.save(); ctx.beginPath(); ctx.rect(0, (b * h) / bands, w, h / bands); ctx.clip(); ctx.translate(b % 2 ? w : 0, (b * h) / bands); ctx.scale(b % 2 ? -1 : 1, 1); stripes(w, h / bands, 0, k, 1); ctx.restore(); }
      } else {
        stripes(w, h, 0, [k[0], g], 1);
        ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.globalCompositeOperation = 'multiply'; stripes(w, h, 0, [k[1 % k.length], g], 0.85); ctx.restore();
      }
    });

  tool('pg_fete', 'FETE', 'vektor', 'muster', 'Festival-Plakat: Farbflecken, eine große Kritzellinie, Sternbild-Punkte',
    [...P0('riso2'), R('flecken', 'Flecken', 2, 20, 7, 1), R('linie', 'Linienstärke', 2, 40, 14, 1), R('punkte', 'Punkte', 0, 120, 40, 1), TEMPO(0.2), SEED(5)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), r = mulberry(p.seed * 13 + 7), s = env.s, t = env.t * p.tempo;
      ground(ctx, w, h, g);
      for (let i = 0; i < p.flecken; i++) { const f = polar(r, 5); fill(ctx, pick(r, k)); polarPath(ctx, r() * w, r() * h, (0.08 + r() * 0.18) * w, (th) => f(th + t * 0.3)); ctx.fill(); }
      const pts = []; for (let i = 0; i < 9; i++) pts.push([w * (0.1 + 0.8 * r()) + Math.sin(t + i) * 10 * s, h * (0.1 + 0.8 * r()) + Math.cos(t * 0.8 + i) * 10 * s]);
      ctx.strokeStyle = k[0]; ctx.lineWidth = p.linie * s; ctx.lineCap = ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      ctx.stroke();
      const dots = []; for (let i = 0; i < p.punkte; i++) dots.push([r() * w, r() * h, (1 + r() * 3) * s]);
      ctx.lineWidth = 0.6 * s; ctx.strokeStyle = k[k.length - 1];
      dots.forEach((a, i) => { const b = dots[(i * 7 + 3) % dots.length]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < w * 0.25) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } });
      fill(ctx, k[k.length - 1]); dots.forEach((a) => { ctx.beginPath(); ctx.arc(a[0], a[1], a[2], 0, 6.2832); ctx.fill(); });
    });

  tool('pg_parcel', 'PARCEL', 'vektor', 'muster', 'zweifarbige Blockfelder mit feinem Vermessungsraster darüber',
    [...P0('tinte'), R('zelle', 'Zelle', 4, 40, 14, 1), R('dichte', 'Dichte', 0, 1, 0.5), Bo('raster', 'Vermessungsraster', true), TEMPO(), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cs = p.zelle * env.s, z = env.t * p.tempo * 0.3 + p.seed;
      ground(ctx, w, h, g); fill(ctx, k[0]);
      for (let y = 0; y < h; y += cs) for (let x = 0; x < w; x += cs) if (noise3(x / cs * 0.18, y / cs * 0.18, z) > 1 - p.dichte) ctx.fillRect(x, y, cs + 0.5, cs + 0.5);
      if (p.raster) {
        ctx.strokeStyle = k[1 % k.length]; ctx.lineWidth = 0.7 * env.s; ctx.beginPath();
        for (let x = 0; x <= w; x += cs * 4) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = 0; y <= h; y += cs * 4) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
        fill(ctx, k[1 % k.length]);
        for (let x = 0; x <= w; x += cs * 4) for (let y = 0; y <= h; y += cs * 4) { ctx.fillRect(x - cs * 0.4, y - 0.6 * env.s, cs * 0.8, 1.2 * env.s); ctx.fillRect(x - 0.6 * env.s, y - cs * 0.4, 1.2 * env.s, cs * 0.8); }
      }
    });

  tool('pg_weave', 'WEAVE', 'vektor', 'muster', 'gestapelte Bänder, jedes mit eigenem Rhythmus senkrechter Streifen',
    [...P0('erde'), R('baender', 'Bänder', 2, 16, 6, 1), R('rhythmus', 'Rhythmus', 2, 20, 7, 1), TEMPO(), SEED(2)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), r = mulberry(p.seed * 19 + 1), u = (w / 60) * p.rhythmus / 6;
      ground(ctx, w, h, g);
      let y = 0;
      for (let b = 0; b < p.baender; b++) {
        const bh = b === p.baender - 1 ? h - y : (h / p.baender) * (0.6 + r() * 0.8), seq = [], cols = [pick(r, k), pick(r, k), g];
        for (let i = 0; i < 3 + ((r() * 5) | 0); i++) seq.push(1 + ((r() * 4) | 0));
        const per = seq.reduce((a, c) => a + c, 0) * u, off = (env.t * p.tempo * u * 6 * (b % 2 ? 1 : -1)) % per;
        for (let x = -per + off, si = 0; x < w; si++) { const sw = seq[si % seq.length] * u; fill(ctx, cols[si % cols.length]); ctx.fillRect(x, y, sw + 0.5, bh + 0.5); x += sw; }
        y += bh;
      }
    });

  tool('pg_modular', 'MODULAR', 'vektor', 'muster', 'modulares Raster: Blöcke, Punktmatrizen, Liniengitter, Verläufe',
    [...P0('pool'), R('spalten', 'Spalten', 2, 10, 5, 1), R('abstand', 'Abstand', 0, 20, 6, 1), R('rund', 'Rundung', 0, 1, 0.3), SEED(6)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), s = env.s, n = p.spalten, cs = w / n, rows = Math.round(h / cs), chh = h / rows, gap = p.abstand * s, r = mulberry(p.seed * 23 + 9);
      ground(ctx, w, h, g);
      const used = new Set();
      for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
        if (used.has(i + ',' + j)) continue;
        let sw = 1 + ((r() * 2.2) | 0), sh = 1 + ((r() * 2.2) | 0);
        sw = Math.min(sw, n - i); sh = Math.min(sh, rows - j);
        for (let a = 0; a < sw; a++) for (let b = 0; b < sh; b++) if (used.has(i + a + ',' + (j + b))) { sw = Math.max(1, a); }
        for (let a = 0; a < sw; a++) for (let b = 0; b < sh; b++) used.add(i + a + ',' + (j + b));
        const x = i * cs + gap / 2, y = j * chh + gap / 2, bw = sw * cs - gap, bh = sh * chh - gap, c = pick(r, k), m = pick(r, ['voll', 'punkte', 'linien', 'verlauf', 'kreis']);
        const rad = p.rund * Math.min(bw, bh) * 0.5;
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, bw, bh, rad); ctx.clip();
        if (m === 'voll') { fill(ctx, c); ctx.fillRect(x, y, bw, bh); }
        else if (m === 'verlauf') { const gr = ctx.createLinearGradient(x, y, x + bw, y + bh); gr.addColorStop(0, c); gr.addColorStop(1, pick(r, k)); ctx.fillStyle = gr; ctx.fillRect(x, y, bw, bh); }
        else if (m === 'punkte') { fill(ctx, c); const d = 8 * s; for (let yy = y + d / 2; yy < y + bh; yy += d) for (let xx = x + d / 2; xx < x + bw; xx += d) { ctx.beginPath(); ctx.arc(xx, yy, d * 0.3, 0, 6.2832); ctx.fill(); } }
        else if (m === 'linien') { ctx.strokeStyle = c; ctx.lineWidth = 1.5 * s; ctx.beginPath(); for (let xx = x; xx < x + bw; xx += 7 * s) { ctx.moveTo(xx, y); ctx.lineTo(xx, y + bh); } ctx.stroke(); }
        else { fill(ctx, c); ctx.beginPath(); ctx.arc(x + bw / 2, y + bh / 2, Math.min(bw, bh) * 0.45, 0, 6.2832); ctx.fill(); }
        ctx.restore();
      }
    });

  tool('pg_stipple', 'STIPPLE', 'vektor', 'raster', 'Punktfelder: Halbton-Gitter oder Streuung aus einem Feld, optional symmetrisch',
    [...P0('tinte'), R('raster', 'Raster', 3, 24, 7, 1), S('modus', 'Modus', ['gitter', 'streuung'], 'gitter'), Bo('symmetrie', 'Symmetrie', false), R('kontrast', 'Kontrast', 0.3, 3, 1.2), TEMPO(0.2), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), f0 = fieldOf(ctx, w, h, p, env, 180), gs = p.raster * env.s, r = mulberry(p.seed + 77);
      const f = (x, y) => clamp((f0(p.symmetrie ? Math.min(x, w - x) : x, y) - 0.5) * p.kontrast + 0.5, 0, 1);
      if (!env.hasInput || p.dunkel) ground(ctx, w, h, g); else ctx.clearRect(0, 0, w, h);
      fill(ctx, k[0]); ctx.beginPath();
      if (p.modus === 'gitter') {
        for (let y = gs / 2; y < h; y += gs) for (let x = gs / 2; x < w; x += gs) { const d = 1 - f(x, y); if (d < 0.03) continue; const rr = Math.sqrt(d) * gs * 0.55; ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, 6.2832); }
      } else {
        const n = (w * h) / (gs * gs) * 2.5;
        for (let i = 0; i < n; i++) { const x = r() * w, y = r() * h, d = 1 - f(x, y); if (r() > d * d) continue; const rr = gs * 0.22; ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, 6.2832); }
      }
      ctx.fill();
    }, true);

  tool('pg_static', 'STATIC', 'vektor', 'glitch', 'zweifarbige Glitch-Pixel: Moiré, Scanlines, Rauschen, Blöcke in 1 Bit',
    [...P0('tinte'), R('zelle', 'Zelle', 1, 10, 3, 1), S('modus', 'Modus', ['moiré', 'scan', 'rauschen', 'blöcke', 'mix'], 'mix'), TEMPO(1), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cs = p.zelle * env.s, f = fieldOf(ctx, w, h, p, env, 120), t = env.t * p.tempo, r = mulberry(p.seed * 3 + Math.floor(t * 8));
      ground(ctx, w, h, g); fill(ctx, k[0]);
      const c1 = [w * (0.4 + 0.1 * Math.sin(t)), h * 0.45], c2 = [w * 0.6, h * (0.55 + 0.1 * Math.cos(t * 0.7))], fq = 0.35 / cs;
      for (let y = 0; y < h; y += cs) {
        const band = p.modus === 'mix' ? ['moiré', 'scan', 'rauschen', 'blöcke'][(((y / h) * 4 + noise3(0, y * 0.01, p.seed)) | 0) & 3] : p.modus;
        for (let x = 0; x < w; x += cs) {
          let on;
          if (band === 'moiré') on = Math.sin(Math.hypot(x - c1[0], y - c1[1]) * fq) * Math.sin(Math.hypot(x - c2[0], y - c2[1]) * fq) > 0;
          else if (band === 'scan') on = (((y / cs) | 0) % 3 === 0) !== (f(x, y) > 0.5);
          else if (band === 'rauschen') on = r() > f(x, y);
          else on = noise3(((x / cs) | 0) * 0.08, ((y / cs) | 0) * 0.3, t * 0.5) > 0.55;
          if (on) ctx.fillRect(x, y, cs + 0.3, cs + 0.3);
        }
      }
    }, true);

  tool('pg_optic', 'OPTIC', 'vektor', 'opart', 'Streifenfeld mit eingeschnittener Figur – phasenverschoben oder gedreht',
    [...P0('tinte'), R('balken', 'Balken', 6, 90, 32, 1), S('figur', 'Figur', ['kreis', 'raute', 'quadrat', 'ring'], 'kreis'), S('modus', 'Modus', ['phase', 'winkel'], 'phase'),
      R('groesse', 'Größe', 0.1, 1, 0.55), TEMPO()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), bw = w / p.balken, t = env.t * p.tempo, R0 = Math.min(w, h) * p.groesse * 0.5, cx = w / 2, cy = h / 2;
      ground(ctx, w, h, g);
      const bars = (off, rot) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); fill(ctx, k[0]); const D = Math.hypot(w, h); for (let x = -D; x < D; x += bw * 2) ctx.fillRect(x + off, -D, bw, D * 2); ctx.restore(); };
      bars((t * bw) % (bw * 2), 0);
      ctx.save(); ctx.beginPath();
      if (p.figur === 'kreis') ctx.arc(cx, cy, R0, 0, 6.2832);
      else if (p.figur === 'quadrat') ctx.rect(cx - R0, cy - R0, R0 * 2, R0 * 2);
      else if (p.figur === 'raute') { ctx.moveTo(cx, cy - R0); ctx.lineTo(cx + R0, cy); ctx.lineTo(cx, cy + R0); ctx.lineTo(cx - R0, cy); ctx.closePath(); }
      else { ctx.arc(cx, cy, R0, 0, 6.2832); ctx.arc(cx, cy, R0 * 0.55, 0, 6.2832, true); }
      ctx.clip(); ground(ctx, w, h, g);
      if (p.modus === 'phase') bars((t * bw) % (bw * 2) + bw, 0); else bars(-(t * bw) % (bw * 2), Math.PI / 2);
      ctx.restore();
    });

  tool('pg_rise', 'RISE', 'vektor', 'opart', 'Balkenfeld mit riesigen konzentrischen Farbbögen, die von einer Kante aufsteigen',
    [...P0('riso2'), R('balken', 'Balken', 6, 90, 36, 1), R('ringe', 'Ringe', 2, 16, 7, 1), S('kante', 'Kante', ['unten', 'oben', 'links', 'rechts'], 'unten'), TEMPO()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), c = { unten: [w / 2, h], oben: [w / 2, 0], links: [0, h / 2], rechts: [w, h / 2] }[p.kante], D = Math.hypot(w, h), step = D / p.ringe, off = (env.t * p.tempo * step * 0.3) % step;
      ground(ctx, w, h, g);
      for (let i = p.ringe + 1; i >= 0; i--) { fill(ctx, k[(i % k.length)]); ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(0, i * step + off), 0, 6.2832); ctx.fill(); }
      const bw = w / p.balken; fill(ctx, g);
      for (let x = bw; x < w; x += bw * 2) ctx.fillRect(x, 0, bw, h);
    });

  tool('pg_prism', 'PRISM', 'vektor', 'feld', 'Pixel-Polarlicht: grobe Regenbogenströme über einem schwarzen Punktraster',
    [S('farben', 'Farben', PAL(), 'thermo'), R('zelle', 'Zelle', 3, 24, 8, 1), R('stroeme', 'Ströme', 1, 8, 4, 1), R('breite', 'Breite', 0.02, 0.3, 0.09), TEMPO(0.5), SEED()],
    (ctx, w, h, p, env) => {
      const cs = p.zelle * env.s, ramp = rampLUT(TP.PALETTES[p.farben] || TP.PALETTES.thermo), o = [0, 0, 0], t = env.t * p.tempo;
      ground(ctx, w, h, '#050505');
      fill(ctx, '#2a2a2a'); for (let y = cs / 2; y < h; y += cs) for (let x = cs / 2; x < w; x += cs) ctx.fillRect(x - 0.6 * env.s, y - 0.6 * env.s, 1.2 * env.s, 1.2 * env.s);
      for (let y = 0; y < h; y += cs) for (let x = 0; x < w; x += cs) {
        let v = 0;
        for (let i = 0; i < p.stroeme; i++) { const yc = h * (0.15 + 0.7 * noise3(x / w * 1.5, i * 3.1 + p.seed, t * 0.3)), d = (y - yc) / (h * p.breite); v = Math.max(v, Math.exp(-d * d)); }
        if (v < 0.18) continue;
        ramp(clamp(v * 0.8 + (x / w) * 0.25, 0, 1), o); ctx.fillStyle = `rgb(${o[0]},${o[1]},${o[2]})`; ctx.fillRect(x, y, cs + 0.3, cs + 0.3);
      }
    });

  tool('pg_riso', 'RISO', 'vektor', 'druck', 'Riso-Collage aus gerissenen Bändern: Zweifarb-Muster, Kritzel, große Punkte, Körnung',
    [...P0('riso2'), R('baender', 'Bänder', 2, 12, 6, 1), R('kritzel', 'Kritzel', 0, 8, 2, 1), R('punkte', 'Große Punkte', 0, 14, 4, 1), R('korn', 'Körnung', 0, 60, 18, 1), SEED(8)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), r = mulberry(p.seed * 41 + 1), s = env.s;
      ground(ctx, w, h, g);
      ctx.globalCompositeOperation = 'multiply';
      let y = 0;
      for (let b = 0; b < p.baender; b++) {
        const bh = (h / p.baender) * (0.7 + r() * 0.8), a = pick(r, k), m = pick(r, ['streifen', 'punkte', 'karo']);
        ctx.save(); ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 6 * s) ctx.lineTo(x, y + (r() - 0.5) * 6 * s);
        for (let x = w; x >= 0; x -= 6 * s) ctx.lineTo(x, y + bh + (r() - 0.5) * 6 * s);
        ctx.clip(); fill(ctx, a);
        const d = 6 * s * (1 + r() * 2);
        if (m === 'streifen') for (let x = -h; x < w; x += d * 2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d, y); ctx.lineTo(x + d + bh, y + bh); ctx.lineTo(x + bh, y + bh); ctx.fill(); }
        else if (m === 'punkte') for (let yy = y; yy < y + bh; yy += d) for (let x = 0; x < w; x += d) { ctx.beginPath(); ctx.arc(x + ((yy / d) % 2) * d / 2, yy, d * 0.3, 0, 6.2832); ctx.fill(); }
        else for (let yy = y; yy < y + bh; yy += d) for (let x = 0; x < w; x += d) if (((x / d + yy / d) | 0) % 2) ctx.fillRect(x, yy, d, d);
        ctx.restore(); y += bh * 0.85;
      }
      ctx.lineCap = ctx.lineJoin = 'round';
      for (let i = 0; i < p.kritzel; i++) { ctx.strokeStyle = pick(r, k); ctx.lineWidth = (2 + r() * 4) * s; ctx.beginPath(); let x = r() * w, yy = r() * h, an = r() * 6.28; ctx.moveTo(x, yy); for (let q = 0; q < 80; q++) { an += (r() - 0.5) * 1.2; x += Math.cos(an) * 8 * s; yy += Math.sin(an) * 8 * s; ctx.lineTo(x, yy); } ctx.stroke(); }
      for (let i = 0; i < p.punkte; i++) { fill(ctx, pick(r, k)); ctx.beginPath(); ctx.arc(r() * w, r() * h, (10 + r() * 40) * s, 0, 6.2832); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      if (p.korn) grain(ctx, w, h, p.korn, false, p.seed + 1);
    });

  tool('pg_totem', 'TOTEM', 'vektor', 'muster', 'symmetrisches Pixel-Banner: Rauschrand um ein gespiegeltes, gewebtes Feld',
    [...P0('neon', true), R('raster', 'Raster', 8, 50, 22, 1), R('rand', 'Rand', 1, 5, 2, 1), TEMPO(0.4), SEED(9)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), n = p.raster, cs = w / n, rows = Math.floor(h / cs), r = mulberry(p.seed * 7 + Math.floor(env.t * p.tempo * 6)), rr = mulberry(p.seed * 11 + 3);
      ground(ctx, w, h, g);
      const oy = (h - rows * cs) / 2, half = Math.ceil(n / 2), pat = [];
      for (let j = 0; j < rows; j++) { pat[j] = []; for (let i = 0; i < half; i++) pat[j][i] = rr(); }
      for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
        const border = i < p.rand || j < p.rand || i >= n - p.rand || j >= rows - p.rand;
        let c = null;
        if (border) { if (r() < 0.5) c = k[0]; }
        else {
          const mi = i < half ? i : n - 1 - i, v = pat[j][mi], band = Math.floor((j / rows) * k.length * 2) % k.length;
          if ((mi + j) % 2 === 0 && v > 0.35) c = k[band]; else if (v > 0.8) c = k[(band + 1) % k.length];
          const cxd = Math.abs(i - (n - 1) / 2), cyd = Math.abs(j - (rows - 1) / 2);
          if (cxd + cyd < Math.min(n, rows) * 0.18) c = (cxd + cyd) % 2 < 1 ? k[(band + 2) % k.length] : g;
        }
        if (c) { fill(ctx, c); ctx.fillRect(i * cs, oy + j * cs, cs + 0.4, cs + 0.4); }
      }
    });

  tool('pg_atlas', 'ATLAS', 'vektor', 'zeichen', 'Terrain im Textmodus: Rauschen in Terrassen, als Zeichen auf ein Monospace-Raster getippt',
    [...P0('see', true), R('zelle', 'Zeichengröße', 6, 30, 11, 1), R('stufen', 'Stufen', 3, 12, 7, 1), S('satz', 'Zeichensatz', [' .:-=+*#%@', ' ·∙•●', ' ░▒▓█', ' ~≈^▲', ' 01'], ' .:-=+*#%@'),
      Bo('farbig', 'Farbig', true), TEMPO(0.2), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cs = p.zelle * env.s, f = fieldOf(ctx, w, h, p, env, 150), set = [...p.satz];
      ground(ctx, w, h, g);
      ctx.font = `${cs * 1.15}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let y = cs / 2; y < h; y += cs * 1.1) for (let x = cs * 0.35; x < w; x += cs * 0.62) {
        const v = f(x, y), lv = Math.min(p.stufen - 1, Math.floor(v * p.stufen)), ch = set[Math.round((lv / (p.stufen - 1)) * (set.length - 1))];
        if (ch === ' ') continue;
        fill(ctx, p.farbig ? k[lv % k.length] : k[k.length - 1]); ctx.fillText(ch, x, y);
      }
      ctx.textAlign = 'start';
    }, true);

  function boardTool(id, name, desc, relief) {
    tool(id, name, 'vektor', 'muster', desc,
      [...P0(relief ? 'pastell' : 'erde', relief), R('spalten', 'Spalten', 2, 8, 4, 1), R('bahnen', 'Leiterbahnen', 0, 12, 5, 1), TEMPO(0.3), SEED(relief ? 12 : 10)],
      (ctx, w, h, p, env) => {
        const { g, k } = gi(p), s = env.s, cw = w / p.spalten, r = mulberry(p.seed * 29 + 1), gap = 6 * s;
        ground(ctx, w, h, g);
        for (let i = 0; i < p.spalten; i++) {
          let y = 0;
          while (y < h) {
            const bh = Math.min(h - y, (40 + r() * 120) * s), x = i * cw + gap / 2, bw = cw - gap, c = pick(r, k), m = pick(r, ['streifen', 'punkte', 'schach', 'voll', 'diagonal']);
            ctx.save(); ctx.beginPath(); ctx.rect(x, y + gap / 2, bw, bh - gap); ctx.clip();
            fill(ctx, c); ctx.fillRect(x, y, bw, bh); fill(ctx, g); const d = 7 * s;
            if (m === 'streifen') for (let xx = x; xx < x + bw; xx += d * 2) ctx.fillRect(xx, y, d, bh);
            else if (m === 'punkte') for (let yy = y + d; yy < y + bh; yy += d * 1.6) for (let xx = x + d; xx < x + bw; xx += d * 1.6) { ctx.beginPath(); ctx.arc(xx, yy, d * 0.35, 0, 6.2832); ctx.fill(); }
            else if (m === 'schach') for (let yy = y; yy < y + bh; yy += d) for (let xx = x; xx < x + bw; xx += d) { if (((xx - x) / d + (yy - y) / d) % 2 < 1) ctx.fillRect(xx, yy, d, d); }
            else if (m === 'diagonal') { ctx.lineWidth = d * 0.5; ctx.strokeStyle = g; ctx.beginPath(); for (let q = -bh; q < bw; q += d * 1.5) { ctx.moveTo(x + q, y); ctx.lineTo(x + q + bh, y + bh); } ctx.stroke(); }
            if (relief) {
              const e = 5 * s; ctx.globalAlpha = 0.45;
              fill(ctx, '#ffffff'); ctx.fillRect(x, y + gap / 2, bw, e); ctx.fillRect(x, y + gap / 2, e, bh - gap);
              fill(ctx, '#000000'); ctx.fillRect(x, y + bh - gap / 2 - e, bw, e); ctx.fillRect(x + bw - e, y + gap / 2, e, bh - gap);
              ctx.globalAlpha = 1;
            }
            ctx.restore(); y += bh;
          }
        }
        // Leiterbahnen: rechtwinklige Wege mit runden Ecken, die über die Kanten laufen
        const t = env.t * p.tempo;
        ctx.lineCap = ctx.lineJoin = 'round';
        for (let q = 0; q < p.bahnen; q++) {
          const pts = []; let x = r() * w, y = 0; pts.push([x, y]);
          while (y < h) { y += (30 + r() * 90) * s; pts.push([x, y]); x = ((x + (r() - 0.5) * cw * 2) % w + w) % w; pts.push([x, y]); }
          const path = () => { ctx.beginPath(); pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]))); };
          if (relief) { ctx.save(); ctx.translate(3 * s, 3 * s); path(); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 7 * s; ctx.stroke(); ctx.restore(); }
          path(); ctx.strokeStyle = k[0]; ctx.lineWidth = 7 * s; ctx.stroke();
          path(); ctx.strokeStyle = g; ctx.lineWidth = 3 * s; ctx.setLineDash([12 * s, 8 * s]); ctx.lineDashOffset = -t * 40 * s; ctx.stroke(); ctx.setLineDash([]);
        }
      });
  }
  boardTool('pg_sampler', 'SAMPLER', 'Musterblöcke in Spalten unter verlegten Leiterbahnen, kachelbar');
  boardTool('pg_relief', 'RELIEF', 'erhabene Musterblöcke mit Licht und Schatten unter Leiterbahnen', true);

  tool('pg_kiosk', 'KIOSK', 'vektor', 'druck', 'Wildplakat: Farbbänder, harte Streifen, Halbton- und Vollblöcke, dichtes Schriftraster',
    [...P0('riso2'), T('text', 'Text', 'KIOSK'), R('schrift', 'Schriftgröße', 6, 40, 14, 1), R('bloecke', 'Blöcke', 0, 10, 4, 1), TEMPO(0.3), SEED(3)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), s = env.s, r = mulberry(p.seed * 37 + 2), split = h * 0.55;
      ground(ctx, w, h, g);
      const nb = 6; for (let i = 0; i < nb; i++) { fill(ctx, k[i % k.length]); ctx.fillRect(0, (i * split) / nb, w, split / nb + 1); }
      const sw = w / 18; for (let i = 0; i < 18; i++) { fill(ctx, k[(i + 2) % k.length]); ctx.fillRect(i * sw, split, sw * 0.55, h - split); }
      for (let i = 0; i < p.bloecke; i++) {
        const bw = (0.15 + r() * 0.35) * w, bh = (0.08 + r() * 0.2) * h, x = r() * (w - bw), y = r() * (h - bh);
        if (r() < 0.5) { fill(ctx, pick(r, k)); ctx.fillRect(x, y, bw, bh); }
        else { fill(ctx, g); const d = 6 * s; for (let yy = y; yy < y + bh; yy += d) for (let xx = x; xx < x + bw; xx += d) { ctx.beginPath(); ctx.arc(xx, yy, d * 0.38 * (0.4 + 0.6 * (yy - y) / bh), 0, 6.2832); ctx.fill(); } }
      }
      const txt = String(p.text || 'KIOSK').toUpperCase() || 'K', fs = p.schrift * s, off = (env.t * p.tempo * fs * 2) % (fs * 0.62 * txt.length);
      ctx.font = `700 ${fs}px "Helvetica Neue", Helvetica, Arial, sans-serif`; ctx.textBaseline = 'top'; fill(ctx, g); ctx.globalAlpha = 0.85;
      for (let y = 0, row = 0; y < h; y += fs * 1.05, row++) { let line = ''; while (line.length * fs * 0.62 < w + fs * 8) line += txt + ' '; ctx.fillText(line, -(row % 2 ? off : fs * 4 - off), y); }
      ctx.globalAlpha = 1;
    });

  tool('pg_mosh', 'MOSH', 'vektor', 'glitch', 'Datamosh-Bänder: Pixelkonfetti, Blockmosaike, Verschmieren, tote Zeilen, Chevron-Risse',
    [...P0('neon', true), R('baender', 'Bänder', 3, 30, 12, 1), R('schaden', 'Schaden', 0, 1, 0.55), R('block', 'Block', 2, 30, 8, 1), TEMPO(1.5), SEED()],
    (ctx, w, h, p, env) => {
      const src = env.hasInput ? ctx.getImageData(0, 0, w, h).data : null, { g, k } = gi(p), s = env.s, t = env.t * p.tempo, r = mulberry(p.seed * 53 + Math.floor(t * 6)), bs = p.block * s;
      const colAt = (x, y) => { if (!src) return k[((noise3(x * 0.01, y * 0.01, p.seed) * k.length * 1.5) | 0) % k.length]; const i = (clamp(y | 0, 0, h - 1) * w + clamp(x | 0, 0, w - 1)) * 4; return `rgba(${src[i]},${src[i + 1]},${src[i + 2]},${src[i + 3] / 255})`; };
      if (!src) ground(ctx, w, h, g);
      let y = 0;
      while (y < h) {
        const bh = (h / p.baender) * (0.4 + r() * 1.2), m = r() < p.schaden ? pick(r, ['konfetti', 'mosaik', 'schmieren', 'tot', 'chevron']) : 'ruhig';
        if (m === 'konfetti') for (let i = 0; i < (w * bh) / (bs * bs) * 0.4; i++) { const x = r() * w, yy = y + r() * bh; fill(ctx, r() < 0.5 ? pick(r, k) : colAt(x, yy)); ctx.fillRect(x, yy, bs * 0.5, bs * 0.5); }
        else if (m === 'mosaik') for (let yy = y; yy < y + bh; yy += bs) for (let x = 0; x < w; x += bs) { fill(ctx, colAt(x + (r() - 0.5) * bs * 8, yy)); ctx.fillRect(x, yy, bs + 0.5, bs + 0.5); }
        else if (m === 'schmieren') for (let yy = y; yy < y + bh; yy += 2 * s) { const x0 = r() * w; fill(ctx, colAt(x0, yy)); ctx.fillRect(x0, yy, w, 2 * s + 0.5); }
        else if (m === 'tot') for (let yy = y; yy < y + bh; yy += 4 * s) { fill(ctx, r() < 0.5 ? '#000' : g); ctx.fillRect(0, yy, w, 1.5 * s); }
        else if (m === 'chevron') { const a = bh * 0.5; for (let x = 0; x < w; x += bs) { const off = Math.abs(((x / w) * 4) % 2 - 1) * a; fill(ctx, colAt(x, y + off)); ctx.fillRect(x, y + off, bs + 0.5, bh * 0.5); } }
        else if (!src) { fill(ctx, pick(r, k)); ctx.globalAlpha = 0.25; ctx.fillRect(0, y, w, bh); ctx.globalAlpha = 1; }
        y += bh;
      }
    }, true);

  tool('pg_pane', 'PANE', 'vektor', 'feld', 'Reihen ungleicher Scheiben, jede mit eigenem Verlauf in eine von acht Richtungen',
    [...P0('pastell'), R('reihen', 'Reihen', 1, 10, 4, 1), R('scheiben', 'Scheiben max.', 1, 8, 4, 1), TEMPO(0.2), SEED(4)],
    (ctx, w, h, p, env) => {
      const { k } = gi(p), r = mulberry(p.seed * 43 + 5), t = env.t * p.tempo;
      let y = 0;
      for (let j = 0; j < p.reihen; j++) {
        const rh = j === p.reihen - 1 ? h - y : (h / p.reihen) * (0.6 + r() * 0.8), n = 1 + ((r() * p.scheiben) | 0), ws = []; let sum = 0;
        for (let i = 0; i < n; i++) { ws.push(0.4 + r()); sum += ws[ws.length - 1]; }
        let x = 0;
        ws.forEach((q) => {
          const pw = (q / sum) * w, dir = ((r() * 8) | 0) * Math.PI / 4 + Math.sin(t + j) * 0.3, cx = x + pw / 2, cy = y + rh / 2, R0 = Math.hypot(pw, rh) / 2;
          const gr = ctx.createLinearGradient(cx - Math.cos(dir) * R0, cy - Math.sin(dir) * R0, cx + Math.cos(dir) * R0, cy + Math.sin(dir) * R0);
          gr.addColorStop(0, pick(r, k)); gr.addColorStop(1, pick(r, k)); ctx.fillStyle = gr; ctx.fillRect(x, y, pw + 0.5, rh + 0.5); x += pw;
        });
        y += rh;
      }
    });

  tool('pg_sonar', 'SONAR', 'vektor', 'raster', 'Landmasse aus einem Rauschfeld: als Halbton gefüllt, an der Küste in Sprenkel zerfallend',
    [...P0('see', true), R('raster', 'Raster', 3, 16, 6, 1), R('kueste', 'Küstenhöhe', 0.1, 0.9, 0.5), R('saum', 'Saum', 0, 1, 0.35), TEMPO(0.15), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), f = fieldOf(ctx, w, h, p, env, 200, 4), gs = p.raster * env.s, r = mulberry(p.seed + 9), th = p.kueste, sb = p.saum * 0.15;
      ground(ctx, w, h, g);
      for (let y = gs / 2; y < h; y += gs) for (let x = gs / 2; x < w; x += gs) {
        const v = f(x, y);
        if (v < th - sb) { const d = clamp((th - v) / th, 0, 1); fill(ctx, k[0]); ctx.beginPath(); ctx.arc(x, y, gs * 0.2 + d * gs * 0.45, 0, 6.2832); ctx.fill(); }
        else if (v < th + sb) for (let q = 0; q < 3; q++) if (r() < 0.6) { fill(ctx, k[1 + (q % Math.max(1, k.length - 1))] || k[0]); ctx.fillRect(x + (r() - 0.5) * gs, y + (r() - 0.5) * gs, gs * 0.22, gs * 0.22); }
      }
    }, true);

  tool('pg_bloom', 'BLOOM', 'vektor', 'feld', 'symmetrisches Pixelfeld: weiche Ringe aus der Mitte, grob gerastert, auf beiden Achsen gespiegelt',
    [...P0('neon', true), R('zelle', 'Zelle', 4, 30, 12, 1), R('stufen', 'Stufen', 2, 8, 5, 1), R('ruhe', 'Ruhige Mitte', 0, 0.8, 0.3), R('ringe', 'Ringdichte', 1, 12, 5), TEMPO(0.5)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cs = p.zelle * env.s, cx = w / 2, cy = h / 2, t = env.t * p.tempo, D = Math.hypot(cx, cy);
      ground(ctx, w, h, g);
      for (let y = 0; y < cy; y += cs) for (let x = 0; x < cx; x += cs) {
        const dx = (cx - x - cs / 2) / D, dy = (cy - y - cs / 2) / D, d = Math.hypot(dx, dy);
        if (d < p.ruhe * 0.5) continue;
        const v = Math.sin(d * p.ringe * 6.2832 - t * 2) * 0.5 + 0.5 + noise3(dx * 3, dy * 3, t * 0.2) * 0.3 - 0.15, lv = Math.floor(clamp(v, 0, 0.999) * p.stufen);
        if (lv === 0) continue;
        fill(ctx, k[(lv - 1) % k.length]);
        for (const [mx, my] of [[x, y], [w - x - cs, y], [x, h - y - cs], [w - x - cs, h - y - cs]]) ctx.fillRect(mx, my, cs + 0.4, cs + 0.4);
      }
    });

  tool('pg_carve', 'CARVE', 'vektor', 'muster', 'der Rahmen zerteilt sich in Rechtecke – je flach, gestreift, Chevrons, Verlauf oder Gitter',
    [...P0('erde'), R('tiefe', 'Tiefe', 1, 8, 5, 1), R('rand', 'Rand', 0, 12, 3, 1), SEED(7)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), s = env.s, r = mulberry(p.seed * 61 + 1), gap = p.rand * s;
      ground(ctx, w, h, g);
      const cut = (x, y, cw, ch, depth) => {
        if (depth > 0 && cw > 40 * s && ch > 40 * s && r() < 0.88) {
          const v = cw > ch ? r() < 0.75 : r() < 0.25, f = 0.3 + r() * 0.4;
          if (v) { cut(x, y, cw * f, ch, depth - 1); cut(x + cw * f, y, cw * (1 - f), ch, depth - 1); }
          else { cut(x, y, cw, ch * f, depth - 1); cut(x, y + ch * f, cw, ch * (1 - f), depth - 1); }
          return;
        }
        const X = x + gap / 2, Y = y + gap / 2, W = cw - gap, H = ch - gap, a = pick(r, k), b = pick(r, k.concat([g])), m = pick(r, ['flach', 'streifen', 'chevron', 'verlauf', 'gitter']);
        ctx.save(); ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip(); fill(ctx, a); ctx.fillRect(X, Y, W, H);
        fill(ctx, b); ctx.strokeStyle = b; const d = (6 + r() * 10) * s;
        if (m === 'streifen') { const vert = r() < 0.5; for (let q = 0; q < (vert ? W : H); q += d * 2) vert ? ctx.fillRect(X + q, Y, d, H) : ctx.fillRect(X, Y + q, W, d); }
        else if (m === 'chevron') for (let q = -W; q < H + W; q += d * 2) { ctx.beginPath(); ctx.moveTo(X, Y + q); ctx.lineTo(X + W / 2, Y + q - W / 3); ctx.lineTo(X + W, Y + q); ctx.lineTo(X + W, Y + q + d); ctx.lineTo(X + W / 2, Y + q + d - W / 3); ctx.lineTo(X, Y + q + d); ctx.fill(); }
        else if (m === 'verlauf') { const gr = ctx.createLinearGradient(X, Y, X, Y + H); gr.addColorStop(0, a); gr.addColorStop(1, b); ctx.fillStyle = gr; ctx.fillRect(X, Y, W, H); }
        else if (m === 'gitter') { ctx.lineWidth = 1.2 * s; ctx.beginPath(); for (let q = 0; q < W; q += d) { ctx.moveTo(X + q, Y); ctx.lineTo(X + q, Y + H); } for (let q = 0; q < H; q += d) { ctx.moveTo(X, Y + q); ctx.lineTo(X + W, Y + q); } ctx.stroke(); }
        ctx.restore();
      };
      cut(0, 0, w, h, p.tiefe);
    });

  tool('pg_vein', 'VEIN', 'vektor', 'feld', 'Scherenschnitt-Marmorierung: gegossene Farbe, in flache Formen geschnitten, über Sternengrund',
    [...P0('neon', true), R('tropfen', 'Tropfen', 3, 30, 12, 1), R('kaemme', 'Kammzüge', 0, 6, 3, 1), R('staerke', 'Zug', 0, 1, 0.5), R('sterne', 'Sterne', 0, 300, 90, 1), TEMPO(0.15), SEED(5)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), r = mulberry(p.seed * 71 + 3), s = env.s, t = env.t * p.tempo;
      ground(ctx, w, h, g);
      fill(ctx, k[k.length - 1]); for (let i = 0; i < p.sterne; i++) { const rr = (0.4 + r() * 1.2) * s; ctx.fillRect(r() * w, r() * h, rr, rr); }
      // Tropfen als Polygone, dann durch Kammzüge verformt (Marmorier-Formel)
      const drops = [], cx = w / 2, cy = h / 2;
      for (let i = 0; i < p.tropfen; i++) drops.push({ R0: Math.hypot(w, h) * 0.5 * (1 - i / p.tropfen), c: k[i % k.length] });
      const lines = [];
      for (let q = 0; q < p.kaemme; q++) { const a = r() * Math.PI, ox = r() * w, oy = r() * h; lines.push([Math.cos(a), Math.sin(a), ox, oy]); }
      const warp = (x, y) => {
        lines.forEach(([dx, dy, ox, oy], qi) => {
          const nx = -dy, ny = dx, d = Math.abs((x - ox) * nx + (y - oy) * ny), lam = 30 * s, amt = p.staerke * 120 * s * (1 + 0.3 * Math.sin(t + qi));
          const m = (amt * lam) / (d + lam); x += dx * m; y += dy * m;
        });
        return [x, y];
      };
      drops.forEach((dp) => {
        fill(ctx, dp.c); ctx.beginPath();
        for (let i = 0; i <= 160; i++) { const a = (i / 160) * 6.2832, q = warp(cx + Math.cos(a) * dp.R0, cy + Math.sin(a) * dp.R0); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        ctx.closePath(); ctx.fill();
      });
    });

  tool('pg_filament', 'FILAMENT', 'vektor', 'organisch', 'Stromlinien durch ein Rauschfeld, zu Seilen gebündelt, mit kleinen Zeichen entlang',
    [...P0('tinte'), R('linien', 'Linien', 20, 800, 240, 10), R('buendel', 'Bündel', 1, 16, 5, 1), R('laenge', 'Länge', 10, 300, 120, 1), R('dicke', 'Dicke', 0.2, 3, 0.7), Bo('marken', 'Zeichen', true), TEMPO(0.2), SEED(2)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), s = env.s, r = mulberry(p.seed * 83 + 1), z = env.t * p.tempo * 0.3, sc = 220 * s, st = 2.2 * s;
      ground(ctx, w, h, g);
      const seeds = []; for (let b = 0; b < p.buendel; b++) seeds.push([r() * w, r() * h, k[b % k.length]]);
      ctx.lineWidth = p.dicke * s; ctx.lineCap = 'round';
      const marks = [];
      for (let i = 0; i < p.linien; i++) {
        const sd = seeds[i % seeds.length]; let x = sd[0] + (r() - 0.5) * 40 * s, y = sd[1] + (r() - 0.5) * 40 * s;
        ctx.strokeStyle = sd[2]; ctx.beginPath(); ctx.moveTo(x, y);
        for (let q = 0; q < p.laenge; q++) {
          const a = noise3(x / sc, y / sc, z) * 12.566; x += Math.cos(a) * st; y += Math.sin(a) * st; ctx.lineTo(x, y);
          if (p.marken && i % 9 === 0 && q % 40 === 20) marks.push([x, y, a, sd[2]]);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1.2 * s;
      marks.forEach(([x, y, a, c], i) => { ctx.strokeStyle = c; fill(ctx, g); ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); if (i % 3 === 0) ctx.arc(0, 0, 3 * s, 0, 6.2832); else if (i % 3 === 1) { ctx.moveTo(-4 * s, 0); ctx.lineTo(4 * s, 0); ctx.moveTo(0, -4 * s); ctx.lineTo(0, 4 * s); } else ctx.rect(-2.5 * s, -2.5 * s, 5 * s, 5 * s); ctx.fill(); ctx.stroke(); ctx.restore(); });
    });

  // ======================================================
  //  PIXEL (bei playgrnd nur PNG)
  // ======================================================
  tool('pg_aura', 'AURA', 'pixel', 'feld', 'weiche, leuchtende Farbfelder, die wie Polarlicht ineinander schmelzen',
    [...P0('neon', true), R('flecken', 'Flecken', 2, 10, 5, 1), R('weich', 'Weichheit', 0.2, 1, 0.75), R('korn', 'Körnung', 0, 40, 8, 1), TEMPO(0.3), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), q = 8, sw = Math.ceil(w / q), sh = Math.ceil(h / q), tc = tmp('aura', sw, sh), tx = tc.getContext('2d'), t = env.t * p.tempo, r = mulberry(p.seed + 1);
      tx.globalCompositeOperation = 'source-over'; tx.fillStyle = g; tx.fillRect(0, 0, sw, sh); tx.globalCompositeOperation = 'screen';
      for (let i = 0; i < p.flecken; i++) {
        const ph = r() * 10, x = sw * (0.5 + 0.4 * Math.sin(t * 0.6 + ph)), y = sh * (0.5 + 0.4 * Math.cos(t * 0.5 + ph * 1.3)), R0 = Math.max(sw, sh) * (0.25 + 0.5 * p.weich) * (0.7 + r() * 0.6);
        const gr = tx.createRadialGradient(x, y, 0, x, y, R0); gr.addColorStop(0, k[i % k.length]); gr.addColorStop(1, 'rgba(0,0,0,0)'); tx.fillStyle = gr; tx.fillRect(0, 0, sw, sh);
      }
      tx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(tc, 0, 0, w, h); ctx.restore();
      if (p.korn) grain(ctx, w, h, p.korn, false, 3);
    });

  tool('pg_mist', 'MIST', 'pixel', 'feld', 'gesprühte Neon-Schleier: senkrechte Leuchtstreifen über weichen Pastellflecken',
    [...P0('pastell'), R('streifen', 'Streifen', 2, 30, 10, 1), R('flecken', 'Flecken', 1, 10, 5, 1), R('korn', 'Körnung', 0, 50, 14, 1), TEMPO(0.2), SEED(3)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), q = 6, sw = Math.ceil(w / q), sh = Math.ceil(h / q), tc = tmp('mist', sw, sh), tx = tc.getContext('2d'), r = mulberry(p.seed * 5 + 1), t = env.t * p.tempo;
      tx.globalCompositeOperation = 'source-over'; tx.fillStyle = g; tx.fillRect(0, 0, sw, sh);
      for (let i = 0; i < p.flecken; i++) { const x = r() * sw, y = r() * sh, R0 = sw * (0.3 + r() * 0.4), gr = tx.createRadialGradient(x, y, 0, x, y, R0); gr.addColorStop(0, pick(r, k)); gr.addColorStop(1, 'rgba(255,255,255,0)'); tx.fillStyle = gr; tx.fillRect(0, 0, sw, sh); }
      tx.globalCompositeOperation = 'screen';
      for (let i = 0; i < p.streifen; i++) {
        const x = ((r() * sw + t * 3 * (i % 2 ? 1 : -1)) % sw + sw) % sw, bw = 1 + r() * 4, gr = tx.createLinearGradient(x - bw, 0, x + bw, 0), c = ['#ff2e88', '#00e5ff', '#f9ff3a', '#7cff6b'][i % 4];
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); tx.fillStyle = gr; tx.globalAlpha = 0.5 + r() * 0.5; tx.fillRect(x - bw, sh * r() * 0.3, bw * 2, sh);
      }
      tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(tc, 0, 0, w, h); ctx.restore();
      if (p.korn) grain(ctx, w, h, p.korn, false, 7);
    });

  tool('pg_terrain', 'TERRAIN', 'pixel', 'feld', 'posterisierte Farbfelder mit geditherten Rändern – organische Flächen',
    [...P0('erde'), R('stufen', 'Stufen', 2, 10, 5, 1), R('rand', 'Dither-Rand', 0, 1, 0.5), R('skala', 'Skala', 40, 400, 160, 1), TEMPO(0.2), SEED()],
    (ctx, w, h, p, env) => {
      const P = TP.PALETTES[p.farben] || TP.PALETTES.erde, cols = P.map(rgbOf), f = fieldOf(ctx, w, h, p, env, p.skala, 4), n = p.stufen;
      pix(ctx, w, h, 2, (x, y, o, ix, iy) => {
        const v = f(x, y) * n, b = (BAYER[(iy & 3) * 4 + (ix & 3)] + 0.5) / 16 - 0.5;
        const lv = clamp(Math.floor(v + b * p.rand), 0, n - 1), c = cols[Math.round((lv / Math.max(1, n - 1)) * (cols.length - 1))];
        o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
      }, false);
    }, true);

  tool('pg_delta', 'DELTA', 'pixel', 'glitch', 'gestörte Satellitenfelder: marmorierter Grund unter Mosaiken, Balken und verschobenen Bändern',
    [...P0('erde'), R('mosaik', 'Mosaik', 0, 1, 0.5), R('block', 'Block', 3, 40, 12, 1), R('baender', 'Verschobene Bänder', 0, 20, 6, 1), TEMPO(0.6), SEED()],
    (ctx, w, h, p, env) => {
      const P = TP.PALETTES[p.farben] || TP.PALETTES.erde, ramp = rampLUT(P), t = env.t * p.tempo, r = mulberry(p.seed * 7 + Math.floor(t * 3)), bs = p.block * env.s;
      if (!env.hasInput) { const sc = 140 * env.s, z = p.seed; pix(ctx, w, h, 3, (x, y, o) => { const a = fbm(x / sc, y / sc, z, 3), b = fbm(x / sc + a * 2, y / sc + a * 3, z + 5, 3); ramp(b, o); }, true); }
      const n = Math.floor((w * h) / (bs * bs * 60) * p.mosaik * 10);
      for (let i = 0; i < n; i++) {
        const mw = (2 + r() * 8) * bs, mh = (1 + r() * 5) * bs, x = r() * w, y = r() * h;
        if (r() < 0.25) { fill(ctx, P[(r() * P.length) | 0]); ctx.fillRect(x, y, mw, bs * 0.5); continue; }
        for (let yy = 0; yy < mh; yy += bs) for (let xx = 0; xx < mw; xx += bs) { fill(ctx, P[(r() * P.length) | 0]); ctx.fillRect(x + xx, y + yy, bs + 0.5, bs + 0.5); }
      }
      for (let i = 0; i < p.baender; i++) { const y = r() * h, bh = (4 + r() * 30) * env.s, dx = (r() - 0.5) * w * 0.3; ctx.drawImage(ctx.canvas, 0, y, w, bh, dx, y, w, bh); }
    }, true);

  tool('pg_sear', 'SEAR', 'pixel', 'feld', 'Wärmekamera: Feld in harte Farbbänder posterisiert, seitlich verschmiert, mit gerissenen Bändern',
    [S('farben', 'Farben', PAL(), 'thermo'), R('stufen', 'Stufen', 2, 12, 6, 1), R('schmieren', 'Verschmieren', 0, 0.98, 0.7), R('risse', 'Risse', 0, 20, 6, 1), TEMPO(0.3), SEED()],
    (ctx, w, h, p, env) => {
      const cols = (TP.PALETTES[p.farben] || TP.PALETTES.thermo).map(rgbOf), f = fieldOf(ctx, w, h, p, env, 150, 3), n = p.stufen, sm = p.schmieren;
      const sw = Math.ceil(w / 2), sh = Math.ceil(h / 2), tc = tmp('sear', sw, sh), tx = tc.getContext('2d'), im = tx.createImageData(sw, sh), d = im.data, r = mulberry(p.seed * 3 + Math.floor(env.t * p.tempo * 4));
      for (let y = 0; y < sh; y++) {
        let a0 = 0, a1 = 0, a2 = 0;
        for (let x = 0; x < sw; x++) {
          const lv = Math.min(n - 1, Math.floor(f(x * 2, y * 2) * n)), c = cols[Math.round((lv / Math.max(1, n - 1)) * (cols.length - 1))];
          if (x === 0) { a0 = c[0]; a1 = c[1]; a2 = c[2]; } else { a0 = a0 * sm + c[0] * (1 - sm); a1 = a1 * sm + c[1] * (1 - sm); a2 = a2 * sm + c[2] * (1 - sm); }
          const i = (y * sw + x) * 4; d[i] = a0; d[i + 1] = a1; d[i + 2] = a2; d[i + 3] = 255;
        }
      }
      tx.putImageData(im, 0, 0);
      for (let i = 0; i < p.risse; i++) { const y = r() * sh, bh = 1 + r() * 12, dx = (r() - 0.5) * sw * 0.4; tx.drawImage(tc, 0, y, sw, bh, dx, y, sw, bh); }
      ctx.save(); ctx.clearRect(0, 0, w, h); ctx.imageSmoothingEnabled = false; ctx.drawImage(tc, 0, 0, w, h); ctx.restore();
    }, true);

  tool('pg_culture', 'CULTURE', 'pixel', 'organisch', 'weiche Zellkolonien, die verschmelzen, in Ringe gebändert, unter Filmkorn',
    [...P0('pastell', true), R('zellen', 'Zellen', 2, 30, 12, 1), R('ringe', 'Ringe', 1, 10, 5, 1), R('korn', 'Körnung', 0, 60, 18, 1), TEMPO(0.2), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cols = [g].concat(k).map(rgbOf), r = mulberry(p.seed * 13 + 1), t = env.t * p.tempo, C0 = [];
      for (let i = 0; i < p.zellen; i++) C0.push([r() * w, r() * h, (0.04 + r() * 0.1) * Math.min(w, h), r() * 6]);
      const cs = C0.map(([x, y, rr, ph]) => [x + Math.sin(t + ph) * 12 * env.s, y + Math.cos(t * 0.8 + ph) * 12 * env.s, rr * rr]);
      pix(ctx, w, h, 2, (x, y, o) => {
        let v = 0; for (const [cx, cy, r2] of cs) { const dx = x - cx, dy = y - cy; v += r2 / (dx * dx + dy * dy + 1); }
        const lv = v < 0.6 ? 0 : 1 + (Math.floor((v - 0.6) * p.ringe) % (cols.length - 1)), c = cols[lv];
        o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
      }, true);
      if (p.korn) grain(ctx, w, h, p.korn, false, 5);
    });

  tool('pg_husk', 'HUSK', 'pixel', 'organisch', 'gestreute Kiesel-Silhouetten, deren Füllung vom Rand her angefressen ist',
    [...P0('tinte'), R('anzahl', 'Anzahl', 2, 60, 16, 1), R('groesse', 'Größe', 0.03, 0.25, 0.1), R('biss', 'Biss', 0, 1, 0.45), S('modus', 'Rand', ['krümel', 'raster'], 'krümel'), SEED(6)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), r = mulberry(p.seed * 17 + 3), s = env.s;
      ground(ctx, w, h, g);
      for (let i = 0; i < p.anzahl; i++) {
        const cx = r() * w, cy = r() * h, R0 = Math.min(w, h) * p.groesse * (0.6 + r() * 0.8), f = polar(r, 5), c = pick(r, k), core = 1 - p.biss;
        fill(ctx, c); polarPath(ctx, cx, cy, R0 * core, f); ctx.fill();
        if (p.modus === 'krümel') { const n = R0 * R0 * 0.06 / (s * s) * p.biss + 20; for (let q = 0; q < n; q++) { const th = r() * 6.2832, u = Math.sqrt(r()), rr = R0 * f(th) * (core + (1 - core) * u); if (r() > 1 - u * 0.9) continue; ctx.fillRect(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, 2.2 * s, 2.2 * s); } }
        else { const gs = 5 * s; for (let y = cy - R0 * 1.4; y < cy + R0 * 1.4; y += gs) for (let x = cx - R0 * 1.4; x < cx + R0 * 1.4; x += gs) { const th = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, y - cy) / (R0 * f(th)); if (d < core || d > 1) continue; ctx.beginPath(); ctx.arc(x, y, gs * 0.45 * (1 - (d - core) / (1 - core + 1e-6)), 0, 6.2832); ctx.fill(); } }
      }
    });

  tool('pg_strand', 'STRAND', 'pixel', 'organisch', 'verzweigte Stabketten, mit einer zweiten, leicht versetzten Farbe gedruckt',
    [...P0('riso2'), R('ketten', 'Ketten', 1, 20, 6, 1), R('stab', 'Stablänge', 6, 50, 18, 1), R('gabel', 'Verzweigung', 0, 0.5, 0.15), R('versatz', 'Versatz', 0, 12, 3, 1), TEMPO(0.2), SEED(4)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), r = mulberry(p.seed * 23 + 1), s = env.s, L = p.stab * s, segs = [];
      const stack = []; for (let i = 0; i < p.ketten; i++) stack.push([r() * w, r() * h, r() * 6.2832, 40]);
      while (stack.length && segs.length < 1500) {
        let [x, y, a, n] = stack.pop();
        for (let i = 0; i < n; i++) {
          a += (r() - 0.5) * 1.1 + Math.sin(env.t * p.tempo + i * 0.3) * 0.05; const nx = x + Math.cos(a) * L, ny = y + Math.sin(a) * L;
          segs.push([x, y, nx, ny]); x = nx; y = ny;
          if (r() < p.gabel) stack.push([x, y, a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), Math.floor(n * 0.6)]);
          if (x < -L || y < -L || x > w + L || y > h + L) break;
        }
      }
      ground(ctx, w, h, g);
      ctx.lineCap = 'round';
      const draw = (c, dx, dy) => { ctx.strokeStyle = c; ctx.lineWidth = 4 * s; ctx.beginPath(); segs.forEach(([a, b, c2, d]) => { ctx.moveTo(a + dx, b + dy); ctx.lineTo(c2 + dx, d + dy); }); ctx.stroke(); fill(ctx, c); segs.forEach(([a, b]) => { ctx.beginPath(); ctx.arc(a + dx, b + dy, 3.5 * s, 0, 6.2832); ctx.fill(); }); };
      draw(k[0], 0, 0); ctx.globalCompositeOperation = 'multiply'; draw(k[1 % k.length], p.versatz * s, p.versatz * s * 0.6); ctx.globalCompositeOperation = 'source-over';
    });

  tool('pg_chaff', 'CHAFF', 'pixel', 'organisch', 'gebogene Klingen, über den Grund geworfen, ungleichmäßig gedruckt',
    [...P0('tinte'), R('anzahl', 'Anzahl', 10, 800, 160, 10), R('laenge', 'Länge', 5, 90, 30, 1), R('kruemmung', 'Krümmung', 0, 1, 0.5), R('rau', 'Rauheit', 0, 1, 0.5), TEMPO(0.1), SEED(2)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), r = mulberry(p.seed * 31 + 7), s = env.s, t = env.t * p.tempo;
      ground(ctx, w, h, g); fill(ctx, k[0]);
      for (let i = 0; i < p.anzahl; i++) {
        const x = r() * w, y = r() * h, a = r() * 6.2832 + t * (r() - 0.5), L = p.laenge * s * (0.5 + r()), b = p.kruemmung * L * 0.6, tw = L * 0.12;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(0, -b - tw, L / 2, 0); ctx.quadraticCurveTo(0, -b + tw, -L / 2, 0); ctx.fill(); ctx.restore();
      }
      if (p.rau > 0) {
        const im = ctx.getImageData(0, 0, w, h), d = im.data, gc = rgbOf(g), sc = 6 * s;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4; if (d[i] === gc[0] && d[i + 1] === gc[1] && d[i + 2] === gc[2]) continue;
          const n = noise3(x / sc, y / sc, 3.3) * 0.6 + Math.random() * 0.4;
          if (n < p.rau * 0.55) { d[i] = gc[0]; d[i + 1] = gc[1]; d[i + 2] = gc[2]; }
        }
        ctx.putImageData(im, 0, 0);
      }
    });

  tool('pg_splice', 'SPLICE', 'pixel', 'druck', 'ein Feld sanfter Hügel, zerschnitten – jedes Stück in eigenem Raster und eigenen Farben gedruckt',
    [...P0('riso2'), R('schnitte', 'Schnitte', 1, 14, 6, 1), R('raster', 'Raster', 3, 14, 6, 1), TEMPO(0.15), SEED(5)],
    (ctx, w, h, p, env) => {
      const P = TP.PALETTES[p.farben] || TP.PALETTES.riso2, f = fieldOf(ctx, w, h, p, env, 260, 2), r = mulberry(p.seed * 7 + 1), gs = p.raster * env.s;
      const pieces = [[0, 0, w, h]];
      for (let i = 0; i < p.schnitte; i++) { const [x, y, pw, ph] = pieces.splice((r() * pieces.length) | 0, 1)[0], fr = 0.3 + r() * 0.4; if (pw > ph) pieces.push([x, y, pw * fr, ph], [x + pw * fr, y, pw * (1 - fr), ph]); else pieces.push([x, y, pw, ph * fr], [x, y + ph * fr, pw, ph * (1 - fr)]); }
      const im = ctx.createImageData(w, h), d = im.data;
      pieces.forEach(([px, py, pw, ph]) => {
        const a = rgbOf(pick(r, P)), b = rgbOf(pick(r, P)), m = pick(r, ['punkte', 'linien', 'dither', 'flach']), ang = r() * Math.PI;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (let y = py | 0; y < Math.min(h, py + ph); y++) for (let x = px | 0; x < Math.min(w, px + pw); x++) {
          const v = f(x, y), u = (x * ca + y * sa) / gs, vv = (-x * sa + y * ca) / gs;
          let on;
          if (m === 'punkte') { const fx = u - Math.floor(u) - 0.5, fy = vv - Math.floor(vv) - 0.5; on = Math.hypot(fx, fy) < (1 - v) * 0.6; }
          else if (m === 'linien') on = Math.abs(vv - Math.floor(vv) - 0.5) < (1 - v) * 0.5;
          else if (m === 'dither') on = 1 - v > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
          else on = v < 0.5;
          const c = on ? a : b, i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
      });
      ctx.putImageData(im, 0, 0);
    }, true);

  tool('pg_whorl', 'WHORL', 'pixel', 'opart', 'Streifen, die sich um unsichtbare Zentren zu Ringen, Augen und Sätteln biegen',
    [...P0('tinte'), R('zentren', 'Zentren', 1, 6, 3, 1), R('streifen', 'Streifen', 4, 80, 22, 1), R('drall', 'Drall', 0, 4, 1), TEMPO(0.4), SEED(3)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), a = rgbOf(k[0]), b = rgbOf(g), r = mulberry(p.seed * 9 + 2), cs = [], t = env.t * p.tempo, D = Math.hypot(w, h);
      for (let i = 0; i < p.zentren; i++) cs.push([r() * w, r() * h, r() < 0.5 ? 1 : -1, (r() - 0.5) * 2]);
      const f = (p.streifen * 6.2832) / D;
      pix(ctx, w, h, 1, (x, y, o) => {
        let ph = 0;
        for (const [cx, cy, sg, sw] of cs) { const dx = x - cx, dy = y - cy; ph += sg * Math.hypot(dx, dy) * f / cs.length + p.drall * sw * Math.atan2(dy, dx); }
        const c = Math.sin(ph + t * 2) > 0 ? a : b; o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
      }, false);
    });

  tool('pg_sprig', 'SPRIG', 'pixel', 'organisch', 'handgezeichnete Botanik: Blüten, Blätter, Stiele in dickem Markerstrich, nahtlos gekachelt',
    [...P0('erde'), R('kacheln', 'Kacheln', 1, 6, 3, 1), R('strich', 'Strich', 1, 12, 4, 1), R('elemente', 'Elemente', 2, 20, 7, 1), SEED(9)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), s = env.s, tile = w / p.kacheln, r = mulberry(p.seed * 47 + 3), els = [];
      for (let i = 0; i < p.elemente; i++) els.push({ x: r() * tile, y: r() * tile, a: r() * 6.28, sz: tile * (0.08 + r() * 0.12), m: pick(r, ['bluete', 'blatt', 'stiel']), c: pick(r, k) });
      ground(ctx, w, h, g);
      ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = p.strich * s;
      const drawEl = (e, ox, oy) => {
        ctx.save(); ctx.translate(e.x + ox, e.y + oy); ctx.rotate(e.a); ctx.strokeStyle = e.c; ctx.beginPath();
        if (e.m === 'bluete') { for (let q = 0; q < 6; q++) { const an = q * 1.047; ctx.moveTo(0, 0); ctx.bezierCurveTo(Math.cos(an - 0.5) * e.sz, Math.sin(an - 0.5) * e.sz, Math.cos(an + 0.5) * e.sz, Math.sin(an + 0.5) * e.sz, 0, 0); } }
        else if (e.m === 'blatt') { ctx.moveTo(-e.sz, 0); ctx.quadraticCurveTo(0, -e.sz * 0.7, e.sz, 0); ctx.quadraticCurveTo(0, e.sz * 0.7, -e.sz, 0); ctx.moveTo(-e.sz, 0); ctx.lineTo(e.sz * 0.8, 0); }
        else { ctx.moveTo(-e.sz * 1.5, 0); ctx.bezierCurveTo(-e.sz * 0.5, -e.sz, e.sz * 0.5, e.sz, e.sz * 1.5, 0); }
        ctx.stroke(); ctx.restore();
      };
      for (let ty = -1; ty <= Math.ceil(h / tile); ty++) for (let tx = -1; tx <= p.kacheln; tx++) els.forEach((e) => drawEl(e, tx * tile, ty * tile));
    });

  tool('pg_frond', 'FROND', 'pixel', 'druck', 'verwittertes Riso-Stillleben: grelle Ausschnitte, 1-Bit-Botanik, Dither-Blöcke, Passermarken',
    [...P0('neon'), R('massen', 'Massen', 1, 8, 3, 1), R('linien', 'Pflanzenlinien', 0, 12, 5, 1), R('rauschen', 'Rauschblöcke', 0, 8, 3, 1), SEED(11)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), r = mulberry(p.seed * 59 + 1), s = env.s;
      ground(ctx, w, h, g);
      ctx.globalCompositeOperation = 'multiply';
      for (let i = 0; i < p.massen; i++) { const f = polar(r, 4); fill(ctx, pick(r, k)); polarPath(ctx, r() * w, r() * h, (0.15 + r() * 0.25) * w, f, 10); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      // 1-Bit-Linien auf grobem Raster
      const q = 3, sw = Math.ceil(w / q / s), sh = Math.ceil(h / q / s), tc = tmp('frond', sw, sh), tx = tc.getContext('2d');
      tx.clearRect(0, 0, sw, sh); tx.strokeStyle = '#000'; tx.lineWidth = 1; tx.imageSmoothingEnabled = false;
      for (let i = 0; i < p.linien; i++) { let x = r() * sw, y = sh, a = -Math.PI / 2 + (r() - 0.5); tx.beginPath(); tx.moveTo(x, y); for (let n = 0; n < 60; n++) { a += (r() - 0.5) * 0.4; x += Math.cos(a) * 2; y += Math.sin(a) * 2; tx.lineTo(x, y); if (n % 8 === 4) { tx.moveTo(x, y); tx.lineTo(x + Math.cos(a + 1) * 6, y + Math.sin(a + 1) * 6); tx.moveTo(x, y); } } tx.stroke(); }
      const id = tx.getImageData(0, 0, sw, sh); for (let i = 3; i < id.data.length; i += 4) id.data[i] = id.data[i] > 90 ? 255 : 0; tx.putImageData(id, 0, 0);
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(tc, 0, 0, w, h); ctx.restore();
      for (let i = 0; i < p.rauschen; i++) { const bw = (30 + r() * 80) * s, bh = (20 + r() * 60) * s, x = r() * (w - bw), y = r() * (h - bh); fill(ctx, k[0]); for (let yy = 0; yy < bh; yy += 2 * s) for (let xx = 0; xx < bw; xx += 2 * s) if (r() < 0.5) ctx.fillRect(x + xx, y + yy, 2 * s, 2 * s); }
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1 * s;
      [[24, 24], [w / s - 24, 24], [24, h / s - 24], [w / s - 24, h / s - 24]].forEach(([x, y]) => { x *= s; y *= s; ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, 6.2832); ctx.moveTo(x - 12 * s, y); ctx.lineTo(x + 12 * s, y); ctx.moveTo(x, y - 12 * s); ctx.lineTo(x, y + 12 * s); ctx.stroke(); });
    });

  tool('pg_pith', 'PITH', 'pixel', 'organisch', 'Zellgewebe: Zellen in lockerem Raster, von Rand zu Kern in Dither-Bändern, von Adern durchzogen',
    [...P0('pastell', true), R('zellen', 'Zellen', 2, 20, 7, 1), R('baender', 'Bänder', 2, 6, 4, 1), R('adern', 'Adern', 0, 10, 3, 1), TEMPO(0.2), SEED(2)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cols = [g].concat(k).map(rgbOf), cs = w / p.zellen, r = mulberry(p.seed * 3 + 1), t = env.t * p.tempo, pts = [];
      const rows = Math.ceil(h / cs) + 1;
      for (let j = -1; j <= rows; j++) for (let i = -1; i <= p.zellen; i++) { const ph = r() * 6.28; pts.push([(i + 0.5 + (r() - 0.5) * 0.7) * cs + Math.sin(t + ph) * cs * 0.08, (j + 0.5 + (r() - 0.5) * 0.7) * cs + Math.cos(t + ph) * cs * 0.08]); }
      pix(ctx, w, h, 2, (x, y, o, ix, iy) => {
        let d1 = 1e9, d2 = 1e9;
        for (const [px, py] of pts) { const dx = x - px, dy = y - py; if (Math.abs(dx) > cs * 1.6 || Math.abs(dy) > cs * 1.6) continue; const d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        const tt = Math.sqrt(d1) / (Math.sqrt(d2) + 1e-6), v = (1 - tt) * p.baender + ((BAYER[(iy & 3) * 4 + (ix & 3)] + 0.5) / 16 - 0.5);
        const lv = tt > 0.93 ? 0 : 1 + (clamp(Math.floor(v), 0, p.baender - 1) % (cols.length - 1)), c = cols[lv];
        o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
      }, false);
      ctx.strokeStyle = g; ctx.lineCap = 'round';
      const vein = (x, y, a, wd, n) => { if (n <= 0 || wd < 0.6) return; ctx.lineWidth = wd * env.s; ctx.beginPath(); ctx.moveTo(x, y); for (let i = 0; i < 12; i++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * 9 * env.s; y += Math.sin(a) * 9 * env.s; ctx.lineTo(x, y); } ctx.stroke(); vein(x, y, a + 0.5, wd * 0.7, n - 1); vein(x, y, a - 0.6, wd * 0.6, n - 1); };
      for (let i = 0; i < p.adern; i++) vein(r() * w, r() * h, r() * 6.28, 4, 4);
    });

  tool('pg_hiss', 'HISS', 'pixel', 'glitch', 'Fernsehschnee-Plakat: spitze Blätter voller Rauschen über marmorierter Farbe, mit Schachlinsen und Sternchen',
    [...P0('neon', true), R('blaetter', 'Blätter', 1, 12, 5, 1), R('rauschen', 'Rauschen', 0, 1, 0.6), R('details', 'Details', 0, 12, 5, 1), TEMPO(2), SEED(7)],
    (ctx, w, h, p, env) => {
      const P = TP.PALETTES[p.farben] || TP.PALETTES.neon, ramp = rampLUT(P), sc = 160 * env.s, s = env.s, r = mulberry(p.seed * 19 + 3);
      pix(ctx, w, h, 3, (x, y, o) => { const a = fbm(x / sc, y / sc, p.seed, 3); ramp(fbm(x / sc + a * 3, y / sc, p.seed + 2, 3), o); }, true);
      const nc = tmp('hiss', Math.ceil(w / 2), Math.ceil(h / 2)), nx = nc.getContext('2d'), nim = nx.createImageData(nc.width, nc.height), nr = mulberry(Math.floor(env.t * p.tempo * 12) + 1);
      for (let i = 0; i < nim.data.length; i += 4) { const v = nr() < 0.5 ? 0 : 255; nim.data[i] = nim.data[i + 1] = nim.data[i + 2] = v; nim.data[i + 3] = 255 * p.rauschen + (1 - p.rauschen) * 60; }
      nx.putImageData(nim, 0, 0);
      const lh = h / (p.blaetter + 1);
      for (let i = 0; i < p.blaetter; i++) {
        const cy = lh * (i + 1), lw = w * (0.35 + r() * 0.3);
        ctx.save(); ctx.beginPath(); ctx.moveTo(w / 2 - lw / 2, cy); ctx.quadraticCurveTo(w / 2, cy - lh * 0.9, w / 2 + lw / 2, cy); ctx.quadraticCurveTo(w / 2, cy + lh * 0.9, w / 2 - lw / 2, cy); ctx.clip();
        ctx.imageSmoothingEnabled = false; ctx.drawImage(nc, 0, 0, w, h); ctx.restore();
      }
      for (let i = 0; i < p.details; i++) {
        const x = r() * w, y = r() * h, m = pick(r, ['linse', 'kamm', 'stern']), R0 = (12 + r() * 26) * s;
        if (m === 'linse') { ctx.save(); ctx.beginPath(); ctx.arc(x, y, R0, 0, 6.2832); ctx.clip(); const d = R0 / 4; for (let yy = -R0; yy < R0; yy += d) for (let xx = -R0; xx < R0; xx += d) { fill(ctx, ((xx + yy) / d) % 2 ? '#000' : '#fff'); ctx.fillRect(x + xx, y + yy, d, d); } ctx.restore(); }
        else if (m === 'kamm') { fill(ctx, '#000'); for (let q = 0; q < 10; q++) ctx.fillRect(x + q * 4 * s, y, 2 * s, R0 * 1.5); }
        else { ctx.strokeStyle = '#000'; ctx.lineWidth = 3 * s; ctx.beginPath(); for (let q = 0; q < 4; q++) { const a = q * Math.PI / 4; ctx.moveTo(x - Math.cos(a) * R0 * 0.5, y - Math.sin(a) * R0 * 0.5); ctx.lineTo(x + Math.cos(a) * R0 * 0.5, y + Math.sin(a) * R0 * 0.5); } ctx.stroke(); }
      }
    });

  tool('pg_benday', 'BENDAY', 'pixel', 'raster', 'Wärmefeld in Farbbänder geschnitten und durch ein Raster aus Ringpunkten gedruckt',
    [S('farben', 'Farben', PAL(), 'thermo'), R('raster', 'Raster', 4, 24, 8, 1), R('stufen', 'Stufen', 2, 8, 5, 1), Bo('ringe', 'Ringpunkte', true), C('grund', 'Grund', '#0b0a10'), TEMPO(0.3), SEED()],
    (ctx, w, h, p, env) => {
      const cols = TP.PALETTES[p.farben] || TP.PALETTES.thermo, f = fieldOf(ctx, w, h, p, env, 120, 4), gs = p.raster * env.s, n = p.stufen;
      ground(ctx, w, h, p.grund);
      ctx.lineWidth = gs * 0.12;
      for (let y = gs / 2; y < h; y += gs) for (let x = gs / 2; x < w; x += gs) {
        const v = f(x, y) * n, lv = Math.min(n - 1, Math.floor(v)), fr = v - lv, c = cols[Math.round((lv / Math.max(1, n - 1)) * (cols.length - 1))];
        const rr = gs * (0.18 + 0.3 * fr);
        fill(ctx, c); ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.fill();
        if (p.ringe) { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(x, y, rr + gs * 0.14, 0, 6.2832); ctx.stroke(); }
      }
    }, true);

  tool('pg_stitch', 'STITCH', 'pixel', 'glitch', 'Feld in senkrechte Schlieren verschmiert, Reihen verrutscht, auf grobe Zellen mit dunklen Fugen gerastert',
    [...P0('neon', true), R('zelle', 'Zelle', 4, 30, 11, 1), R('schliere', 'Schlieren', 0, 1, 0.6), R('rutsch', 'Verrutschen', 0, 1, 0.4), R('fuge', 'Fuge', 0, 0.5, 0.15), TEMPO(0.4), SEED()],
    (ctx, w, h, p, env) => {
      const src = env.hasInput ? ctx.getImageData(0, 0, w, h).data : null, { g, k } = gi(p), cs = p.zelle * env.s, cols = Math.ceil(w / cs), rows = Math.ceil(h / cs);
      const ramp = rampLUT(k), o = [0, 0, 0], t = env.t * p.tempo, r = mulberry(p.seed * 5 + Math.floor(t * 2)), sc = 120 * env.s;
      ground(ctx, w, h, g);
      for (let j = 0; j < rows; j++) {
        const slip = Math.round((r() - 0.5) * 2 * p.rutsch * 4) * cs;
        for (let i = 0; i < cols; i++) {
          const x = i * cs + cs / 2 - slip, y = j * cs + cs / 2, yy = y + Math.sin(i * 1.7) * p.schliere * h * 0.15;
          let c;
          if (src) { const ix = ((Math.round(x) % w) + w) % w, iy = clamp(Math.round(yy), 0, h - 1), q = (iy * w + ix) * 4; if (src[q + 3] < 8) continue; c = `rgb(${src[q]},${src[q + 1]},${src[q + 2]})`; }
          else { ramp(fbm(x / sc, (yy / sc) * (1 - p.schliere * 0.85), p.seed + t * 0.2, 3), o); c = `rgb(${o[0]},${o[1]},${o[2]})`; }
          if (r() < 0.04) c = pick(r, k);
          const gu = cs * p.fuge; fill(ctx, c); ctx.fillRect(i * cs + gu / 2, j * cs + gu / 2, cs - gu, cs - gu);
        }
      }
    }, true);

  tool('pg_fold', 'FOLD', 'pixel', 'muster', 'Kaleidoskop-Pixelkunst: Zebrastreifen, Treppen, Punktreihen, Strahlen, gefaltet und grob gerastert',
    [...P0('riso2'), R('zelle', 'Pixel', 3, 20, 7, 1), S('falten', 'Faltung', ['2', '4', '8'], '4'), R('flecken', 'Flecken', 2, 14, 6, 1), TEMPO(0.3), SEED(8)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cs = p.zelle * env.s, cols = Math.ceil(w / cs), rows = Math.ceil(h / cs), r = mulberry(p.seed * 13 + 1), t = Math.floor(env.t * p.tempo * 4);
      const hw = Math.ceil(cols / 2), hh = Math.ceil(rows / (p.falten === '2' ? 1 : 2)), patches = [];
      for (let i = 0; i < p.flecken; i++) patches.push({ x: r() * hw, y: r() * hh, w: 3 + r() * hw * 0.6, h: 3 + r() * hh * 0.5, m: pick(r, ['zebra', 'treppe', 'punkte', 'strahl', 'chevron', 'schach']), c: pick(r, k) });
      ground(ctx, w, h, g);
      const cell = (i, j) => {
        if (p.falten === '8' && i > j * hw / hh) { const q = i; i = Math.round(j * hw / hh); j = Math.round(q * hh / hw); }
        for (let q = patches.length - 1; q >= 0; q--) {
          const pt = patches[q], u = i - pt.x, v = j - pt.y;
          if (u < 0 || v < 0 || u > pt.w || v > pt.h) continue;
          const U = Math.floor(u) + t, V = Math.floor(v);
          const on = pt.m === 'zebra' ? U % 2 === 0 : pt.m === 'treppe' ? (U - V) % 4 < 2 : pt.m === 'punkte' ? U % 2 === 0 && V % 2 === 0 : pt.m === 'strahl' ? Math.floor(Math.atan2(v - pt.h / 2, u - pt.w / 2) * 3 + t) % 2 === 0 : pt.m === 'chevron' ? (Math.abs(U % 6 - 3) + V) % 3 === 0 : (U + V) % 2 === 0;
          return on ? pt.c : g;
        }
        return g;
      };
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const fi = i < hw ? i : cols - 1 - i, fj = p.falten === '2' ? j : j < hh ? j : rows - 1 - j, c = cell(fi, fj);
        if (c === g) continue; fill(ctx, c); ctx.fillRect(i * cs, j * cs, cs + 0.4, cs + 0.4);
      }
    });

  tool('pg_coral', 'CORAL', 'pixel', 'organisch', 'gerippte Korallenäste auf dunklem Grund, mit Papierlappen und Punktraster darüber',
    [...P0('see', true), R('aeste', 'Äste', 1, 8, 3, 1), R('tiefe', 'Tiefe', 2, 9, 6, 1), Bo('papier', 'Papierlappen', true), Bo('punkte', 'Punktraster', true), SEED(4)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), r = mulberry(p.seed * 67 + 1), s = env.s;
      ground(ctx, w, h, g);
      if (p.papier) for (let i = 0; i < 4; i++) { const f = polar(r, 6); fill(ctx, k[k.length - 1]); ctx.globalAlpha = 0.18; polarPath(ctx, r() * w, r() * h, (0.15 + r() * 0.2) * w, (th) => f(th) * (1 + (r() - 0.5) * 0.08), 90); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.lineCap = 'round';
      const branch = (x, y, a, len, wd, d, c) => {
        if (d <= 0) return;
        const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
        ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.lineWidth = Math.max(0.6 * s, wd * 0.25);
        for (let q = 0.2; q < 1; q += 0.2) { const bx = x + (nx - x) * q, by = y + (ny - y) * q, pa = a + Math.PI / 2; ctx.beginPath(); ctx.moveTo(bx - Math.cos(pa) * wd, by - Math.sin(pa) * wd); ctx.lineTo(bx + Math.cos(pa) * wd, by + Math.sin(pa) * wd); ctx.stroke(); }
        branch(nx, ny, a - 0.3 - r() * 0.4, len * 0.78, wd * 0.72, d - 1, c);
        branch(nx, ny, a + 0.3 + r() * 0.4, len * 0.78, wd * 0.72, d - 1, c);
      };
      for (let i = 0; i < p.aeste; i++) branch(w * (0.2 + 0.6 * r()), h, -Math.PI / 2 + (r() - 0.5) * 0.6, h * 0.16, 9 * s, p.tiefe, k[i % Math.max(1, k.length - 1)]);
      if (p.punkte) { fill(ctx, k[k.length - 1]); ctx.globalAlpha = 0.25; const d = 6 * s; for (let y = 0; y < h; y += d) for (let x = (y / d) % 2 ? d / 2 : 0; x < w; x += d) { ctx.beginPath(); ctx.arc(x, y, d * 0.18, 0, 6.2832); ctx.fill(); } ctx.globalAlpha = 1; }
    });

  tool('pg_dahlia', 'DAHLIA', 'pixel', 'druck', 'Chrysanthemen-Explosion: Strahlen aus kurzen Strichen in gestapelten Farben, mit Perlen, unter Druckkorn',
    [...P0('riso2'), R('strahlen', 'Strahlen', 20, 500, 180, 10), R('striche', 'Striche', 3, 40, 14, 1), R('biegung', 'Biegung', -1, 1, 0.35), Bo('perlen', 'Perlen', true), R('korn', 'Körnung', 0, 60, 16, 1), TEMPO(0.2), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), s = env.s, cx = w / 2, cy = h / 2, R0 = Math.hypot(w, h) * 0.5, t = env.t * p.tempo, r = mulberry(p.seed + 3);
      ground(ctx, w, h, g); ctx.lineCap = 'round';
      for (let i = 0; i < p.strahlen; i++) {
        const a0 = (i / p.strahlen) * 6.2832 + t * 0.1, c = k[i % Math.max(1, k.length - 1)];
        ctx.strokeStyle = c; ctx.lineWidth = (1.5 + (i % 3)) * s; ctx.beginPath();
        let last = null;
        for (let q = 0; q < p.striche; q++) {
          const u = (q + 0.2 + r() * 0.2) / p.striche, rr = R0 * (0.08 + u * 0.92), a = a0 + p.biegung * u * u * 1.5, len = (R0 / p.striche) * 0.55;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); last = [x, y];
        }
        ctx.stroke();
        if (p.perlen && i % 3 === 0 && last) { fill(ctx, k[k.length - 1]); ctx.beginPath(); ctx.arc(last[0], last[1], 2.5 * s, 0, 6.2832); ctx.fill(); }
      }
      if (p.korn) grain(ctx, w, h, p.korn, false, 11);
    });

  tool('pg_cipher', 'CIPHER', 'pixel', 'zeichen', 'Zeichenraster: Quadrate, Rauten, umrandete Quadrate, Kreuze, Punkte – je nach Band des Feldes',
    [...P0('tinte'), R('zelle', 'Zelle', 5, 40, 14, 1), R('baender', 'Bänder', 2, 5, 5, 1), TEMPO(0.2), SEED()],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), f = fieldOf(ctx, w, h, p, env, 160), cs = p.zelle * env.s, gl = ['dot', 'x', 'ring', 'raute', 'quadrat'];
      ground(ctx, w, h, g); ctx.lineWidth = cs * 0.12;
      for (let y = 0; y < h; y += cs) for (let x = 0; x < w; x += cs) {
        const b = Math.min(p.baender - 1, Math.floor(f(x + cs / 2, y + cs / 2) * p.baender)), m = gl[b % gl.length], c = k[b % k.length], cx = x + cs / 2, cy = y + cs / 2, q = cs * 0.36;
        fill(ctx, c); ctx.strokeStyle = c; ctx.beginPath();
        if (m === 'dot') { ctx.arc(cx, cy, q * 0.35, 0, 6.2832); ctx.fill(); }
        else if (m === 'x') { ctx.moveTo(cx - q, cy - q); ctx.lineTo(cx + q, cy + q); ctx.moveTo(cx + q, cy - q); ctx.lineTo(cx - q, cy + q); ctx.stroke(); }
        else if (m === 'ring') { ctx.rect(cx - q, cy - q, q * 2, q * 2); ctx.stroke(); ctx.beginPath(); ctx.rect(cx - q * 0.35, cy - q * 0.35, q * 0.7, q * 0.7); ctx.fill(); }
        else if (m === 'raute') { ctx.moveTo(cx, cy - q); ctx.lineTo(cx + q, cy); ctx.lineTo(cx, cy + q); ctx.lineTo(cx - q, cy); ctx.fill(); }
        else { ctx.rect(cx - q, cy - q, q * 2, q * 2); ctx.fill(); }
      }
    }, true);

  tool('pg_motley', 'MOTLEY', 'pixel', 'muster', 'Glyphen-Flickwerk: zerfranste Flecken und Stufenblöcke, je mit Kreisen, Plus, Streifen, Quadraten oder Punkten',
    [...P0('erde'), R('raster', 'Raster', 4, 24, 10, 1), R('flecken', 'Flecken', 2, 16, 7, 1), SEED(5)],
    (ctx, w, h, p, env) => {
      const { g, k } = gi(p), cs = (w / p.raster), cols = p.raster, rows = Math.ceil(h / cs), r = mulberry(p.seed * 89 + 1), s = env.s;
      ground(ctx, w, h, g);
      for (let q = 0; q < p.flecken; q++) {
        const c = pick(r, k), m = pick(r, ['kreis', 'plus', 'streifen', 'quadrat', 'punkt']), stufen = r() < 0.5, cx = r() * cols, cy = r() * rows, rad = 1.5 + r() * cols * 0.3, f = polar(r, 4);
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
          const inside = stufen ? Math.abs(dx) < rad && Math.abs(dy) < rad * 0.6 + ((i % 3) - 1) : Math.hypot(dx, dy) < rad * f(Math.atan2(dy, dx));
          if (!inside) continue;
          const x = i * cs, y = j * cs, m2 = cs * 0.5;
          fill(ctx, g); ctx.fillRect(x, y, cs + 0.4, cs + 0.4); fill(ctx, c); ctx.strokeStyle = c; ctx.lineWidth = cs * 0.14; ctx.beginPath();
          if (m === 'kreis') { ctx.arc(x + m2, y + m2, cs * 0.34, 0, 6.2832); ctx.stroke(); }
          else if (m === 'plus') { ctx.moveTo(x + m2, y + cs * 0.15); ctx.lineTo(x + m2, y + cs * 0.85); ctx.moveTo(x + cs * 0.15, y + m2); ctx.lineTo(x + cs * 0.85, y + m2); ctx.stroke(); }
          else if (m === 'streifen') { for (let u = 0; u < 3; u++) ctx.fillRect(x, y + u * cs / 3, cs, cs / 6); }
          else if (m === 'quadrat') { ctx.fillRect(x + cs * 0.15, y + cs * 0.15, cs * 0.7, cs * 0.7); }
          else { ctx.arc(x + m2, y + m2, cs * 0.16, 0, 6.2832); ctx.fill(); }
        }
      }
      void s;
    });

  tool('pg_crowd', 'CROWD', 'pixel', 'feld', 'solarisiertes Wasser: schräge Wellenreihen mit Schaumkronen, gekämmt, mit Ölringen, über eine Falschfarben-Skala',
    [...P0('see'), R('wellen', 'Wellenreihen', 3, 30, 12, 1), R('schraeg', 'Schräge', 0, 1, 0.5), R('tropfen', 'Öltropfen', 0, 16, 5, 1), R('solar', 'Solarisation', 1, 4, 2), TEMPO(0.4), SEED(3)],
    (ctx, w, h, p, env) => {
      const P = TP.PALETTES[p.farben] || TP.PALETTES.see, ramp = rampLUT(P.concat(P.slice().reverse())), t = env.t * p.tempo, r = mulberry(p.seed * 7 + 1), rh = h / p.wellen, drops = [];
      for (let i = 0; i < p.tropfen; i++) drops.push([r() * w, r() * h, (20 + r() * 50) * env.s]);
      pix(ctx, w, h, 2, (x, y, o) => {
        const row = Math.floor(y / rh), fy = (y % rh) / rh, skew = p.schraeg * fy * 40 * env.s;
        let v = Math.sin((x + skew) / (30 * env.s) + row * 1.7 + t * 2) * 0.5 + 0.5;
        v = v * (1 - fy) + Math.pow(fy, 3) * 0.8 + Math.sin(x * 0.35 / env.s + row) * 0.05;
        for (const [dx, dy, dr] of drops) { const d = Math.hypot(x - dx, y - dy); if (d < dr * 2) v += Math.sin(d / (4 * env.s)) * 0.2 * (1 - d / (dr * 2)); }
        ramp(((v * p.solar) % 1 + 1) % 1, o);
      }, true);
    });

})();
