/* Tool Pool – Der Mac mini rechnet
   Der Laptop behält die Bedienung (Bausteine ziehen, Regler). Er schickt nur, was der Besucher
   gebaut hat, und zeigt die fertigen Bilder an. Kommen keine Bilder mehr, rechnet er wieder selbst. */
(function () {
  const TP = window.TP, A = TP.app;
  if (!A) return;
  const GNADE_MS = 3000, NEU_VERSUCH_MS = 3000, TAKT_MS = 50;
  const dec = new TextDecoder();
  let station = 0, ctrl = null, zuletzt = 0, altZ = '', altM = '', unterwegs = false;
  let bilder = 0, bilderZeit = performance.now(), fps = 0, neuesBild = null, malt = false;

  const aktiv = () => !!station && Date.now() - zuletzt < GNADE_MS;
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Was gebaut wurde, zum Mac mini ----------
  async function melde() {
    if (!station || unterwegs) return;
    const z = JSON.stringify(A.fernZustand()), m = JSON.stringify(A.maus());
    if (z === altZ && m === altM) return;
    const d = { station, maus: A.maus() };
    if (z !== altZ) d.zustand = A.fernZustand();
    altZ = z; altM = m; unterwegs = true;
    try {
      const r = await fetch('/api/render/zustand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      if (!r.ok) altZ = '';
    } catch (e) { altZ = ''; }
    unterwegs = false;
  }
  setInterval(melde, TAKT_MS);

  // ---------- Bilder vom Mac mini ----------
  async function male() {
    malt = true;
    while (neuesBild) {
      const { typ, meta, jpg } = neuesBild; neuesBild = null;
      try {
        const bmp = await createImageBitmap(new Blob([jpg], { type: 'image/jpeg' }));
        if (typ === 'P') {
          const o = A.posterCanvas();
          if (o.width !== bmp.width || o.height !== bmp.height) { o.width = bmp.width; o.height = bmp.height; }
          o.getContext('2d').drawImage(bmp, 0, 0);
          A.posterAnzeige();
          bilder++;
        }
        bmp.close();
      } catch (e) { /* ein kaputtes Bild überspringen */ }
    }
    malt = false;
  }

  async function vorschauen(meta, jpg) {
    try {
      const bmp = await createImageBitmap(new Blob([jpg], { type: 'image/jpeg' })), th = A.thumbs(), n = meta.zelle;
      meta.ids.forEach((id, i) => {
        const c = th[id];
        if (c) c.getContext('2d').drawImage(bmp, (i % meta.spalten) * n, Math.floor(i / meta.spalten) * n, n, n, 0, 0, c.width, c.height);
      });
      bmp.close();
    } catch (e) { /* nächste Vorschau kommt gleich */ }
  }

  // Aufbau eines Pakets: Typ (1 Byte) · Länge + JSON · Länge + JPEG
  function verarbeite(typ, meta, jpg) {
    zuletzt = Date.now();
    if (typ === 'P') { neuesBild = { typ, meta, jpg }; if (!malt) male(); }
    if (typ === 'V') vorschauen(meta, jpg);
  }

  async function lesen(rd) {
    let buf = new Uint8Array(1 << 19), len = 0;
    for (;;) {
      const { value, done } = await rd.read();
      if (done) return;
      if (len + value.length > buf.length) {
        const neu = new Uint8Array(Math.max(buf.length * 2, len + value.length));
        neu.set(buf.subarray(0, len)); buf = neu;
      }
      buf.set(value, len); len += value.length;
      let pos = 0;
      for (;;) {
        if (len - pos < 5) break;
        const dv = new DataView(buf.buffer, pos);
        const ml = dv.getUint32(1);
        if (len - pos < 5 + ml + 4) break;
        const dl = dv.getUint32(5 + ml);
        if (len - pos < 9 + ml + dl) break;
        const typ = String.fromCharCode(buf[pos]);
        const meta = JSON.parse(dec.decode(buf.subarray(pos + 5, pos + 5 + ml)) || '{}');
        verarbeite(typ, meta, buf.slice(pos + 9 + ml, pos + 9 + ml + dl));
        pos += 9 + ml + dl;
      }
      if (pos) { buf.copyWithin(0, pos, len); len -= pos; }
    }
  }

  async function strom(fuer) {
    while (station === fuer) {
      ctrl = new AbortController();
      try {
        const r = await fetch('/api/render/strom?station=' + fuer, { signal: ctrl.signal, cache: 'no-store' });
        if (r.ok && r.body) { altZ = ''; await lesen(r.body.getReader()); }
      } catch (e) { /* Mac mini gerade nicht erreichbar */ }
      if (station === fuer) await warte(NEU_VERSUCH_MS);
    }
  }

  TP.fern = {
    aktiv,
    // id = Nummer der Station, 0 = der Laptop rechnet selbst
    setze(id) {
      if (id === station) return;
      station = id; altZ = ''; zuletzt = 0;
      if (ctrl) ctrl.abort();
      if (id) strom(id);
    },
    bilderJeSekunde() {
      const jetzt = performance.now();
      if (jetzt - bilderZeit > 500) { fps = Math.round((bilder * 1000) / (jetzt - bilderZeit)); bilder = 0; bilderZeit = jetzt; }
      return fps;
    },
  };
})();
