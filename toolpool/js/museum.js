/* Tool Pool – Museumsmodus und Live-Druck
   Museumsmodus: nur der Baukasten, das Board läuft, nach kurzer Zeit ohne Bedienung zurück zum Startzustand.
   Live-Druck: ein Knopf schickt das Plakat ohne Dialog über den Server (server.py, /api/drucken) an einen Drucker. */
(function () {
  const TP = window.TP, A = TP.app;
  if (!A) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = document.documentElement;
  const PAUSE = 30, IDLE_MIN = 3, HALTEN_MS = 5000;
  const PAPIER = TP.DRUCK_PAPIER;

  const M = Object.assign({ on: false, live: false, drucker: '', format: 'A4', start: null }, A.store.get('toolpool.museum', {}));
  const save = () => A.store.set('toolpool.museum', M);
  let srv = null, busy = false, sperre = 0, touched = false, last = Date.now(), verwaltet = false;

  // ---------- Live-Druck ----------
  const btn = document.createElement('button');
  btn.className = 'btn dark'; btn.id = 'btnLive'; btn.textContent = 'Jetzt drucken';
  $('.insp-actions').prepend(btn);

  function renderBtn() {
    btn.hidden = !M.live;
    const rest = Math.ceil((sperre - Date.now()) / 1000);
    btn.disabled = busy || rest > 0;
    btn.textContent = busy ? 'Wird gedruckt …' : rest > 0 ? 'Gleich wieder · ' + rest + ' s' : 'Jetzt drucken';
  }
  setInterval(renderBtn, 500);

  function pdfVomPlakat() {
    const c = A.renderHi(TP.druckSkala(A.poster(), M.format));
    return TP.druckPdf(c, M.format, A.credits());
  }

  // Rechnet der Mac mini das Plakat, muss nur der Auftrag dorthin. Sonst entsteht das PDF hier.
  function auftragSenden() {
    const station = A.store.get('toolpool.station', 0);
    if (TP.fern && TP.fern.aktiv()) {
      return fetch('/api/druck/auftrag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ station, format: M.format }) });
    }
    return pdfVomPlakat().then((pdf) => {
      const q = new URLSearchParams({ drucker: M.drucker, format: M.format, station });
      return fetch('/api/drucken?' + q, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf });
    });
  }

  async function drucken() {
    if (busy || Date.now() < sperre) return;
    busy = true; renderBtn();
    try {
      await new Promise((r) => setTimeout(r, 40));   // Knopf zuerst aktualisieren, das Rechnen blockiert kurz
      const r = await auftragSenden();
      const j = await r.json().catch(() => ({ fehler: 'Dieser Server kann nicht drucken. Mit server.py starten.' }));
      if (!r.ok) {
        if (j.warte) sperre = Date.now() + j.warte * 1000;
        throw new Error(j.fehler || 'Fehler ' + r.status);
      }
      sperre = Date.now() + (j.pause != null ? j.pause : PAUSE) * 1000;   // Die Regie kann die Pause vorgeben
      A.toast(j.probe ? 'Probe-Druck gespeichert, nichts gedruckt' : j.platz > 1 ? 'In der Warteschlange, Platz ' + j.platz : 'Wird gedruckt');
    } catch (e) {
      console.error(e); A.toast('Druck: ' + e.message);
    } finally { busy = false; renderBtn(); }
  }
  btn.onclick = drucken;

  // ---------- Museumsmodus ----------
  const hint = document.createElement('div');
  hint.className = 'mus-hint mono mute'; hint.textContent = 'Zum Ausprobieren: Bausteine ziehen, Regler bewegen';
  $('.top .nav').after(hint);

  function anwenden() {
    if (M.on) root.dataset.museum = '1'; else delete root.dataset.museum;
    A.renderPalette();
  }
  function an() {
    M.on = true; M.start = A.board(); save(); anwenden();
    A.go('baukasten'); touched = false;
    if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
    A.toast('Museumsmodus an. Verlassen: Schriftzug 5 Sekunden gedrückt halten');
  }
  function aus() {
    M.on = false; const b = M.start; M.start = null; save(); anwenden();
    if (b) A.setBoard(b);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    A.toast('Museumsmodus aus');
  }
  function reset() {
    if (!M.on || !M.start) return false;
    A.setBoard(M.start); touched = false; return true;
  }

  // Bedienung merken, nach IDLE_MIN Minuten ohne Bedienung zurück zum Start
  ['pointerdown', 'keydown', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { last = Date.now(); touched = true; }, { capture: true, passive: true }));
  window.addEventListener('pointermove', () => { last = Date.now(); }, { capture: true, passive: true });
  setInterval(() => { if (M.on && touched && Date.now() - last > IDLE_MIN * 60000) reset(); }, 5000);

  // Besucher kommen nicht aus dem Baukasten heraus
  document.addEventListener('click', (e) => { if (M.on && e.target.closest('a[href]')) e.preventDefault(); }, true);
  document.addEventListener('contextmenu', (e) => { if (M.on) e.preventDefault(); });

  // Verlassen: Schriftzug gedrückt halten
  const brand = $('.brand'); let halt = 0;
  brand.addEventListener('pointerdown', () => { if (M.on && !verwaltet) halt = setTimeout(aus, HALTEN_MS); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => brand.addEventListener(ev, () => clearTimeout(halt)));

  // ---------- Einstellungen ----------
  function settingsHTML() {
    if (verwaltet) return '<div class="set-note mono mute">Museumsmodus und Live-Druck stellt die Regie auf dem Mac mini ein.</div>';
    const namen = srv ? srv.drucker : [], akt = M.drucker || (srv && srv.standard) || '';
    const note = !srv ? 'Drucker werden gesucht …'
      : srv.fehlt ? 'Dieser Server kann nicht drucken. Mit „Tool Pool starten“ oder server.py öffnen.'
      : !srv.erlaubt ? 'Der Server erlaubt Drucken übers Netz nicht. Dort mit --drucken starten.'
      : !namen.length ? 'Am Server ist kein Drucker eingerichtet.'
      : srv.probe ? 'Probelauf: Es geht nichts an den Drucker.' : '';
    return `<label class="set-row"><input type="checkbox" id="setMuseum"${M.on ? ' checked' : ''}>
        <span><b>Museumsmodus</b><span class="mono mute">Nur der Baukasten im Vollbild. Das aktuelle Board ist der Startzustand, nach ${IDLE_MIN} Minuten ohne Bedienung geht es dorthin zurück. Verlassen: Schriftzug 5 Sekunden gedrückt halten.</span></span></label>
      <label class="set-row"><input type="checkbox" id="setLive"${M.live ? ' checked' : ''}>
        <span><b>Live-Druck</b><span class="mono mute">Knopf „Jetzt drucken“ im Baukasten: schickt das Plakat ohne Dialog an den Drucker, höchstens alle ${PAUSE} Sekunden.</span></span></label>
      ${M.live ? `<div class="set-sel"><select class="line-select" id="setDrucker">${namen.map((n) => `<option${n === akt ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <select class="line-select" id="setFormat">${Object.keys(PAPIER).map((k) => `<option${k === M.format ? ' selected' : ''}>${k}</option>`).join('')}</select></div>
      ${note ? `<div class="set-note mono mute">${esc(note)}</div>` : ''}` : ''}`;
  }
  async function settingsOpened() {
    if (srv) return;
    try {
      const r = await fetch('/api/drucker');
      srv = r.ok ? await r.json() : { drucker: [], fehlt: true };
    } catch (e) { srv = { drucker: [], fehlt: true }; }
    if (!$('#setPop').hidden) A.renderSettings();
  }
  function settingsChange(e) {
    const t = e.target;
    if (t.id === 'setMuseum') { if (t.checked) { $('#setPop').hidden = true; an(); } else aus(); }
    if (t.id === 'setLive') {
      M.live = t.checked; save(); renderBtn();
      if (M.live && !srv) settingsOpened();
      A.renderSettings();
    }
    if (t.id === 'setDrucker') { M.drucker = t.value; save(); }
    if (t.id === 'setFormat') { M.format = t.value; save(); }
  }

  // Von der Regie (js/station.js): Einstellungen kommen vom Mac mini
  function setze(a) {
    verwaltet = true;
    if (!!a.museum !== M.on) { if (a.museum) an(); else aus(); }
    if (M.live !== !!a.live || M.drucker !== a.drucker || M.format !== a.format) {
      M.live = !!a.live; M.drucker = a.drucker; M.format = a.format; save(); renderBtn();
    }
  }

  TP.museum = { settingsHTML, settingsOpened, settingsChange, reset, drucken, setze, state: M };

  // Start: war der Modus an, wieder mit dem Startzustand beginnen
  anwenden(); renderBtn();
  if (M.on) { A.go('baukasten'); if (M.start) A.setBoard(M.start); }
})();
