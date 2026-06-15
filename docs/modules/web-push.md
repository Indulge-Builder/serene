# Web Push

> **Purpose:** deliver notifications to an installed PWA even when Serene is closed — a second channel
> behind the one notification fan-out seam, so every existing event gets push for free.
> **Audience:** engineers. · **Source-of-truth scope:** Web Push architecture + contracts.
> **Status:** shipped 2026-06-14 (migration 0120). VAPID, the `web-push` library — no SaaS.
> **Last verified:** 2026-06-15.

## What it is

The in-app notification spine (the `notifications` table, RLS, Realtime, the sidebar bell) is unchanged
and remains the **source of truth**. Web Push adds a *second* delivery channel so a `lead_assigned` /
`lead_won` / SLA / task notification also reaches an installed PWA (iOS 16.4+ standalone, Android, desktop)
when the app is closed. Push is best-effort: if every send fails, the in-app row still stands.

## The fan-out seam (zero call-site edits)

`createNotification` (`src/lib/services/notifications-service.ts`) is the single chokepoint every event
site already routes through (`lead-assignment-notify`, `lead-mutations`, `sla`, `tasks`, `task-reminders`).
After the in-app row insert it calls **`dispatchPush(recipient_id, { title, body, url })`** — so every
existing trigger gets push with **zero edits to any call site**. New event types inherit push automatically
by routing through `createNotification`.

```text
event site → createNotification → INSERT notifications row (source of truth)
                                → dispatchPush(recipient, payload)   ← non-fatal, best-effort
```

## The pieces

| Layer | File | Role |
| ----- | ---- | ---- |
| Service (server + Node only) | `src/lib/services/push-service.ts` | `dispatchPush` — reads the recipient's devices via the **admin** client (cross-user), sends in parallel via `web-push`, **prunes** dead endpoints. VAPID configured once, lazily. |
| Fan-out call site | `src/lib/services/notifications-service.ts` | `createNotification` calls `dispatchPush` after the row insert. |
| Subscribe hook | `src/hooks/usePushSubscription.ts` | Gesture-gated `Notification.requestPermission()` + `pushManager.subscribe`; iOS standalone detection. |
| Actions | `src/lib/actions/push.ts` | `savePushSubscriptionAction` (upsert) / `removePushSubscriptionAction` — Zod → `requireProfile`, session client, owner-only RLS. |
| Validation | `src/lib/validations/push-schema.ts` | Subscription envelope (`endpoint`, `p256dh`, `auth`). |
| UI | `src/components/profile/PushNotificationSettings.tsx` | `/profile` "Notifications" SectionCard — Enable/Disable, or the iOS "Add to Home Screen to get alerts" nudge. |
| Service worker | `public/sw.js` | `push` (parse `{title, body?, url?}` → `showNotification`) + `notificationclick` (focus/navigate). **Additive — offline-shell bytes unchanged, `CACHE_VERSION` not bumped.** |
| Table | migration `0120_push_subscriptions` | per-device VAPID endpoints. |

## `push_subscriptions` (migration 0120)

`(id, profile_id FK, endpoint UNIQUE, p256dh, auth, user_agent, created_at)` + `idx_push_subscriptions_profile`.

- `endpoint` is the unique key — **one row per device, many per user**. A re-subscribe upserts on `endpoint`.
- **Owner-only RLS:** `profile_id = auth.uid()` for SELECT/INSERT/DELETE; **no UPDATE policy**.
- The cross-user read + the dead-endpoint prune in `dispatchPush` run **service-role** (admin client).

## Invariants (never weaken)

1. **In-app row is source of truth; push is non-fatal.** `dispatchPush` NEVER throws — it logs and
   returns. The in-app `notifications` row exists regardless of any send outcome.
2. **Server + Node only.** `web-push` throws under the Edge runtime. Both `createNotification` callers
   (server actions + Trigger.dev) are Node; there is no edge route in the app.
3. **Dead-endpoint prune is mandatory.** Endpoints expire constantly (reinstall, token rotation,
   permission revoke). A `404`/`410` triggers an immediate batched `DELETE` of that subscription row.
   Skipping this fills the table with corpses and slows every fan-out.
4. **iOS silent-failure trap.** Web Push works **only** inside the installed PWA (standalone). In a
   Safari tab it fails with no error. `usePushSubscription` detects standalone and reports
   `'ios-needs-install'` when not installed — the UI shows the install nudge instead of a Subscribe
   button, and a non-standalone iOS user never reaches `pushManager.subscribe()`. It never fakes a
   "subscribed" state.
5. **Subscribe is gesture-gated.** `subscribe()` must run from a click handler — the hook never
   auto-prompts on mount (browsers block `requestPermission()` outside a user gesture).
6. **VAPID keys are server-only.** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (S-11).
   The browser receives only `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the public key, to subscribe). The subject
   is a contact URI (`mailto:`), generated once via `npx web-push generate-vapid-keys`, never rotated
   post-deploy.
7. **Payload is generic.** `{ title, body?, url? }`; `url` is a relative action path, re-validated in the
   `notificationclick` handler. No role-scoped data rides the payload — the notification's `recipient_id`
   already controls who receives it.

## Env

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (server-only), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
(client). Deps: `web-push@3.6.7` + `@types/web-push@3.6.4`. See `../operations/environments.md`.

## Related

- In-app notification spine + bell: `../pages/profile.md`, `../architecture/overview.md`
- PWA install + home-screen icon: `../operations/pwa-install-guide.md`
- The Trigger.dev jobs that fan out through `createNotification`: `../integrations/trigger-dev.md`
