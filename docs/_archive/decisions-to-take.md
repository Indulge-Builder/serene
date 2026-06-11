# Decisions to Take

Problems we know exist. Approaches have been thought through.
Not executed yet — either confidence was low, timing was wrong,
or the fix needs more context before touching production.

---

## 1. Archived Leads — Phone Search Does Not Surface History

### The problem

When an agent types a phone number in the leads search bar, they only
see active leads. If that number was previously a lead that got archived
(won, lost, or junk), it is invisible. The agent cannot tell if the
contact has history with Indulge.

### Why it matters

An agent may treat a returning contact as a fresh lead, missing months
of prior conversation, a previous lost deal, or a previously junk-flagged
number. For a luxury concierge product this context is critical.

### Why the fix is non-trivial

The RLS SELECT policies on `leads` have `archived_at IS NULL` baked in
at the database level for every role (agent, manager, admin, founder).
No application-layer query can bypass this. Even removing the filter
from `getLeadsByRole` returns zero archived rows — the DB wall holds
regardless.

### Files that would be touched

- `supabase/migrations/` — new migration for the RPC
- `src/lib/services/leads-service.ts` — new service function
- Wherever `LeadsTableAsync` lives — parallel fetch addition
- `src/components/leads/ArchivedLeadsStrip.tsx` — new component
- `docs/lead-page.md` — invariant update

---
