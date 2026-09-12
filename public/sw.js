/* Philosophen Service Worker
 * Build script replaces __BUILD_VERSION__ with the real build version.
 * Caches ONLY same-origin hashed assets, portraits and icons.
 * NEVER caches API responses or navigations/HTML.
 */
const VERSION = '__BUILD_VERSION__';
const STATIC_CACHE = 'static-' + VERSION;

const OFFLINE_HTML = [
  '<!doctype html>',
  '<html lang="de"><head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Offline — Philosophen</title>',
  '</head>',
  '<body style="font-family:Georgia,serif;background:#f5f1e8;color:#192c29;padding:3rem 1.5rem;max-width:34rem;margin:0 auto">',
  '<h1 style="font-weight:400;letter-spacing:.02em">Offline</h1>',
  '<p style="line-height:1.6">Der Salon ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es erneut.</p>',
  '</body></html>'
].join('');

const PRECACHE = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/portraits/sokrates.webp',
  '/portraits/aristoteles.webp',
  '/portraits/epikur.webp',
  '/portraits/kant.webp',
  '/portraits/nietzsche.webp',
  '/portraits/arendt.webp',
  '/portraits/beauvoir.webp',
  '/portraits/camus.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map(url => new Request(url, {cache:'reload'}))))
      .catch(() => undefined)
  );
  // No automatic skipWaiting — the page decides when it is safe (no busy
  // chat/recording/transcribe) and posts SKIP_WAITING after explicit user action.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== STATIC_CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isHashedAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
}

function isPublicAsset(url) {
  return url.origin === self.location.origin &&
    (url.pathname.startsWith('/portraits/') || url.pathname.startsWith('/icons/'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Same-origin only; never intercept the API or health checks
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;

  // Navigations: network-first with simple offline fallback page
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (err) {
        return new Response(OFFLINE_HTML, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        });
      }
    })());
    return;
  }

  // Hashed build assets and public artwork: cache-first (immutable)
  if (isHashedAsset(url) || isPublicAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
    return;
  }

  // Everything else (sw.js, manifest.webmanifest): pure network, no-store.
});
