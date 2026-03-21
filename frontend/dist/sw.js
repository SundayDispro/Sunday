/* Service Worker para Sunday – PWA + Web Push + Offline Cache */

const CACHE_NAME = 'sunday-cache-v7';
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
  // TODO: migrar a network-first para navegación y stale-while-revalidate
  // para assets. Bump manual de versión hasta implementar build hash.
  // Solo manejamos requests HTTP(s) GET para evitar errores de respuesta inválida.
  if (event.request.method !== 'GET') return;
  const reqUrl = event.request.url || '';
  if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://')) return;

  // Ignorar peticiones a la API o web sockets para no cachearlas incorrectamente
  if (reqUrl.includes('/api/') || reqUrl.includes('/socket.io/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cachear estáticos (js, css, woff2) automáticamente
        if (networkResponse && networkResponse.ok && reqUrl.match(/\.(js|css|woff2|png|jpg|jpeg|svg)$/)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback a index.html para SPA routing offline
        if (event.request.mode === 'navigate') {
          return caches.match('/').then((fallback) => {
            if (fallback) return fallback;
            return new Response('Offline', {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          });
        }
        return Response.error();
      });
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

