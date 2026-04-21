// Mesa de Trabajo — Service Worker v9
// Estrategia: cache-first para assets estáticos, network-first para API GAS

const CACHE_NAME = 'mdt-v9';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap',
  'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js',
  'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css',
];

// Instalar: pre-cachear assets estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] No se pudieron cachear algunos assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activar: limpiar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first para estáticos, network-only para GAS (CORS)
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Las llamadas a GAS siempre van a la red (no son cacheables por CORS)
  if (url.includes('script.google.com') || url.includes('accounts.google.com')) {
    return; // dejar pasar sin interceptar
  }

  // Para el resto: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Solo cachear respuestas OK de mismo origen o CDNs confiables
        if (response.ok && (
          url.startsWith(self.location.origin) ||
          url.includes('cdn.jsdelivr.net') ||
          url.includes('fonts.googleapis.com') ||
          url.includes('fonts.gstatic.com')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Sin red y sin cache: para HTML devolver la app cacheada
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
