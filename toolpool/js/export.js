/* Tool Pool – Export des Plakats als Bild, GIF oder Video
   Bilder werden Bild für Bild gerechnet (nicht in Echtzeit aufgenommen), deshalb ruckelt nichts.
   GIF: gifenc · WebM (VP9) und MP4 (H.264): WebCodecs + webm-muxer / mp4-muxer. Alles lokal in js/vendor. */
(function () {
  const TP = window.TP, A = TP.app;
  if (!A) return;
  const $ = (s, r = document) => r.querySelector(s);

  const FORMATE = {
    png: { l: 'PNG', d: 'Standbild in hoher Auflösung.' },
    gif: { l: 'GIF', d: 'Läuft überall, max. 256 Farben je Bild. Gut für kurze Loops bis ca. 800 px.' },
    webm: { l: 'WebM', d: 'Video (VP9), kleine Dateien, für Web und Browser.' },
    mp4: { l: 'MP4', d: 'Video (H.264), läuft auf Handy, Mac, Instagram, Premiere.' },
    png_seq: { l: 'PNG-Folge', d: 'Einzelbilder nacheinander als PNG – für After Effects oder Resolume.' },
  };
  const GROESSE = [[540, 'S · 540'], [1080, 'M · 1080'], [1620, 'L · 1620'], [2160, 'XL · 2160']];
  const X = Object.assign({ fmt: 'mp4', w: 1080, sek: 4, fps: 30 }, A.store.get('toolpool.export', {}));
  const save = () => A.store.set('toolpool.export', X);
  let busy = false, abort = false;

  const canVideo = () => typeof window.VideoEncoder === 'function';
  const dims = () => {
    const p = A.poster(), w = X.fmt === 'png' ? X.w : X.w - (X.w % 2);
    let h = Math.round((w * p.h) / p.w); if (X.fmt !== 'png') h -= h % 2;   // Video braucht gerade Maße
    return [w, h];
  };
  const frames = () => Math.max(1, Math.round(X.sek * X.fps));

  function render() {
    const pop = $('#xpPop'), [w, h] = dims(), still = X.fmt === 'png';
    const gifBig = X.fmt === 'gif' && X.w > 1080;
    pop.innerHTML = `
      <h4>Export <button class="link mono" id="xpClose">×</button></h4>
      <div class="xp-seg" id="xpFmt">${Object.entries(FORMATE).map(([k, f]) => `<button data-f="${k}" class="${X.fmt === k ? 'on' : ''}">${f.l}</button>`).join('')}</div>
      <div class="mono mute xp-note">${FORMATE[X.fmt].d}</div>
      <div class="xp-row"><span class="mono">Breite</span><div class="xp-seg" id="xpW">${GROESSE.map(([v, l]) => `<button data-w="${v}" class="${X.w === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${still ? '' : `
      <div class="xp-row"><span class="mono">Dauer</span><label class="mono mute"><input class="line-input num" type="number" min="0.5" max="60" step="0.5" id="xpSek" value="${X.sek}"> s</label></div>
      <div class="xp-row"><span class="mono">Bilder/s</span><div class="xp-seg" id="xpFps">${[12, 15, 24, 25, 30, 60].map((v) => `<button data-fps="${v}" class="${X.fps === v ? 'on' : ''}">${v}</button>`).join('')}</div></div>`}
      <div class="mono mute xp-note">${w} × ${h} px${still ? '' : ' · ' + frames() + ' Bilder'}${gifBig ? ' · GIF so groß wird sehr langsam und riesig' : ''}${(X.fmt === 'webm' || X.fmt === 'mp4') && !canVideo() ? (window.isSecureContext ? ' · Dieser Browser kann nur in Echtzeit aufnehmen' : ' · Über die Netz-Adresse nur Echtzeit-Aufnahme, bei schweren Plakaten kann das ruckeln. GIF und PNG-Folge sind nicht betroffen.') : ''}</div>
      <div class="xp-bar"><i id="xpBar"></i></div>
      <div class="xp-go"><button class="btn dark" id="xpGo">${busy ? 'läuft …' : 'Exportieren'}</button>${busy ? '<button class="link mono" id="xpStop">abbrechen</button>' : ''}<span class="mono mute" id="xpInfo"></span></div>`;
  }

  function toggle(force) {
    const pop = $('#xpPop'), open = force != null ? force : pop.hidden;
    if (!open && busy) return;
    pop.hidden = !open;
    if (open) render();
  }

  const progress = (i, n, txt) => { const b = $('#xpBar'), t = $('#xpInfo'); if (b) b.style.width = (100 * i) / n + '%'; if (t) t.textContent = txt || i + ' / ' + n; };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const stamp = () => 'toolpool-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- die einzelnen Formate ----------
  async function exportPng() {
    const [w, h] = dims(), c = TP.util.canvas(w, h);
    A.frame(c, A.time(), {});
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    download(b, stamp() + '.png');
  }

  async function eachFrame(cb) {
    const [w, h] = dims(), c = TP.util.canvas(w, h), n = frames(), t0 = A.time(), states = {};
    for (let i = 0; i < n; i++) {
      if (abort) throw new Error('abgebrochen');
      A.frame(c, t0 + i / X.fps, states);
      await cb(c, i, n);
      progress(i + 1, n);
      if (i % 2 === 0) await tick();
    }
    return c;
  }

  async function exportGif() {
    const { GIFEncoder, quantize, applyPalette } = window.gifenc;
    const [w, h] = dims(), gif = GIFEncoder(), delay = Math.round(1000 / X.fps);
    await eachFrame((c) => {
      const data = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      const palette = quantize(data, 256, { format: 'rgb565' });
      gif.writeFrame(applyPalette(data, palette, 'rgb565'), w, h, { palette, delay });
    });
    gif.finish();
    download(new Blob([gif.bytes()], { type: 'image/gif' }), stamp() + '.gif');
  }

  async function exportPngSeq() {
    const pad = String(frames()).length;
    await eachFrame(async (c, i) => {
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      download(b, stamp().slice(0, 18) + '_' + String(i + 1).padStart(Math.max(4, pad), '0') + '.png');
      await new Promise((r) => setTimeout(r, 120));   // Browser lässt sonst Downloads fallen
    });
  }

  async function pickCodec(kind, w, h) {
    const list = kind === 'mp4' ? ['avc1.640034', 'avc1.640033', 'avc1.4d0034', 'avc1.42003e'] : ['vp09.00.51.08', 'vp09.00.41.08', 'vp8'];
    const bitrate = Math.round(w * h * X.fps * 0.12);
    for (const codec of list) {
      const cfg = { codec, width: w, height: h, bitrate, framerate: X.fps };
      if (kind === 'mp4') cfg.avc = { format: 'avc' };
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) { /* nächster */ }
    }
    throw new Error('Dieser Browser kann ' + kind.toUpperCase() + ' in ' + w + '×' + h + ' nicht kodieren');
  }

  async function exportVideo(kind) {
    const [w, h] = dims();
    if (!canVideo()) return exportRealtime(kind);
    const cfg = await pickCodec(kind, w, h);
    const M = kind === 'mp4' ? window.Mp4Muxer : window.WebMMuxer;
    const target = new M.ArrayBufferTarget();
    const muxer = kind === 'mp4'
      ? new M.Muxer({ target, video: { codec: 'avc', width: w, height: h, frameRate: X.fps }, fastStart: 'in-memory' })
      : new M.Muxer({ target, video: { codec: cfg.codec.startsWith('vp8') ? 'V_VP8' : 'V_VP9', width: w, height: h, frameRate: X.fps } });
    let err = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (err = e) });
    enc.configure(cfg);
    const dur = 1e6 / X.fps;
    await eachFrame(async (c, i) => {
      if (err) throw err;
      const vf = new VideoFrame(c, { timestamp: Math.round(i * dur), duration: Math.round(dur) });
      enc.encode(vf, { keyFrame: i % (X.fps * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5));
    });
    progress(1, 1, 'schreibe Datei …');
    await enc.flush(); enc.close();
    if (err) throw err;
    muxer.finalize();
    download(new Blob([target.buffer], { type: kind === 'mp4' ? 'video/mp4' : 'video/webm' }), stamp() + '.' + kind);
  }

  // Ohne WebCodecs (ältere Browser): in Echtzeit mit MediaRecorder aufnehmen
  async function exportRealtime(kind) {
    const [w, h] = dims(), c = TP.util.canvas(w, h);
    const types = kind === 'mp4' ? ['video/mp4;codecs=avc1', 'video/mp4'] : ['video/webm;codecs=vp9', 'video/webm'];
    const type = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) throw new Error(kind.toUpperCase() + ' wird von diesem Browser nicht unterstützt');
    const rec = new MediaRecorder(c.captureStream(X.fps), { mimeType: type, videoBitsPerSecond: Math.round(w * h * X.fps * 0.12) }), parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start();
    const n = frames(), t0 = A.time(), states = {}, start = performance.now();
    for (let i = 0; i < n; i++) {
      if (abort) break;
      A.frame(c, t0 + i / X.fps, states);
      progress(i + 1, n);
      const wait = start + ((i + 1) * 1000) / X.fps - performance.now();
      await new Promise((r) => setTimeout(r, Math.max(0, wait)));
    }
    rec.stop(); await done;
    if (abort) throw new Error('abgebrochen');
    download(new Blob(parts, { type: type.split(';')[0] }), stamp() + '.' + kind);
  }

  async function go() {
    if (busy) return;
    busy = true; abort = false; render();
    const t = performance.now();
    try {
      if (X.fmt === 'png') await exportPng();
      else if (X.fmt === 'gif') await exportGif();
      else if (X.fmt === 'png_seq') await exportPngSeq();
      else await exportVideo(X.fmt);
      A.toast(FORMATE[X.fmt].l + ' fertig (' + ((performance.now() - t) / 1000).toFixed(1) + ' s)');
    } catch (e) {
      console.error(e); A.toast('Export: ' + e.message);
    } finally {
      busy = false; render();
    }
  }

  // ---------- Ereignisse ----------
  const pop = $('#xpPop');
  pop.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'xpClose') return toggle(false);
    if (b.id === 'xpGo') return go();
    if (b.id === 'xpStop') { abort = true; return; }
    if (busy) return;
    if (b.dataset.f) { X.fmt = b.dataset.f; if (X.fmt === 'gif' && X.w > 1080) X.w = 540; if (X.fmt === 'gif' && X.fps > 25) X.fps = 15; }
    if (b.dataset.w) X.w = +b.dataset.w;
    if (b.dataset.fps) X.fps = +b.dataset.fps;
    save(); render();
  });
  pop.addEventListener('change', (e) => { if (e.target.id === 'xpSek') { X.sek = Math.min(60, Math.max(0.5, parseFloat(e.target.value) || 4)); save(); render(); } });
  document.addEventListener('click', () => { if (!busy && !pop.hidden) toggle(false); });

  TP.exporter = { toggle, go, settings: X };
})();
