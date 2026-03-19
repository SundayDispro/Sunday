/* Service Worker para Sunday – PWA + Web Push */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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

