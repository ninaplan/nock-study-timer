self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Minimal pass-through handler keeps runtime behavior unchanged
  // while satisfying PWA installability requirements in Chrome.
  event.respondWith(fetch(event.request));
});
