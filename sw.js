const CACHE_NAME = 'livetiming-v2.6.6';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/geo.js',
  'js/gpx.js',
  'js/alerts.js',
  'js/wizard.js',
  'js/scoring.js',
  'js/parser.js',
  'js/map.js',
  'js/mapCanvas.js',
  'js/rallyranking_bridge.js',
  'js/export.js',
  'js/simulation.js',
  'js/storage.js',
  'js/telegram-client.js',
  'favicon.png',
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
