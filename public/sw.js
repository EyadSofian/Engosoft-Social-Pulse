/*
 * Mobde3 service worker: push notifications only. Pages and API calls always come from the network, so a new deploy
 * is live on the next open and nothing stale is ever served from a cache.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'مبدع', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'مبدع';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/app/icon-192.png',
      badge: '/app/badge-96.png',
      image: data.image || undefined,
      tag: data.tag || undefined,
      lang: 'ar',
      dir: 'rtl',
      data: { url: data.url || '/insights' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/insights', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      // The app routes on its own; a message keeps its state instead of reloading the whole page.
      open.postMessage({ type: 'open', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// The browser renewed the subscription (rare): hand the new one to the server so pushes keep arriving.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const response = await fetch('/api/push/key', { credentials: 'include' });
    if (!response.ok) return;
    const { publicKey } = await response.json();
    const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (publicKey.length % 4)) % 4));
    const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await fetch('/api/push/subscribe', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON(), replaces: event.oldSubscription?.endpoint || null }) });
  })());
});
