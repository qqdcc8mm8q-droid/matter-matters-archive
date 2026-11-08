/* Tool Pool – Oberfläche */
(function () {
  const TP = window.TP;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('on'), 2200);
  }

  const FORMATS = { A: { l: 'A hoch', w: 420, h: 594 }, AQ: { l: 'A quer', w: 594, h: 420 }, Q: { l: 'Quadrat', w: 500, h: 500 }, S: { l: 'Story 9:16', w: 360, h: 640 } };
  const P = 112, PAD = 56, TAB = 9;

  // ======================================================
  //  Zustand
  // ======================================================
  function piece(type, c, r, p) { return { id: uid(), type, c, r, p: Object.assign(TP.defaults(type), p || {}) }; }
  function demo() {
    return {
      format: 'A', mix: 'normal', paper: TP.PAPER, sel: null,
      // Text-Kette oben: die Effekte verändern nur den Text.
      // Unten der Hintergrund. „Mischen“ legt B (Text) über A (Hintergrund).
      pieces: [
        piece('text', 1, 0, { text: 'TOOL POOL', groesse: 62 }),
        piece('welle', 2, 0, { amp: 10, freq: 2 }),
        piece('halftone', 3, 0, { raster: 5, tinte: '#151515' }),
        piece('verlauf', 1, 1, {}),
        piece('streifen', 2, 1, { form: 'kreis', linien: 34, welle: 8, fuellen: false, farbe: '#f4f1ec', mix: 'normal' }),
        piece('mischen', 3, 1, { modus: 'normal' }),
        piece('korn', 4, 1, { menge: 0.15 }),
        piece('output', 5, 1),
      ].map((pc) => (pc.type === 'streifen' ? Object.assign(pc, { src: 'auto' }) : pc)),
    };
  }
  let S = store.get('toolpool.state2', null);
  if (!S || !Array.isArray(S.pieces)) S = demo();
  S.pieces = S.pieces.filter((pc) => TP.BLOCKS[pc.type]);
  // Boards ohne Output bekommen einen, hinter dem ersten offenen Ende
  if (S.pieces.length && !TP.output(S.pieces)) {
    const end = TP.unused(S.pieces)[0] || S.pieces[S.pieces.length - 1];
    let c = end.c + 1;
    while (S.pieces.some((q) => q.c === c && q.r === end.r)) c++;
    S.pieces.push(Object.assign(piece('output', c, end.r), { src: end.id }));
  }
  if (!FORMATS[S.format]) S.format = 'A';

  const env = { t: 0, s: 1, mouse: { x: 0.5, y: 0.5 }, images: {}, states: {} };
  let saveTm;
  function save() { clearTimeout(saveTm); saveTm = setTimeout(() => store.set('toolpool.state2', S), 250); }
  const find = (id) => S.pieces.find((pc) => pc.id === id);
  function occ() { const m = {}; S.pieces.forEach((pc) => (m[pc.c + ',' + pc.r] = pc)); return m; }

  // Bilder der „Bild“-Bausteine wiederherstellen
  S.pieces.forEach((pc) => { if (pc.type === 'bild') { const d = store.get('toolpool.img.' + pc.id, null); if (d) loadImg(d, (img) => { env.images[pc.id] = img; dirty = true; if (view === 'drucken' && PR.src === 'live') openPrint(); }); } });   // Bild kam nach dem Öffnen der Druckansicht: Vorschau neu
  function loadImg(src, cb) { const img = new Image(); img.onload = () => cb(img); img.src = src; }

  // ======================================================
  //  Navigation
  // ======================================================
  let view = 'baukasten';
  function go(v) {
    if (!$('#view-' + v) || document.documentElement.dataset.museum) v = 'baukasten';
    view = v;
    $$('.view').forEach((el) => el.classList.toggle('on', el.id === 'view-' + v));
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === v));
    if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
    if (v === 'archiv') renderArchiv();
    if (v === 'notizen') renderNotes();
    if (v === 'ranking') renderRanking();
    if (v === 'drucken') openPrint();
    if (v === 'vorstufe' && TP.vorstufe) TP.vorstufe.open();
    if (v === 'baukasten') dirty = true;
  }
  $('#nav').addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) go(a.dataset.view); });
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));

  // ======================================================
  //  Puzzleteile
  // ======================================================
  function shapePath(s, r) {
    const m = s / 2;
    return `M0 0H${m - r}A${r} ${r} 0 0 0 ${m + r} 0H${s}V${m - r}A${r} ${r} 0 0 1 ${s} ${m + r}V${s}H${m + r}A${r} ${r} 0 0 1 ${m - r} ${s}H0V${m + r}A${r} ${r} 0 0 0 0 ${m - r}Z`;
  }
  function fmt(q, v) {
    if (q.t === 'range') return q.step >= 1 ? String(Math.round(v)) : (+v).toFixed(2).replace(/0$/, '');
    if (q.t === 'bool') return v ? 'an' : 'aus';
    if (q.t === 'text') return '“' + v + '”';
    return String(v);
  }
  function summary(pc) {
    const d = TP.BLOCKS[pc.type], q = d.params.find((x) => x.t !== 'color');
    return q ? fmt(q, pc.p[q.k]) : '';
  }
  let thumbs = {};
  // Mini-Vorschau: in der Liste (an/aus) und in den Bausteinen der Arbeitsfläche (klein/groß/aus)
  const PV = Object.assign({ pal: false, ws: 'klein' }, store.get('toolpool.prev', {}));
  function pieceEl(pc, full) {
    const d = TP.BLOCKS[pc.type], cat = TP.CATS[d.cat], size = full ? P : 84, tab = full ? TAB : 7, box = size + tab + 6;
    const el = h('div', 'pc cat-' + d.cat + (full ? '' : ' small'));
    el.style.setProperty('--cb', `var(--cb-${d.cat}, inherit)`);
    el.style.width = el.style.height = size + 'px';
    if (pc.id) el.dataset.id = pc.id;
    el.dataset.type = pc.type;
    el.innerHTML =
      `<svg class="pc-shape" width="${box}" height="${box}" viewBox="-3 -3 ${box} ${box}"><path d="${shapePath(size, tab)}" style="fill:var(--c-${d.cat})"/></svg>` +
      `<div class="pc-body"><div class="pc-name">${esc(d.name)}</div><div class="pc-cat mono">${d.two ? '2 Eingänge' : esc(TP.FAMS[d.fam] || cat.name)}</div></div>`;
    if (full) {
      const tc = document.createElement('canvas');
      tc.width = tc.height = PV.ws === 'gross' ? 192 : 96; tc.className = 'pc-thumb';
      $('.pc-body', el).append(tc, h('div', 'pc-val mono', esc(summary(pc))));
      el.append(h('i', 'pc-out'));
      if (pc.id) thumbs[pc.id] = tc;
    }
    return el;
  }

  // ---------- Palette ----------
  // Zwei Filter: Technik (Vektor / Pixel / Shader) und Familie, dazu eine Suche
  let palTech = 'alle', palFam = 'alle', palQ = '';
  function chipRow(el, items, cur, set) {
    el.innerHTML = '';
    items.forEach(([k, l]) => { const b = h('button', cur === k ? 'on' : '', l); b.onclick = () => { set(k); renderPalette(); }; el.append(b); });
  }
  function renderPalette() {
    const all = Object.values(TP.BLOCKS);
    chipRow($('#palTech'), [['alle', 'Alle']].concat(Object.entries(TP.CATS).map(([k, v]) => [k, v.name])), palTech, (k) => { palTech = k; palFam = 'alle'; });
    const fams = [...new Set(all.filter((d) => palTech === 'alle' || d.cat === palTech).map((d) => d.fam))];
    chipRow($('#palFam'), [['alle', 'alle']].concat(Object.keys(TP.FAMS).filter((k) => fams.includes(k)).map((k) => [k, TP.FAMS[k].toLowerCase()])), palFam, (k) => (palFam = k));
    const q = palQ.toLowerCase();
    const list = $('#palList');
    list.innerHTML = '';
    palCache.forEach((img) => (img.copies = []));
    const shown = all.filter((d) => !(d.needsImage && document.documentElement.dataset.museum) && (palTech === 'alle' || d.cat === palTech) && (palFam === 'alle' || d.fam === palFam) &&
      (!q || (d.name + ' ' + (d.desc || '') + ' ' + d.tool + ' ' + TP.FAMS[d.fam]).toLowerCase().includes(q)));
    // eigene Bausteine zuerst, dann die playgrnd-Nachbauten
    [['', shown.filter((d) => !d.pg)], ['playgrnd.tools', shown.filter((d) => d.pg)]].forEach(([title, ds]) => {
      if (!ds.length) return;
      if (title) list.append(h('div', 'pal-group mono', title + ' · ' + ds.length));
      ds.forEach((d) => {
        const el = pieceEl({ type: d.id, p: TP.defaults(d.id) }, false);
        if (PV.pal && d.kind !== 'out') { const c = palThumb(d.id); if (c) { el.classList.add('has-thumb'); $('.pc-body', el).append(c); } }
        el.title = TP.CATS[d.cat].name + ' · ' + TP.FAMS[d.fam] + (d.desc ? '\n' + d.desc : '') + '\nPool: ' + d.tool;
        list.append(el);
      });
    });
    if (!shown.length) list.append(h('div', 'pal-group mono', 'nichts gefunden'));
  }
  $('#palSearch').addEventListener('input', (e) => { palQ = e.target.value; renderPalette(); });

  // Vorschaubilder für die Liste: einmal gerechnet, gestaffelt, damit die Seite nicht hängt.
  // Effekte bekommen ein Beispiel (Verlauf + „Aa“), Mischen bekommt beides als A und B.
  const palCache = new Map(), palQueue = [];
  function palThumb(type) {
    let img = palCache.get(type);
    if (!img) {
      img = document.createElement('canvas'); img.width = img.height = 120; img.className = 'pc-pthumb';
      palCache.set(type, img); palQueue.push(type); pumpPal();
    }
    const c = document.createElement('canvas'); c.width = c.height = 120; c.className = 'pc-pthumb';
    c.getContext('2d').drawImage(img, 0, 0); img.copies = (img.copies || []).concat(c);
    return c;
  }
  let palBusy = false;
  function pumpPal() {
    if (palBusy) return; palBusy = true;
    setTimeout(function step() {
      const t0 = performance.now();
      while (palQueue.length && performance.now() - t0 < 24) {
        const type = palQueue.shift(), img = palCache.get(type), d = TP.BLOCKS[type];
        const sample = [{ id: 'pv_v', type: 'verlauf', c: 0, r: 0, p: {}, src: null }, { id: 'pv_t', type: 'text', c: 1, r: 0, src: 'pv_v', p: { text: 'Aa', groesse: 230, zeilen: 1 } }];
        const node = { id: 'pv_x', type, c: 2, r: 0, p: TP.defaults(type) };
        if (d.kind === 'gen') node.src = null; else if (d.kind === 'mix') { node.src = 'pv_v'; node.src2 = 'pv_t'; } else node.src = 'pv_t';
        const pcs = d.kind === 'gen' ? [Object.assign(node, { c: 0 })] : sample.concat(node);
        try {
          const res = TP.evaluate(pcs, 120, 120, { t: 1.5, s: 120 / 420, mouse: { x: 0.5, y: 0.5 }, images: {}, states: {}, export: true }, 'pal');
          const x = img.getContext('2d'); x.fillStyle = S.paper || TP.PAPER; x.fillRect(0, 0, 120, 120); x.drawImage(res.out.pv_x, 0, 0);
          (img.copies || []).forEach((c) => { const cx = c.getContext('2d'); cx.clearRect(0, 0, 120, 120); cx.drawImage(img, 0, 0); });
        } catch (e) { console.warn('Vorschau', type, e); }
      }
      if (palQueue.length) setTimeout(step, 16); else palBusy = false;
    }, 30);
  }
  function applyPrev() {
    $('#palPrev').classList.toggle('on', PV.pal);
    $('#btnWsPrev').textContent = 'Vorschau: ' + { klein: 'klein', gross: 'groß', aus: 'aus' }[PV.ws];
    ws.classList.toggle('prev-aus', PV.ws === 'aus'); ws.classList.toggle('prev-gross', PV.ws === 'gross');
    $('#palette').classList.toggle('with-prev', PV.pal);
  }
  $('#palPrev').onclick = () => { PV.pal = !PV.pal; store.set('toolpool.prev', PV); applyPrev(); renderPalette(); };

  // ---------- Arbeitsfläche ----------
  const ws = $('#ws'), inner = $('#wsInner');
  let slot;
  function renderWS() {
    thumbs = {};
    inner.innerHTML = '';
    const at = occ(), out = TP.output(S.pieces), live = TP.upstream(S.pieces);
    const sel = find(S.sel), selIn = sel ? TP.inputs(sel, S.pieces, at) : [];
    let mc = 0, mr = 0;
    S.pieces.forEach((pc) => {
      mc = Math.max(mc, pc.c); mr = Math.max(mr, pc.r);
      const el = pieceEl(pc, true);
      el.style.left = PAD + pc.c * P + 'px';
      el.style.top = PAD + pc.r * P + 'px';
      if (selSet.has(pc.id)) el.classList.add('sel');
      if (pc.id === S.sel && selSet.size > 1) el.classList.add('primary');
      if (pc === out) { el.classList.add('sink'); el.title = 'Output → Plakat'; }
      else if (live.has(pc.id)) el.classList.add('live');
      else { el.classList.add('off'); el.title = 'nicht mit dem Output verbunden – verändert das Plakat nicht'; }
      $('.pc-cat', el).textContent = inputLabel(pc, at);
      const k = selIn.indexOf(pc);
      if (k >= 0) { el.classList.add('src'); el.append(h('b', 'pc-badge mono', TP.BLOCKS[sel.type].kind === 'mix' ? (k ? 'B' : 'A') : 'Eingang')); }
      inner.append(el);
    });
    inner.style.width = PAD * 2 + (mc + 6) * P + 'px';
    inner.style.height = PAD * 2 + (mr + 5) * P + 'px';
    inner.style.minWidth = '100%'; inner.style.minHeight = '100%';
    slot = h('div', 'slot'); slot.style.width = slot.style.height = P + 'px';
    inner.append(slot);
    $('#wsHint').style.display = S.pieces.length ? 'none' : '';
  }

  // Kurzname für Anzeigen: „Riso“, bei Dopplungen „Riso 2“
  function label(pc) {
    const same = S.pieces.filter((q) => q.type === pc.type).sort((a, b) => a.r - b.r || a.c - b.c);
    return TP.BLOCKS[pc.type].name + (same.length > 1 ? ' ' + (same.indexOf(pc) + 1) : '');
  }
  function inputLabel(pc, at) {
    const d = TP.BLOCKS[pc.type], [a, b] = TP.inputs(pc, S.pieces, at);
    if (d.kind === 'mix') return 'A ' + (a ? label(a) : '–') + ' · B ' + (b ? label(b) : '–');
    if (a) return '← ' + label(a);
    return d.kind === 'gen' ? TP.FAMS[d.fam] || TP.CATS[d.cat].name : d.kind === 'out' ? 'nicht verbunden' : d.field ? 'eigenes Feld' : 'kein Eingang';
  }
  // Auswahl: S.sel ist der Baustein im Inspector, selSet alle markierten
  let selSet = new Set(S.sel ? [S.sel] : []);
  function select(id) { S.sel = id; selSet = new Set(id ? [id] : []); renderWS(); renderInsp(); save(); }
  function selectMany(ids, primary) {
    selSet = new Set(ids);
    S.sel = primary && selSet.has(primary) ? primary : ids[ids.length - 1] || null;
    renderWS(); renderInsp(); save();
  }
  function toggleSel(id) {
    if (selSet.has(id)) selSet.delete(id); else selSet.add(id);
    S.sel = selSet.has(id) ? id : [...selSet].pop() || null;
    renderWS(); renderInsp(); save();
  }
  const selected = () => S.pieces.filter((q) => selSet.has(q.id));
  // Verweise auf gelöschte Teile auf „automatisch“ zurücksetzen
  function unref(id) { S.pieces.forEach((q) => { if (q.src === id) delete q.src; if (q.src2 === id) delete q.src2; }); }
  function commit() { save(); renderWS(); renderInsp(); dirty = true; }

  // Platzieren mit Einschieben: belegtes Feld schiebt die Reihe nach rechts
  function place(pc, c, r) {
    if (c < 0) { S.pieces.forEach((q) => (q.c -= c)); c = 0; }
    if (r < 0) { S.pieces.forEach((q) => (q.r -= r)); r = 0; }
    const at = occ();
    if (at[c + ',' + r]) {
      let k = c; const run = [];
      while (at[k + ',' + r]) { run.push(at[k + ',' + r]); k++; }
      run.forEach((q) => q.c++);
    }
    pc.c = c; pc.r = r;
    S.pieces.push(pc);
    S.sel = pc.id; selSet = new Set([pc.id]);
  }
  // Es gibt nur einen Output – ein zweiter wählt den vorhandenen aus
  function outputExists(type) {
    const o = type === 'output' && TP.output(S.pieces);
    if (o) { toast('Es gibt schon einen Output'); select(o.id); }
    return !!o;
  }
  // Neuer Node kommt immer direkt vor den Output: Output rückt nach rechts,
  // der Node übernimmt den bisherigen Eingang des Outputs und speist ihn.
  function insertBeforeOutput(pc, o) {
    const [inp] = TP.inputs(o, S.pieces);
    place(pc, o.c, o.r);
    if (inp) pc.src = inp.id;
    o.src = pc.id;
  }
  function addFromPalette(type) {
    if (outputExists(type)) return;
    const pc = piece(type, 0, 0), o = TP.output(S.pieces);
    if (o && type !== 'output') insertBeforeOutput(pc, o);
    else { const last = find(S.sel) || S.pieces[S.pieces.length - 1]; if (last) place(pc, last.c + 1, last.r); else place(pc, 1, 1); }
    commit();
  }

  // ---------- Ziehen, Auswählen, Rechtsklick ----------
  let drag = null, pick = null, marquee = null, pan = null, clip = null, lastPt = null;
  function startPick(pc, key) {
    pick = { pc, key };
    ws.classList.add('picking');
    toast('Klick auf den Baustein, der als Eingang dient · Esc = abbrechen');
  }
  function endPick() { pick = null; ws.classList.remove('picking'); }
  const innerPt = (e) => { const r = inner.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const cellAt = (x, y) => [Math.floor((x - PAD) / P), Math.floor((y - PAD) / P)];

  ws.addEventListener('contextmenu', (e) => e.preventDefault());
  inner.addEventListener('pointerdown', (e) => {
    closeMenu();
    const el = e.target.closest('.pc');
    // Rechte oder mittlere Taste: Fläche verschieben (ohne Bewegung = Menü)
    if (e.button === 2 || e.button === 1) {
      e.preventDefault();
      pan = { sx: e.clientX, sy: e.clientY, sl: ws.scrollLeft, st: ws.scrollTop, el, e, right: e.button === 2 };
      return;
    }
    if (e.button !== 0) return;
    if (pick) {
      e.preventDefault();
      if (el && el.dataset.id !== pick.pc.id) { pick.pc[pick.key] = el.dataset.id; S.sel = pick.pc.id; selSet = new Set([S.sel]); }
      endPick(); commit();
      return;
    }
    e.preventDefault();
    if (!el) {
      const [x, y] = innerPt(e);
      marquee = { x0: x, y0: y, add: e.shiftKey || e.metaKey || e.ctrlKey, base: new Set(selSet), box: null };
      return;
    }
    const id = el.dataset.id;
    if (e.shiftKey || e.metaKey || e.ctrlKey) { toggleSel(id); return; }
    const r = el.getBoundingClientRect();
    drag = { mode: 'move', anchor: find(id), sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, wasSel: selSet.has(id) };
  });
  $('#palList').addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('.pc');
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    drag = { mode: 'new', type: el.dataset.type, sx: e.clientX, sy: e.clientY, ox: ((e.clientX - r.left) / r.width) * P, oy: ((e.clientY - r.top) / r.height) * P };
  });

  function startDrag() {
    drag.started = true;
    if (drag.mode === 'move') {
      if (!drag.wasSel) { S.sel = drag.anchor.id; selSet = new Set([drag.anchor.id]); }
      drag.group = selected();
      S.pieces = S.pieces.filter((q) => !selSet.has(q.id));
      drag.orig = drag.group.map((q) => [q.c, q.r]);
      renderWS(); dirty = true;
    } else {
      if (outputExists(drag.type)) { drag = null; return false; }
      drag.anchor = piece(drag.type, 0, 0);
      drag.group = [drag.anchor];
    }
    // Geisterbild der ganzen Gruppe, relativ zum angefassten Teil
    const g = h('div', 'ghost-group');
    drag.group.forEach((q) => {
      const el = pieceEl(q, true);
      delete thumbs[q.id];
      el.style.left = (q.c - drag.anchor.c) * P + 'px';
      el.style.top = (q.r - drag.anchor.r) * P + 'px';
      g.append(el);
    });
    drag.ghost = g;
    document.body.append(g);
    document.body.classList.add('dragging');
    drag.slots = drag.group.map(() => { const sl = h('div', 'slot'); sl.style.width = sl.style.height = P + 'px'; inner.append(sl); return sl; });
    return true;
  }
  function dragTarget(e) {
    drag.ghost.style.left = e.clientX - drag.ox + 'px';
    drag.ghost.style.top = e.clientY - drag.oy + 'px';
    const pr = $('#palette').getBoundingClientRect(), overPal = e.clientX < pr.right;
    $('#palette').classList.toggle('trash', overPal);
    drag.cell = null;
    drag.slots.forEach((sl) => (sl.style.display = 'none'));
    if (overPal) return;
    const ir = inner.getBoundingClientRect();
    const c = Math.round((e.clientX - drag.ox - ir.left - PAD) / P), r = Math.round((e.clientY - drag.oy - ir.top - PAD) / P);
    drag.cell = [c, r];
    const at = occ(), single = drag.group.length === 1;
    let blocked = false;
    drag.group.forEach((q, i) => {
      const qc = c + q.c - drag.anchor.c, qr = r + q.r - drag.anchor.r, sl = drag.slots[i];
      const hit = !!at[qc + ',' + qr];
      blocked = blocked || hit;
      sl.style.display = 'block';
      sl.style.left = PAD + qc * P + 'px'; sl.style.top = PAD + qr * P + 'px';
      sl.classList.toggle('push', single && hit);
      sl.classList.toggle('blocked', !single && hit);
    });
    drag.blocked = !single && blocked;
  }
  // Am Rand der Fläche automatisch scrollen
  function autoScroll() {
    if (!drag || !drag.started || !lastPt) return;
    const r = ws.getBoundingClientRect(), m = 48, sp = 14;
    let dx = 0, dy = 0;
    if (lastPt.clientX > r.left && lastPt.clientX < r.left + m) dx = -sp;
    if (lastPt.clientX > r.right - m && lastPt.clientX < r.right) dx = sp;
    if (lastPt.clientY > r.top && lastPt.clientY < r.top + m) dy = -sp;
    if (lastPt.clientY > r.bottom - m && lastPt.clientY < r.bottom) dy = sp;
    if (dx || dy) { ws.scrollBy(dx, dy); dragTarget(lastPt); }
    requestAnimationFrame(autoScroll);
  }

  window.addEventListener('pointermove', (e) => {
    if (pan) {
      const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
      if (!pan.moved && Math.hypot(dx, dy) < 4) return;
      pan.moved = true;
      ws.classList.add('panning');
      ws.scrollLeft = pan.sl - dx; ws.scrollTop = pan.st - dy;
      return;
    }
    if (marquee) {
      const [x, y] = innerPt(e);
      if (!marquee.box) {
        if (Math.hypot(x - marquee.x0, y - marquee.y0) < 4) return;
        marquee.box = h('div', 'marquee'); inner.append(marquee.box);
      }
      const l = Math.min(x, marquee.x0), t = Math.min(y, marquee.y0), w = Math.abs(x - marquee.x0), hh = Math.abs(y - marquee.y0);
      Object.assign(marquee.box.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: hh + 'px' });
      const ids = new Set(marquee.add ? marquee.base : []);
      S.pieces.forEach((q) => {
        const qx = PAD + q.c * P, qy = PAD + q.r * P;
        if (qx < l + w && qx + P > l && qy < t + hh && qy + P > t) ids.add(q.id);
      });
      selSet = ids;
      $$('.pc[data-id]', inner).forEach((el) => el.classList.toggle('sel', ids.has(el.dataset.id)));
      return;
    }
    if (!drag) return;
    lastPt = e;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
      if (!startDrag()) return;
      requestAnimationFrame(autoScroll);
    }
    dragTarget(e);
  });

  window.addEventListener('pointerup', (e) => {
    if (pan) {
      const p = pan; pan = null;
      ws.classList.remove('panning');
      if (!p.moved && p.right) openMenu(p.e, p.el);
      return;
    }
    if (marquee) {
      const m = marquee; marquee = null;
      if (m.box) { m.box.remove(); selectMany([...selSet]); }
      else if (!m.add) select(null);
      return;
    }
    if (!drag) return;
    const d = drag; drag = null; lastPt = null;
    if (!d.started) {
      if (d.mode === 'move') select(d.anchor.id); else addFromPalette(d.type);
      return;
    }
    d.ghost.remove();
    d.slots.forEach((sl) => sl.remove());
    document.body.classList.remove('dragging');
    $('#palette').classList.remove('trash');
    if (!d.cell) {
      d.group.forEach((q) => { unref(q.id); delete env.states[q.id]; delete env.images[q.id]; if (!document.documentElement.dataset.museum) store.del('toolpool.img.' + q.id); });
      S.sel = null; selSet = new Set();
      if (d.mode === 'move') toast(d.group.length > 1 ? d.group.length + ' Bausteine gelöscht' : TP.BLOCKS[d.anchor.type].name + ' gelöscht');
    } else if (d.group.length === 1) {
      place(d.anchor, d.cell[0], d.cell[1]);
    } else {
      if (d.blocked) {
        d.group.forEach((q, i) => { q.c = d.orig[i][0]; q.r = d.orig[i][1]; });
        toast('Dort ist schon belegt');
      } else {
        const dc = d.cell[0] - d.anchor.c, dr = d.cell[1] - d.anchor.r;
        d.group.forEach((q) => { q.c += dc; q.r += dr; });
      }
      S.pieces.push(...d.group);
      normalize();
    }
    commit();
  });

  // Negative Rasterfelder vermeiden: alles nach rechts/unten schieben
  function normalize() {
    const mc = Math.min(0, ...S.pieces.map((q) => q.c)), mr = Math.min(0, ...S.pieces.map((q) => q.r));
    if (mc || mr) S.pieces.forEach((q) => { q.c -= mc; q.r -= mr; });
  }
  // Gruppe verschieben, wenn alle Zielfelder frei sind
  function moveSel(dc, dr) {
    const g = selected();
    if (!g.length) return;
    const rest = S.pieces.filter((q) => !selSet.has(q.id)), taken = new Set(rest.map((q) => q.c + ',' + q.r));
    if (g.some((q) => taken.has(q.c + dc + ',' + (q.r + dr)))) {
      if (g.length === 1) { S.pieces = rest; place(g[0], g[0].c + dc, g[0].r + dr); normalize(); commit(); }
      else toast('Dort ist schon belegt');
      return;
    }
    g.forEach((q) => { q.c += dc; q.r += dr; });
    normalize(); commit();
  }
  function removeMany(ids) {
    ids = new Set(ids);
    S.pieces = S.pieces.filter((q) => !ids.has(q.id));
    ids.forEach((id) => { unref(id); store.del('toolpool.img.' + id); delete env.states[id]; });
    if (ids.has(S.sel)) S.sel = null;
    selSet = new Set();
    commit();
  }
  function removePiece(id) { removeMany([id]); }
  // Kopien einer Gruppe: neue IDs, Bezüge innerhalb der Gruppe bleiben erhalten
  function cloneGroup(g) {
    const map = {};
    const out = g.map((q) => { const c = JSON.parse(JSON.stringify(q)); c.id = uid(); map[q.id] = c.id; return c; });
    out.forEach((c) => ['src', 'src2'].forEach((k) => { if (c[k] && c[k] !== 'auto' && map[c[k]]) c[k] = map[c[k]]; }));
    return out.filter((c) => c.type !== 'output' || !TP.output(S.pieces));
  }
  // Gruppe an die nächste freie Stelle unterhalb setzen
  function dropFree(g, at) {
    if (!g.length) return;
    const taken = new Set(S.pieces.map((q) => q.c + ',' + q.r));
    const c0 = Math.min(...g.map((q) => q.c)), r0 = Math.min(...g.map((q) => q.r));
    let [tc, tr] = at || [c0, Math.max(...g.map((q) => q.r)) + 1];
    for (let k = 0; k < 60; k++, tr++) {
      if (g.every((q) => !taken.has(tc + q.c - c0 + ',' + (tr + q.r - r0)))) break;
    }
    g.forEach((q) => { q.c = tc + q.c - c0; q.r = tr + q.r - r0; });
    S.pieces.push(...g);
    normalize();
    selectMany(g.map((q) => q.id));
    dirty = true;
  }
  function duplicateSel() { const g = selected(); if (g.length) dropFree(cloneGroup(g)); }
  function copySel() { const g = selected(); if (g.length) { clip = JSON.parse(JSON.stringify(g)); toast(g.length + ' kopiert'); } }
  function pasteClip(at) { if (clip) dropFree(cloneGroup(clip), at); }
  function connectOutput(pc) {
    let o = TP.output(S.pieces);
    if (!o) { o = piece('output', 0, 0); place(o, pc.c + 1, pc.r); }
    o.src = pc.id; S.sel = pc.id; selSet = new Set([pc.id]);
    commit();
  }

  // ---------- Rechtsklick-Menü ----------
  const menu = h('div', 'ctx');
  document.body.append(menu);
  function closeMenu() { menu.classList.remove('on'); }
  document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && e.target.closest && !e.target.closest('#wsInner')) closeMenu(); });
  function openMenu(e, el) {
    const items = [];
    const it = (l, f, k) => items.push({ l, f, k });
    const sep = () => items.push(null);
    if (el) {
      const id = el.dataset.id;
      if (!selSet.has(id)) { S.sel = id; selSet = new Set([id]); renderWS(); renderInsp(); }
      const g = selected(), pc = find(id);
      if (g.length > 1) {
        it(g.length + ' Bausteine duplizieren', duplicateSel, '⌘D');
        it('Kopieren', copySel, '⌘C');
        sep();
        it('Löschen', () => removeMany(g.map((q) => q.id)), '⌫');
      } else {
        const d = TP.BLOCKS[pc.type];
        if (d.kind !== 'out') it('Mit Output verbinden', () => connectOutput(pc));
        it(d.kind === 'mix' ? 'Eingang A wählen …' : 'Eingang wählen …', () => startPick(pc, 'src'));
        if (d.kind === 'mix') it('Eingang B wählen …', () => startPick(pc, 'src2'));
        sep();
        if (d.kind !== 'out') { it('Duplizieren', duplicateSel, '⌘D'); it('Kopieren', copySel, '⌘C'); }
        if (d.params.length) { it('Würfeln', () => { randomize(pc, 0.6); commit(); }); it('Zurücksetzen', () => { pc.p = TP.defaults(pc.type); commit(); }); }
        sep();
        it('Löschen', () => removePiece(id), '⌫');
      }
    } else {
      const [x, y] = innerPt(e), cell = cellAt(x, y), free = !occ()[cell[0] + ',' + cell[1]];
      items.push({ head: 'Hier hinzufügen' });
      Object.values(TP.BLOCKS).forEach((d) => {
        if (d.kind === 'out' && TP.output(S.pieces)) return;
        items.push({ l: d.name, dot: d.cat, f: () => { const pc = piece(d.id, 0, 0); if (free) { pc.c = cell[0]; pc.r = cell[1]; S.pieces.push(pc); normalize(); select(pc.id); dirty = true; } else place(pc, cell[0], cell[1]); commit(); } });
      });
      sep();
      if (clip) it('Einfügen', () => pasteClip(cell), '⌘V');
      it('Alles auswählen', () => selectMany(S.pieces.map((q) => q.id)), '⌘A');
    }
    menu.innerHTML = '';
    items.forEach((x) => {
      if (!x) { menu.append(h('div', 'ctx-sep')); return; }
      if (x.head) { menu.append(h('div', 'ctx-head mono', esc(x.head))); return; }
      const b = h('button', 'ctx-item', (x.dot ? `<i style="background:var(--c-${x.dot})"></i>` : '') + `<span>${esc(x.l)}</span>` + (x.k ? `<span class="mono mute">${x.k}</span>` : ''));
      b.onclick = () => { closeMenu(); x.f(); };
      menu.append(b);
    });
    menu.classList.add('on');
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(e.clientX, innerWidth - mw - 8) + 'px';
    menu.style.top = Math.max(8, Math.min(e.clientY, innerHeight - mh - 8)) + 'px';
  }

  // ---------- Tastatur ----------
  window.addEventListener('keydown', (e) => {
    if (view !== 'baukasten' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if ((e.key === 'Delete' || e.key === 'Backspace') && selSet.size) { e.preventDefault(); removeMany([...selSet]); return; }
    if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
    if (e.key === 'Escape') { closeMenu(); if (pick) { endPick(); return; } setBig(false); select(null); return; }
    if (mod && k === 'a') { e.preventDefault(); selectMany(S.pieces.map((q) => q.id)); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (mod && k === 'c') { copySel(); return; }
    if (mod && k === 'v') { e.preventDefault(); pasteClip(); return; }
    if (e.key.startsWith('Arrow') && selSet.size) {
      e.preventDefault();
      moveSel({ ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0, { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0);
    }
  });

  // ======================================================
  //  Inspector
  // ======================================================
  const insp = $('#insp');
  function paramRow(q, val, onChange) {
    const row = h('div', 'prow'), lb = h('span', 'mono lbl', esc(q.l));
    row.append(lb);
    if (q.d !== undefined) { lb.title = 'Doppelklick = Standardwert'; lb.ondblclick = () => { onChange(q.d); row.replaceWith(paramRow(q, q.d, onChange)); }; }
    if (q.t === 'range') {
      const inp = h('input'); inp.type = 'range'; inp.min = q.min; inp.max = q.max; inp.step = q.step; inp.value = val;
      const v = h('input', 'mono v'); v.type = 'text'; v.inputMode = 'decimal'; v.value = fmt(q, val);
      inp.oninput = () => { v.value = fmt(q, +inp.value); onChange(+inp.value); };
      v.onfocus = () => v.select();
      v.onchange = () => {
        let x = parseFloat(v.value.replace(',', '.'));
        if (isNaN(x)) x = +inp.value;
        x = Math.min(q.max, Math.max(q.min, x));
        inp.value = x; v.value = fmt(q, x); onChange(x);
      };
      v.onkeydown = (e) => {
        if (e.key === 'Enter') v.blur();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const st = (e.shiftKey ? 10 : 1) * q.step * (e.key === 'ArrowUp' ? 1 : -1);
          const x = Math.min(q.max, Math.max(q.min, +inp.value + st));
          inp.value = x; v.value = fmt(q, x); onChange(x);
        }
      };
      row.append(inp, v);
    } else if (q.t === 'select') {
      row.classList.add('wide');
      if (q.opts.length <= 6) {
        const ch = h('div', 'chips mono');
        q.opts.forEach((o) => {
          const b = h('button', o === val ? 'on' : '', esc(o));
          b.onclick = () => { $$('button', ch).forEach((x) => x.classList.toggle('on', x === b)); onChange(o); };
          ch.append(b);
        });
        row.append(ch);
      } else {
        const s = h('select', 'line-select mono');
        q.opts.forEach((o) => s.append(new Option(o, o, false, o === val)));
        s.onchange = () => onChange(s.value);
        row.append(s);
      }
    } else if (q.t === 'color') {
      row.classList.add('wide');
      const inp = h('input'); inp.type = 'color'; inp.value = val;
      inp.oninput = () => onChange(inp.value);
      row.append(inp);
    } else if (q.t === 'text') {
      row.classList.add('wide');
      const inp = h('input', 'line-input'); inp.type = 'text'; inp.value = val;
      inp.oninput = () => onChange(inp.value);
      row.append(inp);
    } else if (q.t === 'bool') {
      row.classList.add('wide');
      const l = h('label', 'check'), inp = h('input'); inp.type = 'checkbox'; inp.checked = !!val;
      inp.onchange = () => onChange(inp.checked);
      l.append(inp); row.append(l);
    }
    return row;
  }
  function updateVal(pc) { const el = $(`.pc[data-id="${pc.id}"] .pc-val`, inner); if (el) el.textContent = summary(pc); }

  // Auswahl, worauf sich ein Baustein bezieht
  function ioRow(pc, key, title, autoHint) {
    const d = TP.BLOCKS[pc.type];
    const val = pc[key] === undefined ? (key === 'src' ? TP.srcDefault(pc) : 'auto') : pc[key];
    const [a, b] = TP.inputs(pc, S.pieces);
    const now = key === 'src' ? a : b;
    const row = h('div', 'prow wide io-row');
    row.append(h('span', 'mono lbl', esc(title)));
    const wrap = h('div', 'io-pick');
    const sel = h('select', 'line-select');
    sel.append(new Option('Nachbar' + (val === 'auto' ? (now ? ' → ' + label(now) : ' (keiner)') : ' (' + autoHint + ')'), 'auto', false, val === 'auto'));
    sel.append(new Option(d.kind === 'gen' ? 'nichts (leer)' : 'kein Eingang', '', false, !val));
    S.pieces.filter((q) => q !== pc).sort((x, y) => x.r - y.r || x.c - y.c).forEach((q) => sel.append(new Option(label(q), q.id, false, val === q.id)));
    sel.onchange = () => { pc[key] = sel.value === 'auto' ? 'auto' : sel.value || null; commit(); };
    const pb = h('button', 'link mono', '⌖ zeigen');
    pb.title = 'Baustein auf der Fläche anklicken';
    pb.onclick = () => startPick(pc, key);
    wrap.append(sel, pb);
    row.append(wrap);
    return row;
  }

  function renderInsp() {
    insp.innerHTML = '';
    const pc = find(S.sel);
    if (selSet.size > 1) {
      const g = selected();
      insp.append(h('h2', '', g.length + ' Bausteine'), h('div', 'mono sub', g.map(label).join(' · ')));
      const acts = h('div', 'acts mono');
      const mk = (l, f) => { const b = h('button', 'link', l); b.onclick = f; acts.append(b); };
      mk('duplizieren', duplicateSel); mk('kopieren', copySel); mk('würfeln', () => { g.forEach((q) => randomize(q, 0.4)); commit(); }); mk('löschen', () => removeMany(g.map((q) => q.id)));
      insp.append(acts, h('div', 'block-sec mono mute', 'Ziehen oder Pfeiltasten = Gruppe verschieben<br>Shift/⌘ + Klick = Auswahl ändern · Esc = aufheben'));
      return;
    }
    if (!pc) {
      insp.append(h('h2', '', 'Plakat'), h('div', 'mono sub', 'Einstellungen für das Ergebnis'));
      const opts = [
        [{ k: 'format', l: 'Format', t: 'select', opts: Object.keys(FORMATS) }, S.format, (v) => { S.format = v; }],
        [{ k: 'paper', l: 'Papier', t: 'color' }, S.paper, (v) => { S.paper = v; }],
      ];
      opts.forEach(([q, v, f]) => insp.append(paramRow(q, v, (x) => { f(x); dirty = true; save(); updatePosterInfo(); })));
      const help = h('div', 'block-sec help');
      help.innerHTML =
        '<b>So funktioniert’s</b><br>Teile aus der Liste links ziehen oder anklicken. ' +
        'Jeder Baustein bezieht sich auf <b>einen</b> anderen: Standard ist der Nachbar links (oder oben). ' +
        'Unter „Bezug auf“ kannst du jeden anderen Baustein wählen, per Liste oder mit <b>⌖ zeigen</b> und Klick auf die Fläche. ' +
        'Wie in TouchDesigner sind Ebenen <b>durchsichtig</b>: Text, Formen und Linien haben keinen Hintergrund. Ein Effekt verändert nur das, was in seinem Eingang steckt. ' +
        '<b>Mischen</b> legt B über A – so kommt der bearbeitete Text auf einen Hintergrund. <b>Maske</b> schneidet A mit der Form von B aus. ' +
        'Schachbrett in der Vorschau = durchsichtig.<br>' +
        'Auf dem Plakat landet nur, was beim <b>Output</b> ankommt. Nodes, die nicht mit ihm verbunden sind, werden blass und verändern nichts.' +
        '<div class="legend mono">' + Object.keys(TP.CATS).map((k) => `<i style="background:var(--c-${k})"></i><span>${TP.CATS[k].name}</span>`).join('') + '</div>' +
        '<div class="mono mute" style="margin-top:12px">Rahmen ziehen = mehrere auswählen · Shift/⌘ + Klick = dazu<br>Rechtsklick = Menü · rechts ziehen = Fläche bewegen<br>Pfeile = verschieben · ⌘D duplizieren · ⌘C/⌘V · Entf löschen<br>Zahl anklicken = eintippen · Doppelklick auf Namen = Standard · Leertaste = Pause</div>';
      insp.append(help);
      return;
    }
    const d = TP.BLOCKS[pc.type];
    insp.append(h('h2', '', esc(label(pc))));
    const live = TP.upstream(S.pieces), what = d.kind === 'gen' ? 'erzeugt ein Bild' : d.kind === 'mix' ? 'verbindet zwei Bilder' : d.kind === 'out' ? 'Endpunkt – das kommt aufs Plakat' : 'verändert ein Bild';
    insp.append(h('div', 'mono sub', TP.CATS[d.cat].name + ' · ' + esc(TP.FAMS[d.fam] || '') + ' · ' + what + (d.field ? ' (liest den Eingang als Feld)' : '') +
      (d.kind !== 'out' ? (live.has(pc.id) ? ' · <span style="color:var(--accent)">mit Output verbunden</span>' : ' · nicht mit Output verbunden') : '') +
      (d.desc ? '<br><span style="color:var(--ink2)">' + esc(d.desc) + '</span>' : '')));
    const io = h('div', 'io');
    if (d.kind === 'mix') { io.append(ioRow(pc, 'src', 'Eingang A', 'links')); io.append(ioRow(pc, 'src2', 'Eingang B', 'oben')); }
    else io.append(ioRow(pc, 'src', d.kind === 'gen' ? 'Darüber legen auf' : d.kind === 'out' ? 'Zeigt' : 'Bezug auf', 'links / oben'));
    insp.append(io);
    d.params.forEach((q) => insp.append(paramRow(q, pc.p[q.k], (v) => { pc.p[q.k] = v; updateVal(pc); dirty = true; save(); })));
    if (d.needsImage && !document.documentElement.dataset.museum) {
      const b = h('button', 'btn', env.images[pc.id] ? 'anderes Bild wählen …' : 'Bild wählen …');
      b.style.marginTop = '12px';
      b.onclick = () => { $('#fileImg').dataset.id = pc.id; $('#fileImg').click(); };
      insp.append(b);
    }
    const acts = h('div', 'acts mono');
    const mk = (l, f) => { const b = h('button', 'link', l); b.onclick = f; acts.append(b); };
    mk('würfeln', () => { randomize(pc, 0.6); renderInsp(); updateVal(pc); dirty = true; save(); });
    mk('zurücksetzen', () => { pc.p = TP.defaults(pc.type); renderInsp(); updateVal(pc); dirty = true; save(); });
    if (d.kind !== 'out') mk('duplizieren', duplicateSel);
    if (d.kind !== 'out') mk('→ Output', () => connectOutput(pc));
    mk('löschen', () => removePiece(pc.id));
    insp.append(acts);
    const cr = h('div', 'block-sec mono mute');
    cr.innerHTML = `Credits<br><span style="color:var(--ink)">Verwandt im Pool: ${esc(d.tool)}</span>`;
    insp.append(cr);
  }

  $('#fileImg').addEventListener('change', (e) => {
    const f = e.target.files[0], id = e.target.dataset.id;
    e.target.value = '';
    if (!f || !id) return;
    const rd = new FileReader();
    rd.onload = () => loadImg(rd.result, (img) => {
      const m = 1400, sc = Math.min(1, m / Math.max(img.width, img.height));
      const c = TP.util.canvas(Math.round(img.width * sc), Math.round(img.height * sc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.88);
      loadImg(url, (im2) => { env.images[id] = im2; dirty = true; renderInsp(); });
      if (!store.set('toolpool.img.' + id, url)) toast('Bild zu groß zum Speichern – bleibt bis zum Neuladen');
    });
    rd.readAsDataURL(f);
  });

  // ---------- Zufall ----------
  function randomize(pc, amt) {
    const d = TP.BLOCKS[pc.type], r = Math.random, pals = Object.values(TP.PALETTES);
    d.params.forEach((q) => {
      if (q.k === 'mix' || q.k === 'grund' || q.k === 'papier') return;
      if (q.t === 'range') {
        let v = q.d + (r() - 0.5) * (q.max - q.min) * amt;
        if (q.k === 'seed') v = r() * q.max;
        v = Math.min(q.max, Math.max(q.min, v));
        pc.p[q.k] = q.step >= 1 ? Math.round(v) : +v.toFixed(3);
      } else if (q.t === 'select' && r() < amt + 0.2) pc.p[q.k] = q.opts[(r() * q.opts.length) | 0];
      else if (q.t === 'color' && r() < amt) { const p = pals[(r() * pals.length) | 0]; pc.p[q.k] = p[(r() * (p.length - 1)) | 0]; }
    });
  }
  function randomBoard() {
    const gens = ['verlauf', 'noise', 'streifen', 'raster', 'fluss'], fx = ['pixel', 'dither', 'glitch', 'farbe', 'kontrast', 'spiegel', 'halftone', 'riso', 'korn', 'welle', 'echo', 'transform'];
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const pcs = [];
    const n = 2 + ((Math.random() * 3) | 0);
    let c = 1;
    pcs.push(piece(pick(gens), c++, 2));
    for (let i = 0; i < n; i++) pcs.push(piece(pick(fx), c++, 2));
    if (Math.random() < 0.7) {
      // zweiter Strang von oben, der in ein Mischen-Teil läuft
      pcs.push(piece(Math.random() < 0.6 ? 'text' : pick(gens), c, 0));
      pcs.push(piece(pick(['welle', 'dither', 'pixel', 'spiegel', 'halftone']), c, 1));
      pcs.push(piece(Math.random() < 0.75 ? 'mischen' : 'maske', c, 2, { modus: 'normal' }));
      c++;
    }
    if (Math.random() < 0.5) pcs.push(piece(pick(['korn', 'riso', 'farbe']), c++, 2));
    pcs.push(piece('output', c, 2));
    pcs.forEach((pc) => randomize(pc, 0.45));
    S.pieces = pcs; S.sel = null; env.states = {};
    commit();
  }
  $('#btnReset').onclick = () => { if (TP.museum && TP.museum.reset()) return; S = demo(); env.states = {}; renderPalette(); commit(); updatePosterInfo(); };
  $('#btnRandom').onclick = randomBoard;
  $('#btnVar').onclick = () => { S.pieces.forEach((pc) => randomize(pc, 0.2)); commit(); };

  // ======================================================
  //  Rendern
  // ======================================================
  const out = $('#out');
  let playing = true, dirty = true, lastNow = 0, lastRender = 0, big = false, msAvg = 0;
  let minFrame = 33, renderScale = 1, drawCount = 0, boardGen = 0;   // Leistungsstufe: von der Regie gesetzt
  function togglePlay() { playing = !playing; $('#btnPlay').textContent = playing ? '❚❚ pause' : '▶ play'; dirty = true; }
  $('#btnPlay').onclick = togglePlay;
  $('#btnWsPrev').onclick = () => { PV.ws = { klein: 'gross', gross: 'aus', aus: 'klein' }[PV.ws]; store.set('toolpool.prev', PV); applyPrev(); renderWS(); dirty = true; };
  function updatePosterInfo() { const f = FORMATS[S.format]; $('#posterInfo').textContent = f.l + ' · ' + f.w + '×' + f.h; }

  let chk = ['#fff', '#e4e3df'];
  function drawContain(dst, src) {
    const x = dst.getContext('2d'), w = dst.width, hh = dst.height, sc = Math.min(w / src.width, hh / src.height);
    x.fillStyle = chk[0]; x.fillRect(0, 0, w, hh);
    x.fillStyle = chk[1];
    for (let j = 0; j < hh; j += 8) for (let i = (j / 8) % 2 ? 8 : 0; i < w; i += 16) x.fillRect(i, j, 8, 8);
    x.drawImage(src, (w - src.width * sc) / 2, (hh - src.height * sc) / 2, src.width * sc, src.height * sc);
  }
  // Halbe Auflösung soll nicht kleiner aussehen: Anzeigegröße wie bei voller Auflösung
  function posterAnzeige() {
    if (renderScale !== 1) {
      const f = FORMATS[S.format], w = $('#posterWrap'), cs = getComputedStyle(w);
      const maxW = big ? innerWidth - 80 : w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const maxH = big ? innerHeight - 80 : innerHeight * 0.34;
      out.style.width = Math.round(f.w * Math.min(big ? 2 : 1, maxW / f.w, maxH / f.h)) + 'px';
    } else if (out.style.width) out.style.width = '';
  }
  function draw() {
    const f = FORMATS[S.format], sc = (big ? 2 : 1) * renderScale;
    const pw = Math.round(f.w * sc), ph = Math.round(f.h * sc);
    if (out.width !== pw || out.height !== ph) { out.width = pw; out.height = ph; }
    posterAnzeige();
    env.s = sc;
    const t0 = performance.now();
    const res = TP.compose(out, S.pieces, env, { mix: S.mix, paper: S.paper, key: 'live' });
    if (PV.ws !== 'aus') for (const id in thumbs) if (res.out[id]) drawContain(thumbs[id], res.out[id]);
    msAvg = msAvg * 0.9 + (performance.now() - t0) * 0.1;
    drawCount++;
    $('#ms').textContent = Math.round(msAvg) + ' ms';
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastNow) / 1000 || 0);
    lastNow = now;
    if (view !== 'baukasten') return;
    if (TP.fern && TP.fern.aktiv()) return;   // Der Mac mini rechnet, siehe js/fern.js
    if (playing) env.t += dt;
    if (!playing && !dirty) return;
    if ((!dirty || minFrame > 33) && now - lastRender < minFrame) return;
    lastRender = now; dirty = false;
    draw();
  }

  out.addEventListener('pointermove', (e) => {
    const r = out.getBoundingClientRect();
    env.mouse = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    dirty = true;
  });
  function setBig(on) { big = on; $('#posterWrap').classList.toggle('big', on); dirty = true; }
  $('#btnBig').onclick = () => setBig(!big);
  $('#posterWrap').addEventListener('click', (e) => { if (big && e.target === e.currentTarget) setBig(false); });

  function renderHi(scale, pieces, format) {
    const f = FORMATS[format || S.format], c = TP.util.canvas(f.w * scale, f.h * scale);
    TP.compose(c, pieces || S.pieces, Object.assign({}, env, { s: scale, export: true }), { mix: S.mix, paper: S.paper, key: 'export' });
    return c;
  }
  function credits(pieces) { return TP.credits(pieces || S.pieces); }
  $('#btnDownload').onclick = (e) => { e.stopPropagation(); if (TP.exporter) TP.exporter.toggle(); };

  // ======================================================
  //  Notizen
  // ======================================================
  let notes = store.get('toolpool.notes', []);
  function saveNotes() {
    while (!store.set('toolpool.notes', notes) && notes.length > 1) { notes.pop(); toast('Speicher voll – älteste Notiz entfernt'); }
  }
  $('#btnUpload').onclick = () => {
    const c = renderHi(2);
    notes.unshift({ id: uid(), title: 'Arbeit ' + (notes.length + 1), date: Date.now(), img: c.toDataURL('image/jpeg', 0.85), credits: credits(), format: S.format, pieces: JSON.parse(JSON.stringify(S.pieces)) });
    saveNotes();
    toast('In Notizen gespeichert');
    go('notizen');
  };
  $('#noteAdd').onclick = () => $('#noteFile').click();
  $('#noteFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => loadImg(rd.result, (img) => {
      const sc = Math.min(1, 1100 / Math.max(img.width, img.height)), c = TP.util.canvas(Math.round(img.width * sc), Math.round(img.height * sc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      notes.unshift({ id: uid(), title: f.name.replace(/\.[^.]+$/, ''), date: Date.now(), img: c.toDataURL('image/jpeg', 0.85), credits: [] });
      saveNotes(); renderNotes();
    });
    rd.readAsDataURL(f);
  });
  function renderNotes() {
    const g = $('#notesGrid');
    g.innerHTML = '';
    if (!notes.length) g.append(h('div', 'empty', 'Noch keine Arbeiten.<br>Im Baukasten auf „Hochladen“ klicken – dann landet das Plakat hier.'));
    notes.forEach((n) => {
      const el = h('div', 'note');
      el.innerHTML = `<img src="${n.img}" alt=""><div class="t" contenteditable="true" spellcheck="false">${esc(n.title)}</div>
        <div class="m mono">${new Date(n.date).toLocaleDateString('de-DE')} · ${n.credits && n.credits.length ? 'Credits: ' + esc(n.credits.join(' · ')) : '—'}</div>
        <div class="a mono">${n.pieces ? '<button data-a="open">öffnen</button>' : ''}<button data-a="print">drucken</button><button data-a="del" class="del">löschen</button></div>`;
      $('.t', el).addEventListener('blur', (e) => { n.title = e.target.textContent.trim() || n.title; saveNotes(); });
      $('.t', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
      $('.a', el).addEventListener('click', (e) => {
        const a = e.target.dataset.a;
        if (a === 'open') { S.pieces = JSON.parse(JSON.stringify(n.pieces)); S.format = n.format || S.format; S.sel = null; env.states = {}; commit(); updatePosterInfo(); go('baukasten'); }
        if (a === 'print') { PR.src = n.id; go('drucken'); }
        if (a === 'del' && confirm('Notiz „' + n.title + '“ löschen?')) { notes = notes.filter((x) => x !== n); saveNotes(); renderNotes(); }
      });
      g.append(el);
    });
    const mr = $('#miniRank');
    mr.innerHTML = '';
    ranked().slice(0, 8).forEach((t, i) => mr.append(h('li', '', `<span class="mono">${String(i + 1).padStart(2, '0')}</span><span>${esc(t.name)}</span><span class="mono mute">${votes[t.name] || 0}</span>`)));
  }

  // ======================================================
  //  Ranking
  // ======================================================
  let votes = store.get('toolpool.votes', null) || Object.assign({}, TP.SEED_VOTES);
  let round = 1, pair = [];
  const ranked = () => TP.TOOLS.slice().sort((a, b) => (votes[b.name] || 0) - (votes[a.name] || 0) || a.name.localeCompare(b.name));
  function newPair() {
    const t = TP.TOOLS, a = t[(Math.random() * t.length) | 0];
    let b; do b = t[(Math.random() * t.length) | 0]; while (b === a);
    pair = [a, b];
  }
  function renderRanking() {
    if (!pair.length) newPair();
    $('#round').textContent = round;
    const dp = $('#duelPair');
    dp.innerHTML = '';
    pair.forEach((t, i) => {
      const b = h('button', 'duel-card');
      b.innerHTML = `<div class="sw" style="${swatch(t)}"></div><div class="info"><b>${esc(t.name)}</b><span class="mono">${esc(t.desc)}</span></div>`;
      b.onclick = () => { votes[t.name] = (votes[t.name] || 0) + 1; store.set('toolpool.votes', votes); round++; newPair(); renderRanking(); };
      dp.append(b);
      if (i === 0) dp.append(h('span', 'vs', 'vs'));
    });
    const list = $('#rankList'), top = ranked().slice(0, 12), max = Math.max(1, ...top.map((t) => votes[t.name] || 0));
    list.innerHTML = '';
    top.forEach((t, i) => {
      const v = votes[t.name] || 0;
      list.append(h('li', '', `<span class="no">${String(i + 1).padStart(2, '0')}</span><span class="sw" style="${swatch(t)}"></span>
        <span class="nm"><a href="${esc(link(t))}"${linkCls(t)} target="_blank" rel="noopener">${esc(t.name)}</a><br><span class="mono mute">${esc(t.url.replace(/^https?:\/\/(www\.)?/, ''))}</span></span>
        <span class="bar"><i style="width:${(v / max) * 100}%"></i></span><span class="ct">${v}</span>`));
    });
  }
  $('#duelSkip').onclick = () => { newPair(); renderRanking(); };

  // ---------- Offline / Online ----------
  // Offline: Tool-Seiten aus offline/ (offline_holen.py), sonst der echte Link
  const OFF = TP.OFFLINE || {};
  let net = store.get('toolpool.net', 'offline');
  const hasLocal = (t) => !!OFF[t.url];
  // Über server.py läuft jede Kopie auf eigenem Port (wie an ihrer Domain-Wurzel), sonst als Datei-Pfad
  function localLink(p) {
    const [, host, ...rest] = p.split('/'), port = (TP.OFFLINE_PORTS || {})[host];
    return port && location.port === '8431' ? `http://${location.hostname}:${port}/${rest.join('/')}` : p;
  }
  const link = (t) => (net === 'offline' && hasLocal(t) ? localLink(OFF[t.url]) : t.url);
  const linkCls = (t) => (net === 'offline' && !hasLocal(t) ? ' class="nur-online" title="Keine lokale Kopie – braucht Internet"' : '');
  function applyNet() {
    document.documentElement.dataset.net = net;
    if (view === 'archiv') renderArchiv();
    if (view === 'ranking') renderRanking();
  }
  function setNet(v) {
    net = v; store.set('toolpool.net', net); applyNet();
    toast(net === 'offline' ? `Offline: ${Object.keys(OFF).length} Tool-Seiten aus lokalen Kopien${TP.OFFLINE_STAND ? ' (Stand ' + TP.OFFLINE_STAND + ')' : ''}` : 'Online: Tool-Seiten aus dem Netz');
  }

  // ======================================================
  //  Archiv
  // ======================================================
  const SW_COLORS = ['#5b4bd6', '#f39a6b', '#e8582a', '#a7d8c3', '#c9c4f5', '#2b2b33', '#f3c6b4', '#d7d6f7', '#8c8bf0', '#f4f1ec', '#9fb0ff'];
  function hash(s) { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; }
  function swatch(t) {
    const n = hash(t.name), a = SW_COLORS[n % SW_COLORS.length], b = SW_COLORS[(n >>> 5) % SW_COLORS.length], k = (n >>> 10) % 5;
    if (k === 0) return `background:repeating-linear-gradient(90deg,#151515 0 2px,#fff 2px 5px)`;
    if (k === 1) return `background:${a === '#f4f1ec' ? '#2b2b33' : a}`;
    if (k === 2) return `background:radial-gradient(circle at 30% 30%,${b},${a})`;
    if (k === 3) return `background:repeating-linear-gradient(0deg,${a} 0 3px,${b} 3px 6px)`;
    return `background:linear-gradient(${(n >>> 3) % 360}deg,${a},${b})`;
  }
  // playgrnd-Tools übernehmen Familie, Technik und Beschreibung aus ihrem Node
  TP.TOOLS.forEach((t) => { const d = t.node && TP.BLOCKS[t.node]; if (d) { t.cat = d.fam; t.tech = d.cat; t.desc = d.desc; } });
  const techLabel = (t) => (t.tech === 'vektor' ? 'Vektor · SVG' : t.tech === 'pixel' ? 'Pixel · PNG' : '—');
  let archMode = 'drift', archCat = 'alle', archTech = 'alle', archQ = '';
  function archTools() {
    const q = archQ.toLowerCase();
    return TP.TOOLS.filter((t) => (archCat === 'alle' || t.cat === archCat) && (archTech === 'alle' || t.tech === archTech) &&
      (!q || (t.name + ' ' + t.desc + ' ' + t.author + ' ' + (TP.FAMS[t.cat] || '')).toLowerCase().includes(q)));
  }
  // Tool als Node in den Baukasten (vor den Output)
  function toolToBoard(t) {
    if (!t.node || !TP.BLOCKS[t.node]) return;
    const pc = piece(t.node, 0, 0), o = TP.output(S.pieces);
    if (o) insertBeforeOutput(pc, o); else place(pc, 1, 1);
    commit(); go('baukasten'); toast(t.name + ' ist jetzt im Baukasten');
  }
  function renderArchiv() {
    $$('#archTabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === archMode));
    const ch = $('#archChips');
    ch.innerHTML = '';
    [['alle', 'alle'], ['vektor', 'vektor'], ['pixel', 'pixel']].forEach(([k, l]) => {
      const b = h('button', archTech === k ? 'on' : '', l); b.onclick = () => { archTech = k; renderArchiv(); }; ch.append(b);
    });
    ch.append(h('span', 'mute', '·'));
    const used = new Set(TP.TOOLS.map((t) => t.cat));
    [['alle', 'alle']].concat(Object.keys(TP.FAMS).filter((k) => used.has(k)).map((k) => [k, TP.FAMS[k].toLowerCase()])).forEach(([k, l]) => {
      const b = h('button', archCat === k ? 'on' : '', esc(l)); b.onclick = () => { archCat = k; renderArchiv(); }; ch.append(b);
    });
    const body = $('#archBody'), tools = archTools();
    body.innerHTML = '';
    if (!tools.length) { body.append(h('div', 'empty', '&nbsp;&nbsp;&nbsp;&nbsp;Nichts gefunden.')); return; }
    const open = (t) => window.open(link(t), '_blank', 'noopener');
    if (archMode === 'drift') {
      const d = h('div', 'drift'), W = body.clientWidth || 1000;
      d.style.height = Math.max(body.clientHeight, 160 + tools.length * 14) + 'px';
      const H = parseInt(d.style.height, 10);
      tools.forEach((t) => {
        const n = hash(t.name), sz = 34 + (n % 90), ar = [1, 1, 0.75, 1.3][(n >>> 4) % 4];
        const el = h('div', 'tile' + (n % 4 === 0 ? ' named' : ''));
        el.style.cssText = `left:${40 + ((n >>> 6) % 1000) / 1000 * (W - 200)}px;top:${30 + ((n >>> 12) % 1000) / 1000 * (H - 140)}px;width:${sz}px;height:${sz * ar}px;--dx:${((n >>> 2) % 30) - 15}px;--dy:${((n >>> 9) % 30) - 15}px;--dur:${6 + (n % 7)}s`;
        el.innerHTML = `<div class="sw" style="${swatch(t)}"></div><div class="lb">${esc(t.name)}${t.author !== '—' ? ' · ' + esc(t.author) : ''}</div>`;
        el.title = t.desc + (t.node ? '\nKlick = als Node in den Baukasten' : '');
        el.onclick = () => (t.node ? toolToBoard(t) : open(t));
        d.append(el);
      });
      body.append(d);
    } else if (archMode === 'index') {
      const tb = h('table', 'idx');
      tb.innerHTML = '<thead><tr><th>#</th><th></th><th>Tool</th><th>Beschreibung</th><th>Autor:in</th><th>Familie</th><th>Technik</th><th></th><th></th></tr></thead>';
      const tbody = h('tbody');
      tools.forEach((t, i) => {
        const tr = h('tr', '', `<td class="mono">${String(i + 1).padStart(2, '0')}</td><td><div class="sw" style="${swatch(t)}"></div></td>
          <td><a href="${esc(link(t))}"${linkCls(t)} target="_blank" rel="noopener">${esc(t.name)}</a></td><td>${esc(t.desc)}</td><td class="mono">${esc(t.author)}</td>
          <td class="mono">${esc(TP.FAMS[t.cat] || '—')}</td><td class="mono">${techLabel(t)}</td>
          <td class="mono">${t.node ? '<button class="link add">+ Baukasten</button>' : ''}</td><td class="mono"><a href="${esc(link(t))}"${linkCls(t)} target="_blank" rel="noopener">${net === 'offline' ? (hasLocal(t) ? 'lokal ↗' : 'online ↗') : '↗'}</a></td>`);
        const b = $('.add', tr); if (b) b.onclick = () => toolToBoard(t);
        tbody.append(tr);
      });
      tb.append(tbody);
      body.append(tb);
    } else {
      const cols = h('div', 'cols');
      Object.entries(TP.FAMS).forEach(([k, l]) => {
        const ts = tools.filter((t) => t.cat === k);
        if (!ts.length) return;
        const col = h('div', 'col', `<h3>${esc(l)} <span class="mono mute">${ts.length}</span></h3>`);
        ts.forEach((t) => {
          const a = h('a', 'card', `<div class="sw" style="${swatch(t)}"></div><b>${esc(t.name)}</b><span class="mono">${techLabel(t)}</span><span class="mono">${esc(t.desc)}</span>`);
          a.href = link(t); if (net === 'offline' && !hasLocal(t)) a.classList.add('nur-online'); a.target = '_blank'; a.rel = 'noopener';
          if (t.node) { const b = h('button', 'link mono add', '+ Baukasten'); b.onclick = (e) => { e.preventDefault(); toolToBoard(t); }; a.append(b); }
          col.append(a);
        });
        cols.append(col);
      });
      body.append(cols);
    }
  }
  $('#archTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { archMode = b.dataset.m; renderArchiv(); } });
  $('#archSearch').addEventListener('input', (e) => { archQ = e.target.value; renderArchiv(); });
  $('#archRandom').onclick = () => { const t = archTools(); if (t.length) window.open(link(t[(Math.random() * t.length) | 0]), '_blank', 'noopener'); };
  window.addEventListener('resize', () => { if (view === 'archiv' && archMode === 'drift') renderArchiv(); });

  // ======================================================
  //  Drucken
  // ======================================================
  const PAPER = { A5: [148, 210], A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841] };
  const PRINT_MAX_PX = 10400;   // lange Seite beim Drucken: reicht für 300 dpi auf A1
  const PR = Object.assign({
    tab: 'druck', sec: 'allgemein', src: 'live', format: 'A4', orient: 'hoch', double: false, margins: [12.7, 12.7, 12.7, 12.7],
    copies: 1, collate: false, reverse: false, pages: 'alle', fit: true, marks: false, bleed: 3, showCred: true, credText: '', preset: '[Standard]',
  }, store.get('toolpool.print', {}));
  PR.src = 'live';
  let prImg = '', prCred = '', prNat = [420, 594];
  const SECTIONS = [['allgemein', 'Allgemein'], ['einrichten', 'Einrichten', 1], ['marken', 'Marken und Anschnitt'], ['ausgabe', 'Ausgabe', 1], ['grafiken', 'Grafiken', 1],
    ['farbe', 'Farbmanagement', 1], ['erweitert', 'Erweitert', 1], ['credits', 'Credits'], ['uebersicht', 'Übersicht']];

  function sheetSize() { const [a, b] = PAPER[PR.format]; return PR.orient === 'hoch' ? [a, b] : [b, a]; }
  function openPrint() {
    if (PR.src === 'live') { const f = FORMATS[S.format]; prImg = renderHi(2).toDataURL('image/png'); prCred = credits().join(' · '); prNat = [f.w, f.h]; }
    else {
      const n = notes.find((x) => x.id === PR.src);
      if (!n) { PR.src = 'live'; return openPrint(); }
      prImg = n.img; prCred = (n.credits || []).join(' · ');
      // Notizen haben keine Maße: Originalgröße = lange Seite wie ein A2-Plakat
      const im = new Image();
      im.onload = () => { const k = 594 / Math.max(im.naturalWidth, im.naturalHeight); prNat = [im.naturalWidth * k, im.naturalHeight * k]; if (!PR.fit) renderPreview(); };
      im.src = n.img;
    }
    renderPrint();
  }
  function credLine() { return PR.credText.trim() || (prCred ? 'Credits: ' + prCred : ''); }
  function sheetHTML(scale, page) {
    const [w, hh] = sheetSize(), [mt, mr, mb, ml] = PR.margins.map(Number), credH = PR.showCred && credLine() ? 12 : 0;
    const px = (mm) => (scale === 'mm' ? mm + 'mm' : mm * scale + 'px');
    let html = `<div class="sheet" style="width:${px(w)};height:${px(hh)}">`;
    if (page === 'back') {
      html += `<div class="cred" style="left:${px(ml)};top:${px(mt)};right:${px(mr)};font-size:${px(3)}">Tool Pool · ${new Date().toLocaleDateString('de-DE')}<br><br>${esc(credLine() || 'Credits: —')}</div>`;
    } else {
      html += `<div class="art" style="left:${px(ml)};top:${px(mt)};right:${px(mr)};bottom:${px(mb + credH)}"><img src="${prImg}" alt="" style="width:${PR.fit ? '100%' : px(prNat[0])};height:${PR.fit ? '100%' : px(prNat[1])}"></div>`;
      if (credH) html += `<div class="cred" style="left:${px(ml)};right:${px(mr)};bottom:${px(mb)};height:${px(credH - 2)};font-size:${px(2.3)};display:flex;align-items:flex-end">${esc(credLine())}</div>`;
    }
    if (PR.marks) {
      const L = 6, o = 2, th = scale === 'mm' ? '0.2mm' : '1px';
      [[ml, mt], [w - mr, mt], [ml, hh - mb], [w - mr, hh - mb]].forEach(([x, y]) => {
        const sx = x < w / 2 ? -1 : 1, sy = y < hh / 2 ? -1 : 1;
        html += `<i class="mk" style="left:${px(sx < 0 ? x - o - L : x + o)};top:${px(y)};width:${px(L)};height:${th}"></i>`;
        html += `<i class="mk" style="left:${px(x)};top:${px(sy < 0 ? y - o - L : y + o)};width:${th};height:${px(L)}"></i>`;
      });
    }
    return html + '</div>';
  }
  function fr(label, content) { return `<div class="fr"><span class="mono">${label}</span><div>${content}</div></div>`; }
  function renderPrint() {
    $$('.pr-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === PR.tab));
    $('#prGo').textContent = PR.tab === 'pdf' ? 'Exportieren' : 'Drucken';
    const secs = $('#prSections');
    secs.innerHTML = '';
    SECTIONS.forEach(([k, l, dis]) => {
      const b = h('button', PR.sec === k ? 'on' : '', l);
      if (dis) b.disabled = true; else b.onclick = () => { PR.sec = k; renderPrint(); };
      secs.append(b);
    });
    const f = $('#prForm');
    const srcOpts = `<option value="live"${PR.src === 'live' ? ' selected' : ''}>Aktuelles Plakat (Baukasten)</option>` + notes.map((n) => `<option value="${n.id}"${PR.src === n.id ? ' selected' : ''}>Notiz: ${esc(n.title)}</option>`).join('');
    const presets = store.get('toolpool.printPresets', {});
    if (PR.sec === 'allgemein') {
      f.innerHTML =
        fr('Inhalt', `<select class="line-select" data-k="src">${srcOpts}</select>`) +
        fr('Druckvorgabe', `<select class="line-select" data-k="preset">${['[Standard]'].concat(Object.keys(presets)).map((p) => `<option${p === PR.preset ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>`) +
        fr('Drucker', `<select class="line-select"><option>${PR.tab === 'pdf' ? 'Als PDF sichern (Systemdialog)' : 'Systemdrucker'}</option></select>`) +
        fr('PPD', `<select class="line-select"><option>Geräteunabhängig</option></select>`) +
        fr('Exemplare', `<div class="inl"><input class="line-input num" type="number" min="1" max="50" value="${PR.copies}" data-k="copies"><label class="check"><input type="checkbox" data-k="collate"${PR.collate ? ' checked' : ''}> Sortieren</label><label class="check"><input type="checkbox" data-k="reverse"${PR.reverse ? ' checked' : ''}> Umgekehrte Reihenfolge</label></div>`) +
        fr('Seiten', `<div class="inl"><label class="radio"><input type="radio" name="pg" checked> Alle</label><label class="radio"><input type="radio" name="pg" disabled> Aktuelle Seite</label></div>`) +
        fr('Ebenen drucken', `<select class="line-select"><option>Sichtbare und druckbare Ebenen</option></select>`) +
        fr('Optionen', `<div class="stack"><label class="check"><input type="checkbox" data-k="showCred"${PR.showCred ? ' checked' : ''}> Credits drucken</label><label class="check"><input type="checkbox" data-k="marks"${PR.marks ? ' checked' : ''}> Schnittmarken drucken</label><label class="check"><input type="checkbox" data-k="double"${PR.double ? ' checked' : ''}> Rückseite mit Credits (Doppelseite)</label></div>`);
    } else if (PR.sec === 'marken') {
      f.innerHTML =
        fr('Marken', `<div class="stack"><label class="check"><input type="checkbox" data-k="marks"${PR.marks ? ' checked' : ''}> Schnittmarken</label></div>`) +
        fr('Ränder', `<span class="mono mute">rechts unter „Dokument“ einstellen</span>`);
    } else if (PR.sec === 'credits') {
      f.innerHTML =
        fr('Credits drucken', `<label class="check"><input type="checkbox" data-k="showCred"${PR.showCred ? ' checked' : ''}> ja</label>`) +
        fr('Automatisch', `<span class="mono">${esc(prCred || '—')}</span>`) +
        fr('Eigener Text', `<textarea data-k="credText" placeholder="leer = automatisch">${esc(PR.credText)}</textarea>`);
    } else {
      const [w, hh] = sheetSize();
      f.innerHTML =
        fr('Inhalt', esc(PR.src === 'live' ? 'Aktuelles Plakat' : (notes.find((n) => n.id === PR.src) || {}).title || '')) +
        fr('Format', `${PR.format} · ${PR.orient === 'hoch' ? 'Hochformat' : 'Querformat'} · ${w} × ${hh} mm`) +
        fr('Größe', PR.fit ? 'auf die Seite vergrößert' : 'Originalgröße') +
        fr('Ränder', PR.margins.join(' / ') + ' mm') +
        fr('Exemplare', PR.copies + (PR.double ? ' × 2 Seiten' : '')) +
        fr('Schnittmarken', PR.marks ? 'ja' : 'nein') +
        fr('Credits', esc(PR.showCred ? credLine() || '—' : 'aus'));
    }
    f.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      const ev = inp.tagName === 'SELECT' || inp.type === 'checkbox' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        if (k === 'src') { PR.src = inp.value; openPrint(); return; }
        if (k === 'preset') { if (presets[inp.value]) Object.assign(PR, presets[inp.value]); PR.preset = inp.value; renderPrint(); return; }
        PR[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Math.max(1, Math.min(50, +inp.value || 1)) : inp.value;
        savePR(); renderPreview();
      });
    });
    // Dokument
    const fs = $('#prFormat');
    fs.innerHTML = Object.keys(PAPER).map((k) => `<option${k === PR.format ? ' selected' : ''}>${k}</option>`).join('');
    $$('.pr-orient').forEach((b) => b.classList.toggle('on', b.dataset.o === PR.orient));
    $('#prDouble').checked = PR.double;
    $('#prFit').checked = PR.fit;
    const [w, hh] = sheetSize();
    $('#prW').value = w; $('#prH').value = hh;
    const pm = $('#prMargins');
    pm.innerHTML = '';
    ['oben', 'rechts', 'unten', 'links'].forEach((l, i) => {
      const inp = h('input', 'line-input num'); inp.type = 'number'; inp.step = '0.1'; inp.min = '0'; inp.value = PR.margins[i]; inp.title = l;
      inp.oninput = () => { PR.margins[i] = Math.max(0, +inp.value || 0); savePR(); renderPreview(); };
      const lb = h('label', '', ''); lb.append(inp, document.createTextNode(' mm'));
      pm.append(lb);
    });
    renderPreview();
  }
  function renderPreview() {
    const box = $('#prPreview'), [w, hh] = sheetSize();
    const avW = Math.max(200, box.clientWidth - 56), avH = Math.max(240, box.clientHeight - 56);
    const sc = Math.min(avW / w, avH / hh);
    box.innerHTML = sheetHTML(sc, 'front');
  }
  function savePR() { const { src, ...rest } = PR; void src; store.set('toolpool.print', rest); }
  $('#prFormat').onchange = (e) => { PR.format = e.target.value; savePR(); renderPrint(); };
  $$('.pr-orient').forEach((b) => (b.onclick = () => { PR.orient = b.dataset.o; savePR(); renderPrint(); }));
  $('#prDouble').onchange = (e) => { PR.double = e.target.checked; savePR(); renderPrint(); };
  $('#prFit').onchange = (e) => { PR.fit = e.target.checked; savePR(); renderPrint(); };
  $$('.pr-tabs button').forEach((b) => (b.onclick = () => { PR.tab = b.dataset.t; renderPrint(); }));
  $('#prCancel').onclick = () => go('baukasten');
  $('#prSave').onclick = () => {
    const name = prompt('Name der Vorgabe', 'Plakat ' + PR.format);
    if (!name) return;
    const presets = store.get('toolpool.printPresets', {});
    presets[name] = { format: PR.format, orient: PR.orient, margins: PR.margins.slice(), marks: PR.marks, showCred: PR.showCred, double: PR.double, copies: PR.copies, fit: PR.fit };
    store.set('toolpool.printPresets', presets);
    PR.preset = name; savePR(); renderPrint(); toast('Vorgabe gespeichert');
  };
  // Das Plakat erst beim Drucken in der Auflösung der Seite rechnen (300 dpi), die Vorschau bleibt schnell
  function printImage() {
    const [w, hh] = sheetSize();
    const f = FORMATS[S.format], mm = PR.fit ? Math.max(w, hh) : Math.max(f.w, f.h);
    const scale = Math.max(2, Math.min(PRINT_MAX_PX, (mm / 25.4) * 300) / Math.max(f.w, f.h));
    return new Promise((r) => renderHi(scale).toBlob((b) => r(URL.createObjectURL(b)), 'image/png'));
  }
  $('#prGo').onclick = async () => {
    const [w, hh] = sheetSize(), keep = prImg, live = PR.src === 'live';
    if (live) { toast('Plakat wird für ' + PR.format + ' gerechnet …'); await new Promise((r) => setTimeout(r, 30)); prImg = await printImage(); }
    let pages = [];
    for (let i = 0; i < PR.copies; i++) { pages.push('front'); if (PR.double) pages.push('back'); }
    if (PR.reverse) pages.reverse();
    $('#printRoot').innerHTML = `<style>@page{size:${w}mm ${hh}mm;margin:0}</style>` + pages.map((p) => sheetHTML('mm', p)).join('');
    const printUrl = prImg; prImg = keep;
    const imgs = $$('#printRoot img');
    // erst drucken, wenn das Bild dekodiert ist: bei großen Bildern bliebe die Seite sonst leer
    Promise.all(imgs.map((im) => im.decode().catch(() => {}))).then(() => {
      window.print();
      if (live) setTimeout(() => URL.revokeObjectURL(printUrl), 60000);
    });
  };
  $('#btnToPrint').onclick = () => { PR.src = 'live'; go('drucken'); };
  $('#btnToVorstufe').onclick = () => go('vorstufe');
  window.addEventListener('resize', () => { if (view === 'drucken') renderPreview(); });

  // ---------- Hell / Dunkel ----------
  // Outline-Farbe je Modus merken: hell standardmäßig schwarz, dunkel lila
  const OUTLINE = { light: '#151515', dark: '#9b6cff' };
  let outlines = Object.assign({}, OUTLINE, store.get('toolpool.outline', {}));
  function applyTheme(t) {
    const root = document.documentElement;
    root.dataset.theme = t;
    root.style.setProperty('--outline', outlines[t]);
    $('#themeBtn').textContent = t === 'dark' ? '○ Hell' : '● Dunkel';
    $('#outlineColor').value = outlines[t];
    const cs = getComputedStyle(root);
    chk = [cs.getPropertyValue('--chk1').trim() || '#fff', cs.getPropertyValue('--chk2').trim() || '#e4e3df'];
    dirty = true;
  }
  $('#outlineColor').addEventListener('input', (e) => {
    outlines[theme] = e.target.value;
    document.documentElement.style.setProperty('--outline', e.target.value);
    store.set('toolpool.outline', outlines);
  });
  $('#outlineColor').addEventListener('dblclick', () => { outlines[theme] = OUTLINE[theme]; store.set('toolpool.outline', outlines); applyTheme(theme); });
  let theme = store.get('toolpool.theme', null) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme);
  applyNet();
  $('#themeBtn').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; store.set('toolpool.theme', theme); applyTheme(theme); };

  // ---------- Einstellungen ----------
  TP.settings = Object.assign({ hsd: true }, store.get('toolpool.settings', {}));
  function renderSettings() {
    const H = TP.HSD, n = H ? H.lehrende.filter((p) => p.haupt).length : 0;
    $('#setPop').innerHTML = `<div class="mono mute">Einstellungen</div>
      <label class="set-row"><input type="checkbox" id="setHsd"${TP.settings.hsd ? ' checked' : ''}${H ? '' : ' disabled'}>
        <span><b>HSD PBSA-Modus</b><span class="mono mute">${H ? `Kursleitung und Kurse aus dem Vorlesungsverzeichnis FB Design · ${esc(H.semester)} · ${n} hauptamtlich Lehrende · Stand ${esc(H.stand)}. Dazu das Auftragsformular der Grafischen Werkstatt.` : 'Keine Daten – einmal mit Internet: python3 hsd_holen.py'}</span></span></label>
      <label class="set-row"><input type="checkbox" id="setNet"${net === 'offline' ? ' checked' : ''}>
        <span><b>Tool-Seiten offline öffnen</b><span class="mono mute">Lokale Kopien statt der Links ins Netz. Braucht den Start über „Tool Pool starten“.</span></span></label>` + (TP.museum ? TP.museum.settingsHTML() : '');
    if (TP.museum) TP.museum.settingsOpened();
  }
  $('#setBtn').onclick = (e) => { e.stopPropagation(); const p = $('#setPop'); p.hidden = !p.hidden; if (!p.hidden) renderSettings(); };
  $('#setPop').addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { $('#setPop').hidden = true; });
  $('#setPop').addEventListener('change', (e) => {
    if (TP.museum) TP.museum.settingsChange(e);
    if (e.target.id === 'setNet') setNet(e.target.checked ? 'offline' : 'online');
    if (e.target.id === 'setHsd') {
      TP.settings.hsd = e.target.checked; store.set('toolpool.settings', TP.settings);
      toast(TP.settings.hsd ? 'HSD PBSA-Modus an' : 'HSD PBSA-Modus aus');
      if (TP.vorstufe) TP.vorstufe.refresh();
    }
  });

  // Für die Druckvorstufe (js/vorstufe.js)
  TP.app = {
    renderHi, credits, toast, store, go, poster: () => Object.assign({ key: S.format }, FORMATS[S.format]),
    // Ein Bild zur Zeit t in eine Leinwand rechnen (für Video/GIF); states = eigene Simulation pro Export
    frame: (c, t, states) => TP.compose(c, S.pieces, Object.assign({}, env, { t, s: c.width / FORMATS[S.format].w, export: true, states }), { mix: S.mix, paper: S.paper, key: 'video' }),
    time: () => env.t,
    board: () => JSON.parse(JSON.stringify(S)),
    setBoard: (b) => { S = JSON.parse(JSON.stringify(b)); env.states = {}; boardGen++; renderPalette(); commit(); updatePosterInfo(); if (!playing) togglePlay(); },
    renderPalette, renderSettings,
    perf: () => ({ ms: Math.round(msAvg), frames: drawCount }),
    posterCanvas: () => out,
    posterAnzeige,
    thumbs: () => thumbs,
    maus: () => env.mouse,
    hatBilder: () => S.pieces.some((pc) => pc.type === 'bild' && env.images[pc.id]),
    // Was der Mac mini braucht, um dieses Board zu rechnen
    fernZustand: () => ({
      gen: boardGen, pieces: S.pieces, mix: S.mix, paper: S.paper, poster: { w: FORMATS[S.format].w, h: FORMATS[S.format].h },
      playing, big, skala: renderScale, vorschau: PV.ws === 'aus' ? 0 : PV.ws === 'gross' ? 192 : 96, chk,
    }),
    // Stufen für schwache Rechner. Export und Druck rechnen weiter in voller Größe.
    // fern: Der Mac mini rechnet, dann entfallen auch die Vorschauen in der Bausteinliste.
    leistung(stufe, fern) {
      const L = { normal: [33, 1, null], sparsam: [50, 1, 'aus'], minimal: [83, 0.5, 'aus'] }[stufe] || [33, 1, null];
      minFrame = L[0]; renderScale = L[1];
      const gespeichert = store.get('toolpool.prev', {}), ws = L[2] || gespeichert.ws || 'klein', pal = L[2] || fern ? false : !!gespeichert.pal;
      if (ws !== PV.ws || pal !== PV.pal) { PV.ws = ws; PV.pal = pal; applyPrev(); renderPalette(); renderWS(); }
      document.documentElement.toggleAttribute('data-fern', !!fern);
      dirty = true;
    },
  };

  // ======================================================
  //  Start
  // ======================================================
  applyPrev();
  renderPalette();
  renderWS();
  renderInsp();
  updatePosterInfo();
  go(location.hash.slice(1) || 'baukasten');
  requestAnimationFrame(frame);
})();
