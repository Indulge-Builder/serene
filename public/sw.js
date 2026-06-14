/**
 * Serene service worker — offline fallback shell ONLY.
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
const CACHE_VERSION = "serene-shell-v1";
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

/* ================================================================
   WEB PUSH (additive — migration 0120). Independent of the offline
   shell above; touches none of its fetch/cache logic. The payload is
   the JSON written by dispatchPush (src/lib/services/push-service.ts):
   { title, body?, url? }. No role-scoped data is cached here — a push
   only shows a notification and (on tap) navigates; it stores nothing.
   ================================================================ */

const PUSH_ICON = "/icons/icon-192.png";

self.addEventListener("push", (event) => {
  // A push with no/garbled data still shows a safe generic notification rather
  // than dropping silently — the in-app row already exists either way.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Serene";
  const options = {
    body: payload.body || "",
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    // Relative action path consumed by notificationclick below. Falls back to
    // the dashboard. Stored in `data` so it survives to the click handler.
    data: { url: typeof payload.url === "string" ? payload.url : "/dashboard" },
    // Re-using the tag would collapse rapid notifications into one; omit it so
    // each meaningful event surfaces. (The in-app bell is the full history.)
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Relative path only (same contract as NotificationItem.action_url). Anything
  // that is not an in-app relative route falls back to the dashboard — a push
  // payload must never navigate an installed PWA to an absolute/external URL.
  const raw = (event.notification.data && event.notification.data.url) || "/dashboard";
  const path = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")
    ? raw
    : "/dashboard";
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an already-open Serene window and navigate it, rather than
        // spawning a duplicate tab.
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            return client.focus().then((focused) => {
              if ("navigate" in focused) return focused.navigate(target);
              return focused;
            });
          }
        }
        // No open window — open one at the target path.
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      }),
  );
});
