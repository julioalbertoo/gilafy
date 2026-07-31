/* Comprobaciones de extremo a extremo de Gilafy.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node test/e2e.js
 *
 * Sirve la app en localhost y simula archive.org por completo: búsqueda,
 * metadatos, carátulas y un WAV sintético de 2 s. Así las comprobaciones son
 * deterministas y no dependen de la red ni del catálogo real.
 *
 * Variables opcionales:
 *   PW_CHROMIUM  ruta a un Chromium concreto
 *   SHOTS        carpeta donde dejar las capturas
 */
'use strict';

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'gilafy-shots');
const PORT = 4173;

fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('no encontrado'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

/* ── Catálogo simulado ─────────────────────────────────────── */

const SHOWS = [
  { identifier: 'kglw2022-10-15.matrix', title: 'King Gizzard Live at Red Rocks 2022-10-15', date: '2022-10-15T00:00:00Z', year: '2022', creator: 'King Gizzard & The Lizard Wizard', coverage: 'Morrison, CO', venue: 'Red Rocks Amphitheatre', downloads: 91234, avg_rating: '4.9', publicdate: '2022-11-01T00:00:00Z' },
  { identifier: 'kglw2019-06-01.akg', title: 'King Gizzard Live in Melbourne 2019-06-01', date: '2019-06-01T00:00:00Z', year: '2019', creator: 'King Gizzard & The Lizard Wizard', coverage: 'Melbourne, AU', venue: 'Forum Theatre', downloads: 55010, avg_rating: '4.5', publicdate: '2019-07-01T00:00:00Z' },
  { identifier: 'kglw2023-03-04.sbd', title: 'King Gizzard & The Lizard Wizard Live at the Aragon Ballroom in Chicago on 2023-03-04', date: '2023-03-04T00:00:00Z', year: '2023', creator: 'King Gizzard & The Lizard Wizard', coverage: 'Chicago, IL', venue: 'Aragon Ballroom', downloads: 33001, avg_rating: '4.2', publicdate: '2023-04-01T00:00:00Z' },
  { identifier: 'kglw2018-08-08.dsbd', title: 'King Gizzard Live in Barcelona 2018-08-08', date: '2018-08-08T00:00:00Z', year: '2018', creator: 'King Gizzard & The Lizard Wizard', coverage: 'Barcelona, ES', venue: 'Razzmatazz', downloads: 12000, avg_rating: '3.9', publicdate: '2018-09-01T00:00:00Z' },
];

const TITLES = ['Rattlesnake', 'Robot Stop', 'The River', 'Crumbling Castle'];

/* El archivo suele tener varias subidas del mismo disco liberado; la app debe
 * quedarse con una sola, la más descargada. El último es un directo que sólo
 * menciona el título y no debe colarse como álbum de estudio.
 *
 * Las maquetas comparten frase de búsqueda y sólo las distingue el número de
 * volumen, así que van escritas como aparecen en el archivo —con puntuación y
 * sin ella— para comprobar que ni se confunden entre sí ni se pierden. */
const STUDIO = [
  { identifier: 'polygondwanaland-flac', title: 'King Gizzard & The Lizard Wizard - Polygondwanaland', creator: 'King Gizzard & The Lizard Wizard', year: '2017', date: '2017-11-17T00:00:00Z', downloads: 4000, avg_rating: '5.0' },
  { identifier: 'Polygondwanaland_mp3', title: 'Polygondwanaland (free release)', creator: 'King Gizzard & The Lizard Wizard', year: '2017', date: '2017-11-20T00:00:00Z', downloads: 91000, avg_rating: '4.8' },
  { identifier: 'teenage-gizzard-bootlegger', title: 'King Gizzard & The Lizard Wizard - Teenage Gizzard', creator: 'King Gizzard & The Lizard Wizard', year: '2020', date: '2020-12-24T00:00:00Z', downloads: 7100, avg_rating: '4.6' },
  { identifier: 'kglw-demos-vol-1-2', title: 'King Gizzard - Demos Vol. 1 + Vol. 2', creator: 'King Gizzard & The Lizard Wizard', year: '2020', date: '2020-09-29T00:00:00Z', downloads: 6200, avg_rating: '4.4' },
  { identifier: 'kglw-demos-vol-1-2-tape', title: 'Demos Vol 1 & 2 (tape rip)', creator: 'King Gizzard & The Lizard Wizard', year: '2020', date: '2020-10-02T00:00:00Z', downloads: 900, avg_rating: '4.0' },
  { identifier: 'kglw-demos-vol-3-4', title: 'Demos Vol 3 + Vol 4', creator: 'King Gizzard & The Lizard Wizard', year: '2022', date: '2022-07-15T00:00:00Z', downloads: 3100, avg_rating: '4.3' },
  { identifier: 'kglw-otro-directo', title: 'KGLW Live in Utrecht', creator: 'King Gizzard & The Lizard Wizard', year: '2019', date: '2019-05-05T00:00:00Z', downloads: 500, avg_rating: '4.0' },
];

/* Cómo debe quedar la sección de álbumes: un disco por entrada de FREE_STUDIO
 * que el archivo tenga, con el título canónico de la app —no el de la subida—.
 * Las maquetas 5+6 y 7+8 no están en el simulacro a propósito: lo que no
 * aparece en el archivo simplemente no se pinta. */
const STUDIO_TITLES = ['Polygondwanaland', 'Teenage Gizzard', 'Demos Vol. 1 + Vol. 2', 'Demos Vol. 3 + Vol. 4'];

/** Cada tema aparece en tres formatos, como en el archivo real: la app debe
 *  quedarse con un único derivado reproducible por pista. */
function metaFor(id) {
  const show = SHOWS.find((s) => s.identifier === id) || SHOWS[0];
  const files = [];
  TITLES.forEach((title, i) => {
    const stem = `${id}t${String(i + 1).padStart(2, '0')}`;
    const length = `${200 + i * 30}.5`;
    files.push({ name: `${stem}.flac`, format: 'Flac', title, track: String(i + 1), length });
    files.push({ name: `${stem}.mp3`, format: 'VBR MP3', title, track: String(i + 1), length, original: `${stem}.flac` });
    files.push({ name: `${stem}_64kb.mp3`, format: '64Kbps MP3', title, track: String(i + 1), length, original: `${stem}.flac` });
  });
  files.push({ name: `${id}_meta.xml`, format: 'Metadata' });
  return {
    metadata: {
      identifier: id, title: show.title, creator: show.creator, date: show.date,
      venue: show.venue, coverage: show.coverage,
      description: '<p>Grabación de audiencia autorizada por la banda.</p>',
    },
    files,
  };
}

function wav(seconds = 2) {
  const rate = 8000, n = rate * seconds;
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write('data', 36); buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(40 * Math.sin(i / 12));
  return buf;
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

/** Texto visible de la página descontando el rótulo fijo de la cabecera: ahí
 *  el nombre del grupo va entero a propósito. La abreviatura a KGLW es para
 *  lo que llega del archivo, no para la marca. */
async function bodyWithoutBrand(p) {
  return p.evaluate(() => {
    const text = document.body.innerText;
    const brand = document.querySelector('.topbar__group')?.innerText;
    return brand ? text.split(brand).join('') : text;
  });
}

/* La versión de los datos guardados se lee del código, no se fija a mano:
   así las comprobaciones de caché no se desfasan cuando sube. */
const DATA_VERSION = Number(
  fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/const DATA_VERSION = (\d+)/)?.[1]);
if (!DATA_VERSION) throw new Error('no se pudo leer DATA_VERSION de app.js');

/* ── Ejecución ─────────────────────────────────────────────── */

(async () => {
  await new Promise((r) => server.listen(PORT, r));

  const browser = await chromium.launch({
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  /* El simulador del archivo se registra por contexto, así que vive suelto:
     más abajo abrimos un segundo contexto (táctil) que necesita el mismo. */
  const archiveRoute = async (route) => {
    const url = route.request().url();
    if (url.includes('advancedsearch.php')) {
      // La consulta de estudio es distinta de la del catálogo en directo.
      const studio = /polygondwanaland/i.test(decodeURIComponent(url));
      const docs = studio ? STUDIO : SHOWS;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ response: { numFound: docs.length, docs } }) });
    }
    if (url.includes('/metadata/')) {
      const id = decodeURIComponent(url.split('/metadata/')[1].split('?')[0]);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(metaFor(id)) });
    }
    if (url.includes('/services/img/')) {
      return route.fulfill({ contentType: 'image/png', body: PNG, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.includes('/download/')) {
      return route.fulfill({ contentType: 'audio/wav', body: wav(2), headers: { 'Accept-Ranges': 'bytes' } });
    }
    console.log('  [simulación: URL inesperada]', url);
    return route.fulfill({ status: 404, body: '' });
  };
  await ctx.route('**/archive.org/**', archiveRoute);

  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`error de página: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`consola: ${m.text()}`); });

  const step = async (name, fn) => {
    try { await fn(); console.log(`  ok  ${name}`); }
    catch (e) { console.log(`  FALLO ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
  };

  const url = `http://localhost:${PORT}/index.html`;

  console.log('\n== Publicaciones ==');
  await page.goto(url, { waitUntil: 'networkidle' });
  await step('el catálogo llega a la estantería', async () => {
    await page.waitForSelector('.shelf__item', { timeout: 8000 });
    const n = await page.locator('.shelf__item').count();
    // Los directos más los discos de estudio que sobreviven a la criba.
    const esperados = SHOWS.length + STUDIO_TITLES.length;
    if (n !== esperados) throw new Error(`esperaba ${esperados} items, hay ${n}`);
  });

  await step('los discos liberados aparecen, deduplicados y etiquetados', async () => {
    const row = page.locator('.section', { hasText: 'Álbumes' });
    await row.waitFor({ timeout: 6000 });
    const titulos = await row.locator('.pub__title').allTextContents();
    if (titulos.length !== STUDIO_TITLES.length) {
      throw new Error(`esperaba ${STUDIO_TITLES.length} álbumes, hay ${titulos.length}: ${titulos.join(' | ')}`);
    }
    for (const wanted of STUDIO_TITLES) {
      const copias = titulos.filter((t) => t === wanted).length;
      if (copias !== 1) throw new Error(`«${wanted}» sale ${copias} veces: ${titulos.join(' | ')}`);
    }
    const text = await row.locator('.pub').first().innerText();
    if (!text.includes('Álbum')) throw new Error(`sin el tipo de publicación: ${text.trim()}`);
    // De cada disco debe elegir la copia más descargada.
    const hrefs = await row.locator('.pub__open').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    for (const wanted of ['Polygondwanaland_mp3', 'kglw-demos-vol-1-2']) {
      if (!hrefs.some((h) => h.includes(wanted))) throw new Error(`no eligió ${wanted}: ${hrefs.join(' | ')}`);
    }
    if (hrefs.some((h) => h.includes('tape'))) throw new Error('eligió la copia menos descargada de las maquetas');
  });

  await step('un directo que cita el título no cuenta como estudio', async () => {
    const albumes = await page.locator('.section', { hasText: 'Álbumes' }).locator('.pub__title').allTextContents();
    if (!albumes.length) throw new Error('la sección de álbumes está vacía');
    const intrusas = albumes.filter((t) => !STUDIO_TITLES.includes(t));
    if (intrusas.length) throw new Error(`listadas como álbum: ${intrusas.join(' | ')}`);
    const body = await page.locator('body').innerText();
    if (body.includes('Utrecht')) throw new Error('se coló un directo en la búsqueda de estudio');
  });
  await step('la cabecera de publicaciones sólo lleva el grupo', async () => {
    // Publicaciones es la portada: ni título ni botón atrás, que no llevaría
    // a ninguna parte. El resto de vistas sí se anuncian.
    if (await page.locator('#viewTitle').isVisible()) {
      throw new Error(`sigue el título «${await page.locator('#viewTitle').textContent()}»`);
    }
    if (await page.locator('#navBack').isVisible()) throw new Error('sigue el botón atrás');
  });
  await step('el nombre del grupo va en la cabecera, a la altura de la lupa', async () => {
    const brand = page.locator('.topbar__group');
    const text = (await brand.textContent()).trim();
    if (text !== 'King Gizzard & The Lizard Wizard') throw new Error(`rótulo = «${text}»`);

    const [a, b] = [await brand.boundingBox(), await page.locator('#searchToggle').boundingBox()];
    const dy = Math.abs((a.y + a.height / 2) - (b.y + b.height / 2));
    if (dy > 4) throw new Error(`descuadrado con la lupa: ${dy.toFixed(1)}px`);
  });
  await step('secciones de publicaciones', async () => {
    const titles = await page.locator('.section__title').allTextContents();
    for (const wanted of ['Última publicación', 'Álbumes', 'Directos']) {
      if (!titles.includes(wanted)) throw new Error(`falta «${wanted}»: ${titles.join(' | ')}`);
    }
  });
  await step('filas de publicación renderizadas', async () => {
    if (await page.locator('.pub').count() < SHOWS.length) throw new Error('faltan filas');
  });
  await step('el play de cada fila va en verde', async () => {
    /* DESIGN.md reserva el acento para reproducir, activo y CTA. En una lista
     * de filas es el único sitio donde aparece: si se apaga, la pantalla
     * entera se queda en grises. */
    const { icono, verde } = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--green)';
      document.body.append(probe);
      const verde = getComputedStyle(probe).color;
      probe.remove();
      return { icono: getComputedStyle(document.querySelector('.pub__play')).color, verde };
    });
    if (icono !== verde) throw new Error(`el play es ${icono} y el verde es ${verde}`);
  });
  await step('los filtros dejan un solo tipo', async () => {
    await page.locator('.filter', { hasText: 'Álbumes' }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.section__title')].every((h) => h.textContent !== 'Directos'),
    null, { timeout: 4000 });
    const metas = await page.locator('.pub__meta').allTextContents();
    const intrusas = metas.filter((m) => !m.startsWith('Álbum'));
    if (intrusas.length) throw new Error(`con el filtro de álbumes se cuelan: ${intrusas.join(' | ')}`);
    await page.locator('.filter', { hasText: 'Todo' }).click();
    await page.waitForSelector('.section__title:text-is("Directos")', { timeout: 4000 });
  });
  await step('la cola arranca oculta', async () => {
    if (await page.locator('#queue').isVisible()) throw new Error('el panel de cola es visible');
  });
  await step('un solo icono de volumen visible', async () => {
    const n = await page.locator('#btnMute svg:visible').count();
    if (n !== 1) throw new Error(`${n} iconos visibles`);
  });
  await step('el nombre de la banda se abrevia a KGLW', async () => {
    const text = await bodyWithoutBrand(page);
    if (/King\s*Gizzard/i.test(text)) {
      const hit = text.match(/.{0,40}King\s*Gizzard.{0,40}/i)[0];
      throw new Error(`nombre largo sin abreviar: «${hit.trim()}»`);
    }
    if (!text.includes('KGLW')) throw new Error('no aparece KGLW por ninguna parte');
  });
  await page.screenshot({ path: `${OUT}/01-home.png` });

  await step('el buscador no aparece hasta pulsar la lupa', async () => {
    if (await page.locator('#searchbar').isVisible()) throw new Error('la barra ya estaba desplegada');
    // La lupa vive arriba a la derecha, junto al atajo a la biblioteca.
    const sitio = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { lupa: r('#searchToggle'), kg: r('.avatar'), cabecera: r('.topbar') };
    });
    if (sitio.cabecera.right - sitio.lupa.right > 120) throw new Error('la lupa no está pegada a la derecha');
    if (sitio.lupa.left > sitio.kg.left) throw new Error('la lupa quedó por detrás de KG');
    await page.locator('#searchToggle').click();
    await page.waitForSelector('#searchbar:visible', { timeout: 4000 });
    const foco = await page.evaluate(() => document.activeElement.id);
    if (foco !== 'searchInput') throw new Error(`el foco se quedó en «${foco}»`);
    // Volver a pulsarla la repliega.
    await page.locator('#searchToggle').click();
    if (await page.locator('#searchbar').isVisible()) throw new Error('no se plegó al repulsar');
    await page.locator('#searchToggle').click();
    await page.waitForSelector('#searchbar:visible', { timeout: 4000 });
  });

  await step('el buscador queda arriba y no se desplaza con el contenido', async () => {
    const antes = await page.evaluate(() => {
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      return {
        barra: r('.searchbar'), topbar: r('.topbar'), vista: r('.view'),
        player: r('#player'), alto: window.innerHeight,
        pestanas: document.querySelectorAll('.tabbar').length,
      };
    });
    if (antes.pestanas) throw new Error('sigue habiendo barra de pestañas');
    if (antes.barra.top < antes.topbar.bottom - 1) throw new Error('el buscador se solapa con la cabecera');
    if (antes.barra.bottom > antes.vista.top + 1) throw new Error('el buscador se mete dentro de la vista');
    if (Math.round(antes.player.bottom) !== Math.round(antes.alto)) throw new Error('el reproductor no toca el borde inferior');

    const despues = await page.evaluate(() => {
      document.querySelector('#view').scrollTop = 600;
      return document.querySelector('.searchbar').getBoundingClientRect().top;
    });
    if (Math.round(despues) !== Math.round(antes.barra.top)) {
      throw new Error(`se movió al desplazar: ${antes.barra.top} → ${despues}`);
    }
    await page.evaluate(() => { document.querySelector('#view').scrollTop = 0; });
  });

  console.log('\n== Grabación y reproducción ==');
  await step('abrir grabación', async () => {
    await page.locator('.pub__open').first().click();
    await page.waitForSelector('.track', { timeout: 8000 });
  });
  await step('fuera de la portada vuelven título y botón atrás', async () => {
    const t = await page.locator('#viewTitle').textContent();
    if (t !== 'Grabación') throw new Error(`título = «${t}»`);
    if (!(await page.locator('#navBack').isVisible())) throw new Error('sin botón atrás');
    if (await page.locator('#searchbar').isVisible()) throw new Error('el buscador siguió desplegado al navegar');
    // El grupo no se va: con título encima queda como antetítulo.
    if (!(await page.locator('.topbar__group').isVisible())) throw new Error('desapareció el nombre del grupo');
  });
  await step('deduplicación de derivados (4 temas, no 12)', async () => {
    const n = await page.locator('.track').count();
    if (n !== TITLES.length) throw new Error(`esperaba ${TITLES.length} pistas, hay ${n}`);
  });
  await step('títulos y duraciones', async () => {
    const row = await page.locator('.track').first().textContent();
    if (!row.includes('Rattlesnake') || !row.includes('3:20')) throw new Error(`fila: ${row.trim()}`);
  });
  await step('la vista de grabación también abrevia', async () => {
    const text = await page.locator('.view').innerText();
    if (/King\s*Gizzard/i.test(text)) throw new Error('nombre largo en la vista de grabación');
    if (!(await page.locator('.track__meta').first().textContent()).includes('KGLW')) {
      throw new Error('la fila de tema no muestra KGLW');
    }
  });
  await page.screenshot({ path: `${OUT}/02-album.png` });

  await step('reproducir la grabación', async () => {
    await page.locator('#albumPlay').click();
    await page.waitForFunction(() => {
      const a = document.querySelector('#audio');
      return a && !a.paused && a.currentTime > 0.1;
    }, { timeout: 8000 });
  });
  await step('la barra de reproducción se actualiza', async () => {
    const title = await page.locator('#npTitle').textContent();
    if (title !== 'Rattlesnake') throw new Error(`npTitle = ${title}`);
  });
  await step('Media Session publica metadatos y carátula', async () => {
    const md = await page.evaluate(() => {
      const m = navigator.mediaSession?.metadata;
      return m ? { title: m.title, artist: m.artist, album: m.album, art: m.artwork.length } : null;
    });
    if (!md || md.title !== 'Rattlesnake' || md.art < 1) throw new Error(JSON.stringify(md));
    if (md.artist !== 'KGLW') throw new Error(`artist = ${md.artist}`);
  });
  await step('playbackState = playing', async () => {
    const s = await page.evaluate(() => navigator.mediaSession.playbackState);
    if (s !== 'playing') throw new Error(s);
  });
  await page.screenshot({ path: `${OUT}/03-playing.png` });

  console.log('\n== Segundo plano ==');
  await step('sigue sonando con la pestaña oculta', async () => {
    const other = await ctx.newPage();            // roba el foco → visibilitychange
    await other.goto('about:blank');
    await other.bringToFront();
    await new Promise((r) => setTimeout(r, 1200));
    const st = await page.evaluate(() => ({
      hidden: document.hidden,
      paused: document.querySelector('#audio').paused,
    }));
    await other.close();
    await page.bringToFront();
    if (st.paused) throw new Error(`se pausó al ocultar (hidden=${st.hidden})`);
    if (!st.hidden) console.log('      (nota: en headless la pestaña no llegó a marcarse hidden)');
  });
  await step('avance automático al terminar la pista', async () => {
    await page.evaluate(() => {
      const a = document.querySelector('#audio');
      a.currentTime = Math.max(0, a.duration - 0.15);
    });
    await page.waitForFunction(() => document.querySelector('#npTitle').textContent === 'Robot Stop', { timeout: 10000 });
  });
  await step('los manejadores de Media Session responden', async () => {
    const before = await page.evaluate(() => document.querySelector('#npTitle').textContent);
    await page.evaluate(() => document.querySelector('#btnNext').click());
    await page.waitForFunction((b) => document.querySelector('#npTitle').textContent !== b, before, { timeout: 6000 });
  });

  console.log('\n== Controles ==');
  await step('pausa y reanudación, con cambio de icono', async () => {
    await page.locator('#btnPlay').click();
    await page.waitForFunction(() => document.querySelector('#audio').paused, { timeout: 4000 });
    await page.waitForSelector('#btnPlay .ico-play', { state: 'visible', timeout: 4000 });
    await page.waitForSelector('#btnPlay .ico-pause', { state: 'hidden', timeout: 4000 });
    await page.locator('#btnPlay').click();
    await page.waitForFunction(() => !document.querySelector('#audio').paused, { timeout: 4000 });
    await page.waitForSelector('#btnPlay .ico-pause', { state: 'visible', timeout: 4000 });
    await page.waitForSelector('#btnPlay .ico-play', { state: 'hidden', timeout: 4000 });
  });
  await step('el icono de silencio alterna', async () => {
    await page.locator('#btnMute').click();
    if (!(await page.locator('#btnMute .ico-muted').isVisible())) throw new Error('sin icono de silencio');
    await page.locator('#btnMute').click();
    if (!(await page.locator('#btnMute .ico-vol').isVisible())) throw new Error('no vuelve el icono de volumen');
  });
  await step('aleatorio y repetición', async () => {
    await page.locator('#btnShuffle').click();
    if (await page.locator('#btnShuffle').getAttribute('aria-pressed') !== 'true') throw new Error('aleatorio no se activó');
    await page.locator('#btnRepeat').click();
    await page.locator('#btnRepeat').click();
    if (await page.locator('#btnRepeat').getAttribute('data-mode') !== 'one') throw new Error('repetición != one');
    await page.locator('#btnRepeat').click();
  });
  await step('me gusta se persiste', async () => {
    await page.locator('#btnLike').click();
    const liked = await page.evaluate(() => JSON.parse(localStorage.getItem('gilafy.liked')));
    if (!liked?.length) throw new Error('no se guardó');
  });
  await step('la cola lista la reproducción actual', async () => {
    await page.locator('#btnQueue').click();
    await page.waitForSelector('.queue__item', { timeout: 4000 });
    const n = await page.locator('.queue__item').count();
    if (n !== TITLES.length) throw new Error(`cola con ${n} items`);
  });
  await page.screenshot({ path: `${OUT}/04-queue.png` });
  await page.locator('#queueClose').click();

  await step('volumen por teclado', async () => {
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('ArrowDown');
    const v = await page.evaluate(() => document.querySelector('#audio').volume);
    if (v > 0.96) throw new Error(`volumen ${v}`);
  });
  await step('la barra de progreso salta al hacer clic', async () => {
    const box = await page.locator('#seek').boundingBox();
    const before = await page.evaluate(() => document.querySelector('#audio').currentTime);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
    await new Promise((r) => setTimeout(r, 400));
    const after = await page.evaluate(() => document.querySelector('#audio').currentTime);
    if (Math.abs(after - before) < 0.3) throw new Error(`no saltó (${before} → ${after})`);
  });

  console.log('\n== Búsqueda y biblioteca ==');
  await step('buscar por ciudad', async () => {
    await page.locator('#searchToggle').click();
    await page.waitForSelector('#searchbar:visible', { timeout: 4000 });
    await page.locator('#searchInput').fill('Barcelona');
    await page.waitForFunction(() => location.hash.includes('search'), { timeout: 4000 });
    await page.waitForSelector('.card', { timeout: 6000 });
    const n = await page.locator('.card').count();
    if (n !== 1) throw new Error(`${n} resultados para Barcelona`);
  });
  await page.screenshot({ path: `${OUT}/05-search.png` });
  await step('estado vacío sin resultados', async () => {
    await page.locator('#searchInput').fill('zzzzz');
    await page.waitForSelector('.state__title', { timeout: 6000 });
  });
  await step('la biblioteca muestra los favoritos', async () => {
    await page.locator('#searchInput').fill('');
    await page.evaluate(() => { location.hash = '#/library'; });
    await page.waitForSelector('#likedPlay', { timeout: 6000 });
  });
  await page.screenshot({ path: `${OUT}/06-library.png` });

  console.log('\n== Persistencia y errores ==');
  await step('la sesión se restaura tras recargar', async () => {
    const before = await page.evaluate(() => document.querySelector('#npTitle').textContent);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction((b) => document.querySelector('#npTitle').textContent === b, before, { timeout: 8000 });
  });
  await step('una caché de una versión anterior se descarta', async () => {
    /* El catálogo y la sesión se guardan YA procesados. Si una copia vieja
     * sobrevive a un cambio en cómo se derivan —como la abreviatura a KGLW—
     * la app pintaría datos con el formato antiguo. */
    const p4 = await ctx.newPage();
    await p4.addInitScript(() => {
      localStorage.setItem('gilafy.catalog', JSON.stringify({
        ts: Date.now(),
        docs: [{
          id: 'viejo', title: 'King Gizzard & The Lizard Wizard Live at Anthem',
          creator: 'King Gizzard & The Lizard Wizard', date: '2022-10-23T00:00:00Z',
          year: '2022', place: 'Washington, DC', downloads: 1, rating: 5,
          art: 'https://archive.org/services/img/viejo',
        }],
      }));
      localStorage.setItem('gilafy.session', JSON.stringify({
        pos: 0, order: [0], context: 'viejo', time: 0,
        queue: [{
          itemId: 'viejo', file: 'a.mp3', title: 'Banter',
          album: 'King Gizzard & The Lizard Wizard Live at Anthem',
          artist: 'King Gizzard & The Lizard Wizard', num: 1, duration: 60,
          art: 'https://archive.org/services/img/viejo',
          url: 'https://archive.org/download/viejo/a.mp3',
        }],
      }));
    });
    await p4.goto(url, { waitUntil: 'networkidle' });
    await p4.waitForSelector('.pub', { timeout: 8000 });

    const body = await bodyWithoutBrand(p4);
    if (/King\s*Gizzard/i.test(body)) {
      throw new Error(`sobrevivió la caché vieja: «${body.match(/.{0,50}King\s*Gizzard.{0,30}/i)[0].trim()}»`);
    }
    if (await p4.locator('#npTitle').textContent() === 'Banter') {
      throw new Error('se restauró una sesión de la versión anterior');
    }
    await p4.close();
  });

  await step('una caché con nombres largos se abrevia igualmente al pintar', async () => {
    /* Red de seguridad: aunque la copia lleve la versión correcta, si arrastra
     * el nombre largo —por ejemplo porque el navegador sirvió un app.js
     * anterior desde su propia caché— no debe llegar así a la pantalla. */
    const p5 = await ctx.newPage();
    await p5.addInitScript((version) => {
      localStorage.setItem('gilafy.catalog', JSON.stringify({
        v: version, ts: Date.now(),
        docs: [{
          id: 'largo', title: 'King Gizzard & The Lizard Wizard Live at Anthem',
          creator: 'King Gizzard and the Lizard Wizard', date: '2022-10-23T00:00:00Z',
          year: '2022', place: 'Washington, DC', downloads: 1, rating: 5,
          art: 'https://archive.org/services/img/largo',
        }],
      }));
    }, DATA_VERSION);
    await p5.goto(url, { waitUntil: 'networkidle' });
    await p5.waitForSelector('.pub', { timeout: 8000 });
    const body = await bodyWithoutBrand(p5);
    if (/King\s*Gizzard/i.test(body)) {
      throw new Error(`se pintó el nombre largo: «${body.match(/.{0,50}King\s*Gizzard.{0,30}/i)[0].trim()}»`);
    }
    if (!body.includes('KGLW Live at Anthem')) throw new Error('no se usó la copia guardada');
    await p5.close();
  });

  await step('estado de error, en español, si el archivo no responde', async () => {
    const p2 = await ctx.newPage();
    await p2.route('**/archive.org/**', (r) => r.abort());
    await p2.addInitScript(() => localStorage.clear());
    await p2.goto(url, { waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('.state--error', { timeout: 15000 });
    const msg = await p2.locator('.state--error .state__body').first().textContent();
    if (!msg.includes('conexión')) throw new Error(`mensaje sin traducir: ${msg.trim()}`);
    await p2.screenshot({ path: `${OUT}/07-error.png` });
    await p2.close();
  });

  console.log('\n== Pantalla completa (móvil) ==');
  {
    const m = await ctx.newPage();
    m.on('pageerror', (e) => errors.push(`error de página (movil): ${e.message}`));
    await m.setViewportSize({ width: 390, height: 844 });
    await m.goto(url, { waitUntil: 'networkidle' });
    await m.waitForSelector('.pub', { timeout: 8000 });

    const open = () => m.locator('#npFull').isVisible();

    /* La hoja entra con una transición de 260ms. Medir su posición antes de
     * que termine da coordenadas obsoletas, así que esperamos a que el
     * transform sea la identidad antes de tocarla. */
    const settled = () => m.waitForFunction(() => {
      const el = document.querySelector('#npFullSheet');
      if (!el || document.querySelector('#npFull').hidden) return false;
      const t = getComputedStyle(el).transform;
      return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
    }, null, { timeout: 4000 });

    const openSheet = async () => {
      await m.locator('#npExpand').click();
      await m.waitForSelector('#npFull', { state: 'visible', timeout: 4000 });
      await settled();
    };

    const dragSheet = async (distance) => {
      const box = await m.locator('.np-full__art-wrap').boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await m.mouse.move(x, y);
      await m.mouse.down();
      await m.mouse.move(x, y + distance / 2, { steps: 6 });
      await m.mouse.move(x, y + distance, { steps: 6 });
      await m.mouse.up();
    };

    await step('no se abre sin nada sonando', async () => {
      await m.locator('#npExpand').click();
      await new Promise((r) => setTimeout(r, 200));
      if (await open()) throw new Error('se abrió con la cola vacía');
    });

    await step('pulsar la barra maximiza', async () => {
      await m.locator('.pub__open').first().click();
      await m.waitForSelector('.track', { timeout: 8000 });
      await m.locator('#albumPlay').click();
      await m.waitForFunction(() => !document.querySelector('#audio').paused, { timeout: 8000 });
      await openSheet();
      if (await m.locator('#npExpand').getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded sin actualizar');
    });

    await step('muestra la misma pista que la barra', async () => {
      const bar = await m.locator('#npTitle').textContent();
      const full = await m.locator('.np-full__title').textContent();
      if (bar !== full) throw new Error(`barra «${bar}» ≠ pantalla «${full}»`);
      if (!(await m.locator('.np-full__art').getAttribute('src'))) throw new Error('sin carátula');
    });

    await step('con un título largo la hoja no se sale por la derecha', async () => {
      /* La hoja es un elemento flexible: sin `min-width: 0` crece hasta el
       * ancho del nombre de la grabación —que va en una sola línea— y el
       * corazón, la repetición y el tiempo restante quedan fuera de pantalla,
       * recortados por el `overflow: hidden` del contenedor. */
      const med = await m.evaluate(() => {
        const dentro = [...document.querySelectorAll('#npFullSheet *')]
          .map((el) => el.getBoundingClientRect().right);
        return {
          hoja: document.querySelector('#npFullSheet').getBoundingClientRect().width,
          derecha: Math.max(...dentro),
          ancho: window.innerWidth,
        };
      });
      if (med.hoja > med.ancho + 1) throw new Error(`la hoja mide ${med.hoja}px en ${med.ancho}px de pantalla`);
      if (med.derecha > med.ancho + 1) throw new Error(`hay contenido hasta ${Math.round(med.derecha)}px, fuera de ${med.ancho}px`);
    });

    await step('la carátula llena el hueco y es cuadrada', async () => {
      const { art, wrap } = await m.evaluate(() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
        return { art: r(document.querySelector('.np-full__art')), wrap: r(document.querySelector('.np-full__art-wrap')) };
      });
      if (Math.abs(art.w - art.h) > 2) throw new Error(`no es cuadrada: ${art.w}×${art.h}`);
      if (art.w > wrap.w + 1 || art.h > wrap.h + 1) throw new Error(`se sale del hueco: ${art.w}×${art.h} en ${wrap.w}×${wrap.h}`);
      // Debe ocupar el lado corto del hueco, no quedarse en su tamaño natural.
      const target = Math.min(wrap.w, wrap.h);
      if (art.w < target - 2) throw new Error(`se queda pequeña: ${art.w}px de ${target}px disponibles`);
    });
    await m.screenshot({ path: `${OUT}/09-nowplaying.png` });

    await step('el tiempo restante va en negativo', async () => {
      const left = await m.locator('.js-time-left').textContent();
      if (!/^-\d+:\d\d$/.test(left)) throw new Error(`restante = «${left}»`);
    });

    await step('sus controles mueven la reproducción real', async () => {
      await m.locator('.np-full__play').click();
      await m.waitForFunction(() => document.querySelector('#audio').paused, { timeout: 4000 });
      await m.locator('.np-full__play').click();
      await m.waitForFunction(() => !document.querySelector('#audio').paused, { timeout: 4000 });
    });

    await step('los dos aleatorios quedan sincronizados', async () => {
      // El aleatorio de la barra está oculto en móvil, así que el "otro lado"
      // es el atajo de teclado, que actúa sobre el control de la barra.
      await m.locator('.np-full__ctrl [data-ctrl="shuffle"]').click();
      const bar = await m.locator('#btnShuffle').getAttribute('aria-pressed');
      const full = await m.locator('.np-full__ctrl [data-ctrl="shuffle"]').getAttribute('aria-pressed');
      if (bar !== 'true' || full !== 'true') throw new Error(`barra=${bar} pantalla=${full}`);

      await m.keyboard.press('s');              // deshacer desde el otro lado
      await m.waitForFunction(() =>
        document.querySelector('.np-full__ctrl [data-ctrl="shuffle"]').getAttribute('aria-pressed') === 'false',
      null, { timeout: 3000 }).catch(() => { throw new Error('la pantalla completa no siguió a la barra'); });
      if (await m.locator('#btnShuffle').getAttribute('aria-pressed') !== 'false') throw new Error('la barra quedó descuadrada');
    });

    await step('el corazón se sincroniza en ambos sentidos', async () => {
      await m.locator('.np-full__like').click();
      if (!(await m.locator('#btnLike').getAttribute('class')).includes('is-on')) throw new Error('la barra no reflejó el me gusta');
      await m.locator('.np-full__like').click();
    });

    await step('avanzar de pista actualiza la pantalla completa', async () => {
      const before = await m.locator('.np-full__title').textContent();
      await m.locator('.np-full__ctrl [data-ctrl="next"]').click();
      await m.waitForFunction((b) => document.querySelector('.np-full__title').textContent !== b, before, { timeout: 6000 });
    });

    await step('el chevrón cierra', async () => {
      await m.locator('#npFullClose').click();
      await m.waitForSelector('#npFull', { state: 'hidden', timeout: 4000 });
    });

    await step('Escape cierra', async () => {
      await openSheet();
      await m.keyboard.press('Escape');
      await m.waitForSelector('#npFull', { state: 'hidden', timeout: 4000 });
    });

    await step('el botón atrás cierra sin cambiar de vista', async () => {
      const hash = await m.evaluate(() => location.hash);
      await openSheet();
      await m.goBack();
      await m.waitForSelector('#npFull', { state: 'hidden', timeout: 4000 });
      const after = await m.evaluate(() => location.hash);
      if (after !== hash) throw new Error(`la vista cambió: ${hash} → ${after}`);
    });

    await step('cerrar no deja basura en el historial', async () => {
      const hash = await m.evaluate(() => location.hash);
      await openSheet();
      await m.locator('#npFullClose').click();
      await m.waitForSelector('#npFull', { state: 'hidden', timeout: 4000 });
      await new Promise((r) => setTimeout(r, 300));
      // Tras cerrar con el chevrón, atrás debe salir de la vista, no reabrir.
      await m.goBack();
      await new Promise((r) => setTimeout(r, 300));
      if (await m.locator('#npFull').isVisible()) throw new Error('atrás reabrió la pantalla completa');
      if (await m.evaluate(() => location.hash) === hash) throw new Error('atrás no navegó: quedó una entrada de más');
    });

    await step('arrastrar hacia abajo descarta', async () => {
      await m.evaluate(() => { history.forward(); });
      await new Promise((r) => setTimeout(r, 300));
      await openSheet();
      await dragSheet(200);
      await m.waitForSelector('#npFull', { state: 'hidden', timeout: 4000 });
    });

    await step('un arrastre corto no descarta', async () => {
      await openSheet();
      await dragSheet(40);
      await new Promise((r) => setTimeout(r, 400));
      if (!(await open())) throw new Error('se cerró con 40px de arrastre');
      const t = await m.evaluate(() => document.querySelector('#npFullSheet').style.transform);
      if (t && t !== 'none') throw new Error(`el arrastre no volvió a su sitio: ${t}`);
      await m.locator('#npFullClose').click();
    });

    await step('la hoja entra deslizándose, sin saltos', async () => {
      /* Enfocar el chevrón al abrir desplazaba el contenedor: la hoja aún está
       * en translateY(100%), así que el navegador la traía «a la vista» media
       * pantalla arriba. El recorte lo hacía invisible, pero la hoja aparecía
       * de golpe y luego tiritaba mientras ese scrollTop se deshacía solo
       * durante los 260ms de la transición. */
      await m.waitForSelector('#npFull', { state: 'hidden', timeout: 4000 });

      await m.evaluate(() => {
        window.__frames = [];
        const sample = () => {
          const full = document.querySelector('#npFull');
          if (!full.hidden) {
            window.__frames.push({
              scrollTop: full.scrollTop,
              top: document.querySelector('#npFullSheet').getBoundingClientRect().top,
            });
          }
          if (window.__frames.length < 25) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await m.locator('#npExpand').click();
      await settled();

      const f = await m.evaluate(() => window.__frames);
      if (f.length < 5) throw new Error(`sólo ${f.length} fotogramas medidos`);

      const scrolled = f.find((x) => x.scrollTop !== 0);
      if (scrolled) throw new Error(`el contenedor se desplazó ${scrolled.scrollTop}px al abrir`);

      // El primer fotograma pintado debe tener la hoja abajo del todo.
      const alto = await m.evaluate(() => window.innerHeight);
      if (f[0].top < alto * 0.9) throw new Error(`la hoja aparece ya a ${Math.round(f[0].top)}px, no desde ${alto}px`);

      // Y debe subir progresivamente, sin plantarse arriba en dos fotogramas.
      const arriba = f.findIndex((x) => x.top <= 8);
      if (arriba !== -1 && arriba < 6) throw new Error(`llega arriba en ${arriba + 1} fotogramas: es un salto, no una transición`);

      await m.locator('#npFullClose').click();
      await m.waitForSelector('#npFull', { state: 'hidden', timeout: 4000 });
    });

    await step('el escuchado recientemente es un carril horizontal, al final', async () => {
      // Con un solo elemento no habría nada que desplazar: sembramos el
      // historial con todo el catálogo y volvemos a publicaciones.
      await m.evaluate(() => {
        const ids = JSON.parse(localStorage.getItem('gilafy.catalog')).docs.map((d) => d.id);
        localStorage.setItem('gilafy.history', JSON.stringify(ids));
        location.hash = '#/home';
      });
      await m.reload({ waitUntil: 'networkidle' });
      await m.waitForSelector('.rail', { timeout: 8000 });

      const r = await m.evaluate(() => {
        const rail = document.querySelector('.rail');
        const secs = [...document.querySelectorAll('.view .section')];
        return {
          titulo: rail.closest('.section').querySelector('.section__title').textContent,
          ultima: secs[secs.length - 1] === rail.closest('.section'),
          overflow: getComputedStyle(rail).overflowX,
          desborda: rail.scrollWidth > rail.clientWidth + 1,
          apilado: rail.scrollHeight > rail.clientHeight + 1,
        };
      });
      if (r.titulo !== 'Escuchado recientemente') throw new Error(`el carril cuelga de «${r.titulo}»`);
      if (!r.ultima) throw new Error('no es la última sección de la vista');
      if (r.overflow !== 'auto') throw new Error(`overflow-x = ${r.overflow}`);
      if (!r.desborda) throw new Error('no hay nada que desplazar en horizontal');
      if (r.apilado) throw new Error('el carril crece hacia abajo en vez de a lo ancho');
    });
    await m.screenshot({ path: `${OUT}/10-carril.png` });

    await m.close();
  }

  await step('en escritorio no hay pantalla completa', async () => {
    if (await page.locator('#npExpand').isVisible()) throw new Error('el disparador es visible en escritorio');
    await page.evaluate(() => document.querySelector('#npExpand').click());
    await new Promise((r) => setTimeout(r, 250));
    if (await page.locator('#npFull').isVisible()) throw new Error('se abrió en escritorio');
  });

  console.log('\n== Responsive (mobile first) ==');

  /* La base es el teléfono; cada punto de ruptura sólo añade. Comprobamos
   * qué debe verse y qué no en cada escalón, en ambos sentidos. */
  const LAYOUTS = [
    { name: 'movil-320',  width: 320,  height: 640,  sidebar: false, ctrl: false, cols: 2 },
    { name: 'movil-390',  width: 390,  height: 844,  sidebar: false, ctrl: false, cols: 2 },
    { name: 'movil-576',  width: 576,  height: 800,  sidebar: false, ctrl: false },
    { name: 'tablet-768', width: 768,  height: 900,  sidebar: true,  ctrl: true, carril: true },
    { name: 'tablet-896', width: 896,  height: 900,  sidebar: true,  ctrl: true, carril: false },
    { name: 'desktop',    width: 1440, height: 900,  sidebar: true,  ctrl: true, carril: false },
  ];

  for (const L of LAYOUTS) {
    const p3 = await ctx.newPage();
    await p3.setViewportSize({ width: L.width, height: L.height });
    await p3.goto(url, { waitUntil: 'networkidle' });
    await p3.waitForSelector('.pub', { timeout: 8000 });

    await step(`${L.name}: sin desbordamiento horizontal`, async () => {
      const over = await p3.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) throw new Error(`desborda ${over}px`);
    });

    await step(`${L.name}: navegación correcta para el tamaño`, async () => {
      const sidebar = await p3.locator('.sidebar').isVisible();
      if (sidebar !== L.sidebar) throw new Error(`barra lateral ${sidebar ? 'visible' : 'oculta'}, se esperaba lo contrario`);
      if (await p3.locator('.tabbar').count()) throw new Error('quedan restos de la barra de pestañas');
      // El atajo a la biblioteca sustituye a la pestaña que había: siempre visible.
      if (!(await p3.locator('.avatar').isVisible())) throw new Error('sin acceso a la biblioteca');
    });

    await step(`${L.name}: el buscador se queda arriba`, async () => {
      if (await p3.locator('#searchbar').isVisible()) throw new Error('la barra arranca desplegada');
      await p3.locator('#searchToggle').click();
      await p3.waitForSelector('#searchbar:visible', { timeout: 4000 });
      const m = await p3.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { barra: r('.searchbar'), campo: r('#searchInput'), vista: r('.view'), player: r('#player'), alto: window.innerHeight };
      });
      if (m.barra.bottom > m.vista.top + 1) throw new Error('el buscador cae dentro de la zona que se desplaza');
      if (m.campo.height < 40) throw new Error(`el campo se quedó en ${m.campo.height}px`);
      if (Math.round(m.player.bottom) !== Math.round(m.alto)) throw new Error('el reproductor no toca el borde inferior');
    });

    await step(`${L.name}: controles del reproductor`, async () => {
      const full = await p3.locator('#btnPlay').isVisible();
      const compact = await p3.locator('#btnPlayMobile').isVisible();
      if (full !== L.ctrl) throw new Error(`controles completos ${full ? 'visibles' : 'ocultos'}`);
      if (compact === L.ctrl) throw new Error(`play compacto ${compact ? 'visible' : 'oculto'} a la vez que los completos`);
      // Siempre hay exactamente un botón de reproducción accesible.
      if (full === compact) throw new Error('cero o dos botones de play visibles');
    });

    if (L.carril !== undefined) {
      await step(`${L.name}: barra lateral ${L.carril ? 'como carril de iconos' : 'desplegada'}`, async () => {
        const labelled = await p3.locator('.brand__name').isVisible();
        if (labelled === L.carril) throw new Error(`etiquetas ${labelled ? 'visibles' : 'ocultas'}`);
      });
    }

    await p3.screenshot({ path: `${OUT}/08-${L.name}.png` });

    if (L.cols) {
      await step(`${L.name}: rejilla de ${L.cols} columnas`, async () => {
        // La rejilla vive en la búsqueda; publicaciones es una lista de filas.
        await p3.evaluate(() => { location.hash = '#/search'; });
        await p3.waitForSelector('.grid', { timeout: 6000 });
        const cols = await p3.evaluate(() =>
          getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length);
        if (cols !== L.cols) throw new Error(`${cols} columnas`);
      });
    }
    await p3.close();
  }

  console.log('\n== Safari iOS ==');

  /* Safari iOS amplía la página al enfocar un campo cuya letra mide menos de
   * 16px, y al salir no la reduce: el viewport de maquetación (393px) deja de
   * caber en la pantalla y la interfaz se desborda por la derecha. El zoom es
   * propio de WebKit y aquí no se puede provocar, así que vigilamos la causa. */
  {
    const tactil = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    });
    await tactil.route('**/archive.org/**', archiveRoute);
    const pIOS = await tactil.newPage();
    pIOS.on('pageerror', (e) => errors.push(`error de página (táctil): ${e.message}`));
    await pIOS.goto(url, { waitUntil: 'networkidle' });
    await pIOS.waitForSelector('.pub', { timeout: 8000 });

    await step('ningún campo baja de 16px con puntero grueso', async () => {
      const chicos = await pIOS.$$eval('input, select, textarea', (els) => els
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${el.id || el.tagName} a ${getComputedStyle(el).fontSize}`));
      if (chicos.length) throw new Error(`ampliarían la página: ${chicos.join(', ')}`);
    });

    await step('con ratón la búsqueda vuelve a los 14px del diseño', async () => {
      const px = await page.evaluate(() => getComputedStyle(document.querySelector('#searchInput')).fontSize);
      if (px !== '14px') throw new Error(`mide ${px}`);
    });

    /* La zona que se reserva el indicador de inicio tiene que sumarse al
     * reproductor, que es lo que queda pegado al borde, no descontarse de él:
     * con `box-sizing: border-box` un `padding-bottom` suelto se la come a los
     * controles. Chromium no expone insets, así que forzamos el valor. */
    await step('la zona segura se suma al reproductor', async () => {
      const medir = (inset) => pIOS.evaluate((v) => {
        document.documentElement.style.setProperty('--safe-b', v);
        const player = document.querySelector('#player');
        const cs = getComputedStyle(player);
        return {
          alto: player.getBoundingClientRect().height,
          controles: player.clientHeight - parseFloat(cs.paddingBottom),
          borde: window.innerHeight - player.getBoundingClientRect().bottom,
          app: document.querySelector('.app').getBoundingClientRect().height,
        };
      }, inset);

      const sin = await medir('0px');
      const con = await medir('34px');
      if (con.controles !== sin.controles) throw new Error(`los controles pierden ${sin.controles - con.controles}px`);
      if (con.alto - sin.alto !== 34) throw new Error(`el reproductor creció ${con.alto - sin.alto}px, esperaba 34`);
      if (Math.round(con.borde) !== 0) throw new Error(`el reproductor queda a ${con.borde}px del borde`);
      if (Math.round(sin.app - con.app) !== 34) throw new Error('la app no cede el alto que gana el reproductor');
      await pIOS.evaluate(() => document.documentElement.style.removeProperty('--safe-b'));
    });

    await pIOS.screenshot({ path: `${OUT}/09-ios.png` });
    await tactil.close();
  }

  await browser.close();
  server.close();

  console.log(`\nCapturas en ${OUT}`);
  console.log('============================');
  if (errors.length) {
    console.log(`FALLOS (${errors.length}):`);
    errors.forEach((e) => console.log(' - ' + e));
    process.exit(1);
  }
  console.log('Todo correcto, sin errores de consola.');
})().catch((e) => { console.error(e); process.exit(1); });
