# Deals

> **Purpose:** Deal recording from both lead closure (won status) and walk-in direct sales, with
> founder-set monthly per-domain targets and role-scoped visibility.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md).

---

## Entry points & data flow

1. **Lead → deal** — `recordDeal(input)` (`actions/deals.ts`), from the dossier WonDealModal: Zod →
   `requireProfile()` → fetch lead + access check → **Step 1** INSERT `deals` (lead_id FK, contact copied
   from lead, `won_at = now`) → **Step 2** `updateLeadStatus({ status: 'won' })`. Order matters: if Step 1
   fails, the lead is NOT marked won; if Step 2 fails, the orphaned deal is harmless.
2. **Walk-in** — `createWalkInDeal(input)`: Zod → `requireProfile()` → role-based domain/assignee
   enforcement (agent: own domain/self; manager: own domain; admin/founder: any) → validate assignee via
   `getAssignableUsers({ domain, agentsOnly: true })` → `normalizeToE164(contact_phone)` (human error on
   failure) → INSERT `deals` (`lead_id = null`).
3. **Read** — `getDealsByRole(role, userId, domain, filters)`: session client, role-scoped WHERE first,
   joins lead(slug) + assignee; `getDealsSummary(...)` via the `get_deals_summary` RPC.
4. **Targets** — `getDomainTargets()` (session read, RLS all-authenticated); `upsertDomainTarget(...)` via
   admin client in a founder/admin-gated action.

---

## Canonical helpers

- `getDealsByRole` / `getDealsSummary` — the role-scoped deal reads.
- `getDomainTargets` / `upsertDomainTarget` (`domain-targets-service.ts`) — founder monthly deals-closed targets.
- `getAssignableUsers` (reused for walk-in assignee validation), `normalizeToE164`.

---

## Key tables

| Table | Holds |
|---|---|
| `deals` | `lead_id` (null for walk-ins), contact name/phone/email, `domain`, `deal_type` (membership/retail), `deal_duration` (3m/6m/1y, membership only), `deal_amount`, `assigned_to`, `won_at`, `archived_at` |
| `domain_targets` | `(domain, metric, period)` unique; `target_value`, `set_by`; today metric=`deals_closed`, period=`month` |

---

## Invariants / gotchas

- **No RLS on `deals`** — all writes use the admin client; the application layer enforces access
  (`recordDeal` lead-access check; `createWalkInDeal` role/domain/assignee enforcement).
- **Deal insert before status flip** in `recordDeal` — guarantees a lead is never marked won without a deal.
- **E.164 normalization in the action** — client sends a raw string; normalization failure → human error.
- **Membership requires `deal_duration`** (schema refine); retail has none.
- **Targets are founder-set only** — no cascade to agents.

---

## File map (spine)

| File | Role |
|---|---|
| `src/lib/services/deals-service.ts` | By-role list, summary RPC, single-lead deal |
| `src/lib/services/domain-targets-service.ts` | Domain targets: read per role, admin-gated write |
| `src/lib/actions/deals.ts` | `recordDeal` (lead→deal), `createWalkInDeal`, target upsert |
| `src/components/deals/DealCard.tsx` | Deal row display (contact, amount, type, won date, lead link) |
| `src/components/deals/NewDealModal.tsx` | WonDealModal (lead path) + walk-in create path |
| `src/components/deals/DealsFilters.tsx` | Filter bar (search, date, agent, deal_type) |
