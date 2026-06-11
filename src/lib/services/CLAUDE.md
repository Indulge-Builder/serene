# Services CLAUDE.md

## Template sends in whatsapp-api.ts — `sendGupshupTemplate()` is the only pipeline

All five template senders (`sendLeadAssignmentNotification`, `sendFounderLeadNotification`,
`sendSlaAgentNotification`, `sendSlaManagerNotification`, `sendLeadInitiationMessage`) are thin
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
