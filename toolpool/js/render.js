/* Tool Pool – Rechner auf dem Mac mini
   Läuft unsichtbar in der App: je Station eine Seite. Der Laptop schickt nur, was der Besucher
   gebaut hat. Hier wird gerechnet, die App holt die fertigen Bilder ab und schickt sie zurück. */
(function () {
  const TP = window.TP;
  const out = TP.util.canvas(420, 594), atlas = TP.util.canvas(96, 96);
  const env = { t: 0, s: 1, mouse: { x: 0.5, y: 0.5 }, images: {}, states: {} };
  let Z = null, res = null;

  function vorschauZelle(x, dx, dy, n, src, chk) {
    const sc = Math.min(n / src.width, n / src.height);
    x.fillStyle = chk[0]; x.fillRect(dx, dy, n, n);
    x.fillStyle = chk[1];
    for (let j = 0; j < n; j += 8) for (let i = (j / 8) % 2 ? 8 : 0; i < n; i += 16) x.fillRect(dx + i, dy + j, Math.min(8, n - i), Math.min(8, n - j));
    x.drawImage(src, dx + (n - src.width * sc) / 2, dy + (n - src.height * sc) / 2, src.width * sc, src.height * sc);
  }

  window.TPRender = {
    zustand(z) {
      if (Z && z.gen !== Z.gen) env.states = {};   // Board wurde zurückgesetzt: Simulationen neu beginnen
      Z = z;
    },
    maus(m) { env.mouse = m; },
    // Ein Bild weiterrechnen. Liefert das Plakat als JPEG (Base64).
    bild(dt, qualitaet) {
      if (!Z) return null;
      if (Z.playing) env.t += dt;
      const sc = (Z.big ? 2 : 1) * (Z.skala || 1), w = Math.round(Z.poster.w * sc), h = Math.round(Z.poster.h * sc);
      if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
      env.s = sc;
      const t0 = performance.now();
      res = TP.compose(out, Z.pieces, env, { mix: Z.mix, paper: Z.paper, key: 'live' });
      const ms = performance.now() - t0;
      return { bild: out.toDataURL('image/jpeg', qualitaet).slice(23), ms };
    },
    // Die kleinen Vorschauen der Bausteine als ein gemeinsames Bild
    vorschau() {
      if (!Z || !Z.vorschau || !res) return null;
      const ids = Object.keys(res.out);
      if (!ids.length) return null;
      const n = Z.vorschau, sp = Math.ceil(Math.sqrt(ids.length)), ze = Math.ceil(ids.length / sp);
      if (atlas.width !== sp * n || atlas.height !== ze * n) { atlas.width = sp * n; atlas.height = ze * n; }
      const x = atlas.getContext('2d');
      ids.forEach((id, i) => vorschauZelle(x, (i % sp) * n, Math.floor(i / sp) * n, n, res.out[id], Z.chk || ['#fff', '#e4e3df']));
      return { bild: atlas.toDataURL('image/jpeg', 0.7).slice(23), ids, zelle: n, spalten: sp };
    },
    // Das aktuelle Plakat druckfertig rechnen. Liefert das PDF (Base64).
    async druck(format) {
      if (!Z) throw new Error('Noch kein Plakat');
      const s = TP.druckSkala(Z.poster, format), c = TP.util.canvas(Math.round(Z.poster.w * s), Math.round(Z.poster.h * s));
      TP.compose(c, Z.pieces, Object.assign({}, env, { s, export: true }), { mix: Z.mix, paper: Z.paper, key: 'export' });
      const pdf = await TP.druckPdf(c, format, TP.credits(Z.pieces));
      let bin = '';
      for (let i = 0; i < pdf.length; i += 32768) bin += String.fromCharCode.apply(null, pdf.subarray(i, i + 32768));
      return btoa(bin);
    },
  };
})();
