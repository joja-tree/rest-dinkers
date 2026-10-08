const CACHE_NAME = "rest-dinkers-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/logo-header.png", "/logo.png", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
  const response = await fetch("/");
  const html = await response.clone().text();
  const paths = [...html.matchAll(/(?:src|href)="([^"?]+)"/g)]
    .map((match) => match[1])
    .filter((path) => path.startsWith("/_next/static/"));
  await Promise.all([...new Set(paths)].map(async (path) => {
    try { await cache.add(path); } catch { /* A later online visit can cache it. */ }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(async (response) => {
      const cache = await caches.open(CACHE_NAME);
      cache.put("/", response.clone());
      return response;
    }).catch(() => caches.match("/").then((cached) => cached || Response.error())));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
      return response;
    })));
  }
});
