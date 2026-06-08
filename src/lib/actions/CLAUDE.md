# Actions CLAUDE.md

## Founder WhatsApp alert — call-site pattern

`sendFounderLeadNotification(domain, agentName, leadName, leadPhone, leadId?)` must be called
from every code path that creates or reassigns a lead — **regardless of whether an agent was assigned**.

**Confirmed call sites (all four required):**

| File | Context | `leadId` source |
|---|---|---|
| `src/app/api/webhooks/leads/route.ts` | Webhook ingestion — always fires after successful ingest | `result.leadId` |
| `src/lib/actions/leads.ts` `assignLead` | Manual reassignment from dossier | `leadId` (parsed from schema) |
| `src/lib/actions/leads.ts` `createManualLead` | Add Lead modal | `inserted.id` aliased as `leadId` |
| `src/lib/services/whatsapp-ingestion.ts` | WhatsApp inbound — new number creates a lead | `leadId` from `createLeadFromWhatsApp` |

**`agentName` when no agent is available:** pass `result.agent_name ?? 'Unassigned'`.
Never gate the founder notification on `assigned_to` being non-null — the founder must always
know a new lead entered the system, even if unassigned.

**Vercel serverless lifecycle — the notify MUST be awaited inside `after()`:**

On Vercel, the serverless function is frozen/killed the instant the HTTP response (or
server-action return) is flushed. A bare `void fetch().catch()` notification is orphaned
mid-flight — the Gupshup send is severed and `logNotification` never runs (no log row written).
This is silent, intermittent loss (a send survives only when the lambda happens to stay warm).

**Do not call notification sends directly.** Route every lead-assignment side-effect through
`notifyLeadAssigned()` (`src/lib/services/lead-assignment-notify.ts`), which **awaits** its
Gupshup sends internally. Then wrap that call in `after()` from `next/server` so the response
returns immediately while Vercel keeps the lambda alive until the awaited sends settle:

```ts
import { after } from 'next/server';

after(
  notifyLeadAssigned({ leadId, assignedTo, agentName, leadName, leadPhone, domain, ... })
    .catch((err) => console.error('[module] notifyLeadAssigned failed (non-fatal):', err)),
);
return /* response / { data, error } */;
```

`after()` is the only construct that satisfies both constraints: a bare `await` would delay the
response by the send time; a bare `void` would kill the send when the lambda freezes.

**Call sites (all four route through `notifyLeadAssigned`, all wrapped in `after()` except the
WhatsApp ingestion path, which is already inside the whatsapp route's `after()` and uses a plain
`await`):**

| File | Context | Construct |
|---|---|---|
| `src/app/api/webhooks/leads/route.ts` | Webhook ingestion | `after(notifyLeadAssigned(...))` |
| `src/lib/actions/leads.ts` `assignLead` | Manual reassignment | `after(notifyLeadAssigned(...))` |
| `src/lib/actions/leads.ts` `createManualLead` | Add Lead modal | `after(notifyLeadAssigned(...))` |
| `src/lib/services/whatsapp-ingestion.ts` | WhatsApp inbound new number | `await notifyLeadAssigned(...)` (inside route's `after()`) |

**Rules:**

- Never call `sendFounderLeadNotification` / `sendLeadAssignmentNotification` directly from a
  lead-assignment path. Always go through `notifyLeadAssigned`.
- Never use a bare `void fn()` for an outward WhatsApp send on Vercel. It is silently lost when
  the lambda freezes. Await it (inside `after()` for request/action paths).
- Always pass `leadId`. The 5th parameter is optional in the signature only as a safety net for
  unknown future call sites — every known call site has a `leadId` available and must pass it.
- Never gate on `assigned_to`. The founder alert fires even when `assigned_to` is null.
- Never add a domain allow-list inside `sendFounderLeadNotification`. Founders receive alerts for
  all domains. The function queries `profiles WHERE role = 'founder'` — no filtering needed.
- Never call `createAdminClient()` in the action layer for this notification. `whatsapp-api.ts`
  already owns the admin client internally.
