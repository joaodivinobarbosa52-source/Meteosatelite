// AgroPro · Service Worker v1.0
// Cache-first para assets estáticos, network-first para tiles do mapa

const CACHE_NAME = 'agropro-campo-v1';
const TILE_CACHE = 'agropro-tiles-v1';

// Assets essenciais para funcionar offline
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// ---- INSTALL ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Tenta pré-cachear; falhas individuais não bloqueiam install
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Não cacheou:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== TILE_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- FETCH ----
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Tiles do mapa → cache com expiração longa (stale-while-revalidate)
  if (url.hostname.includes('arcgisonline.com') || url.hostname.includes('tile.openstreetmap')) {
    event.respondWith(tileStrategy(event.request));
    return;
  }

  // Fontes Google → cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Leaflet CDN → cache first
  if (url.hostname.includes('unpkg.com')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // App shell → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

// Strategies
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

async function tileStrategy(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // Retorna tile cinza transparente se offline
    return new Response(
      new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,1,0,0,0,1,0,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,120,156,98,120,120,120,0,0,0,4,0,1,255,42,3,198,0,0,0,0,73,69,78,68,174,66,96,130]),
      { headers: { 'Content-Type': 'image/png' } }
    );
  }
}

// ---- MENSAGENS DO APP ----
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: CACHE_NAME });
  }
});
