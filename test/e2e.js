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
  { identifier: 'kglw2023-03-04.sbd', title: 'King Gizzard Live in Chicago 2023-03-04', date: '2023-03-04T00:00:00Z', year: '2023', creator: 'King Gizzard & The Lizard Wizard', coverage: 'Chicago, IL', venue: 'Aragon Ballroom', downloads: 33001, avg_rating: '4.2', publicdate: '2023-04-01T00:00:00Z' },
  { identifier: 'kglw2018-08-08.dsbd', title: 'King Gizzard Live in Barcelona 2018-08-08', date: '2018-08-08T00:00:00Z', year: '2018', creator: 'King Gizzard & The Lizard Wizard', coverage: 'Barcelona, ES', venue: 'Razzmatazz', downloads: 12000, avg_rating: '3.9', publicdate: '2018-09-01T00:00:00Z' },
];

const TITLES = ['Rattlesnake', 'Robot Stop', 'The River', 'Crumbling Castle'];

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

/* ── Ejecución ─────────────────────────────────────────────── */

(async () => {
  await new Promise((r) => server.listen(PORT, r));

  const browser = await chromium.launch({
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await ctx.route('**/archive.org/**', async (route) => {
    const url = route.request().url();
    if (url.includes('advancedsearch.php')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ response: { numFound: SHOWS.length, docs: SHOWS } }) });
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
  });

  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`error de página: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`consola: ${m.text()}`); });

  const step = async (name, fn) => {
    try { await fn(); console.log(`  ok  ${name}`); }
    catch (e) { console.log(`  FALLO ${name}: ${e.message}`); errors.push(`${name}: ${e.message}`); }
  };

  const url = `http://localhost:${PORT}/index.html`;

  console.log('\n== Portada ==');
  await page.goto(url, { waitUntil: 'networkidle' });
  await step('el catálogo llega a la estantería', async () => {
    await page.waitForSelector('.shelf__item', { timeout: 8000 });
    const n = await page.locator('.shelf__item').count();
    if (n !== SHOWS.length) throw new Error(`esperaba ${SHOWS.length} items, hay ${n}`);
  });
  await step('secciones de la portada', async () => {
    const titles = await page.locator('.section__title').allTextContents();
    if (!titles.includes('Los más escuchados')) throw new Error(`secciones: ${titles.join(' | ')}`);
  });
  await step('tarjetas renderizadas', async () => {
    if (await page.locator('.card').count() < SHOWS.length) throw new Error('faltan tarjetas');
  });
  await step('la cola arranca oculta', async () => {
    if (await page.locator('#queue').isVisible()) throw new Error('el panel de cola es visible');
  });
  await step('un solo icono de volumen visible', async () => {
    const n = await page.locator('#btnMute svg:visible').count();
    if (n !== 1) throw new Error(`${n} iconos visibles`);
  });
  await page.screenshot({ path: `${OUT}/01-home.png` });

  console.log('\n== Grabación y reproducción ==');
  await step('abrir grabación', async () => {
    await page.locator('.card a').first().click();
    await page.waitForSelector('.track', { timeout: 8000 });
  });
  await step('deduplicación de derivados (4 temas, no 12)', async () => {
    const n = await page.locator('.track').count();
    if (n !== TITLES.length) throw new Error(`esperaba ${TITLES.length} pistas, hay ${n}`);
  });
  await step('títulos y duraciones', async () => {
    const row = await page.locator('.track').first().textContent();
    if (!row.includes('Rattlesnake') || !row.includes('3:20')) throw new Error(`fila: ${row.trim()}`);
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

  console.log('\n== Responsive ==');
  for (const [name, width, height] of [['tablet', 800, 900], ['movil', 390, 844]]) {
    const p3 = await ctx.newPage();
    await p3.setViewportSize({ width, height });
    await p3.goto(url, { waitUntil: 'networkidle' });
    await p3.waitForSelector('.card', { timeout: 8000 });
    await step(`sin desbordamiento horizontal (${name})`, async () => {
      const over = await p3.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) throw new Error(`desborda ${over}px`);
    });
    if (name === 'movil') {
      await step('barra de pestañas y play compacto en móvil', async () => {
        if (!(await p3.locator('.tabbar').isVisible())) throw new Error('sin barra de pestañas');
        if (!(await p3.locator('#btnPlayMobile').isVisible())) throw new Error('sin play compacto');
      });
    }
    await p3.screenshot({ path: `${OUT}/08-${name}.png` });
    await p3.close();
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
