const CACHE_NAME = 'boxbox-v5';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.ico'];
const DATA_PREFIX = '/data/';
const MAX_DATA_AGE = 5 * 60 * 1000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.pathname.startsWith(DATA_PREFIX)) {
    e.respondWith(networkFirstWithCache(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

async function networkFirstWithCache(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      // Aggiunge header Date per tracking età cache
      const headers = new Headers(res.headers);
      headers.set('sw-cached-at', Date.now().toString());
      const cloned = new Response(await res.clone().blob(), { status: res.status, headers });
      cache.put(request, cloned);
    }
    return res;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get('sw-cached-at') || '0');
      // Serve dalla cache solo se non troppo vecchia
      if (cachedAt && (Date.now() - cachedAt) > MAX_DATA_AGE) {
        // Dati stale: servi comunque (offline) ma con header di avviso
        const headers = new Headers(cached.headers);
        headers.set('sw-stale', 'true');
        return new Response(await cached.clone().blob(), { status: cached.status, headers });
      }
      return cached;
    }
    return new Response('{"error":"offline"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
