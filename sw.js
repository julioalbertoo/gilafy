/* Service worker de Gilafy.
   Sólo cachea el "app shell" del propio origen. El audio y los metadatos de
   archive.org NUNCA se interceptan: las peticiones de rango (Range) del
   elemento <audio> deben llegar intactas al servidor, o el desplazamiento
   dentro de la pista dejaría de funcionar. */

const CACHE = 'gilafy-v4';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-32.png',
  './icon-192.png',
  './icon.png',
  './icon-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => { /* un recurso ausente no debe impedir la instalación */ })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // archive.org pasa de largo
  if (request.headers.has('range')) return;

  /* Primero la red, con la caché como respaldo.
     Servir la copia guardada y refrescar por detrás (stale-while-revalidate)
     dejaría al usuario viendo siempre la versión del despliegue anterior en
     la primera carga; con la app cambiando, eso se nota. La caché queda para
     lo que de verdad es: funcionar sin conexión. */
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        throw new Error('sin red y sin copia en caché');
      }
    })
  );
});
