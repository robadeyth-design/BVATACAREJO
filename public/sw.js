const CACHE_NAME = 'bv-atacarejo-v1';
const OFFLINE_URL = '/offline.html';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/icon-512.png',
  'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23f59e0b\'%3E%3Cpath d=\'M20 8H4V6h16v2zm-2 5H6v-2h12v2zm-4 5v-2H6v2h8z\'/%3E%3C/svg%3E'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline support fallback page and essential assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event Handler
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // We only intercept GET requests
  if (event.request.method !== 'GET') return;

  // Let browser handle hot module updates (HMR) and firestore endpoints
  if (
    requestUrl.pathname.includes('__vite_ping') ||
    requestUrl.pathname.includes('@vite') ||
    requestUrl.pathname.includes('node_modules') ||
    requestUrl.hostname.includes('firestore.googleapis.com') ||
    requestUrl.hostname.includes('firebase')
  ) {
    return;
  }

  // 1. Navigation requests - Network First, then Cache, then fall back to offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Put template in cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // 2. Static Resources (JS, CSS, images, etc.) - Stale-while-revalidate or Cache First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for cache revalidation
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
          })
          .catch(() => {/* Ignore background sync failures */});
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => {
          // If fallback lacks icon requests
          if (event.request.destination === 'image' && requestUrl.pathname.includes('icon')) {
            return caches.match('/icon-512.png');
          }
        });
    })
  );
});
