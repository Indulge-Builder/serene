# Call Intelligence / Helpdesk

> **Purpose:** A domain-scoped case library (`service_cases` + `conversation_hooks`), Redis-cached for the
> `/helpdesk` page, with a dossier card that surfaces ≤6 relevant cases per lead.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md). Migration: `0110`.

---

## Entry points & data flow

- **Full library** — `getHelpdeskLibrary(domain)` (`intelligence-service.ts`): Redis cache-aside under
  `REDIS_KEYS.helpdeskCases(domain)` / `REDIS_TTL.HELPDESK_CASES` (1hr) → on miss, a Supabase `{ cases,
  hooks }` envelope. Falls through to a live read if Redis is unavailable.
- **Dossier card** — `getCasesForLead(interests, city, domain)` (≤6 rows, featured-first) and
  `getHooksForCategories(categories, domain, limit=5)`. **Deliberately un-cached** (small indexed,
  lead-specific lookup).
- **Writes** — `upsertServiceCaseAction` / `upsertConversationHookAction` (`actions/intelligence.ts`):
  session client (0110 RLS) → **await `redis.del(helpdeskCases(domain))`** (P-08 try/catch-warn) →
  `revalidatePath('/helpdesk')`.
- **Helpdesk filtering is CLIENT-SIDE** on the full library — never a per-keystroke server search.

---

## Canonical helpers

- `getServiceCategoryLabel(slug)` / the interests vocabulary (`lib/constants/interests.ts`).
- `getCasesForLead` / `getHooksForCategories` — the dossier reads; the `/helpdesk` page and the dossier
  `ServiceInterestCard` compose the same `src/components/intelligence/` components.

---

## Key tables

| Table | Holds |
|---|---|
| `service_cases` | `domain`, `category`, `tags` text[], `title`, `summary`, `outcome_note`, `city`/`country`, `is_featured`, `sort_order`, `search_vector` |
| `conversation_hooks` | `domain`, `category`, `hook`, `context`, `sort_order` |

(RLS: migration 0110 — all-authenticated read, admin/founder write.)

---

## Invariants / gotchas

- **Redis cache-aside is library-only** — the dossier interest card is never cached.
- **Partial envelope never cached** — if either query errors, nothing is stored; a live read is complete or nothing.
- **Redis failure is non-fatal** — absence/timeout falls through to a live read; never a user error.
- **Invalidation is action-owned** — every write awaits the helpdesk-key del before `revalidatePath` (P-08).

---

## File map

| File | Role |
|---|---|
| `src/lib/services/intelligence-service.ts` | `getHelpdeskLibrary` (Redis envelope), `getCasesForLead`, `getHooksForCategories` |
| `src/lib/actions/intelligence.ts` | Library read action + `upsertServiceCase`/`upsertConversationHook` |
| `src/lib/constants/interests.ts` | Service categories, domain interests, label resolver |
| `src/components/intelligence/CaseCard.tsx` | Featured case card (helpdesk + dossier) |
| `src/components/intelligence/CaseDetailModal.tsx` | Full case detail modal |
| `src/components/intelligence/CaseListRow.tsx` | `/helpdesk` list row |
| `src/components/intelligence/HookList.tsx` | Conversation hooks list |
| `src/components/intelligence/HelpdeskSearch.tsx` | Client-side `/helpdesk` search + filter |
| `src/components/intelligence/CategoryPill.tsx` / `CategoryTag.tsx` | Filter button / static category pill |
