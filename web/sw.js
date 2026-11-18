// Offline shell: app files are fetched network-first (so a deploy shows up immediately) and
// cached as the offline fallback; fonts are cache-first. The API is never cached: the code
// lives on the server, so guesses and the live board need the network.

const CACHE = 'numly-v4';
// Filled in by the build (vite.config.js) with the hashed app files.
const SHELL = self.__SHELL;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (request.method !== 'GET') return;
  if (sameOrigin && url.pathname.startsWith('/api/')) return;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;

  event.respondWith(sameOrigin ? networkFirst(request, url) : cacheFirst(request));
});

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(url.pathname, response.clone());
    return response;
  } catch (err) {
    // Offline. Invite links (/?g=…, /?f=…) must open too, so the lookup ignores the query string.
    const cached = await cache.match(url.pathname, { ignoreSearch: true });
    if (cached) return cached;
    // Client-side routes (/week) are the same app shell.
    if (request.mode === 'navigate') {
      const shell = await cache.match('/');
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}
