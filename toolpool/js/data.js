/* Tool Pool – Sammlung
   Oben die Tools aus dem Ranking des Boards, darunter alle 52 Tools von playgrnd.tools.
   Bei playgrnd-Tools kommen Beschreibung, Familie und Technik aus dem passenden Node (js/playgrnd.js). */
(function () {
  const TP = (window.TP = window.TP || {});

  // [Name, Link, Autor:in, Familie, Beschreibung, Technik ('' = nicht geprüft)]
  const pool = [
    ['ATOM', 'https://atomtypelab.com', 'David Fucsku', 'schrift', 'experimentelles Typografie-Tool', ''],
    ['Stoer Editor', 'https://zobinkiesel.de', 'Robin Kiesel', 'schrift', 'abstrakte Buchstabenvariationen', ''],
    ['Space Type Generator', 'https://spacetypegenerator.com', 'Kiel Mutschelknaus', 'schrift', 'kinetischer Schriftgenerator', ''],
    ['Hypha', 'https://hyphahypha.com', '—', 'organisch', 'lässt Buchstaben (und anderes) wachsen', ''],
    ['TAAG', 'https://patorjk.com/software/taag', 'patorjk', 'zeichen', 'Text als ASCII-Art', ''],
    ['ASCII Automata', 'https://constraint.systems', '—', 'zeichen', 'ASCII-Art-Raster', ''],
    ['Grainrad', 'https://grainrad.com', '—', 'raster', 'ASCII, Dithering und Retro-Effekte', 'pixel'],
    ['Dither Garden', 'https://dithergarden.com', '—', 'raster', 'Bilder dithern', 'pixel'],
    ['Book of Shapes', 'https://bookofshapes.com', 'Nikolaj Sokolowski', 'muster', 'generative SVG-Muster', 'vektor'],
    ['Gradientor', 'https://gradientor.afterimage.cc', 'Afterimage', 'feld', 'Zeichnen mit Verläufen', ''],
  ];

  const playgrnd = ('ODDGRID ZIG QUILT AURA WARP SPECIMEN TOKENS VEE FETE PARCEL WEAVE STIPPLE MODULAR STATIC OPTIC RISE PRISM RISO DELTA MIST ' +
    'TOTEM ATLAS SAMPLER RELIEF KIOSK MOSH PANE SONAR BLOOM SEAR CARVE CULTURE HUSK STRAND CHAFF SPLICE WHORL SPRIG FROND PITH HISS BENDAY ' +
    'STITCH FOLD CORAL DAHLIA CIPHER MOTLEY VEIN CROWD FILAMENT TERRAIN').split(' ');

  TP.TOOLS = pool.map(([name, url, author, cat, desc, tech]) => ({ name, url, author, cat, desc, tech }));
  playgrnd.forEach((n) => TP.TOOLS.push({ name: n, url: 'https://www.playgrnd.tools/' + n.toLowerCase() + '/index.html', author: 'playgrnd', cat: '', desc: '', tech: '', node: 'pg_' + n.toLowerCase() }));
  TP.TOOLS.forEach((t, i) => (t.id = 't' + i));

  // Startwerte fürs Ranking (aus dem Board)
  TP.SEED_VOTES = { ATOM: 9, 'Stoer Editor': 8, 'Dither Garden': 7, Grainrad: 7, 'Book of Shapes': 6, Hypha: 6, MOSH: 5, 'Space Type Generator': 5, Gradientor: 4, TAAG: 3 };
})();
