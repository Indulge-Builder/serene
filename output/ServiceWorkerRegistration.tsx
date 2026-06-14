"use client";

import { useEffect } from "react";

/**
 * Registers the offline-shell service worker (public/sw.js). Mounted once in
 * the root layout. Production-only — a SW in dev fights HMR and Turbopack.
 * The SW intercepts GET navigations only (network-first → offline.html);
 * Server Action POSTs and RSC payloads pass through untouched. See public/sw.js.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("[sw] registration failed (non-fatal):", err));
  }, []);

  return null;
}
