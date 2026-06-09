const CACHE_NAME = 'boom-cmd-v2';
const BASE = '/boom-cmd/';
const STATIC_ASSETS = [
  BASE, BASE + 'index.html', BASE + 'favicon.svg',
  BASE + 'icon-192.png', BASE + 'icon-512.png',
  BASE + 'apple-touch-icon.png', BASE + 'manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match(BASE + 'index.html')));
    return;
  }
  e.respondWith(caches.match(request).then((cached) => cached ||
    fetch(request).then((res) => {
      if (res.ok && request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, clone));
      }
      return res;
    })));
});
