// Other World Projex service worker — DELIBERATELY conservative.
//
// This app is live-money: balances, bounty meters and game rounds must never
// be served stale, and this codebase has already been bitten once by stale
// bundles. So the rules are strict:
//   · Pages (navigations): NETWORK ONLY. Never cached — a deploy is visible on
//     the next load, always. If the network is down, serve the offline page.
//   · /api/*: never touched — straight to the network.
//   · Immutable static assets (/_next/static/* is content-hashed; /art/* and
//     fonts/images never change in place): cache-first. Safe by construction.
// Bump VERSION to drop every old cache on the next activate.
const VERSION = "owp-sw-v1";
const OFFLINE_CACHE = `${VERSION}-offline`;
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

const STATIC_RE = /\.(?:png|jpg|jpeg|webp|gif|svg|ico|woff2?)$/;

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/art/") ||
    STATIC_RE.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network only, offline fallback. NEVER cache a document.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then(
          (hit) =>
            hit ??
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
        )
      )
    );
    return;
  }

  // Immutable assets: cache-first.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
  // Everything else (incl. /api/*): untouched — default network behavior.
});
