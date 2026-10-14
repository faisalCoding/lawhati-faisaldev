// The Service Worker that receives this server's push notifications.
//
// It does one thing: show what the sync server sent, and open the right board when it is tapped.
// No caching and no offline shell — the app keeps its own boards on the device already, and a
// stale cached bundle would be a bug that is hard to see and harder to clear.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, data, tag } = payload;
  if (!title) return;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body ?? '',
      // Same tag replaces rather than stacks, so a burst of edits is one line.
      tag: tag ?? 'lawhati',
      renotify: true,
      dir: 'rtl',
      lang: 'ar',
      icon: '%BASE_URL%/icons/icon-192.png',
      badge: '%BASE_URL%/icons/icon-192.png',
      data: data ?? {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification.data?.url ?? '%BASE_URL%/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Bring an open tab forward rather than opening a second one.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(target);

          return client.focus();
        }
      }

      return self.clients.openWindow(target);
    }),
  );
});
