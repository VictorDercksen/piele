// The Pavilion's service worker: shows push messages and opens their page when tapped.
// It caches nothing and handles no fetches, so every page and API response still comes from
// the network. Messages are JSON from the API's push job: { title, body, url, tag }.

// Only a path on this site: '//host' and '/\\host' would leave it.
const appPath = (url) => (/^\/(?![/\\])/.test(url) ? url : '/');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  const text = (value, fallback) => (typeof value === 'string' && value ? value : fallback);
  const url = text(message.url, '/');
  event.waitUntil(
    self.registration.showNotification(text(message.title, 'The Pavilion'), {
      body: text(message.body, ''),
      tag: text(message.tag, undefined),
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/badge-96.png',
      data: { url: appPath(url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(appPath(event.notification.data?.url || '/'), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        try {
          await client.navigate(target);
          return;
        } catch {
          // A page this worker does not control cannot be navigated; open a new one.
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
