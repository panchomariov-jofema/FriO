// A basic service worker for PWA installability
self.addEventListener('fetch', (event) => {
  // For this basic setup, we're not doing any caching.
  // We just need the file to exist and be registered.
  event.respondWith(fetch(event.request));
});
