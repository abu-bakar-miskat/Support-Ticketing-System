const CACHE = "pen-shell-v4";
const OFFLINE_URL = "/offline";
const NOTIFICATION_ICON = "/android-chrome-192x192.png";

const PRECACHE = [
  OFFLINE_URL,
  NOTIFICATION_ICON,
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|wav)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  event.waitUntil(
    (async () => {
      // If any app window is open (focused or backgrounded), the page realtime
      // handler shows a toast or OS Notification. Only show from the SW when
      // there is no open window (browser fully closed / no controlled clients).
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (windowClients.length > 0) return;

      let data;
      try {
        data = event.data.json();
      } catch {
        data = { title: "New notification", body: event.data.text() };
      }

      const title = data.title ?? "PEN Notification";
      const options = {
        body: data.body ?? undefined,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_ICON,
        tag: data.id ? `pen-${data.id}` : "pen-notification",
        renotify: true,
        data: { url: data.url ?? "/inbox" },
      };

      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/inbox";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
