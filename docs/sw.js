// Clubhouse Golf Service Worker — Cache-First Strategy
//
// All asset paths are RELATIVE to this script's own location, so the worker
// carries no hardcoded deploy path. It works unchanged at a repo subpath
// (/whatever/), at a domain root, or behind a custom domain — rename the repo
// or attach a domain and nothing here needs editing.
const CACHE_NAME = 'clubhouse-golf-v9';  // bumped: path-agnostic asset URLs
const abs = rel => new URL(rel, self.location).href;
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './data/products.json',
  './data/coaches.json',
  './data/courses.json',
  './data/submissions.json',
  './data/profile.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/clubhouse-golf-app-icon.png',
  './icons/clubhouse-golf-app-hero.png',
  './icons/product-placeholder.svg'
].map(abs);

// ── Install: pre-cache static shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS.map(url => {
        return new Request(url, { cache: 'reload' });
      })).catch(err => {
        console.warn('[SW] Pre-cache partial failure (non-fatal):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Allow the page to activate a waiting worker immediately ──────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for static, network-first for API ─────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip Anthropic API calls — never cache these
  if (url.hostname === 'api.anthropic.com') return;

  // Skip Chrome extension requests
  if (url.protocol === 'chrome-extension:') return;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // version.json — always network-first so update checks see the live deploy
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // Skip cross-origin image requests (Unsplash, etc.) — let browser handle
  if (url.hostname.includes('unsplash.com') || url.hostname.includes('images.unsplash.com')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        // On failure, serve the branded placeholder instead of a blank pixel
        caches.match(abs('./icons/product-placeholder.svg'))
      )
    );
    return;
  }

  // Cache-first for local static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache successful same-origin responses
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });

        return response;
      }).catch(() => {
        // Offline fallback — return the app shell
        if (event.request.destination === 'document') {
          return caches.match(abs('./index.html'));
        }
      });
    })
  );
});

// ── Background Sync (future hook) ────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-bookings') {
    console.log('[SW] Background sync: bookings');
  }
});
