# Notifications CLAUDE.md

## Component inventory

| File | Role |
| ---- | ---- |
| `NotificationBell.tsx` | Bell icon + unread dot. Owns open/close state. Wraps panel. |
| `NotificationPanel.tsx` | Dropdown panel. Header + scrollable list. Empty state. |
| `NotificationItem.tsx` | Single row. Icon. Title/body/timestamp. One uniform style (no unread dot / read pill — the list is unread-only). |

## Unread-only display contract (2026-06-17)

**The bell shows UNREAD notifications only.** Opening a notification marks it read (optimistic),
which drops it from the displayed list — it "goes away" once actioned. There is **no lingering
read-history row** and **no read/unread visual split** in the panel; every shown row is unread and
renders identically. `markAllRead` empties the list. Never reintroduce a dimmed-read row, an unread
dot, or a per-item "pill" treatment — those existed when the panel showed read + unread together
and were removed when the list became unread-only.

The hook keeps the **full** set (read + unread) internally as `allNotifications` purely so a failed
`markRead`/`markAllRead` can roll an item back into view; it exposes `notifications` as the unread
slice (`read_at === null`) and `unreadCount` as that slice's length. The `read_at` write still
persists server-side (`markNotificationRead`) — read state is real, the panel just doesn't surface
read rows.

## Hook

`src/hooks/useNotifications.ts` is **the only place** that owns notification state.

```typescript
const { notifications, unreadCount, markRead, markAllRead, isLoading } =
  useNotifications({ userId, initialData });
// `notifications` is the UNREAD slice; `unreadCount === notifications.length`.
```

- Initial data seeded from a server-fetched prop. **Streaming contract (perf A-2, 2026-06-11):** the layout starts `getNotifications(profile.id)` WITHOUT awaiting and passes the promise to `Sidebar` as `notificationsPromise`; `Sidebar` unwraps it with React `use()` inside a `<Suspense>` boundary (`SeededNotificationBell`, static same-size `BellFallback`). Never re-add a blocking `await getNotifications` to the layout — it stalls every navigation's TTFB for a bell seed. `getNotifications` must keep returning `[]` on error (never reject) — a rejected promise would throw from `use()`. (The seed may include read rows; the hook filters them out — so no seed wiring needs to switch to `getUnreadNotifications`.)
- Realtime subscription via Supabase `postgres_changes` — filtered strictly at channel level by `recipient_id=eq.${userId}`. Not filtered in JS after the event — filtering in JS leaks data.
- Optimistic updates for `markRead` and `markAllRead` operate on the full `allNotifications` array (mutate by id) — rollback on error restores the item, which re-enters the unread slice.
- Subscribe on mount, unsubscribe on unmount.

## State ownership rule

`useNotifications` and `toast` (from `src/lib/toast.ts`) are the **only two** places in the entire codebase allowed to manage notification state. Nothing else owns this state.

## Realtime subscription pattern

```typescript
supabase
  .channel(`notifications:${userId}`)
  .on("postgres_changes", {
    event:  "INSERT",
    schema: "public",
    table:  "notifications",
    filter: `recipient_id=eq.${userId}`,   // ← CRITICAL: always at channel level
  }, handler)
  .subscribe();
```

Never move the filter into the JS handler. It must be on the channel to prevent receiving other users' notifications.

## Security invariants

1. `action_url` is always a relative path. `NotificationItem` validates with `url.startsWith("/") && !url.startsWith("//")` before calling `router.push`. Never navigate to an absolute URL from DB content.
2. `createNotification()` in the service uses the admin (service-role) client. No INSERT RLS policy exists — only service-role can insert.
3. SELECT/UPDATE RLS enforces `recipient_id = auth.uid()` at DB level. The service also adds `.eq("recipient_id", userId)` in code (Rule A-09: two-layer security).

## Animation contracts (post-redesign 2026-05-31)

### NotificationBell

- `motion.button` with `willChange: "transform"` on the button only.
- Hover: `scale 1.08`, 200ms `EASE_OUT_EXPO`. No `x` nudge.
- Tap: `scale 0.88` spring (`EASE_SPRING`).
- Icon colour: `--theme-sidebar-text` at rest → `--theme-sidebar-active` when open or `unreadCount > 0`. Transition via `--transition-hover`.
- Unread dot: 6px, `--theme-accent`. Always in DOM. Uses `key={unreadCount > 0 ? 'on' : 'off'}` on `motion.span` to retrigger spring entrance (`scale 0.5→1` + `opacity 0→1` — never from `scale(0)`, design-audit 2026-06-11) on each `unreadCount` 0→N edge. No continuous pulse.

### NotificationPanel

- Entrance: `{ opacity: 0, y: 6 } → { opacity: 1, y: 0 }`, `ENTER_DURATION` (400ms), `EASE_OUT_EXPO`. **Not `DROPDOWN_VARIANTS`** (those use 200ms).
- Exit: `{ opacity: 0, y: -4 }`, `EXIT_DURATION` (250ms), `EASE_IN_EXPO`.
- Surface: `--theme-paper` + `1px --theme-paper-border` + `--radius-lg` + `--shadow-4`. **No `backdrop-filter`.**
- **Portal escape + responsive geometry (2026-06-14).** The bell lives inside the sidebar `<aside>`, which carries a `transform` for the off-canvas drawer below md — a transformed ancestor is a containing block for `position: fixed`/`absolute` descendants (root CLAUDE.md "Framer transform + position: fixed — portal escape"). So the panel **portals to `document.body`** via `createPortal` (mount-gated for SSR). Geometry is class-driven (`.notification-panel` in `globals.css`): **below md** it is a docked **bottom sheet** (fixed, full-bleed left/right gutters, `bottom` + safe-area-inset pad, `max-height: 80dvh`, `--z-modal`) with the `.notification-mobile-backdrop` visible (`--z-overlay`, dismiss-on-tap — this replaced the old `display:none` stub, the real "bell not working on phone" fix); **at md+** it is the anchored dropdown (fixed, `--z-dropdown`, 380px) whose `top`/`right` are measured from the bell rect by `NotificationPanel` and applied inline only when `!useMediaQuery(MQ.mobile)` (so the sheet CSS wins below md without an inline fight). The list flexes to fill the sheet; `.notification-panel-list` caps it at 480px on the md+ dropdown.
- Item stagger: `delay: Math.min(i * 50, 200)ms` at initial mount only. Tracked via `isInitialMount` ref (flipped to false after first open). Realtime-added items always use `custom={0}` — stagger never re-triggers on new arrivals.
- Item list wrapped in `motion.div layout` + `AnimatePresence` so existing items shift via layout animation (transform only) when a new item prepends.

### NotificationItem

- **One uniform row (unread-only list, 2026-06-17):** `background: transparent` at rest, `--theme-paper-subtle` on hover (inline event handlers). **No unread dot, no per-item `--shadow-1` / `--radius-md` "pill", no `isUnread` branch** — every shown item is unread (see "Unread-only display contract" above). The old read/unread split was removed when the panel stopped showing read rows.
- Icon container: 28px, `--theme-accent-surface` bg, `--radius-sm`. Icon: `--theme-accent` (default), warning/danger overrides for SLA types.
- Title: `--text-sm`, `--weight-medium`, `--theme-text-primary`.
- Body: `--text-xs`, `--leading-relaxed`, two-line clamp.
- Timestamp: `--text-2xs`, `--font-mono`, `--theme-text-tertiary`.
- Tap: `whileTap scale 0.98` spring. Optimistic mark-read fires before `router.push` — and (unread-only list) immediately drops the row from view.
- `willChange` is NOT set statically. Only Framer applies it during active transition.

## Notification types and their icons

| type | icon |
| ---- | ---- |
| `lead_assigned` | `UserPlus` |
| `lead_won` | `Trophy` |
| `task_due` | `Clock` |
| `task_assigned` | `CheckSquare` |
| `mention` | `AtSign` |
| `system` | `Info` |
| `sla_breach_agent` | `AlertTriangle` |
| `sla_breach_manager` | `AlertTriangle` |
| `sla_breach_founder` | `AlertTriangle` (SLA-01C — new lead untouched 45 min) |
| `task_overdue_manager` | `AlertTriangle` (gia task due +30 min, no clearing event) |
| `suggestion_resolved` | `MessageSquarePlus` (suggestion / bug report marked resolved → sender notified) |

## Notification sound

`src/hooks/useNotificationSound.ts` — synthesised C6/E6 major-third chime via Web Audio API.

- `play()` fires in `useNotifications` INSERT handler only. Never on initial seed, markRead, or markAllRead.
- `useNotifications` calls `useNotificationSound()` at its top and calls `sound.play()` after prepending the new notification to state.
- **localStorage key:** `serene:notifications:sound:v1`. Default `true` when absent. Persists across page refresh.
- **Debounce:** 1500ms minimum between plays. Three rapid Realtime inserts → one chime.
- **Autoplay guard:** checks `context.state`. If `'suspended'`, calls `context.resume()`. If still not `'running'`, returns silently. No `console.error`, no throw — silence is correct fallback for first-load Realtime events.
- **Settings toggle:** `src/components/profile/NotificationPreferences.tsx` — first row, live (not stubbed). `Toggle` controlled by `sound.enabled` / `sound.setEnabled`.
- **No audio files** — sound is entirely synthesised (two oscillators, GainNode exponential decay).

**Rule:** No file outside `useNotifications.ts` may call `sound.play()`. The hook is the single owner.

## Wire-up: where notifications are created

`src/lib/actions/leads.ts`:

- `updateLeadStatus` → status transitions to `won` → notifies all active managers/admins/founders in the lead's domain.
- `assignLead` → notifies the receiving agent (fire-and-forget, non-fatal).
- `createManualLead` → notifies the assigned agent when `assignedTo !== caller.id` (fire-and-forget, non-fatal).

To add a new trigger: call `createNotification()` from `src/lib/services/notifications-service.ts` inside a server action. Never call it from a component or route handler.

## Web Push — the second channel (migration 0120)

Every notification reaches installed PWAs (iOS 16.4+ standalone, Android, desktop) as well as the
in-app bell, because `createNotification` calls `dispatchPush` after the row insert — **inside the
function, so all triggers above get push for free with zero call-site edits**. See
`src/lib/services/CLAUDE.md` "Web Push — `createNotification` is the fan-out seam" for the service
contract (non-fatal, Node-only, 404/410 prune).

**SW handlers:** `public/sw.js` has additive `push` (parse `{title, body?, url?}` → `showNotification`)
and `notificationclick` (focus an open Serene window + navigate, else open the url; relative paths
only, same contract as `NotificationItem.action_url`) listeners. The offline-shell `install`/`activate`/`fetch`
logic is byte-for-byte unchanged — push is purely additive; `CACHE_VERSION` was NOT bumped.

**Subscribe UI:** `src/components/profile/PushNotificationSettings.tsx` (in the profile
"Notifications" SectionCard) composes `hooks/usePushSubscription.ts` — a gesture-gated Enable/Disable
button. On iOS-not-standalone it shows the **"Add to Home Screen to get alerts" install nudge**
instead (iOS push only works in the installed PWA — never fake a "subscribed" state there).
