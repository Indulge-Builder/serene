# Web Push notifications

> **Purpose:** Device-subscribed Web Push (VAPID) as the **second** notification channel, auto-fanned
> out by `createNotification` right after the in-app inbox write, with dead-endpoint pruning to keep the
> subscription table clean. Best-effort — the in-app row is the source of truth.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md). Migration: `0120`.

---

## Flow

1. **Subscribe (device)** — `usePushSubscription.subscribe()` (gesture-gated): `Notification.requestPermission()`
   → `pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })` → `sub.toJSON()` →
   `savePushSubscriptionAction` upserts `push_subscriptions` (session client, owner-only RLS), keyed on
   the immutable `endpoint`.
2. **Send (server)** — any action/job calls `createNotification({ recipient_id, type, title, body,
   action_url })` (`notifications-service.ts`) → inserts the in-app row → **calls `dispatchPush(...)`
   immediately inside `createNotification`** (the fan-out seam). Never throws.
3. **Dispatch** — `dispatchPush` (`push-service.ts`, admin client) reads all of the recipient's
   subscription rows, sends in parallel via `web-push`, collects 404/410 responses (dead endpoints), and
   **deletes those rows in one batched delete** (mandatory prune).
4. **Receive / click (browser)** — `public/sw.js` `push` handler → `showNotification`; `notificationclick`
   reads `data.url` (validated relative path, must start with `/`, never `//`), focuses an open Serene
   window or opens a new one; falls back to `/dashboard`.
5. **Unsubscribe** — `usePushSubscription.unsubscribe()` → browser `unsubscribe()` +
   `removePushSubscriptionAction(endpoint)` deletes the row (idempotent).

---

## Invariants / gotchas

- **Non-fatal contract.** `dispatchPush` never throws. If every push fails, the notification still exists
  in the inbox. Push is best-effort; the in-app row is canonical.
- **VAPID keys are server-side** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); the public key
  is also exposed as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for the browser. Missing keys →
  `ensureVapidConfigured()` logs once and disables push for that deploy (graceful, never a throw).
- **Dead-endpoint prune is mandatory.** 404/410 = permanent death → delete the row. 429/5xx = transient →
  keep for retry. Skipping the prune fills the table with corpses every fan-out re-sends to.
- **Upsert on `endpoint` dedups** — re-subscribing the same device is idempotent and re-binds it to the
  current owner. Two devices = two rows.
- **iOS only works inside an installed PWA.** In a Safari tab `pushManager.subscribe()` fails silently —
  the hook reports `ios-needs-install` and the UI shows an install nudge instead of a Subscribe button.
- **Gesture-gated** — `subscribe()` must be called from a click handler; the hook never auto-prompts.
- **Relative-path-only `action_url`** — validated client-side (schema, ≤2000 chars) and in `sw.js`.

---

## File map

| File | Role |
|---|---|
| `src/lib/services/push-service.ts` | `dispatchPush` (VAPID send + dead-endpoint prune), admin client |
| `src/lib/actions/push.ts` | `savePushSubscriptionAction`, `removePushSubscriptionAction` |
| `src/lib/validations/push-schema.ts` | Save/Remove subscription Zod schemas |
| `src/hooks/usePushSubscription.ts` | subscribe/unsubscribe lifecycle, iOS detection, gesture gate |
| `src/components/profile/PushNotificationSettings.tsx` | Toggle UI, support states, install nudge |
| `src/lib/services/notifications-service.ts` | `createNotification` — the fan-out seam to `dispatchPush` |
| `public/sw.js` | Service worker: `push` + `notificationclick` handlers, offline shell |
| `public/offline.html` | Offline fallback page served by the service worker |
