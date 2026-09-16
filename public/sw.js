// GLOW UP — Progressive Web App Service Worker
// Version: 1.0.0
// Cache strategy:
// 1. Static UI shell & assets: Cache-first with stale-while-revalidate
// 2. Navigation routes: Network-first falling back to cached shell
// 3. CRITICAL SECURITY: Supabase/Cloud API calls are NEVER cached in Service Worker

const CACHE_NAME = 'glow-up-static-v1';

const STATIC_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/app_logo.png',
  '/assets/hero_illustration.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

// Install: Pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_PRECACHE).catch((err) => {
        console.warn('Pre-cache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Secure caching routing
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. SECURITY FILTER: Never cache Supabase auth or database API requests
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/v1') ||
    url.pathname.includes('/rest/v1') ||
    event.request.headers.get('Authorization')
  ) {
    // Pass straight to network, do not touch CacheStorage
    return;
  }

  // 2. Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // 3. Navigation Requests (HTML shell fallback for SPA routing)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedShell = await cache.match('/index.html') || await cache.match('/');
        return cachedShell || new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // 4. Static Assets (JS, CSS, Images, Fonts)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch update in background for next time (Stale-While-Revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
        }).catch(() => {/* offline, ignore background fetch failure */});

        return cachedResponse;
      }

      // Not in cache: fetch from network and cache
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && !event.request.url.includes('fonts.gstatic.com') && !event.request.url.includes('cdn.tailwindcss.com'))) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(async () => {
        // Fallback for image requests when offline
        if (event.request.destination === 'image') {
          const cache = await caches.open(CACHE_NAME);
          return cache.match('/assets/app_logo.png');
        }
      });
    })
  );
});
