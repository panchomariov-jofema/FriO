// public/sw.js

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  // Skip waiting to activate the new service worker immediately.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  // Take control of all clients as soon as the service worker is activated.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // A simple pass-through fetch handler.
  // This ensures the service worker is functional for PWA installation checks,
  // but doesn't implement any caching strategy.
  // For offline capabilities, a more robust strategy (e.g., cache-first) is needed.
  event.respondWith(fetch(event.request));
});
