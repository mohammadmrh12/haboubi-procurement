const CACHE_NAME = "haboubi-procurement-v170";
const ASSETS = ["./","./index.html","./public-search.html","./public-search.css?v=7","./public-search.js?v=5","./public-search-manifest.json","./styles.css?v=94","./drug-aliases.js?v=7","./app.js?v=93","./forms-addon.js?v=98","./catalog-seed.js?v=31","./auth.js?v=25","./manifest.json","./logo.svg?v=3","./apple-touch-icon-v3.png","./vendor/xlsx.full.min.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) { event.respondWith(fetch(event.request, { cache: "no-store" })); return; }
  if (url.pathname.endsWith("/catalog-seed.json")) { event.respondWith(fetch(event.request, { cache: "no-store" })); return; }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  })));
});
