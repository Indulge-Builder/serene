# Notifications CLAUDE.md

## Component inventory

| File | Role |
| ---- | ---- |
| `NotificationBell.tsx` | Bell icon + unread dot. Owns open/close state. Wraps panel. |
| `NotificationPanel.tsx` | Dropdown panel. Header + scrollable list. Empty state. |
| `NotificationItem.tsx` | Single row. Unread dot. Icon. Title/body/timestamp. |

## Hook

`src/hooks/useNotifications.ts` is **the only place** that owns notification state.

```typescript
const { notifications, unreadCount, markRead, markAllRead, isLoading } =
  useNotifications({ userId, initialData });
```

- Initial data seeded from server-fetched prop (passed through layout → Sidebar → NotificationBell).
- Realtime subscription via Supabase `postgres_changes` — filtered strictly at channel level by `recipient_id=eq.${userId}`. Not filtered in JS after the event — filtering in JS leaks data.
- Optimistic updates for `markRead` and `markAllRead` — rollback on error.
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

## Notification types and their icons

| type | icon |
| ---- | ---- |
| `lead_assigned` | `UserPlus` |
| `lead_won` | `Trophy` |
| `task_due` | `Clock` |
| `mention` | `AtSign` |
| `system` | `Info` |

## Wire-up: where notifications are created

`src/lib/actions/leads.ts`:
- `updateLeadStatus` → status transitions to `won` → notifies all active managers/admins/founders in the lead's domain.
- `assignLead` → notifies the receiving agent (fire-and-forget, non-fatal).
- `createManualLead` → notifies the assigned agent when `assignedTo !== caller.id` (fire-and-forget, non-fatal).

To add a new trigger: call `createNotification()` from `src/lib/services/notifications-service.ts` inside a server action. Never call it from a component or route handler.
