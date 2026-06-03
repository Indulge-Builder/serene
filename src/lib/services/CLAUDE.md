# Services CLAUDE.md

## Template send functions in whatsapp-api.ts — canonical finally-block pattern

Every Gupshup template send function (`sendLeadAssignmentNotification`,
`sendFounderLeadNotification`, `sendSlaAgentNotification`, `sendSlaManagerNotification`)
uses this structure for the HTTP call and its log:

```ts
let gupshupStatus = 0;
let gupshupBody   = '';
let delivered     = false;

try {
  const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', { ... });
  gupshupStatus = res.status;
  gupshupBody   = await res.text();
  delivered     = isGupshupDelivered(res.ok, gupshupBody);
} catch (fetchErr) {
  gupshupStatus = 0;
  gupshupBody   = String(fetchErr);
  delivered     = false;
} finally {
  if (delivered) { console.log(...) } else { console.error(...) }
  void logNotification({ ..., gupshupStatus, gupshupBody, delivered }).catch(() => {});
}
```

**Why finally, not a split try/catch:**
The previous pattern called `logNotification` separately in the catch block (with `return`/`continue`)
and again after the fetch on the success path. Any new failure mode that bypassed both branches
(e.g. an exception thrown by `res.text()` itself) would exit with zero log rows written —
completely silent. The `finally` block guarantees exactly one log row per send attempt,
regardless of how control exits the try.

**Rules for any new template send function:**
1. Declare `gupshupStatus`, `gupshupBody`, `delivered` before the try block with zero-value defaults.
2. Populate all three inside try; set `gupshupStatus = 0`, `gupshupBody = String(err)`, `delivered = false` inside catch.
3. Call `logNotification` only inside `finally` — never in try or catch separately.
4. Guard `logNotification` with `.catch(() => {})` — a DB insert failure must never propagate.
5. The outer function-level try/catch (which wraps the profile fetch + the inner try/finally) remains.
   It catches setup failures (admin client, profiles query) and logs them. It does not call
   `logNotification` — at that point we have no `destination` to log against.
6. Never `await logNotification` — always `void fn().catch(() => {})` to preserve fire-and-forget.

**`sendLeadInitiationMessage` — re-throw exception to the finally-block pattern:**
It uses the same `gupshupStatus/gupshupBody/delivered` variables and `finally { void logNotification(...) }`
structure, but with two differences:
1. **Re-throws after logging** — the error propagates to the action layer, which surfaces it to the UI.
   Do not remove the `throw err` inside the catch block.
2. **`type: 'lead_initiation'`** — migration 0067 added this value to the CHECK constraint on
   `whatsapp_notification_logs.type`. Every initiation attempt now has a log row.

**`agentName = 'Unassigned'` fallback convention:**
When no agent is available from the round-robin pool, `result.agent_name` is `null`.
Both `sendFounderLeadNotification` call sites (webhook route and whatsapp-ingestion) pass
`result.agent_name ?? 'Unassigned'`. `sendFounderLeadNotification` accepts this — the template
`{{2}}` param is just a string; `'Unassigned'` is a valid value. Never pass `null` or `undefined`
as the `agentName` argument to `sendFounderLeadNotification`.
