/* Tool Pool – Station in der Ausstellung
   Nur aktiv, wenn die Seite einmal mit ?station=N geöffnet wurde (?station=0 meldet wieder ab).
   Meldet sich alle 2 Sekunden beim Mac mini und übernimmt Einstellungen und Befehle aus der Regie. */
(function () {
  const TP = window.TP, A = TP.app;
  if (!A) return;
  const PULS_MS = 2000, BILD_ALLE = 3, BILD_BREITE = 240;
  const q = new URLSearchParams(location.search).get('station');
  if (q !== null) A.store.set('toolpool.station', +q || 0);
  const id = A.store.get('toolpool.station', 0);
  if (!id) return;

  let bedient = 0, stufe = '', fernAn = false, zaehler = 0, altFrames = 0, altZeit = performance.now();
  ['pointerdown', 'keydown', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { bedient = Date.now(); }, { capture: true, passive: true }));

  function kleinesBild() {
    const o = A.posterCanvas();
    if (!o || !o.width) return undefined;
    const c = TP.util.canvas(BILD_BREITE, Math.max(1, Math.round((BILD_BREITE * o.height) / o.width)));
    c.getContext('2d').drawImage(o, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  }

  async function puls() {
    const p = A.perf(), jetzt = performance.now();
    const fps = Math.round(((p.frames - altFrames) * 1000) / Math.max(1, jetzt - altZeit));
    altFrames = p.frames; altZeit = jetzt;
    const fern = !!(TP.fern && TP.fern.aktiv());
    const d = { id, ms: fern ? 0 : p.ms, fps: fern ? TP.fern.bilderJeSekunde() : fps, fern };
    if (bedient) d.ruhe = Math.round((Date.now() - bedient) / 1000);
    if (zaehler++ % BILD_ALLE === 0 && !fern) d.bild = kleinesBild();   // Rechnet der Mac mini, hat er das Bild schon
    try {
      const r = await fetch('/api/station/puls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      if (!r.ok) return;
      const j = await r.json();
      if (TP.museum) TP.museum.setze(j.ausstellung);
      const aufMini = j.ausstellung.rechnen === 'mini' && !A.hatBilder();
      if (TP.fern) TP.fern.setze(aufMini ? id : 0);
      if (j.ausstellung.leistung !== stufe || aufMini !== fernAn) { stufe = j.ausstellung.leistung; fernAn = aufMini; A.leistung(stufe, aufMini); }
      j.befehle.forEach((b) => {
        if (b === 'reset' && TP.museum) TP.museum.reset();
        if (b === 'neuladen') location.reload();
        if (b === 'zeigen') A.toast('Station ' + id + (j.name ? ' · ' + j.name : ''));
      });
    } catch (e) { /* Mac mini gerade nicht erreichbar: weiterlaufen, beim nächsten Puls neu versuchen */ }
  }
  puls();
  setInterval(puls, PULS_MS);
})();
