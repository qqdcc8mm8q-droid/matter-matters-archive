/* Tool Pool – Regie: holt jede Sekunde den Zustand vom Server und schickt Änderungen zurück. */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HILFE = {
    aus: 'Die Regie schaltet nicht. Der ATEM bleibt, wie er ist.',
    manuell: 'Bei einer Station auf „Auf den Bildschirm“ klicken.',
    reihe: 'Die verbundenen Stationen nacheinander.',
    zufall: 'Zufällig unter den verbundenen Stationen.',
    aktivitaet: 'Stationen, die gerade jemand bedient, kommen zuerst. Sonst zufällig.',
  };
  const LANGSAM_MS = 33;
  let letzter = null, kartenIds = '', druckerGeladen = false, fehlerBis = 0;

  function fehler(t) { $('#rgFehler').textContent = t || ''; fehlerBis = t ? Date.now() + 6000 : 0; }

  async function post(pfad, d) {
    try {
      const r = await fetch('/api/regie/' + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      const j = await r.json();
      if (!r.ok) return fehler(j.fehler);
      fehler(''); zeigen(j);
    } catch (e) { fehler('Server nicht erreichbar'); }
  }
  const setzen = (pfad, wert) => { const [a, b] = pfad.split('.'); post('setzen', { [a]: { [b]: wert } }); };

  function bedienText(s) {
    if (!s.online) return 'nicht verbunden';
    if (s.ruhe === null) return 'noch nicht bedient';
    if (s.ruhe < 5) return 'wird gerade bedient';
    return s.ruhe < 120 ? 'bedient vor ' + s.ruhe + ' s' : 'bedient vor ' + Math.round(s.ruhe / 60) + ' min';
  }

  function karten(st) {
    const ids = st.stationen.map((s) => s.id).join();
    if (ids === kartenIds) return;
    kartenIds = ids;
    $('#rgStationen').innerHTML = st.stationen.map((s) => `
      <article class="rg-card" data-id="${s.id}">
        <div class="rg-kopf"><i class="rg-punkt"></i><input data-name aria-label="Name der Station" placeholder="Station ${s.id}"><span class="rg-air" hidden>AUF SENDUNG</span></div>
        <div class="rg-bild"></div>
        <div class="rg-info mono mute"><span data-bedient></span><span data-last></span></div>
        <label class="rg-z"><span>ATEM-Eingang</span><input type="number" min="1" max="8" data-eingang></label>
        <div class="rg-reihe"><button class="rg-k" data-schnitt>Auf den Bildschirm</button><button class="rg-k" data-cmd="reset">Reset</button><button class="rg-k" data-cmd="neuladen">Neu laden</button><button class="rg-k" data-cmd="zeigen" title="Zeigt kurz die Nummer auf dem Laptop">Finden</button></div>
      </article>`).join('');
  }

  function feld(el, wert) {
    if (document.activeElement === el) return;
    if (el.type === 'checkbox') el.checked = !!wert; else if (el.value !== String(wert)) el.value = wert;
  }

  function stationURL(st, id) {
    const a = st.adressen[st.adressen.length - 1] || location.origin + '/';
    return a + '?station=' + id;
  }

  function zeigen(st) {
    letzter = st;
    karten(st);
    st.stationen.forEach((s) => {
      const c = $(`.rg-card[data-id="${s.id}"]`);
      c.classList.toggle('on', s.online); c.classList.toggle('off', !s.online); c.classList.toggle('air', s.auf_monitor);
      $('.rg-air', c).hidden = !s.auf_monitor;
      feld($('[data-name]', c), s.name); feld($('[data-eingang]', c), s.eingang);
      $('[data-bedient]', c).textContent = bedienText(s);
      const l = $('[data-last]', c);
      l.textContent = s.online ? s.ms + ' ms · ' + s.fps + ' B/s' : '';
      l.classList.toggle('warn', s.online && s.ms > LANGSAM_MS);
      const b = $('.rg-bild', c);
      if (s.online && s.bild) {
        let im = $('img', b);
        if (!im) { b.innerHTML = '<img alt="Plakat dieser Station">'; im = $('img', b); }
        if (im.getAttribute('src') !== s.bild) im.src = s.bild;
      } else if (!s.online) {
        const t = 'Auf dem Laptop öffnen: ' + stationURL(st, s.id);
        if (b.textContent !== t) b.innerHTML = '<div class="mono mute">' + esc(t) + '</div>';
      }
    });
    const cfg = st.cfg;
    $$('[data-p]').forEach((el) => { const [a, k] = el.dataset.p.split('.'); if (el.id !== 'aDrucker') feld(el, cfg[a][k]); });
    const seg = (sel, wert) => $$(sel + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === wert));
    seg('#mModus', cfg.monitor.modus); seg('#lSzene', cfg.licht.szene); seg('#aStufe', cfg.ausstellung.leistung);
    $('#mHilfe').textContent = HILFE[cfg.monitor.modus];
    feld($('#mIp'), st.atem.ip);
    const auf = st.stationen.find((s) => s.auf_monitor);
    $('#mStatus').textContent = st.atem.fehler ? st.atem.fehler
      : !st.atem.verbunden ? 'ATEM nicht verbunden'
      : (st.atem.modell || 'ATEM') + (auf ? ' · Station ' + auf.id : st.atem.programm ? ' · Eingang ' + st.atem.programm : '')
        + (['reihe', 'zufall', 'aktivitaet'].includes(cfg.monitor.modus) ? ' · nächster in ' + st.naechster + ' s' : '');
    $('#lStatus').textContent = st.licht.fehler || (cfg.licht.ziel ? st.licht.pakete + ' Pakete gesendet' : 'keine Ziel-Adresse');
    $('#lJetzt').style.background = 'rgb(' + st.licht.rgb.join(',') + ')';
    $('#aStatus').textContent = st.stationen.filter((s) => s.online).length + ' verbunden · ' + st.drucke + ' gedruckt';
    $('#rgAdresse').textContent = st.adressen.join('  ·  ');
    if (st.monitor_fehler && Date.now() > fehlerBis) $('#rgFehler').textContent = st.monitor_fehler;
    else if (Date.now() > fehlerBis) $('#rgFehler').textContent = '';
    if (!druckerGeladen) ladeDrucker(cfg.ausstellung.drucker);
    else feld($('#aDrucker'), cfg.ausstellung.drucker);
  }

  async function ladeDrucker(akt) {
    druckerGeladen = true;
    try {
      const d = await (await fetch('/api/drucker')).json();
      $('#aDrucker').innerHTML = `<option value="">Standard (${esc(d.standard || 'keiner')})</option>` + d.drucker.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      $('#aDrucker').value = akt;
    } catch (e) { druckerGeladen = false; }
  }

  async function holen() {
    try {
      const r = await fetch('/api/regie/status');
      if (!r.ok) { const j = await r.json().catch(() => ({})); return fehler(j.fehler || 'Fehler ' + r.status); }
      zeigen(await r.json());
    } catch (e) { fehler('Server nicht erreichbar'); }
  }

  // ---------- Bedienung ----------
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.p) {
      const w = t.type === 'checkbox' ? t.checked : 'n' in t.dataset ? +t.value : t.value;
      return setzen(t.dataset.p, w);
    }
    const c = t.closest('.rg-card');
    if (!c) return;
    const id = +c.dataset.id;
    if ('name' in t.dataset) post('setzen', { name: { id, name: t.value } });
    if ('eingang' in t.dataset) post('setzen', { eingang: { id, eingang: +t.value } });
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const c = b.closest('.rg-card');
    if (c && 'schnitt' in b.dataset) return post('schnitt', { station: +c.dataset.id });
    if (c && b.dataset.cmd) return post('befehl', { ziel: +c.dataset.id, cmd: b.dataset.cmd });
    if (b.dataset.alle) return post('befehl', { ziel: 'alle', cmd: b.dataset.alle });
    if (b.id === 'mVerbinden') return post('atem', { ip: $('#mIp').value });
    const seg = b.closest('.rg-seg');
    if (seg && seg.id === 'mModus') setzen('monitor.modus', b.dataset.v);
    if (seg && seg.id === 'lSzene') setzen('licht.szene', b.dataset.v);
    if (seg && seg.id === 'aStufe') setzen('ausstellung.leistung', b.dataset.v);
  });

  holen();
  setInterval(holen, 1000);
})();
