// Cache static assets only. API health/provider status must always be fresh;
// transcript requests and user-specific pages are never cached here.
const CACHE = "hader-static-v1"
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("qla-") || (key.startsWith("hader-static-") && key !== CACHE)).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()))
})
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url)
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return
  if (!url.pathname.startsWith("/_next/static/")) return
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request)
    if (cached) return cached
    const response = await fetch(event.request)
    if (response.ok) await cache.put(event.request, response.clone())
    return response
  }))
})
