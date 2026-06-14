# Services CLAUDE.md

## Template sends in whatsapp-api.ts — `sendGupshupTemplate()` is the only pipeline

All seven template senders (`sendLeadAssignmentNotification`, `sendFounderLeadNotification`,
`sendSlaAgentNotification`, `sendSlaManagerNotification`, `sendLeadInitiationMessage`,
`sendTaskDueReminderNotification`, `sendTaskOverdueManagerNotification`) are thin
wrappers over one internal core, **`sendGupshupTemplate(opts)`** (dry-audit H-8). The core owns,
in exactly one place:

- `'+'`-stripping of source + destination, `URLSearchParams` assembly, the
  `https://api.gupshup.io/wa/api/v1/template/msg` fetch
- the `gupshupStatus / gupshupBody / delivered` capture (zero-value defaults; on throw,
  `gupshupBody` keeps any partial body, else `String(err)`)
- `isGupshupDelivered()` interpretation (Gupshup returns HTTP 200 for app-level errors)
- the success/failure console line
- the **one-log-row-per-attempt finally contract**: `await logNotification(...)` in `finally`,
  with `recipientPhone` derived from the stripped destination

```ts
await sendGupshupTemplate({
  templateId:     GUPSHUP_…_TEMPLATE_ID,
  destination:    profile.phone,                 // '+' stripped inside
  templateParams: [a, b, c],
  label:          'Lead assignment notification', // console + thrown-error prefix
  logRecipient:   `agent ${agentId}`,             // console suffix
  log: { type: 'agent_assignment', leadId, recipientId, agentName, leadName, leadPhone, domain },
  throwOnError?:  true,                           // only sendLeadInitiationMessage
});
```

**Never** call `fetch` on `/template/msg` outside `sendGupshupTemplate`. A new template
(call-intelligence is on the roadmap) = a new ~25-line wrapper that resolves recipients,
assembles `templateParams`, and supplies `log` metadata — nothing else.

**Throw/swallow contract:** with `throwOnError` unset the core never throws — wrappers stay
fire-and-forget safe (their outer try/catch covers only setup: admin client, profiles query;
at that point there is no `destination` to log against, so no `logNotification` there).
`sendLeadInitiationMessage` passes `throwOnError: true` — the core re-throws **after** the
finally log, so the action layer still receives the error and every initiation attempt still
gets a log row (`type: 'lead_initiation'`, CHECK constraint added in migration 0067).

**Why `await logNotification` (Vercel):** the log insert must complete before the send function
resolves. These send functions are awaited up the chain (via `notifyLeadAssigned` → `after()`),
and Vercel keeps the lambda alive only until the awaited chain settles. A `void logNotification()`
in `finally` would let the send function resolve before the row is written, so the lambda could
freeze and drop the log insert — producing exactly the silent gap (missing rows, not error rows)
the 2026-06-08 outage exposed. `logNotification` swallows its own errors internally, so awaiting
it never throws.

**Why finally, not a split try/catch:** any failure mode that bypasses both a success path and a
catch-path log call (e.g. `res.text()` itself throwing) would exit with zero log rows written —
completely silent. The `finally` block guarantees exactly one log row per send attempt,
regardless of how control exits the try.

**Recipient fan-out stays in the wrappers:** founder sends run in parallel (`Promise.all` —
sequential sends risked timeout mid-loop); SLA manager sends stay sequential (small lists,
Trigger.dev context, not a response-bound lambda). Null-phone guards + warn lines also stay
in the wrappers — they are recipient-resolution concerns, not pipeline concerns.

**`agentName = 'Unassigned'` fallback convention:**
When no agent is available from the round-robin pool, `result.agent_name` is `null`.
Both `sendFounderLeadNotification` call sites (webhook route and whatsapp-ingestion) pass
`result.agent_name ?? 'Unassigned'`. `sendFounderLeadNotification` accepts this — the template
`{{2}}` param is just a string; `'Unassigned'` is a valid value. Never pass `null` or `undefined`
as the `agentName` argument to `sendFounderLeadNotification`.

## Web Push — `createNotification` is the fan-out seam; `push-service.ts` is the sender

Web Push (VAPID, the `web-push` library — no SaaS) is the **second** notification delivery
channel, behind the same single chokepoint as the in-app inbox: `createNotification`
(`notifications-service.ts`). After the in-app row insert succeeds, `createNotification` calls
`dispatchPush(recipient_id, { title, body, url })` from `push-service.ts`. **The fan-out lives
INSIDE `createNotification`** — every existing call site (`lead-assignment-notify`,
`lead-mutations`, `sla`, `tasks`, `task-reminders`) gets push for free with **zero call-site
edits.** Never add a `dispatchPush` call to an event site; never gate push per call site.

**Non-fatal contract (mirrors the in-app `.catch(() => {})` posture):** the in-app row is the
source of truth and must succeed even if every push send fails. `dispatchPush` **never throws** —
it logs and returns. `createNotification` `await`s it so awaited callers (Trigger.dev) keep the
lambda alive until the send settles; the fire-and-forget callers' own outer `.catch()` still
covers the whole call.

**Two-runtime invariant:** `createNotification` runs in two contexts — server actions and
Trigger.dev jobs. `web-push` is **Node-only** (it throws under the Edge runtime). Both contexts
are Node, and there is **no edge route in the app** — never introduce one that calls
`createNotification`/`dispatchPush`, and never set `export const runtime = 'edge'` on a route in
that chain.

**Dead-endpoint prune is MANDATORY (not nice-to-have):** push endpoints expire constantly
(reinstall, token rotation, permission revoke). The push service answers **404 / 410** for a dead
endpoint; `dispatchPush` DELETEs those `push_subscriptions` rows in one batched delete. Skipping
the prune lets the table fill with corpses and slows every subsequent fan-out. Any other status
(429/5xx) is transient — the row is kept for the next send to retry.

**Client side:** the browser subscribes/unsubscribes via `hooks/usePushSubscription.ts` →
`actions/push.ts` (session client, owner-only RLS). The subscribe UI + the iOS install nudge live
in `components/profile/PushNotificationSettings.tsx`. `dispatchPush` is the only push path that
needs the admin client (cross-user read + prune). VAPID keys: `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (server-only) + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the browser
needs the public key to subscribe).

**iOS silent-failure trap:** iOS delivers Web Push **only inside the installed PWA** (Add to Home
Screen → standalone). In a Safari tab it fails with no error. `usePushSubscription` reports
`support = 'ios-needs-install'` for iOS-not-standalone, so the UI shows the install nudge instead
of a Subscribe button — a non-standalone iOS user can never reach `pushManager.subscribe()` and
falsely believe they're subscribed.
