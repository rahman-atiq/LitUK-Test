/* ============================================================
   Service worker for the Life in the UK study hub.
   Core shell is precached on install; everything else is cached
   as you visit it, or all at once via the hub's "Save for offline".
   Bump VERSION whenever the content changes.
   ============================================================ */
const VERSION = "2026-08-29a";
const CORE_CACHE = "lituk-core-" + VERSION;
const RUNTIME_CACHE = "lituk-runtime-" + VERSION;

const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/flag-gb.svg",
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
  "./testprep-data.js",
  "./lituktestweb-data.js",
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
  "./life-in-uk-day-before.html",
  "./life-in-uk-day-before-ch4.html",
  "./life-in-uk-day-before-ch5.html",
  "./life-in-uk-cast.html",
  "./cast-data.js",
  "./life-in-uk-awards.html",
  "./life-in-uk-plan.html",
]);

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CORE_CACHE)
      // One bad URL must not fail the whole install. "reload" keeps the browser's
      // own HTTP cache out of the way: without it a bumped VERSION opens a brand
      // new cache and then refills it with the very bytes it meant to replace,
      // so the shell looks updated and reads exactly the same.
      .then((c) => Promise.allSettled(
        CORE.map((u) => c.add(new Request(u, { cache: "reload" })))
      ))
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

/* Two strategies, because a page and a 400 KB data file do not want the same one.

   Stale-while-revalidate is right for assets and wrong for documents, and that
   is what stranded the Practice Tests page on an old build after VERSION went
   to ...c. A bump only actively refreshes CORE, which is index.html, app.js and
   the icons. Every other page falls through to this handler, and here SWR did
   two things that compound: it answers from cache and refreshes behind you, so
   a changed page always shows up one visit late — and its refresh went out as a
   bare fetch(), which the browser is free to answer out of its OWN HTTP cache.
   Pages serves HTML with max-age=600, so that fetch could hand back the very
   bytes the bump meant to replace, and the worker then stored them as current.
   The shell updated, the page did not, and nothing about it self-corrected.

   So: documents are network-first now. A page you navigate to has to be the
   page that is deployed. Assets stay stale-while-revalidate — instant, which is
   the whole point — but revalidate conditionally, so a stale HTTP-cache entry
   can never be promoted into the worker's cache again. */

/* Long enough that a slow phone still gets the live page, short enough that a
   dead connection does not hold a blank screen. Past it we fall back to cache,
   which is one build behind at worst — better than nothing on screen. */
const DOC_TIMEOUT = 4000;

function isDoc(req) {
  return req.mode === "navigate" ||
    req.destination === "document" ||
    (req.headers.get("accept") || "").includes("text/html");
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
           (err) => { clearTimeout(t); reject(err); });
  });
}

function store(req, res) {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

/* Network-first, cache as the offline floor. "no-cache" is the load-bearing
   part: it revalidates against the server (ETag, so a 304 when nothing moved)
   instead of letting the browser answer from its own cache. */
function docFirst(req) {
  const net = fetch(req, { cache: "no-cache" }).then((res) => store(req, res));
  return withTimeout(net, DOC_TIMEOUT).catch(() =>
    caches.match(req, { ignoreSearch: true })
      .then((hit) => hit || net.catch(() => caches.match("./index.html")))
  );
}

/* Instant from cache, revalidated behind you — but conditionally, and the
   request is in the background, so the extra round trip costs nothing you see. */
function swr(req) {
  return caches.match(req, { ignoreSearch: true }).then((hit) => {
    const net = fetch(req, { cache: "no-cache" })
      .then((res) => store(req, res))
      .catch(() => hit || caches.match("./index.html"));
    return hit || net;
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(isDoc(req) ? docFirst(req) : swr(req));
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
