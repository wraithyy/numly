// Offline shell: app files (fonts included, they are self-hosted) are fetched network-first, so a
// deploy shows up immediately, and cached as the offline fallback. The API is never cached: the code
// lives on the server, so guesses and the live board need the network.

const CACHE = 'numly-v5'; // v5: fonts moved from Google to our own files
// Filled in by the build (vite.config.js) with the hashed app files.
const SHELL = self.__SHELL;
// The page keeps the player's language here, so a payload-free push can still speak it.
const PREFS = 'numly-prefs';
const PUSH_TEXT = {
  cs: ['Nový týdenní trezor', 'Je pondělí a čeká tě nový trezor.'],
  en: ['A new weekly safe', 'It is Monday and a new safe is waiting.'],
  sk: ['Nový týždenný trezor', 'Je pondelok a čaká ťa nový trezor.'],
  de: ['Ein neuer Wochentresor', 'Es ist Montag und ein neuer Tresor wartet.'],
  pl: ['Nowy sejf tygodnia', 'Jest poniedziałek i czeka nowy sejf.'],
  es: ['Nueva caja semanal', 'Es lunes y te espera una nueva caja.'],
  fr: ['Nouveau coffre de la semaine', 'C’est lundi, un nouveau coffre t’attend.'],
  it: ['Nuova cassaforte settimanale', 'È lunedì e ti aspetta una nuova cassaforte.'],
  pt: ['Novo cofre semanal', 'É segunda e um novo cofre espera por você.'],
};

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== PREFS).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (request.method !== 'GET') return;
  if (sameOrigin && url.pathname.startsWith('/api/')) return;
  if (!sameOrigin) return;

  event.respondWith(networkFirst(request, url));
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

self.addEventListener('push', event => {
  event.waitUntil(
    (async () => {
      const lang = await (await (await caches.open(PREFS)).match('/lang'))?.text();
      const [title, body] = PUSH_TEXT[lang] ?? PUSH_TEXT.en;
      await self.registration.showNotification(title, { body, icon: '/icons/icon-192.png', tag: 'numly-week' });
    })(),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/week'));
});
