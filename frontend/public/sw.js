// SuperWash Exprez — Minimal, Safe PWA Service Worker
const CACHE_NAME = 'superwash-shell-v1';
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching asset failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Bypass all non-http(s) schemas
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Same-origin invariant: Only handle same-origin requests; bypass external services, OAuth, and CDN
  if (url.origin !== self.location.origin) {
    return;
  }

  // Security & Data Integrity Invariant:
  // Strictly bypass Supabase backend, auth calls, API queries.
  // Never cache customer personal info, order records, or dynamic database state.
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  // Network-first strategy: always fetch fresh from network, fall back to shell cache if offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache for static assets or root app shell on valid basic 200 response
        if (response.status === 200 && response.type === 'basic') {
          if (event.request.mode === 'navigate') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', responseClone));
          } else {
            const isStatic = url.pathname.endsWith('.png') ||
                             url.pathname.endsWith('.svg') ||
                             url.pathname.endsWith('.json') ||
                             url.pathname.endsWith('.css') ||
                             url.pathname.endsWith('.js');
            if (isStatic) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
          }
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // If navigation fails (e.g. offline route transition), fallback to root app shell
        if (event.request.mode === 'navigate') {
          const fallbackShell = await caches.match('/');
          if (fallbackShell) {
            return fallbackShell;
          }
        }
        return Response.error();
      })
  );
});
