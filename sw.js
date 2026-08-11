const CACHE_NAME = 'boxbox-v17';
const SHELL = [
  '/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.ico',
  '/styles.css',
  '/format.js', '/state.js', '/data.js', '/selectors.js', '/analysis.js',
  '/countdown.js', '/ui.js', '/tab-home.js', '/tab-standings.js', '/tab-fantasy.js',
  '/tab-other.js', '/pull-to-refresh.js', '/notifications.js', '/auto-refresh.js', '/main.js',
];
const DATA_PREFIX = '/data/';
const MAX_DATA_AGE = 5 * 60 * 1000;

/* manifest.webmanifest + icone: MAI cache-first. Disinstallare la scorciatoia
   da home screen NON cancella Service Worker + Cache Storage del sito (solo
   il sito stesso, da "Cancella dati sito", lo fa) - un cache-first qui
   avrebbe potuto continuare a servire un'icona vecchia a ogni "Aggiungi a
   schermata Home" indipendentemente da cosa veniva corretto sul server, per
   tutti i cicli di disinstalla/reinstalla fatti finora. Sono gli unici file
   che il sistema operativo legge in un momento preciso (l'installazione) e
   mai più dopo: devono sempre arrivare dalla rete quando possibile. */
const NETWORK_FIRST_ALWAYS = new Set([
  '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.ico',
]);

self.addEventListener('install', e => {
  /* addAll e' atomico: un solo 404 farebbe fallire l'intero install e la PWA
     resterebbe bloccata sulla versione precedente. add() singolo con .catch
     degrada l'offline sul file mancante invece di bloccare l'aggiornamento. */
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.all(SHELL.map(url => c.add(url).catch(() => {}))))
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

  if (NETWORK_FIRST_ALWAYS.has(url.pathname)) {
    e.respondWith(networkFirstShell(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

async function networkFirstShell(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

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
