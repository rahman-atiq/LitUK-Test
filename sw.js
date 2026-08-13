/* ============================================================
   Service worker for the Life in the UK study hub.
   Core shell is precached on install; everything else is cached
   as you visit it, or all at once via the hub's "Save for offline".
   Bump VERSION whenever the content changes.
   ============================================================ */
const VERSION = "2026-08-13f";
const CORE_CACHE = "lituk-core-" + VERSION;
const RUNTIME_CACHE = "lituk-runtime-" + VERSION;

const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-maskable-512.png",
];

const EVERYTHING = CORE.concat([
  "./search-index.js",
  "./life-in-uk-quiz.html",
  "./life-in-uk-mock-tests.html",
  "./mock-data.js",
  "./practice-data.js",
  "./facts.js",
  "./life-in-uk-chapter1.html",
  "./life-in-uk-chapter2.html",
  "./life-in-uk-chapter3.html",
  "./life-in-uk-chapter4.html",
  "./life-in-uk-chapter5.html",
  "./life-in-uk-chapter1-story.html",
  "./life-in-uk-chapter2-story.html",
  "./life-in-uk-chapter3-story.html",
  "./life-in-uk-chapter4-story.html",
  "./life-in-uk-chapter5-story.html",
]);

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CORE_CACHE)
      // One bad URL must not fail the whole install.
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CORE_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Stale-while-revalidate: instant from cache, refreshed in the background. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit || caches.match("./index.html"));
      return hit || net;
    })
  );
});

/* The hub can ask for the whole library up front. */
self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type !== "precache-all") return;

  e.waitUntil((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    let done = 0, failed = 0;
    for (const url of EVERYTHING) {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res); else failed++;
      } catch (err) { failed++; }
      done++;
      if (e.source) e.source.postMessage({ type: "precache-progress", done, total: EVERYTHING.length });
    }
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: "precache-done", total: EVERYTHING.length, failed }));
  })());
});
