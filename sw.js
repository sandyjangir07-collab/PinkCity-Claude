// PinkCity Properties — Service Worker v1.0
// Strategy: Cache-first for assets, Network-first for API/Supabase

const CACHE_NAME = 'pinkcity-v1';
const STATIC_CACHE = 'pinkcity-static-v1';
const RUNTIME_CACHE = 'pinkcity-runtime-v1';

// Files to cache immediately on install
const PRECACHE_URLS = [
  '/index.html',
  '/blog.html',
  '/blog-post.html',
  '/listing.html',
  '/login.html',
  '/dashboard.html',
  '/why.html',
  '/verified.html',
  '/reviews.html',
  '/calculator.html',
  '/investment.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Never cache these (always fresh)
const NETWORK_ONLY = [
  'supabase.co',
  'formspree.io',
  'callmebot.com',
  'wa.me',
];

// ── INSTALL: precache static shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: smart strategy ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for Supabase, forms, WA
  if (NETWORK_ONLY.some(host => url.hostname.includes(host))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Google Fonts — cache-first
  if (url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // CDN scripts (Supabase UMD) — cache-first
  if (url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // HTML pages — Network-first (always fresh), fall back to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else — Cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(event.request, clone));
        return response;
      });
    })
  );
});

// ── PUSH NOTIFICATIONS (future use) ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'PinkCity Properties';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'View', icon: '/icon-72.png' },
      { action: 'close', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  }
});
