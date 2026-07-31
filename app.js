/* ============================================================
   Gilafy — reproductor del material público de
   King Gizzard & The Lizard Wizard.

   Catálogo: Internet Archive. La banda mantiene un programa
   oficial de "bootlegger" y autoriza grabar y redistribuir sus
   directos, así que ese archivo es material genuinamente libre.

   Reproducción en segundo plano: un único <audio> que nunca se
   destruye + Media Session API, de modo que el audio continúa
   con la pestaña oculta, la pantalla apagada o la app en segundo
   plano, y aparece en los controles del sistema operativo.
   ============================================================ */
'use strict';

/* ── Configuración ─────────────────────────────────────────── */

const IA = 'https://archive.org';

/* El nombre completo es demasiado largo para la interfaz: en móvil provoca
   saltos de línea en la barra de reproducción, en las filas de temas y en la
   cabecera. Se muestra siempre abreviado; el nombre completo sólo se usa para
   consultar el archivo, que es donde tiene que coincidir literalmente. */
const ARTIST = 'KGLW';
const CATALOG_ROWS = 300;
const CATALOG_TTL = 12 * 60 * 60 * 1000;   // 12 h

/* Lo que se guarda en localStorage son datos YA procesados (títulos
   abreviados, pistas resueltas), así que cambiar cómo se derivan no basta:
   las copias viejas seguirían pintándose hasta que caduquen. Subir esta
   versión las descarta. Las preferencias del usuario —me gusta, historial,
   volumen— no llevan versión y sobreviven a los cambios. */
const DATA_VERSION = 4;

/* El identificador exacto de la colección puede variar; probamos
   varias estrategias y nos quedamos con la primera que devuelva
   resultados, recordándola para las siguientes visitas. */
const QUERIES = [
  'collection:(KingGizzardAndTheLizardWizard)',
  'collection:(kinggizzardandthelizardwizard)',
  'creator:("King Gizzard & The Lizard Wizard") AND mediatype:(audio)',
  'creator:("King Gizzard and the Lizard Wizard") AND mediatype:(audio)',
  '("King Gizzard & The Lizard Wizard" OR "King Gizzard and the Lizard Wizard") AND mediatype:(audio)',
];

const FIELDS = ['identifier', 'title', 'date', 'year', 'creator', 'coverage',
                'venue', 'downloads', 'avg_rating', 'num_reviews', 'publicdate'];

/* Material de estudio que la banda liberó de forma explícita.
 *
 * Polygondwanaland (2017) se publicó con los másters y la portada
 * descargables y permiso expreso para copiarlo, prensarlo y venderlo: «We do
 * not own this record. You do». Decenas de sellos lo prensaron. Es el único
 * disco de estudio que entra aquí por derecho propio.
 *
 * El resto del catálogo de estudio es comercial: no se busca ni se enlaza,
 * aunque haya subidas de terceros en el archivo. Si la banda libera algo más,
 * basta con añadirlo a esta lista. */
const FREE_STUDIO = [
  { key: 'polygondwanaland', title: 'Polygondwanaland', year: '2017' },
];

/* Tipos de publicación, en el orden en que se listan.
 *
 * `studio` sale de FREE_STUDIO; el resto se deduce del título, que es lo único
 * que el buscador del archivo devuelve: la mayoría de subidas son conciertos
 * completos, y sólo unas pocas se anuncian como EP o sencillo. Cuando un tipo
 * no tiene nada, ni su filtro ni su sección se pintan. */
const PUB_KINDS = [
  { id: 'studio', label: 'Álbumes',        one: 'Álbum' },
  { id: 'live',   label: 'Directos',       one: 'Directo' },
  { id: 'single', label: 'Sencillos y EP', one: 'Sencillo' },
];

const SINGLE_RE = /(\bEP\b|\bE\.P\.|\bsingles?\b|\bsencillos?\b|\b7"|\b10")/i;

/** Tipo de una publicación que no es de estudio. */
const kindFromTitle = (title) => (SINGLE_RE.test(String(title ?? '')) ? 'single' : 'live');

/** Etiqueta legible del tipo («Álbum», «Directo», «Sencillo»). */
const kindLabel = (kind) => PUB_KINDS.find((k) => k.id === kind)?.one || 'Directo';

/* Cuántas filas se pintan por sección: unas pocas en la vista general,
   muchas más cuando el filtro deja una sola. */
const PUB_PREVIEW = 12;
const PUB_FULL = 60;

/* Preferencia de formato: derivados que cualquier navegador reproduce.
   Los originales (FLAC, SHN) se descartan. */
const AUDIO_FORMATS = ['VBR MP3', '128Kbps MP3', '256Kbps MP3', '320Kbps MP3',
                       'MP3', '64Kbps MP3', 'Ogg Vorbis'];

/* ── Utilidades ────────────────────────────────────────────── */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const first = (v) => (Array.isArray(v) ? v[0] : v);
const nfmt = new Intl.NumberFormat('es-ES');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * `hidden` es una propiedad de HTMLElement: los <svg> de los iconos no la
 * implementan, así que alternamos el atributo, que sí respetan.
 */
function setHidden(el, on) {
  if (!el) return;
  if (on) el.setAttribute('hidden', '');
  else el.removeAttribute('hidden');
}

/**
 * Abrevia el nombre de la banda a KGLW en cualquiera de las formas en que el
 * archivo lo escribe: "King Gizzard & The Lizard Wizard", "…and the…",
 * "KingGizzardAndTheLizardWizard" o sólo "King Gizzard".
 */
const BAND_RE = /King\s*Gizzard(\s*(?:&|and)\s*the\s*Lizard\s*Wizard)?/gi;
const kglw = (text) => String(text ?? '').replace(BAND_RE, ARTIST).replace(/\s{2,}/g, ' ').trim();

/** Codifica una ruta conservando las barras de los subdirectorios. */
function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

/** Acepta "312.45" y "5:12.45"; devuelve segundos. */
function parseLength(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  if (s.includes(':')) {
    return s.split(':').reduce((acc, part) => acc * 60 + (parseFloat(part) || 0), 0);
  }
  return parseFloat(s) || 0;
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
           : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Hash estable → tono, para las portadas de reserva y el tinte del héroe. */
function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/** Portada generada: el archivo no siempre tiene imagen propia. */
function fallbackArt(seed, label) {
  const hue = hashHue(seed || 'gizz');
  const initials = esc(String(label || 'KG').replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'KG');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 62% 42%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 48) % 360} 58% 16%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="300" height="300" fill="url(#g)"/>` +
    `<text x="150" y="150" fill="rgba(255,255,255,.86)" font-family="Helvetica,Arial,sans-serif"` +
    ` font-size="104" font-weight="700" text-anchor="middle" dominant-baseline="central">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const artOf = (id, title) => (id ? `${IA}/services/img/${encodeURIComponent(id)}` : fallbackArt(id, title));

/* ── Almacenamiento ────────────────────────────────────────── */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`gilafy.${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`gilafy.${key}`, JSON.stringify(value)); } catch { /* cuota llena */ }
  },
};

/* ── Estado ────────────────────────────────────────────────── */

const state = {
  catalog: [],            // documentos de búsqueda (shows/álbumes)
  items: new Map(),       // identifier → { meta, tracks }
  route: { name: 'home', param: '' },

  queue: [],              // pistas cargadas
  order: [],              // índices en orden de reproducción
  pos: -1,                // posición dentro de `order`
  context: '',            // de dónde salió la cola

  shuffle: store.get('shuffle', false),
  repeat: store.get('repeat', 'off'),   // off | all | one
  volume: store.get('volume', 1),
  muted: store.get('muted', false),

  liked: new Set(store.get('liked', [])),
  history: store.get('history', []),
  shelfFilter: 'all',
  pubFilter: 'all',        // filtro de tipo en la vista de publicaciones
  seeking: false,
};

const trackKey = (t) => `${t.itemId} ${t.file}`;
const currentTrack = () => (state.pos >= 0 ? state.queue[state.order[state.pos]] : null);

/* ── Capa de datos (Internet Archive) ──────────────────────── */

/** Traduce los errores de red del navegador a algo legible. */
function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (err?.name === 'AbortError') return 'El archivo tardó demasiado en responder.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No hay conexión con archive.org.';
  if (/^HTTP 5/.test(msg)) return 'Internet Archive está devolviendo errores en este momento.';
  if (/^HTTP 4/.test(msg)) return 'Internet Archive rechazó la petición.';
  return msg || 'Error desconocido.';
}

async function getJSON(url, { timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function searchURL(query, { rows = CATALOG_ROWS, sort = 'downloads desc' } = {}) {
  const params = new URLSearchParams();
  params.set('q', query);
  FIELDS.forEach((f) => params.append('fl[]', f));
  params.append('sort[]', sort);
  params.set('rows', String(rows));
  params.set('page', '1');
  params.set('output', 'json');
  return `${IA}/advancedsearch.php?${params}`;
}

function normalizeDoc(doc) {
  const id = doc.identifier;
  const title = kglw(first(doc.title)) || id;
  return {
    id,
    title,
    kind: kindFromTitle(title),
    creator: kglw(first(doc.creator)) || ARTIST,
    date: first(doc.date) || first(doc.publicdate) || '',
    year: first(doc.year) || String(first(doc.date) || '').slice(0, 4),
    place: [first(doc.venue), first(doc.coverage)].filter(Boolean).join(' · '),
    downloads: Number(doc.downloads) || 0,
    rating: Number(doc.avg_rating) || 0,
    art: artOf(id, title),
  };
}

/**
 * Busca los discos de estudio liberados y se queda con una copia de cada uno:
 * el archivo suele tener varias subidas del mismo álbum, así que elegimos la
 * más descargada, que en la práctica es la mejor conservada.
 *
 * Si falla, devuelve una lista vacía: es material extra, no debe tumbar la
 * carga del catálogo principal.
 */
async function loadStudio() {
  const clauses = FREE_STUDIO.map((a) => `title:(${a.key})`).join(' OR ');
  let docs = [];
  try {
    const data = await getJSON(searchURL(`(${clauses}) AND mediatype:(audio)`, { rows: 60 }));
    docs = (data?.response?.docs || []).filter((d) => d.identifier).map(normalizeDoc);
  } catch {
    return [];
  }

  const best = new Map();
  for (const doc of docs) {
    const haystack = `${doc.title} ${doc.id}`.toLowerCase();
    const album = FREE_STUDIO.find((a) => haystack.includes(a.key));
    if (!album) continue;                      // descarta directos que citan el título
    const prev = best.get(album.key);
    if (prev && prev.downloads >= doc.downloads) continue;
    best.set(album.key, { ...doc, kind: 'studio', title: album.title, year: doc.year || album.year, place: 'Álbum de estudio' });
  }
  return [...best.values()];
}

/**
 * Descarga el catálogo probando las consultas en orden hasta que
 * una devuelva resultados. Cachea el resultado y la consulta ganadora.
 */
/** Copia guardada del catálogo, o null si está caducada o es de otra versión. */
function cachedCatalog({ ignoreAge = false } = {}) {
  const cached = store.get('catalog', null);
  if (!cached || cached.v !== DATA_VERSION || !cached.docs?.length) return null;
  if (!ignoreAge && Date.now() - cached.ts >= CATALOG_TTL) return null;
  // Reaplicamos la abreviatura al leer: la versión sola no basta si el
  // navegador arrastra un app.js antiguo de su propia caché.
  return cached.docs.map(shortenDoc);
}

/** Vuelve a pasar por el acortador los campos visibles de un documento. */
function shortenDoc(doc) {
  const title = kglw(doc.title) || doc.id;
  // El tipo también se vuelve a deducir al leer, por el mismo motivo que la
  // abreviatura: una copia guardada por un app.js anterior no lo traía.
  return {
    ...doc,
    title,
    kind: doc.kind === 'studio' ? 'studio' : kindFromTitle(title),
    creator: kglw(doc.creator) || ARTIST,
  };
}

async function loadCatalog({ force = false } = {}) {
  if (!force) {
    const cached = cachedCatalog();
    if (cached) {
      state.catalog = cached;
      return state.catalog;
    }
  }

  const known = store.get('query', null);
  const attempts = known ? [known, ...QUERIES.filter((q) => q !== known)] : QUERIES;
  let lastError = null;

  for (const query of attempts) {
    try {
      const data = await getJSON(searchURL(query));
      const live = (data?.response?.docs || []).filter((d) => d.identifier).map(normalizeDoc);
      if (live.length) {
        // Los discos liberados van primero: son el material «de catálogo».
        const docs = [...await loadStudio(), ...live];
        state.catalog = docs;
        store.set('query', query);
        store.set('catalog', { v: DATA_VERSION, ts: Date.now(), docs });
        return docs;
      }
    } catch (err) {
      lastError = err;
    }
  }

  // Sin red: al menos servimos lo último que se vio, aunque haya caducado.
  const stale = cachedCatalog({ ignoreAge: true });
  if (stale) {
    state.catalog = stale;
    return state.catalog;
  }
  throw lastError || new Error('El archivo no devolvió resultados.');
}

/** Metadatos + pistas reproducibles de un item. */
async function loadItem(id) {
  if (state.items.has(id)) return state.items.get(id);

  const data = await getJSON(`${IA}/metadata/${encodeURIComponent(id)}`);
  if (!data || !data.files) throw new Error('Grabación no disponible.');

  const meta = data.metadata || {};
  const title = kglw(first(meta.title)) || id;
  const creator = kglw(first(meta.creator)) || ARTIST;

  // Agrupamos los derivados por pista original para no duplicar temas.
  const byTrack = new Map();
  for (const f of data.files) {
    if (!f.name) continue;
    const rank = AUDIO_FORMATS.indexOf(f.format);
    const isMp3 = rank >= 0 || /\.(mp3|ogg|m4a)$/i.test(f.name);
    if (!isMp3) continue;

    const base = (f.original && !/\.(mp3|ogg|m4a)$/i.test(f.original) ? f.original : f.name)
      .replace(/\.[^.]+$/, '');
    const score = rank >= 0 ? rank : AUDIO_FORMATS.length;
    const prev = byTrack.get(base);
    if (!prev || score < prev.score) byTrack.set(base, { file: f, score });
  }

  const tracks = [...byTrack.values()].map(({ file: f }) => {
    const num = parseInt(String(first(f.track) || '').match(/\d+/)?.[0] ?? '', 10);
    return {
      itemId: id,
      file: f.name,
      title: kglw(first(f.title) || f.name.replace(/\.[^.]+$/, '').replace(/^[\d\-_. ]+/, '')),
      album: title,
      artist: creator,
      num: Number.isFinite(num) ? num : 0,
      duration: parseLength(f.length),
      art: artOf(id, title),
      url: `${IA}/download/${encodeURIComponent(id)}/${encodePath(f.name)}`,
    };
  }).sort((a, b) => (a.num || 1e6) - (b.num || 1e6) || a.file.localeCompare(b.file));

  tracks.forEach((t, i) => { if (!t.num) t.num = i + 1; });

  const item = {
    id,
    title,
    creator,
    date: first(meta.date) || first(meta.publicdate) || '',
    place: [first(meta.venue), first(meta.coverage)].filter(Boolean).join(' · '),
    description: kglw(String(first(meta.description) || '').replace(/<[^>]*>/g, ' ')),
    downloads: Number(data.item_size ? meta.downloads : meta.downloads) || 0,
    art: artOf(id, title),
    tracks,
  };
  state.items.set(id, item);
  return item;
}

/* ── Elementos del DOM ─────────────────────────────────────── */

const audio     = $('#audio');
const viewEl    = $('#view');
const shelfEl   = $('#shelf');
const toastEl   = $('#toast');
const queueEl   = $('#queue');
const queueList = $('#queueList');
const appEl     = $('.app');

const npFullEl    = $('#npFull');
const npFullSheet = $('#npFullSheet');

const volFill = $('#volFill');
const volKnob = $('#volKnob');

/* La barra inferior y la pantalla completa muestran lo mismo. En vez de
   duplicar lógica, cada dato se pinta sobre todos los elementos que lo
   declaran con una clase .js-*, y cada acción se ata a todos los botones
   que la declaran con data-ctrl. */
const parts = {
  art:      $$('.js-art'),
  title:    $$('.js-title'),
  sub:      $$('.js-sub'),
  seek:     $$('.js-seek'),
  seekFill: $$('.js-seek-fill'),
  seekKnob: $$('.js-seek-knob'),
  timeNow:  $$('.js-time-now'),
  timeEnd:  $$('.js-time-end'),
  timeLeft: $$('.js-time-left'),
};

const ctrls = (name) => $$(`[data-ctrl="${name}"]`);
const onCtrl = (name, handler) => ctrls(name).forEach((el) => el.addEventListener('click', handler));

let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

/* ── Motor de reproducción ─────────────────────────────────── */

function buildOrder(startIndex) {
  const idx = state.queue.map((_, i) => i);
  if (!state.shuffle) {
    state.order = idx;
    state.pos = startIndex;
    return;
  }
  const rest = idx.filter((i) => i !== startIndex);
  for (let i = rest.length - 1; i > 0; i--) {           // Fisher-Yates
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  state.order = startIndex >= 0 ? [startIndex, ...rest] : rest;
  state.pos = startIndex >= 0 ? 0 : -1;
}

function playQueue(tracks, index = 0, context = '') {
  if (!tracks?.length) { toast('Esta grabación no tiene pistas reproducibles.'); return; }
  state.queue = tracks;
  state.context = context;
  buildOrder(index);
  loadCurrent({ autoplay: true });
  renderQueue();
}

function loadCurrent({ autoplay = true, resumeAt = 0 } = {}) {
  const track = currentTrack();
  if (!track) return;

  audio.src = track.url;
  if (resumeAt > 0) {
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = resumeAt; }, { once: true });
  }

  renderNowPlaying(track);
  updateMediaSession(track);
  markPlayingRows();
  renderQueue();
  rememberSession();

  if (autoplay) {
    audio.play().catch((err) => {
      // Las políticas de autoplay exigen un gesto: no es un fallo real.
      if (err?.name !== 'NotAllowedError') toast('No se pudo iniciar la reproducción.');
    });
  }
}

function togglePlay() {
  if (!currentTrack()) {
    const firstShow = state.catalog[0];
    if (firstShow) playItem(firstShow.id);
    return;
  }
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function next({ auto = false } = {}) {
  if (!state.queue.length) return;
  if (auto && state.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }

  if (state.pos < state.order.length - 1) {
    state.pos++;
  } else if (state.repeat === 'all' || (!auto && state.order.length > 1)) {
    state.pos = 0;
  } else {
    audio.pause();
    audio.currentTime = 0;
    setPlayIcon(false);
    return;
  }
  loadCurrent({ autoplay: true });
}

function prev() {
  if (!state.queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  state.pos = state.pos > 0 ? state.pos - 1 : state.order.length - 1;
  loadCurrent({ autoplay: true });
}

async function playItem(id, index = 0) {
  try {
    const item = await loadItem(id);
    playQueue(item.tracks, index, item.title);
    pushHistory(id);
  } catch {
    toast('No se pudo cargar esa grabación.');
  }
}

function pushHistory(id) {
  state.history = [id, ...state.history.filter((x) => x !== id)].slice(0, 24);
  store.set('history', state.history);
  renderShelf();
}

function rememberSession() {
  const track = currentTrack();
  if (!track) return;
  store.set('session', {
    v: DATA_VERSION,
    queue: state.queue, order: state.order, pos: state.pos,
    context: state.context, time: audio.currentTime || 0,
  });
}

/* ── Media Session: controles del sistema y segundo plano ──── */

function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;

  ms.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist || ARTIST,
    album: track.album,
    artwork: [96, 128, 192, 256, 384, 512].map((size) => ({
      src: track.art, sizes: `${size}x${size}`, type: 'image/jpeg',
    })),
  });

  const handlers = {
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    previoustrack: () => prev(),
    nexttrack: () => next(),
    stop: () => { audio.pause(); audio.currentTime = 0; },
    seekbackward: (d) => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); },
    seekforward: (d) => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset || 10)); },
    seekto: (d) => { if (d.fastSeek && audio.fastSeek) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime; },
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try { ms.setActionHandler(action, handler); } catch { /* acción no soportada */ }
  }
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(audio.currentTime, audio.duration),
    });
  } catch { /* posición fuera de rango durante la carga */ }
}

/* ── Render: barra de reproducción ─────────────────────────── */

const setText = (els, value) => els.forEach((el) => { el.textContent = value; });

function setPlayIcon(playing) {
  for (const btn of ctrls('play')) {
    setHidden($('.ico-play', btn), playing);
    setHidden($('.ico-pause', btn), !playing);
    btn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  }
}

function renderNowPlaying(track) {
  const albumHref = `#/album/${encodeURIComponent(track.itemId)}`;

  parts.art.forEach((img) => {
    img.src = track.art;
    img.alt = `Portada de ${track.album}`;
    delete img.dataset.fallbackApplied;   // la nueva carátula merece su intento
    img.dataset.fb = track.album;
  });
  parts.title.forEach((el) => { el.textContent = track.title; el.title = track.title; });
  parts.sub.forEach((el) => {
    el.textContent = track.album;
    if (el.tagName === 'A') el.href = albumHref;
  });

  $('#npFullSource').href = albumHref;
  $('#npFullArchive').href = `${IA}/details/${encodeURIComponent(track.itemId)}`;

  setText(parts.timeEnd, fmtTime(track.duration));
  renderLike();
}

function renderLike() {
  const track = currentTrack();
  const on = !!track && state.liked.has(trackKey(track));
  for (const btn of ctrls('like')) {
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Quitar de Me gusta' : 'Añadir a Me gusta');
  }
}

function renderProgress() {
  if (state.seeking) return;
  const dur = Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : (currentTrack()?.duration || 0);
  const pct = dur > 0 ? Math.min(100, (audio.currentTime / dur) * 100) : 0;
  paintSeek(pct);
  setText(parts.timeNow, fmtTime(audio.currentTime));
  setText(parts.timeEnd, fmtTime(dur));
  setText(parts.timeLeft, `-${fmtTime(Math.max(0, dur - audio.currentTime))}`);
}

/** Mueve las dos barras de progreso a la vez. */
function paintSeek(pct) {
  parts.seekFill.forEach((el) => { el.style.width = `${pct}%`; });
  parts.seekKnob.forEach((el) => { el.style.left = `${pct}%`; });
  parts.seek.forEach((el) => el.setAttribute('aria-valuenow', String(Math.round(pct))));
}

function renderVolume() {
  const pct = state.muted ? 0 : state.volume * 100;
  volFill.style.width = `${pct}%`;
  volKnob.style.left = `${pct}%`;
  $('#vol').setAttribute('aria-valuenow', String(Math.round(pct)));
  const silent = state.muted || state.volume === 0;
  setHidden($('#btnMute .ico-vol'), silent);
  setHidden($('#btnMute .ico-muted'), !silent);
}

function renderToggles() {
  for (const sh of ctrls('shuffle')) {
    sh.classList.toggle('is-on', state.shuffle);
    sh.setAttribute('aria-pressed', String(state.shuffle));
  }
  for (const rp of ctrls('repeat')) {
    rp.classList.toggle('is-on', state.repeat !== 'off');
    rp.setAttribute('aria-pressed', String(state.repeat !== 'off'));
    rp.dataset.mode = state.repeat;
    setHidden($('.repeat__one', rp), state.repeat !== 'one');
  }
}

/* ── Render: cola ──────────────────────────────────────────── */

function renderQueue() {
  if (queueEl.hidden) return;
  if (!state.queue.length) {
    queueList.innerHTML = '<li class="state"><p class="state__body">La cola está vacía.</p></li>';
    return;
  }
  const rows = state.order.map((qi, i) => {
    const t = state.queue[qi];
    return `<li><button class="queue__item ${i === state.pos ? 'is-current' : ''}" data-qpos="${i}">
      <img class="queue__art" src="${esc(t.art)}" alt="" loading="lazy" data-fb="${esc(t.album)}">
      <span class="queue__cell">
        <span class="queue__name truncate">${esc(t.title)}</span>
        <span class="queue__sub truncate">${esc(t.album)}</span>
      </span>
    </button></li>`;
  });
  queueList.innerHTML = rows.join('');
}

/* ── Render: estantería lateral ────────────────────────────── */

function renderShelf() {
  let list = state.catalog;
  if (state.shelfFilter === 'recent') {
    list = state.history.map((id) => state.catalog.find((d) => d.id === id)).filter(Boolean);
  } else if (state.shelfFilter === 'liked') {
    const likedItems = new Set([...state.liked].map((k) => k.split(' ')[0]));
    list = state.catalog.filter((d) => likedItems.has(d.id));
  }

  if (!list.length) {
    shelfEl.innerHTML = '<li class="sidebar__legal" style="display:block">Todavía no hay nada aquí.</li>';
    return;
  }

  const playingId = currentTrack()?.itemId;
  shelfEl.innerHTML = list.slice(0, 60).map((d) => `
    <li><a class="shelf__item ${d.id === playingId ? 'is-playing' : ''}" href="#/album/${encodeURIComponent(d.id)}" title="${esc(d.title)}">
      <img class="shelf__art" src="${esc(d.art)}" alt="" loading="lazy" data-fb="${esc(d.title)}">
      <span class="shelf__text truncate">
        <span class="shelf__name truncate">${esc(d.title)}</span>
        <span class="shelf__sub truncate">${esc(d.place || d.year || 'Directo')}</span>
      </span>
    </a></li>`).join('');
}

/* ── Render: componentes reutilizables ─────────────────────── */

function cardHTML(doc) {
  return `<article class="card">
    <a href="#/album/${encodeURIComponent(doc.id)}" aria-label="Abrir ${esc(doc.title)}">
      <span class="card__art-wrap">
        <img class="card__art" src="${esc(doc.art)}" alt="" loading="lazy" data-fb="${esc(doc.title)}">
      </span>
      ${doc.kind === 'studio' ? '<span class="card__badge">Estudio</span>' : ''}
      <h3 class="card__title truncate">${esc(doc.title)}</h3>
      <p class="card__sub">${esc([doc.place, doc.year].filter(Boolean).join(' · ') || 'Grabación en directo')}</p>
    </a>
    <button class="card__play" data-play="${esc(doc.id)}" aria-label="Reproducir ${esc(doc.title)}">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg>
    </button>
  </article>`;
}

function rowHTML(title, docs, { more = '' } = {}) {
  if (!docs.length) return '';
  return `<section class="section">
    <div class="section__head">
      <h2 class="section__title">${esc(title)}</h2>
      ${more ? `<a class="section__more" href="${more}">Mostrar todo</a>` : ''}
    </div>
    <div class="grid">${docs.map(cardHTML).join('')}</div>
  </section>`;
}

/** Fila de publicación: carátula, título y «Tipo · Año», como en la app real.
 *
 * El enlace es una capa que cubre la fila entera —igual que en la barra de
 * reproducción— para no meter un botón dentro de un <a>, que no es válido. */
function pubHTML(doc) {
  const meta = [kindLabel(doc.kind), doc.year || String(doc.date).slice(0, 4)].filter(Boolean).join(' · ');
  return `<div class="pub" data-id="${esc(doc.id)}">
    <a class="pub__open" href="#/album/${encodeURIComponent(doc.id)}" aria-label="Abrir ${esc(doc.title)}"></a>
    <img class="pub__art" src="${esc(doc.art)}" alt="" loading="lazy" data-fb="${esc(doc.title)}">
    <div class="pub__cell">
      <p class="pub__title">${esc(doc.title)}</p>
      <p class="pub__meta">${esc(meta)}</p>
    </div>
    <button class="pub__play" data-play="${esc(doc.id)}" aria-label="Reproducir ${esc(doc.title)}">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg>
    </button>
  </div>`;
}

function pubSectionHTML(title, docs, { more = '' } = {}) {
  if (!docs.length) return '';
  return `<section class="section">
    <div class="section__head">
      <h2 class="section__title">${esc(title)}</h2>
      ${more ? `<button class="section__more" data-filter="${esc(more)}">Mostrar todo</button>` : ''}
    </div>
    <div class="pubs">${docs.map(pubHTML).join('')}</div>
  </section>`;
}

/** Carril horizontal, al estilo de los carruseles de Spotify. */
function railHTML(title, docs) {
  if (!docs.length) return '';
  return `<section class="section">
    <div class="section__head"><h2 class="section__title">${esc(title)}</h2></div>
    <div class="rail">${docs.map(cardHTML).join('')}</div>
  </section>`;
}

function skeletonHTML(count = 10) {
  return `<div class="hero hero--home"><h1 class="hero__title">Cargando…</h1></div>
    <section class="section"><div class="grid">
    ${Array.from({ length: count }, () => '<div class="skeleton sk-card"></div>').join('')}
    </div></section>`;
}

/** Esqueleto de la vista de publicaciones: filas, no tarjetas. */
function pubSkeletonHTML(count = 6) {
  return `<div class="filters">
      ${Array.from({ length: 3 }, () => '<div class="skeleton sk-filter"></div>').join('')}
    </div>
    <div class="pubs">
      ${Array.from({ length: count }, () => '<div class="skeleton sk-pub"></div>').join('')}
    </div>`;
}

function errorHTML(message) {
  return `<div class="state state--error">
    <h2 class="state__title">No se pudo abrir el archivo</h2>
    <p class="state__body">${esc(message)}</p>
    <p class="state__body">Gilafy se sirve en directo desde Internet Archive. Comprueba tu conexión
      (o si una extensión o cortafuegos bloquea <code>archive.org</code>) y vuelve a intentarlo.</p>
    <button class="pill pill--upper" id="retry">Reintentar</button>
  </div>`;
}

/* ── Vistas ────────────────────────────────────────────────── */

/**
 * Publicaciones: lo primero que se ve al abrir la app. Filtros por tipo, la
 * última publicación destacada, las secciones de álbumes, directos y sencillos,
 * y abajo del todo el carril horizontal de lo escuchado recientemente.
 */
async function viewHome() {
  viewEl.innerHTML = pubSkeletonHTML();
  try {
    await loadCatalog();
  } catch (err) {
    viewEl.innerHTML = errorHTML(friendlyError(err));
    return;
  }
  renderShelf();
  setHero(hashHue('home'));

  const newest = (docs) => [...docs].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const byKind = new Map(PUB_KINDS.map((k) => [k.id, newest(state.catalog.filter((d) => d.kind === k.id))]));

  // Sólo se ofrecen los filtros que tienen algo detrás.
  const available = PUB_KINDS.filter((k) => byKind.get(k.id).length);
  if (!available.some((k) => k.id === state.pubFilter)) state.pubFilter = 'all';

  const shown = state.pubFilter === 'all' ? available : available.filter((k) => k.id === state.pubFilter);
  const limit = state.pubFilter === 'all' ? PUB_PREVIEW : PUB_FULL;

  const latest = newest(shown.flatMap((k) => byKind.get(k.id)))[0];
  const recent = state.history.map((id) => state.catalog.find((d) => d.id === id)).filter(Boolean);

  viewEl.innerHTML = `
    <div class="filters" role="list">
      <button class="filter ${state.pubFilter === 'all' ? 'is-on' : ''}" data-filter="all" role="listitem">Todo</button>
      ${available.map((k) => `<button class="filter ${state.pubFilter === k.id ? 'is-on' : ''}"
        data-filter="${k.id}" role="listitem">${esc(k.label)}</button>`).join('')}
    </div>
    ${latest ? pubSectionHTML('Última publicación', [latest]) : ''}
    ${shown.map((k) => {
      const docs = byKind.get(k.id);
      return pubSectionHTML(k.label, docs.slice(0, limit),
        { more: docs.length > limit ? k.id : '' });
    }).join('')}
    ${!latest ? `<div class="state"><h2 class="state__title">Nada publicado todavía</h2>
      <p class="state__body">El archivo no devolvió publicaciones de este tipo.</p></div>` : ''}
    ${railHTML('Escuchado recientemente', recent.slice(0, 20))}
  `;
  markPlayingRows();
}

async function viewSearch(query = '') {
  const input = $('#searchInput');
  if (input.value !== query) input.value = query;

  try {
    await loadCatalog();
  } catch (err) {
    viewEl.innerHTML = errorHTML(friendlyError(err));
    return;
  }
  setHero(hashHue('search'));

  const q = query.trim().toLowerCase();
  if (!q) {
    const places = new Map();
    for (const d of state.catalog) {
      const key = (d.place || 'Sin ubicación').split(' · ').pop();
      if (!places.has(key)) places.set(key, d);
    }
    viewEl.innerHTML = `
      <div class="hero hero--home"><h1 class="hero__title">Buscar</h1>
        <p class="hero__facts">Ciudad, sala, año o nombre del tema — todo el archivo a la vez.</p></div>
      ${rowHTML('Explora por ciudad', [...places.values()].slice(0, 20))}`;
    return;
  }

  const hits = state.catalog.filter((d) =>
    [d.title, d.place, d.date, d.year, d.id].join(' ').toLowerCase().includes(q));

  viewEl.innerHTML = `
    <div class="hero hero--home"><h1 class="hero__title">${esc(query)}</h1>
      <p class="hero__facts"><b>${nfmt.format(hits.length)}</b> resultados en el catálogo cargado.</p></div>
    ${hits.length
      ? `<section class="section"><div class="grid">${hits.map(cardHTML).join('')}</div></section>`
      : `<div class="state"><h2 class="state__title">Sin resultados para «${esc(query)}»</h2>
          <p class="state__body">Prueba con una ciudad (Melbourne, Chicago), una sala o un año.</p></div>`}`;
}

async function viewAlbum(id) {
  viewEl.innerHTML = skeletonHTML(5);
  let item;
  try {
    item = await loadItem(id);
  } catch (err) {
    viewEl.innerHTML = errorHTML(friendlyError(err));
    return;
  }

  setHero(hashHue(id));
  applyArtColor(item.art, id);

  const total = item.tracks.reduce((sum, t) => sum + t.duration, 0);
  const facts = [
    item.place,
    fmtDate(item.date),
    `${item.tracks.length} ${item.tracks.length === 1 ? 'tema' : 'temas'}`,
    total ? fmtTime(total) : '',
  ].filter(Boolean);

  viewEl.innerHTML = `
    <header class="hero">
      <div class="hero__row">
        <img class="hero__art" src="${esc(item.art)}" alt="Portada de ${esc(item.title)}" data-fb="${esc(item.title)}">
        <div>
          <p class="hero__kicker">${state.catalog.find((d) => d.id === id)?.kind === 'studio'
            ? 'Álbum de estudio · liberado por la banda' : 'Grabación en directo'}</p>
          <h1 class="hero__title">${esc(item.title)}</h1>
          <p class="hero__facts"><b>${esc(item.creator)}</b><span class="hero__sep">•</span>${
            facts.map(esc).join('<span class="hero__sep">•</span>')}</p>
        </div>
      </div>
    </header>

    <div class="actions">
      <button class="play-cta" id="albumPlay" aria-label="Reproducir ${esc(item.title)}">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg>
      </button>
      <button class="icon-btn" id="albumShuffle" aria-label="Reproducir en aleatorio">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M17 3.5 21.5 8 17 12.5V9.5h-1.9c-1 0-1.6.4-2.4 1.5l-.9 1.3-1.2-1.7.6-.9C12.4 7.9 13.6 7.2 15.1 7.2H17zM2.5 7.2h2.6c1.6 0 2.8.8 3.9 2.4l4 5.8c.8 1.1 1.4 1.5 2.3 1.5H17V14l4.5 4.5L17 23v-3h-1.8c-1.6 0-2.8-.8-3.9-2.4l-4-5.8c-.8-1.1-1.4-1.5-2.3-1.5H2.5z"/></svg>
      </button>
      <a class="pill pill--ghost" href="${IA}/details/${encodeURIComponent(item.id)}" target="_blank" rel="noopener noreferrer">Ver en Internet Archive</a>
    </div>

    <section class="tracks">
      <div class="tracks__head" role="presentation">
        <span>#</span><span>Título</span><span>Duración</span>
      </div>
      ${item.tracks.map((t, i) => `
        <button class="track" data-item="${esc(item.id)}" data-index="${i}">
          <span class="track__num"><span class="num">${i + 1}</span><span class="ico">▶</span></span>
          <span class="track__cell">
            <span class="track__name truncate">${esc(t.title)}</span>
            <span class="track__meta truncate">${esc(item.creator)}</span>
          </span>
          <span class="track__time">${t.duration ? fmtTime(t.duration) : '—'}</span>
        </button>`).join('')}
    </section>

    ${item.description ? `<section class="section">
      <h2 class="section__title">Sobre esta grabación</h2>
      <p class="hero__facts" style="line-height:1.6;max-width:80ch">${esc(item.description.slice(0, 1200))}</p>
    </section>` : ''}`;

  markPlayingRows();
}

async function viewLibrary() {
  try {
    await loadCatalog();
  } catch (err) {
    viewEl.innerHTML = errorHTML(friendlyError(err));
    return;
  }
  setHero(hashHue('library'));

  const likedIds = [...new Set([...state.liked].map((k) => k.split(' ')[0]))];
  const likedShows = likedIds.map((id) => state.catalog.find((d) => d.id === id)).filter(Boolean);
  const recent = state.history.map((id) => state.catalog.find((d) => d.id === id)).filter(Boolean);

  viewEl.innerHTML = `
    <div class="hero hero--home">
      <p class="hero__kicker">Tu biblioteca</p>
      <h1 class="hero__title">Me gusta</h1>
      <p class="hero__facts"><b>${nfmt.format(state.liked.size)}</b> ${state.liked.size === 1 ? 'tema guardado' : 'temas guardados'}</p>
    </div>
    ${state.liked.size ? `<div class="actions">
      <button class="play-cta" id="likedPlay" aria-label="Reproducir tus temas favoritos">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg>
      </button></div>` : ''}
    ${likedShows.length ? rowHTML('Grabaciones con temas guardados', likedShows) : `
      <div class="state"><h2 class="state__title">Aún no has guardado nada</h2>
      <p class="state__body">Pulsa el corazón en la barra de reproducción para guardar el tema que suena.</p></div>`}
    ${railHTML('Escuchado recientemente', recent)}`;
}

/** Reúne todas las pistas marcadas como favoritas (requiere cargar sus items). */
async function playLiked() {
  const ids = [...new Set([...state.liked].map((k) => k.split(' ')[0]))];
  const tracks = [];
  for (const id of ids) {
    try {
      const item = await loadItem(id);
      for (const t of item.tracks) if (state.liked.has(trackKey(t))) tracks.push(t);
    } catch { /* item inaccesible: se omite */ }
  }
  playQueue(tracks, 0, 'Me gusta');
}

/* ── Color del héroe ───────────────────────────────────────── */

function setHero(hue) {
  document.documentElement.style.setProperty('--hero', `hsl(${hue} 34% 26%)`);
}

/** Extrae el color dominante de la portada; si el lienzo se contamina, usamos el hash. */
function applyArtColor(src, seed) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 24;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 24, 24);
      const { data } = ctx.getImageData(0, 0, 24, 24);
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      if (!n) return;
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      document.documentElement.style.setProperty('--hero', `rgb(${r} ${g} ${b})`);
    } catch {
      setHero(hashHue(seed));
    }
  };
  img.onerror = () => setHero(hashHue(seed));
  img.src = src;
}

/* ── Pantalla completa de reproducción ─────────────────────── */

/* Sólo en móvil, igual que Spotify: en escritorio la barra ya muestra
   todos los controles y no hay nada que maximizar. */
const compactPlayer = window.matchMedia('(max-width: 767px)');

let npFullPushed = false;   // ¿hemos añadido una entrada de historial?
let npCloseTimer = null;    // ocultado diferido mientras dura la animación

function openNowPlaying() {
  if (!npFullEl.hidden || !compactPlayer.matches || !currentTrack()) return;

  clearTimeout(npCloseTimer);   // volver a abrir durante el cierre debe valer
  npFullEl.hidden = false;
  document.body.classList.add('is-np-open');
  ctrls('expand').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  renderProgress();

  // Un fotograma con la hoja abajo para que la transición tenga de dónde salir.
  requestAnimationFrame(() => npFullEl.classList.add('is-open'));

  // El botón atrás del sistema debe cerrar la hoja, no cambiar de vista.
  history.pushState({ npFull: true }, '', location.href);
  npFullPushed = true;

  $('#npFullClose').focus();
}

/**
 * @param {boolean} fromHistory  true si ya venimos de un popstate o de un
 *   cambio de ruta: entonces no hay que tocar el historial.
 */
function closeNowPlaying({ fromHistory = false } = {}) {
  if (npFullEl.hidden) return;

  npFullEl.classList.remove('is-open');
  npFullSheet.style.transform = '';
  document.body.classList.remove('is-np-open');
  ctrls('expand').forEach((b) => b.setAttribute('aria-expanded', 'false'));

  clearTimeout(npCloseTimer);
  const hide = () => { npFullEl.hidden = true; };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) hide();
  else npCloseTimer = setTimeout(hide, 220);

  if (npFullPushed && !fromHistory) history.back();
  npFullPushed = false;
}

function bindNowPlayingFull() {
  onCtrl('expand', openNowPlaying);
  $('#npFullClose').addEventListener('click', () => closeNowPlaying());

  // Al abrir la grabación desde la hoja, ésta se cierra y deja ver la vista.
  $('#npFullSource').addEventListener('click', () => closeNowPlaying());

  window.addEventListener('popstate', () => {
    if (!npFullEl.hidden) closeNowPlaying({ fromHistory: true });
  });

  // Si la ventana crece hasta el reproductor completo, la hoja sobra.
  compactPlayer.addEventListener('change', (e) => {
    if (!e.matches) closeNowPlaying();
  });

  bindSheetDrag();
}

/** Arrastrar hacia abajo para descartar, como en la app original. */
function bindSheetDrag() {
  let startY = 0;
  let delta = 0;
  let dragging = false;

  /* Arrastrar una imagen dispara el drag-and-drop nativo del navegador, que
     se traga los pointermove/pointerup y deja el gesto a medias. */
  npFullSheet.addEventListener('dragstart', (e) => e.preventDefault());

  npFullSheet.addEventListener('pointerdown', (e) => {
    // Los controles y los deslizadores mandan sobre el gesto.
    if (e.target.closest('button, a, .range')) return;
    dragging = true;
    startY = e.clientY;
    delta = 0;
    // Capturar el puntero garantiza que los move/up siguen llegando aquí
    // aunque el dedo salga del elemento donde empezó.
    npFullSheet.setPointerCapture(e.pointerId);
    npFullSheet.style.transition = 'none';
  });

  npFullSheet.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    delta = Math.max(0, e.clientY - startY);      // sólo hacia abajo
    npFullSheet.style.transform = `translateY(${delta}px)`;
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    if (e && npFullSheet.hasPointerCapture(e.pointerId)) npFullSheet.releasePointerCapture(e.pointerId);
    npFullSheet.style.transition = '';
    if (delta > 110) closeNowPlaying();
    else npFullSheet.style.transform = '';
  };
  npFullSheet.addEventListener('pointerup', end);
  npFullSheet.addEventListener('pointercancel', end);
}

/* ── Enrutado ──────────────────────────────────────────────── */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name = 'home', ...rest] = raw.split('/');
  return { name, param: decodeURIComponent(rest.join('/')) };
}

/** Título de la cabecera: es la única referencia de dónde estás en el móvil. */
function setViewTitle(text) {
  $('#viewTitle').textContent = text;
}

function router() {
  const route = parseHash();
  state.route = route;

  // Cambiar de vista cierra la pantalla completa. La entrada de historial que
  // añadió ya quedó atrás con la navegación, así que no la deshacemos.
  closeNowPlaying({ fromHistory: true });

  $$('[data-route]').forEach((el) => el.classList.toggle('is-active', el.dataset.route === route.name));
  viewEl.scrollTop = 0;

  switch (route.name) {
    case 'album':   setViewTitle('Grabación');  viewAlbum(route.param); break;
    case 'search':  setViewTitle('Buscar');     viewSearch(route.param); break;
    case 'library': setViewTitle('Tu biblioteca'); viewLibrary(); break;
    default:        setViewTitle('Publicaciones'); viewHome();
  }
}

/* ── Marcado de la pista activa ────────────────────────────── */

function markPlayingRows() {
  const track = currentTrack();
  $$('.pub').forEach((row) => row.classList.toggle('is-playing', row.dataset.id === track?.itemId));
  $$('.track').forEach((row) => {
    const on = !!track && row.dataset.item === track.itemId
      && Number(row.dataset.index) === state.queue.indexOf(track);
    row.classList.toggle('is-current', on);
    const num = $('.track__num .num', row);
    if (num) {
      num.innerHTML = on && !audio.paused
        ? '<span class="eq"><i></i><i></i><i></i></span>'
        : String(Number(row.dataset.index) + 1);
    }
  });
  renderShelf();
}

/* ── Deslizadores (progreso y volumen) ─────────────────────── */

function bindRange(el, { onScrub, onCommit, step = 5 }) {
  const ratioFrom = (clientX) => {
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-drag');
    onScrub(ratioFrom(e.clientX));
  });
  el.addEventListener('pointermove', (e) => {
    if (!el.classList.contains('is-drag')) return;
    onScrub(ratioFrom(e.clientX));
  });
  const end = (e) => {
    if (!el.classList.contains('is-drag')) return;
    el.classList.remove('is-drag');
    onCommit(ratioFrom(e.clientX));
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener('keydown', (e) => {
    const now = Number(el.getAttribute('aria-valuenow')) || 0;
    let target = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') target = now + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') target = now - step;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = 100;
    if (target === null) return;
    e.preventDefault();
    const ratio = Math.min(1, Math.max(0, target / 100));
    onScrub(ratio);
    onCommit(ratio);
  });
}

/* ── Enlaces de la interfaz ────────────────────────────────── */

function bindUI() {
  // Reproducción — `onCtrl` ata a la vez la barra y la pantalla completa.
  onCtrl('play', togglePlay);
  onCtrl('next', () => next());
  onCtrl('prev', prev);

  onCtrl('shuffle', () => {
    state.shuffle = !state.shuffle;
    store.set('shuffle', state.shuffle);
    if (state.queue.length && state.pos >= 0) {
      buildOrder(state.order[state.pos]);       // conserva la pista actual
    }
    renderToggles();
    renderQueue();
    toast(state.shuffle ? 'Reproducción aleatoria activada' : 'Reproducción aleatoria desactivada');
  });

  onCtrl('repeat', () => {
    state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
    store.set('repeat', state.repeat);
    renderToggles();
  });

  onCtrl('like', () => {
    const track = currentTrack();
    if (!track) return;
    const key = trackKey(track);
    if (state.liked.has(key)) { state.liked.delete(key); toast('Eliminado de Me gusta'); }
    else { state.liked.add(key); toast('Añadido a Me gusta'); }
    store.set('liked', [...state.liked]);
    renderLike();
    if (state.route.name === 'library') viewLibrary();
  });

  $('#btnMute').addEventListener('click', () => {
    state.muted = !state.muted;
    audio.muted = state.muted;
    store.set('muted', state.muted);
    renderVolume();
  });

  // Cola
  onCtrl('queue', () => {
    const open = queueEl.hidden;
    queueEl.hidden = !open;
    appEl.classList.toggle('app--queue', open);
    for (const btn of ctrls('queue')) {
      btn.setAttribute('aria-pressed', String(open));
      btn.classList.toggle('is-on', open);
    }
    // La cola vive detrás de la pantalla completa: al abrirla, ésta se cierra.
    if (open) closeNowPlaying();
    renderQueue();
  });
  $('#queueClose').addEventListener('click', () => $('#btnQueue').click());

  queueList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qpos]');
    if (!btn) return;
    state.pos = Number(btn.dataset.qpos);
    loadCurrent({ autoplay: true });
  });

  // Navegación del historial
  $('#navBack').addEventListener('click', () => history.back());
  $('#navFwd').addEventListener('click', () => history.forward());

  // Búsqueda
  const input = $('#searchInput');
  let searchTimer = null;
  $('#searchForm').addEventListener('submit', (e) => e.preventDefault());
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const value = input.value;
    searchTimer = setTimeout(() => {
      const target = `#/search/${encodeURIComponent(value)}`;
      if (location.hash !== target) {
        // replaceState evita llenar el historial con cada pulsación
        history.replaceState(null, '', target);
        router();
      }
    }, 220);
  });

  // Filtros de la estantería
  $$('.chip').forEach((chip) => chip.addEventListener('click', () => {
    $$('.chip').forEach((c) => c.classList.toggle('chip--on', c === chip));
    state.shelfFilter = chip.dataset.chip;
    renderShelf();
  }));

  $('#reloadCatalog').addEventListener('click', async () => {
    toast('Actualizando catálogo…');
    try {
      await loadCatalog({ force: true });
      renderShelf();
      router();
      toast('Catálogo actualizado');
    } catch {
      toast('No se pudo actualizar el catálogo.');
    }
  });

  // Clics delegados en la vista
  viewEl.addEventListener('click', (e) => {
    const play = e.target.closest('[data-play]');
    if (play) { e.preventDefault(); playItem(play.dataset.play); return; }

    // Filtros de publicación: sólo repintan, no navegan.
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      e.preventDefault();
      state.pubFilter = filter.dataset.filter;
      viewEl.scrollTop = 0;
      viewHome();
      return;
    }

    const row = e.target.closest('.track');
    if (row) { playItem(row.dataset.item, Number(row.dataset.index)); return; }

    if (e.target.closest('#albumPlay')) { playItem(state.route.param); return; }

    if (e.target.closest('#albumShuffle')) {
      if (!state.shuffle) ctrls('shuffle')[0].click();
      playItem(state.route.param);
      return;
    }

    if (e.target.closest('#likedPlay')) { playLiked(); return; }

    if (e.target.closest('#retry')) { router(); }
  });

  // Portadas rotas → portada generada
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = '1';
    img.src = fallbackArt(img.src, img.dataset.fb || ARTIST);
  }, true);

  // Sombreado de la barra superior al desplazar
  viewEl.addEventListener('scroll', () => {
    $('#topbar').classList.toggle('is-stuck', viewEl.scrollTop > 24);
  }, { passive: true });

  // Deslizadores — las dos barras de progreso comparten manejador
  parts.seek.forEach((el) => bindRange(el, {
    onScrub: (ratio) => {
      state.seeking = true;
      const dur = audio.duration || currentTrack()?.duration || 0;
      paintSeek(ratio * 100);
      setText(parts.timeNow, fmtTime(ratio * dur));
      setText(parts.timeLeft, `-${fmtTime(Math.max(0, dur - ratio * dur))}`);
    },
    onCommit: (ratio) => {
      const dur = audio.duration;
      if (Number.isFinite(dur) && dur > 0) audio.currentTime = ratio * dur;
      state.seeking = false;
      renderProgress();
    },
  }));

  bindRange($('#vol'), {
    onScrub: (ratio) => {
      state.volume = ratio;
      state.muted = ratio === 0;
      audio.volume = ratio;
      audio.muted = state.muted;
      renderVolume();
    },
    onCommit: () => {
      store.set('volume', state.volume);
      store.set('muted', state.muted);
    },
  });

  // Atajos de teclado
  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case ' ':          e.preventDefault(); togglePlay(); break;
      case 'ArrowRight': if (e.shiftKey) next(); else audio.currentTime += 10; break;
      case 'ArrowLeft':  if (e.shiftKey) prev(); else audio.currentTime -= 10; break;
      case 'ArrowUp':    e.preventDefault(); setVolume(state.volume + 0.05); break;
      case 'ArrowDown':  e.preventDefault(); setVolume(state.volume - 0.05); break;
      case 'm': case 'M': $('#btnMute').click(); break;
      case 's': case 'S': ctrls('shuffle')[0].click(); break;
      case 'r': case 'R': ctrls('repeat')[0].click(); break;
      case '/':          e.preventDefault(); $('#searchInput').focus(); break;
      case 'Escape':     closeNowPlaying(); break;
      default: break;
    }
  });
}

function setVolume(value) {
  state.volume = Math.min(1, Math.max(0, value));
  state.muted = state.volume === 0;
  audio.volume = state.volume;
  audio.muted = state.muted;
  store.set('volume', state.volume);
  store.set('muted', state.muted);
  renderVolume();
}

/* ── Eventos del elemento <audio> ──────────────────────────── */

function bindAudio() {
  audio.addEventListener('play', () => {
    setPlayIcon(true);
    markPlayingRows();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  });

  audio.addEventListener('pause', () => {
    setPlayIcon(false);
    markPlayingRows();
    rememberSession();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  });

  audio.addEventListener('timeupdate', () => {
    renderProgress();
    updatePositionState();
  });

  audio.addEventListener('loadedmetadata', () => {
    const track = currentTrack();
    if (track && (!track.duration || !Number.isFinite(track.duration)) && Number.isFinite(audio.duration)) {
      track.duration = audio.duration;
    }
    renderProgress();
    updatePositionState();
  });

  audio.addEventListener('ended', () => next({ auto: true }));

  audio.addEventListener('error', () => {
    if (!audio.src) return;
    toast('Ese archivo no se pudo reproducir; pasando al siguiente.');
    setTimeout(() => next({ auto: true }), 600);
  });

  // Guardamos la posición periódicamente y al salir, para poder retomar.
  setInterval(rememberSession, 5000);
  window.addEventListener('pagehide', rememberSession);
  document.addEventListener('visibilitychange', () => {
    // Nada de pausar aquí: la reproducción debe continuar en segundo plano.
    if (document.hidden) rememberSession();
  });
}

/* ── Restauración de la sesión anterior ────────────────────── */

function restoreSession() {
  const saved = store.get('session', null);
  if (!saved?.queue?.length || saved.pos < 0) return;
  if (saved.v !== DATA_VERSION) { store.set('session', null); return; }
  // Misma red de seguridad que en el catálogo.
  state.queue = saved.queue.map((t) => ({
    ...t, title: kglw(t.title), album: kglw(t.album), artist: kglw(t.artist) || ARTIST,
  }));
  state.order = saved.order?.length ? saved.order : saved.queue.map((_, i) => i);
  state.pos = Math.min(saved.pos, state.order.length - 1);
  state.context = saved.context || '';
  // Sin autoplay: los navegadores lo bloquean sin gesto previo del usuario.
  loadCurrent({ autoplay: false, resumeAt: saved.time || 0 });
  setPlayIcon(false);
}

/* ── Arranque ──────────────────────────────────────────────── */

function init() {
  audio.volume = state.volume;
  audio.muted = state.muted;

  renderVolume();
  renderToggles();
  setPlayIcon(false);
  bindUI();
  bindAudio();
  bindNowPlayingFull();
  restoreSession();

  window.addEventListener('hashchange', router);
  // replaceState en lugar de asignar location.hash: no dispara hashchange,
  // así evitamos renderizar la portada dos veces al arrancar.
  if (!location.hash) history.replaceState(null, '', '#/home');
  router();

  loadCatalog().then(renderShelf).catch(() => { /* la vista ya muestra el error */ });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', registerWorker);
  }
}

/**
 * Registra el service worker y se recarga sola cuando llega una versión nueva.
 *
 * Sin esto la app puede quedarse una versión por detrás: el worker antiguo
 * decide qué se sirve, así que el arreglo que lo corrige llega tarde. Como
 * `sw.js` hace skipWaiting + claim, el worker nuevo toma el control en cuanto
 * se instala y ahí recargamos.
 */
function registerWorker() {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // En la primera visita no había controlador: eso no es una actualización.
    if (!hadController || refreshing) return;
    // Recargar cortaría la música: si suena algo, que espere a la próxima visita.
    if (!audio.paused) return;
    refreshing = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js')
    .then((reg) => reg.update())
    .catch(() => { /* file:// o sin HTTPS */ });
}

init();
