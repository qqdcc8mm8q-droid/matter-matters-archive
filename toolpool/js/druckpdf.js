/* Tool Pool – Druck-PDF für den Live-Druck
   Wird im Browser des Laptops genutzt (js/museum.js) und auf dem Mac mini (js/render.js). */
(function () {
  const TP = window.TP;
  const PT = 72 / 25.4, DPI = 200, RAND = 6, UNTEN = 10;
  TP.DRUCK_PAPIER = { A4: [210, 297], A3: [297, 420] };

  // Tools, die in das Plakat eingeflossen sind (für die Fußzeile)
  TP.credits = function (pieces) {
    const seen = new Set(), live = TP.upstream(pieces);
    pieces.filter((pc) => live.has(pc.id)).forEach((pc) => {
      const t = TP.BLOCKS[pc.type] && TP.BLOCKS[pc.type].tool;
      if (t && t !== '—' && !/eigene|weird/.test(t)) t.split(' · ').forEach((x) => x !== 'playgrnd' && seen.add(x.trim()));
    });
    return [...seen];
  };

  // So groß muss das Plakat gerechnet werden, damit es auf dem Papier scharf ist
  TP.druckSkala = function (f, format) {
    const [a, b] = TP.DRUCK_PAPIER[format];
    return ((Math.max(a, b) / 25.4) * DPI) / Math.max(f.w, f.h);
  };

  // c: das fertig gerechnete Plakat. Liefert die PDF-Datei als Uint8Array.
  TP.druckPdf = async function (c, format, credits) {
    const [a, b] = TP.DRUCK_PAPIER[format], quer = c.width > c.height;
    const W = quer ? b : a, H = quer ? a : b;
    const jpg = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.93));
    const doc = await PDFLib.PDFDocument.create();
    doc.setTitle('Tool Pool'); doc.setCreator('Tool Pool · Live-Druck');
    const img = await doc.embedJpg(await jpg.arrayBuffer());
    const page = doc.addPage([W * PT, H * PT]);
    const k = Math.min((W - 2 * RAND) / c.width, (H - RAND - UNTEN) / c.height), dw = c.width * k, dh = c.height * k;
    page.drawImage(img, { x: ((W - dw) / 2) * PT, y: (UNTEN + (H - RAND - UNTEN - dh) / 2) * PT, width: dw * PT, height: dh * PT });
    const zeile = ('Tool Pool · ' + new Date().toLocaleDateString('de-DE') + (credits.length ? ' · ' + credits.join(' · ') : '')).replace(/[^\x20-\x7E\xA0-\xFF]/g, '').slice(0, 150);
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    page.drawText(zeile, { x: RAND * PT, y: 5 * PT, size: 6, font, color: PDFLib.rgb(0.25, 0.25, 0.25) });
    return doc.save();
  };
})();
