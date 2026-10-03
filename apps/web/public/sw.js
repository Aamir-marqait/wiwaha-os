// Wiwaha OS service worker: keeps the staff task list usable offline on event
// days. Pages are network-first with a cached fallback; static assets are
// cache-first. Task completions made offline are queued by the page itself
// (IndexedDB) and replayed when the phone is back online.
const CACHE = "wiwaha-tasks-v1";
const SHELL = ["/team/tasks"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (req.mode === "navigate" && url.pathname.startsWith("/team/tasks")) {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/team/tasks", copy)); return res; }).catch(() => caches.match("/team/tasks")));
  }
});
