const CACHE_NAME = 'frigomanager-cache-v1';

// On install, pre-cache some resources if needed, but for dynamic apps it's often better to cache on the fly.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  // event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(['/offline.html'])));
  self.skipWaiting(); // Force the waiting service worker to become the active service worker.
});

// On activate, clean up old caches.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Become the service worker for clients that are already open.
});


// On fetch, use a network-first (network falling back to cache) strategy.
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If we get a valid response, we cache it and return it.
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // If the network request fails, try to get it from the cache.
        return caches.match(event.request)
          .then((response) => {
            // If the request is in the cache, return it.
            // Otherwise, we can't do anything, the browser will handle the error.
            return response;
          });
      })
  );
});
