// Minimal service worker for PWA installability
// Network-first strategy — the app needs the API, so offline caching is minimal
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
