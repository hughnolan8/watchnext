// WatchNext service worker: makes the app installable and keeps it usable offline.
// - Pages: network first, falling back to the last copy, then to /offline.html.
// - Build assets, icons, fonts, posters: cache first (they're immutable or rarely change).
// - API calls and auth: never cached.

const VERSION = "v1";
const STATIC = `wn-static-${VERSION}`;
const PAGES = `wn-pages-${VERSION}`;
const IMAGES = `wn-images-${VERSION}`;
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES, IMAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName, max) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    if (max) trim(cacheName, max);
  }
  return response;
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    // Only keep real pages (not redirects to /login)
    if (response.ok && !response.redirected) {
      const cache = await caches.open(PAGES);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("/offline.html"));
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return;
    if (request.mode === "navigate") {
      event.respondWith(networkFirstPage(request));
      return;
    }
    if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(request, STATIC));
    }
    return;
  }

  // Posters, backdrops and service logos from TMDB
  if (url.hostname === "image.tmdb.org") {
    event.respondWith(cacheFirst(request, IMAGES, 300));
  }
});
