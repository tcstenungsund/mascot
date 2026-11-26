'use strict';
// Service worker: makes the mascot work offline and installable.
// Network first: edits to config.js (or any file) show up on the next reload, and the cached copy is
// only used when the server does not answer. Bump VERSION when files are added or removed.

const VERSION = 'mascot-v2';
const FILES = [
  './',
  'index.html',
  'mascot.css',
  'mascot.js',
  'prompt.js',
  'config.js',
  'manifest.webmanifest',
  'fonts/kaomoji-latin.woff2',
  'fonts/kaomoji-cjk.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

// Remove caches from older versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only our own files. /presence is live sensor data and must never come from a cache.
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname === '/presence') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          // Stored without ?face=… etc., so URL variants share one cache entry instead of piling up.
          caches.open(VERSION).then(cache => cache.put(url.origin + url.pathname, copy));
        }
        return response;
      })
      // Offline: the cached copy, ignoring ?face=… and other URL parameters.
      .catch(() => caches.match(event.request, { ignoreSearch: true })),
  );
});
