// Network first, cache as the fallback: online you always get the latest
// build, offline the last one you loaded still opens. The API is never cached;
// games keep their own copy on the device (see js/store.js).
const CACHE = "tabletop-shell-v2";
// The shell is cached up front; game files are cached the first time they load.
const SHELL = ["/", "/app.css", "/brand/bridgewater.css", "/brand/bundle.js", "/js/theme-init.js", "/js/app.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request.mode === "navigate" ? "/" : e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request.mode === "navigate" ? "/" : e.request)),
  );
});
