# Web Push

> **Purpose:** deliver notifications to an installed PWA even when Serene is closed: a second channel behind the one notification seam, so every in-app notification can also arrive as a push.
> **Audience:** engineers. · **Source-of-truth scope:** Web Push architecture and contracts. The install steps for users: `../operations/pwa-install-guide.md`. Per-user notification categories: `src/lib/constants/notification-categories.ts` and `../pages/profile.md`.
> **Status:** shipped 2026-06-14 (migration 0120). VAPID and the `web-push` library, no SaaS.
> **Last verified:** 2026-09-26 against `src/lib/services/notifications-service.ts`, `src/lib/services/push-service.ts`, `src/hooks/usePushSubscription.ts`, `src/lib/actions/push.ts`, `src/components/profile/PushNotificationSettings.tsx`, `src/components/layout/ServiceWorkerRegistration.tsx`, `public/sw.js`, `src/lib/constants/notification-categories.ts`, and every `createNotification` call site in `src/`.

## What it is

The in-app notification spine (the `notifications` table, RLS, Realtime, the bell) is unchanged
and remains the **source of truth**. Web Push adds a second delivery channel, so a notification
also reaches an installed PWA (iOS 16.4+ standalone, Android, desktop) when the app is closed.
Push is best effort: if every send fails, the in-app row still stands.

## The fan-out seam (zero call-site edits)

`createNotification` (`src/lib/services/notifications-service.ts`) is the single chokepoint.
After the in-app row insert it calls **`dispatchPush(recipient_id, { title, body, url })`**, so
every caller gets push with no change of its own. Callers today:

| Area | Where `createNotification` is called |
| ---- | ------------------------------------ |
| Leads and deals | `lead-assignment-notify.ts` (assignment, repeat enquiry), `lead-mutations.ts` (`lead_won`), `lib/actions/sla.ts` (SLA fires), `lib/actions/deals.ts` |
| Tasks | `task-mutations.ts` (`task_assigned`), `src/trigger/task-reminders.ts` (due, overdue, repeat nudges) |
| Tickets (Sia) | `ticket-intake.ts` (a suggested ticket), `ticket-sentinel.ts` (warnings, breaches, unhappy members), `ticket-mutations.ts` (`ticket_assigned`) |
| The Sia watcher alarm | `src/trigger/sia-silence.ts` (type `system`, no category key, so it cannot be muted) |
| Elaya | `elaya-briefing.ts` (the founders' brief), `elaya-alerts.ts` (live alerts), `elaya-deep-read.ts` (a finished read), `elaya/tools/write-registry.ts` (an improvement request raised, to the tech responders) |
| Suggestions | `lib/actions/suggestions.ts` (a resolved report) |

**Per-user gate (migration 0133, Seam A):** `createNotification` takes an optional
`notificationKey` (a category from `notification-categories.ts`). When a key is supplied and the
recipient has muted the `in_app` channel for that category, BOTH the in-app row and the push are
skipped. Push rides the `in_app` channel; there is no separate push channel
(`NotificationChannel = 'in_app' | 'whatsapp'`). No key, or any gate error, means send (the gate
fails open). Transactional sends have no key and are never gated. Users edit their preferences in
`src/components/profile/NotificationPreferences.tsx` on `/profile`.

```text
event site → createNotification → [key given and recipient muted in_app → skip row AND push]
                                → INSERT notifications row (source of truth)
                                → dispatchPush(recipient, payload)   ← non-fatal, best effort
```

## The pieces

| Layer | File | Role |
| ----- | ---- | ---- |
| Service (server and Node only) | `src/lib/services/push-service.ts` | `dispatchPush`: reads the recipient's devices with the **admin client** (a cross-user read), sends in parallel via `web-push`, **prunes** dead endpoints. VAPID configured once, lazily; missing keys log a warning and turn push off, never throw |
| Fan-out call site | `src/lib/services/notifications-service.ts` | `createNotification` awaits `dispatchPush` after the row insert |
| Subscribe hook | `src/hooks/usePushSubscription.ts` | gesture-gated `Notification.requestPermission()` + `pushManager.subscribe`; iOS standalone detection |
| Actions | `src/lib/actions/push.ts` | `savePushSubscriptionAction` (upsert) / `removePushSubscriptionAction`: Zod, `requireProfile`, session client, owner-only RLS |
| Validation | `src/lib/validations/push-schema.ts` | the subscription envelope (`endpoint`, `p256dh`, `auth`) |
| UI | `src/components/profile/PushNotificationSettings.tsx` | inside the `/profile` **Notifications** card, under the category preferences: Enable / Disable, or the iOS "Add to Home Screen" hint |
| Service worker | `public/sw.js` | `push` (parse `{title, body?, url?}` → `showNotification`) and `notificationclick` (focus or open, navigate). Registered by `ServiceWorkerRegistration.tsx` in production only |
| Table | migration `0120_push_subscriptions` | per-device VAPID endpoints (schema `public`) |

**The notification icon** is `/icons/icon-192.png`, the same file the offline shell precaches.
Since 2026-09-26 it is the Serene mark on a white square (it was cream from 2026-07-10, black
before). Each icon change bumps `CACHE_VERSION` in `sw.js` (now `serene-shell-v4`) so installed
devices pick up the new file; the push handlers themselves did not change.

## `push_subscriptions` (migration 0120)

`(id, profile_id FK, endpoint UNIQUE, p256dh, auth, user_agent, created_at)` +
`idx_push_subscriptions_profile`.

- `endpoint` is the unique key: **one row per device, many per user**. A re-subscribe upserts on
  `endpoint`.
- **Owner-only RLS:** `profile_id = auth.uid()` for SELECT / INSERT / DELETE; **no UPDATE
  policy**.
- The cross-user read and the dead-endpoint prune in `dispatchPush` run service-role (admin
  client).

## Invariants (never weaken)

1. **The in-app row is the source of truth; push is non-fatal.** `dispatchPush` never throws; it
   logs and returns. One deliberate exception: the 0133 gate skips the row and the push together
   when the recipient has muted the category, before any send is attempted.
2. **Server and Node only.** `web-push` throws under the Edge runtime. Every caller (server
   actions, services, Trigger.dev tasks) runs on Node; no route in the app sets
   `runtime = 'edge'`.
3. **The dead-endpoint prune is mandatory.** Endpoints expire constantly (reinstall, token
   rotation, permission revoked). A `404` or `410` triggers an immediate batched DELETE of that
   subscription. Skipping it fills the table with dead rows and slows every fan-out.
4. **The iOS silent-failure trap.** Web Push works only inside the installed PWA (standalone). In
   a Safari tab it fails with no error. `usePushSubscription` detects standalone and reports
   `'ios-needs-install'` when not installed; the UI shows the install hint instead of an Enable
   button, and a non-standalone iOS user never reaches `pushManager.subscribe()`. It never fakes a
   "subscribed" state.
5. **Subscribe is gesture-gated.** `subscribe()` must run from a click handler; the hook never
   prompts on mount (browsers block `requestPermission()` outside a user gesture).
6. **VAPID private material is server-only.** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
   `VAPID_SUBJECT` (S-11). The browser receives only `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Generated once
   with `npx web-push generate-vapid-keys`, never rotated after deploy (rotating orphans every
   existing subscription).
7. **The payload is generic.** `{ title, body?, url? }`; `url` is a relative path, re-checked in
   `notificationclick` (anything not starting with a single `/` falls back to `/dashboard`). No
   role-scoped data rides the payload; the notification's `recipient_id` already decides who gets
   it.

## Env

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (server only) and
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (browser). Dependencies: `web-push` ^3.6.7, `@types/web-push`
^3.6.4.

**Set the three server keys on the Trigger.dev worker as well as on Vercel.** Many notifications
are created inside background jobs (SLA fires, reminders and nudges, the sentinel, intake, the Sia
alarm, the brief and alerts). Without the keys there, those pushes are silently off (one warning
in the job log) while the in-app rows still land. See `../operations/environments.md`.

## Related

- Per-user notification preferences (migration 0133): `src/lib/constants/notification-categories.ts`, `src/lib/services/notification-prefs-service.ts`.
- The in-app spine and the bell: `../pages/profile.md`, `../architecture/overview.md`.
- PWA install and the home-screen icon: `../operations/pwa-install-guide.md`.
- The Trigger.dev jobs that fan out through `createNotification`: `../integrations/trigger-dev.md`.
