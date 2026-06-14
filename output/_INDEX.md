# Notification spine — file dump

All files flattened into this one folder (no subfolders). Some were renamed to avoid
collisions (two `CLAUDE.md`, `layout.tsx`). Map of `output/` name → real repo path below.

> **Key finding on the push path (your items #8/#9):** there is **NO native mobile app.**
> No Capacitor, Expo, or React Native; no `ios/`/`android/` dirs; no `capacitor.config.*` /
> `app.json` / `eas.json`; no `firebase`/`fcm`/`web-push`/`onesignal` dependency in
> `package.json`. Serene is a **Next.js 16 PWA** — it ships a service worker (`sw.js`) that is
> offline-shell-only and an `offline.html`. There is **zero existing push/permission code**
> (confirmed). So the push path is **Web Push (Service Worker `push` event + VAPID)** layered
> onto the existing SW — not FCM/APNs through a native shell.

---

## 1. THE SPINE — table DDL

| output/ name | real path |
| --- | --- |
| `20260528000016_notifications.sql` | `supabase/migrations/20260528000016_notifications.sql` — original table, indexes, RLS |
| `20260612000113_task_overdue_and_notification_types.sql` | `supabase/migrations/20260612000113_task_overdue_and_notification_types.sql` — extends the `type` CHECK + adds `task_overdue_manager` etc. |
| `database-notification-types.ts` | EXTRACTED slice of `src/lib/types/database.ts` — `notifications` Row/Insert/Update + `NotificationType` union + `Notification` app type (the event model, type side) |

## 2/3. Service + server actions

| output/ name | real path |
| --- | --- |
| `notifications-service.ts` | `src/lib/services/notifications-service.ts` — reads/writes/mark-read; `createNotification()` lives here |
| `notifications.ts` | `src/lib/actions/notifications.ts` — `markNotificationReadAction`, `markAllReadAction` |

## 4. Where events become notifications (the `createNotification` call sites)

| output/ name | real path | events written |
| --- | --- | --- |
| `lead-assignment-notify.ts` | `src/lib/services/lead-assignment-notify.ts` | the `after()` WhatsApp+in-app assignment fan-out |
| `lead-mutations.ts` | `src/lib/services/lead-mutations.ts` | `lead_won` (in `updateLeadStatusCore`) — shared core for actions + Elaya tools |
| `sla.ts` | `src/lib/actions/sla.ts` | `sla_breach_agent` / `sla_breach_manager` / `sla_breach_founder` |
| `tasks.ts` | `src/lib/actions/tasks.ts` | `task_assigned` (createPersonal/createSubtask) |
| `task-reminders.ts` | `src/trigger/task-reminders.ts` | `task_due` + `task_overdue_manager` (Trigger.dev jobs) |

> Note: `lead_assigned` is created in `src/lib/actions/leads.ts` (assignLead / createManualLead)
> and `lead_won` in `lead-mutations.ts`. `leads.ts` is very large and multi-purpose; the
> notification calls there are thin (`createNotification({type:'lead_assigned', ...}).catch(()=>{})`).
> Grab it separately if you want those exact lines — say the word.

## 5/6/7. The broken bell + parent + realtime hook

| output/ name | real path | role |
| --- | --- | --- |
| `NotificationBell.tsx` | `src/components/notifications/NotificationBell.tsx` | #5 the bell |
| `NotificationPanel.tsx` | `src/components/notifications/NotificationPanel.tsx` | dropdown panel |
| `NotificationItem.tsx` | `src/components/notifications/NotificationItem.tsx` | single row |
| `Sidebar.tsx` | `src/components/layout/Sidebar.tsx` | #6 parent that mounts the bell (footer) |
| `useNotifications.ts` | `src/hooks/useNotifications.ts` | #7 the Realtime subscription hook feeding the bell |
| `useNotificationSound.ts` | `src/hooks/useNotificationSound.ts` | companion sound hook |

## 8/9. Mobile / push path

| output/ name | real path | note |
| --- | --- | --- |
| `sw.js` | `public/sw.js` | the existing service worker — **offline shell only, no `push`/`notificationclick` handlers** |
| `ServiceWorkerRegistration.tsx` | `src/components/layout/ServiceWorkerRegistration.tsx` | registers `sw.js`, production-only |
| `app-root-layout.tsx` | `src/app/layout.tsx` | mounts `<ServiceWorkerRegistration />` |

## 10. Authority context (reuse the existing conventions)

| output/ name | real path | what to reuse |
| --- | --- | --- |
| `services-CLAUDE.md` | `src/lib/services/CLAUDE.md` | service registry + the **Realtime teardown pattern (`removeChannel`, `useId()` mount suffix, P-06)** + `after()` outward-send rule |
| `actions-CLAUDE.md` | `src/lib/actions/CLAUDE.md` | action conventions + the `createNotification()` call-site rules (fire-and-forget, non-fatal) |
