// GolfVault Service Worker — Cache-First Strategy
const CACHE_NAME = 'golfvault-v3';  // bumped: 5-tab nav + Docs tab
const STATIC_ASSETS = [
  '/GolfVault/',
  '/GolfVault/index.html',
  '/GolfVault/app.js',
  '/GolfVault/styles.css',
  '/GolfVault/manifest.json',
  '/GolfVault/data/products.json',
  '/GolfVault/data/coaches.json',
  '/GolfVault/data/courses.json',
  '/GolfVault/data/submissions.json',
  '/GolfVault/icons/icon.svg',
  '/GolfVault/icons/icon-maskable.svg',
  '/GolfVault/icons/icon-192.png',
  '/GolfVault/icons/icon-512.png',
  '/GolfVault/icons/GolfVault_AppIcon.png',
  '/GolfVault/icons/GolfVault_AppHeroImage.png'
];

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

  // Skip cross-origin image requests (Unsplash, etc.) — let browser handle
  if (url.hostname.includes('unsplash.com') || url.hostname.includes('images.unsplash.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return a transparent 1px PNG as fallback for failed images
        return new Response(
          atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
          { headers: { 'Content-Type': 'image/png' } }
        );
      })
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
          return caches.match('/GolfVault/index.html');
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
