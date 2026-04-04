const CACHE_NAME = 'livetiming-v2.0.4-test-fix';
const ASSETS = [
  './',
  'index.html?v=2.0.4',
  'css/style.css?v=2.0.4',
  'js/app.js?v=2.0.4',
  'js/geo.js?v=2.0.4',
  'js/gpx.js?v=2.0.4',
  'js/alerts.js?v=2.0.4',
  'js/wizard.js?v=2.0.4',
  'js/scoring.js?v=2.0.4',
  'js/parser.js?v=2.0.4',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force the waiting service worker to become the active service worker.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim()) // Force the newly active service worker to take control of all open clients.
  );
});

// Network First strategy for everything during this transition phase
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
