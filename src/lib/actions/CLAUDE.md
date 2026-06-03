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

**Call pattern (fire-and-forget, non-fatal):**

```ts
void sendFounderLeadNotification(
  domain,
  agentName ?? 'Unassigned',
  leadName,
  phone,
  leadId,         // ← always pass; omitting makes lead_id null in notification logs
).catch((err) => {
  console.error('[module] founder notification failed (non-fatal):', err);
});
```

**Rules:**

- Always `void fn().catch(...)` — never `await`. The function must never block or throw to its caller.
- Always pass `leadId`. The 5th parameter is optional in the signature only as a safety net for
  unknown future call sites — every known call site has a `leadId` available and must pass it.
- Never gate on `assigned_to`. The founder alert fires even when `assigned_to` is null.
- Never add a domain allow-list inside `sendFounderLeadNotification`. Founders receive alerts for
  all domains. The function queries `profiles WHERE role = 'founder'` — no filtering needed.
- Never call `createAdminClient()` in the action layer for this notification. `whatsapp-api.ts`
  already owns the admin client internally.
