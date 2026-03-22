/* Service Worker para Sunday – PWA + Web Push + Offline Cache */

const CACHE_NAME = 'sunday-cache-v9';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon-192.v6.png',
  '/icon-512.v6.png',
  '/apple-touch-icon-180x180.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Solo manejamos requests HTTP(s) GET
  if (event.request.method !== 'GET') return;
  const reqUrl = event.request.url || '';
  if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://')) return;

  // Ignorar peticiones a la API o web sockets
  if (reqUrl.includes('/api/') || reqUrl.includes('/socket.io/')) {
    return;
  }

  // 1. Network-First para navegación (HTML) - Asegura ver la última versión si hay red
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match('/');
        });
      })
    );
    return;
  }

  // 2. Stale-While-Revalidate para estáticos (js, css, imágenes, fuentes)
  if (reqUrl.match(/\.(js|css|woff2|png|jpg|jpeg|svg|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Fallback silencioso si falla la red durante la revalidación
        });

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Cache-First por defecto para el resto de recursos cacheados (manifest, etc.)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Notificación', body: event.data.text() };
  }
  const { title, body, url, tag, badgeCount } = payload;

  event.waitUntil(
    (async () => {
      const showPromise = self.registration.showNotification(title || 'Sunday', {
        body: body || '',
        icon: '/icon-192.v6.png',
        tag: tag || undefined,
        data: { url: url || '/' },
        badge: '/icon-192.v6.png',
      });

      const badgePromise =
        typeof badgeCount === 'number' &&
        self.registration &&
        typeof self.registration.setAppBadge === 'function'
          ? self.registration.setAppBadge(badgeCount).catch(() => {})
          : Promise.resolve();

      await Promise.all([showPromise, badgePromise]);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

