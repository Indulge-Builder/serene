/**
 * Eia service worker — offline fallback shell ONLY.
 *
 * Hard rules (root CLAUDE.md / PWA brief):
 * - NEVER cache navigations, RSC payloads, or Server Action responses.
 *   Every page response is role-scoped per user; caching one would replay it
 *   to another user/role on a shared device.
 * - Only GET requests in `navigate` mode are intercepted, network-first.
 *   POSTs (Server Actions) and every other request pass through untouched —
 *   no respondWith, the browser handles them natively.
 * - The cache holds the static offline shell + icons only.
 *
 * Bump CACHE_VERSION whenever offline.html or the icons change.
 */
const CACHE_VERSION = "eia-shell-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      // New SW activates immediately so a deploy never leaves a stale SW locked in.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Navigations only. Everything else (Server Action POSTs, RSC prefetches,
  // _next/static, API calls) is deliberately not intercepted.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    // Network-first, no caching of the response — page HTML is role-scoped.
    fetch(request).catch(() => caches.match(OFFLINE_URL)),
  );
});
