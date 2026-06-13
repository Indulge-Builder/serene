# Call Intelligence & Helpdesk — Full Feature Specification

> **Purpose:** complete spec for the call-intelligence/helpdesk module (service taxonomy, schema, retrieval, UI surfaces, build sequence).
> **Audience:** engineers. · **Source-of-truth scope:** the module's design contract. **Phase 1 code is built (2026-06-12)** — see `docs/changelog.md` for the implementation record; file paths below are now live (migrations renumbered 0109/0110, the spec's 0085/0086 slots were taken).
> **Last verified:** 2026-06-12 · **Status:** Phase 1 code complete; **migrations 0109/0110 applied to production (ledger-recorded)**; §15 live checks passed (RLS write matrix agent/manager blocked + admin allowed, ingestion `interest='travel,events'` → `['travel','events']`, Redis key del verified). **Content gate: CLOSED (seeded 2026-06-12).** The curated library — 150 cases + 30 hooks for `onboarding` (25 cases + 5 hooks per category, exceeding the ≥20/category ship bar), distilled from the Freshdesk export — was seeded via `scripts/seed-call-intelligence.ts` from `scripts/data/call-intelligence-seed.json`: every row validated against the 0110 contract (incl. the city-slug-tag invariant) pre-insert, post-insert counts verified (150/30), `helpdesk:cases:onboarding` Redis envelope deleted. The worksheet (`call-intelligence-content-worksheet.md`) remains the drafting reference; all post-seed edits go via the admin path (the script refuses to re-run without `--force`).
>
> **Serene · Indulge Global · Internal OS**
> Written: 2026-06-09
> Status: Planning complete. Awaiting content seeding before build begins.
> Author: Architecture session between Wizard & Claude

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [The Problem It Solves](#2-the-problem-it-solves)
3. [Service Taxonomy — The 6 Categories](#3-service-taxonomy--the-6-categories)
4. [Data Model — Complete Schema](#4-data-model--complete-schema)
5. [Lead Form Integration & Ingestion Pipeline](#5-lead-form-integration--ingestion-pipeline)
6. [Retrieval Strategy — Why Client-Side Wins](#6-retrieval-strategy--why-client-side-wins)
7. [Redis Caching Layer](#7-redis-caching-layer)
8. [UI Surface 1 — Lead Dossier Interest Card](#8-ui-surface-1--lead-dossier-interest-card)
9. [UI Surface 2 — The Helpdesk Page](#9-ui-surface-2--the-helpdesk-page)
10. [New Files Map](#10-new-files-map)
11. [Migration Plan](#11-migration-plan)
12. [Phase 2 — Embeddings (Semantic Search)](#12-phase-2--embeddings-semantic-search)
13. [Content Brief — Writing the 150 Cases](#13-content-brief--writing-the-150-cases)
14. [Build Sequence](#14-build-sequence)
15. [Sign-off Conditions](#15-sign-off-conditions)

---

## 1. What This Is

**Call Intelligence** is a two-surface feature inside Gia that arms agents with the right examples, scripts, and talking points at the exact moment they need them — during a live call with a lead.

It has two entry points:

**Surface A — The Lead Dossier Interest Card.**
When a lead opens in the dossier, a card shows the most relevant past deliveries and conversation hooks based on two data points from the lead: their city (`leads.city`) and their stated service interests (`leads.service_interests`). The agent sees this before or during the call without searching for anything. **Since 2026-06-12 the card is always visible and also carries its own library search** — a lead with no interests gets a search-first view instead of nothing, and even matched leads can search the full library inline (one lazy `getHelpdeskLibraryAction(lead.domain)` fetch on first keystroke, then client-side `caseMatchesQuery` filtering — same no-per-keystroke-server-search rule as Surface B).

**Surface B — The Helpdesk Page (`/helpdesk`).**
A standalone search page accessible from the sidebar. Agent types any keyword — "yacht", "rolex", "jaipur", "nanny", "f1" — and all matching past deliveries appear instantly. Zero server round-trips after the initial page load. Used mid-call when the conversation goes somewhere unexpected.

Both surfaces draw from the same dataset: a curated library of 150 real past deliveries (`service_cases`) and a set of category-scoped talking points (`conversation_hooks`). Both tables require content to be seeded by the team before the UI is built.

---

## 2. The Problem It Solves

Agents are on live calls with high-net-worth leads. These leads are impatient and evaluating within the first 60 seconds whether Indulge is worth their attention.

Today's problem:

- Agents struggle to recall relevant past deliveries on the spot
- They default to generic claims ("we can arrange anything") instead of specific proof
- They don't know which talking points land best for a lead interested in events vs travel vs retail
- A Delhi-based lead gets the same pitch as a Mumbai lead, when they should hear "we've worked extensively in Delhi"

What this feature gives them:

- Specific, impressive past examples matched to what the lead cares about
- City-contextual proof ("here's what we've done for clients in your city")
- Confident scripts and talking points so they never ramble
- A search tool for when the conversation goes off-script

**The founder's goal:** Give agents everything they need to convert the conversation. Faster. More personal. More convincing.

---

## 3. Service Taxonomy — The 6 Categories

These are stored as a PostgreSQL enum (`service_category`) on the `service_cases` table and as `text[]` values in `leads.service_interests` and the `DOMAIN_INTERESTS` constants file.

### The 6 Concierge Categories


| Value     | Display Name     | What It Covers                                                                                                                                                                                                                                                     |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `travel`  | Travel           | Custom itineraries, hotel bookings, flight management, pick-drop, invisible butler travel experiences. We don't recommend Instagram places — we find the hidden ones matched to the client's personality, hygiene standard, adventure level, and past preferences. |
| `dining`  | Dining           | Fully-booked restaurant seats, club entries, lounge access, private dining, party organization, table at the place everyone says is impossible.                                                                                                                    |
| `gifts`   | Gifts            | Rare item sourcing, personality-matched gifts, occasion reminders. Our Joker team's only job is to make clients look incredible to the people they care about.                                                                                                     |
| `events`  | Events           | Sports tickets (F1, IPL, Wimbledon, WWE), concerts, once-in-a-lifetime experiences (Antarctica, Everest breakfast), workshops, and any seat the public cannot buy.                                                                                                 |
| `retail`  | Retail           | Sold-out and waitlisted items — Rolex on 3-year waitlist, limited sneakers, jewellery, yachts, jets. Client wishes for a thing; we source and deliver it.                                                                                                          |
| `special` | Special Requests | Everything that doesn't fit above. If it is legal where the client is, we can attempt it. Nanny sourcing, househelp, tutors, unusual logistics, delivering medicine to a remote location, a Coke bottle to a mountain peak.                                        |


### Tag Convention

Tags are freeform `text[]` on each case. They are the only granular vocabulary — no subcategories, no additional hierarchy. Tags cover:

- **City tags:** `'delhi'`, `'jaipur'`, `'mumbai'`, `'goa'`, `'london'`, `'tokyo'` — always lowercase city slug
- **Service tags:** `'rolex'`, `'daytona'`, `'nanny'`, `'wimbledon'`, `'f1'`, `'private_chef'`, `'yacht'`, `'sold_out'`
- **Qualifier tags:** `'48hrs'`, `'same_day'`, `'international'`, `'rare'`, `'waitlisted'`, `'bespoke'`
- **Impression tags:** `'client_loved'`, `'referred_others'`, `'extended_engagement'`

**Rule:** Every case must include at minimum the city slug as a tag (matching `leads.city`). This is what powers the city-contextual card on the dossier.

### Multi-Domain Interest Vocabulary

`leads.service_interests` is `text[]` — not the enum — because different domains have different interest vocabularies. The enum would break on Shop, House, and Legacy leads.

The `DOMAIN_INTERESTS` constants file owns valid values per domain:

```typescript
// src/lib/constants/interests.ts
export const DOMAIN_INTERESTS = {
  concierge: ['travel', 'dining', 'gifts', 'events', 'retail', 'special'],
  shop:      ['watches', 'perfumes', 'jewellery', 'fashion', 'accessories', 'art'],
  house:     ['interior', 'renovation', 'staff', 'security', 'smart_home', 'garden'],
  legacy:    ['estate', 'investments', 'art', 'philanthropy', 'succession', 'legal'],
  onboarding: ['travel', 'dining', 'gifts', 'events', 'retail', 'special'],
} as const satisfies Record<string, string[]>;

export type ServiceInterest = 
  (typeof DOMAIN_INTERESTS)[keyof typeof DOMAIN_INTERESTS][number];
```

Zod validation at the action layer validates submitted interests against `DOMAIN_INTERESTS[lead.domain]`. Unknown values are dropped, never rejected (defensive parsing — don't block a lead ingest over an unrecognized interest value).

---

## 4. Data Model — Complete Schema

### Table 1: `service_cases`

The brag library. 150 curated real past deliveries. Searched live during calls.

```sql
-- array_to_string() is only STABLE (anyarray element casting), so Postgres
-- rejects it inside a GENERATED column (42P17). This text[]-only wrapper
-- involves no casting and is safely IMMUTABLE — required by search_vector
-- below. Any future module reusing this FTS-over-tags pattern needs it too
-- (it already exists in prod from migration 0110; CREATE OR REPLACE is safe).
CREATE OR REPLACE FUNCTION public.immutable_array_to_string(text[], text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN array_to_string($1, $2);

CREATE TABLE public.service_cases (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Domain scoping (which Gia domain this case belongs to)
  domain         public.app_domain  NOT NULL,

  -- Taxonomy
  category       text        NOT NULL,  -- 'travel' | 'dining' | 'gifts' | 'events' | 'retail' | 'special'
                                        -- (text, not enum — accommodates Shop/House/Legacy vocabulary)
  tags           text[]      NOT NULL DEFAULT '{}',  -- city slugs + service keywords + qualifiers

  -- Content (what agents read and say)
  title          text        NOT NULL,  -- one impressive claim line. max 120 chars.
  summary        text        NOT NULL,  -- 2–3 sentences. what, how, why it was hard. no client names.
  outcome_note   text,                  -- what happened after. brag number if possible.

  -- Location display
  city           text,                  -- "Delhi" — display column for the card UI
  country        text,                  -- "India" — display column for international cases

  -- Ordering
  is_featured    boolean     NOT NULL DEFAULT false,  -- pinned to top per category
  sort_order     int         NOT NULL DEFAULT 0,

  -- Audit
  created_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Full-text search (weighted, generated, stored)
  -- Weight A: title (most important — agents search by headline)
  -- Weight B: summary + city + country (context)
  -- Weight C: tags (keyword matching)
  search_vector  tsvector    GENERATED ALWAYS AS (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(city, '') || ' ' || coalesce(country, '')), 'B') ||
    -- NOT plain array_to_string() — STABLE, rejected in a generated column
    setweight(to_tsvector('english', public.immutable_array_to_string(tags, ' ')), 'C')
  ) STORED,

  -- Phase 2 only — embedding column exists from day 1, populated later.
  -- Requires: CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
  embedding      extensions.vector(1536)  -- NULL until Phase 2. HNSW index NOT created until populated.
);

-- Indexes
CREATE INDEX idx_service_cases_fts      ON public.service_cases USING GIN(search_vector);
CREATE INDEX idx_service_cases_tags     ON public.service_cases USING GIN(tags);
CREATE INDEX idx_service_cases_category ON public.service_cases(category);
CREATE INDEX idx_service_cases_domain   ON public.service_cases(domain);
CREATE INDEX idx_service_cases_city     ON public.service_cases(lower(city));
CREATE INDEX idx_service_cases_featured ON public.service_cases(is_featured, sort_order);

-- RLS
ALTER TABLE public.service_cases ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "service_cases_select" ON public.service_cases
  FOR SELECT TO authenticated USING (true);

-- Only admin and founder can write
CREATE POLICY "service_cases_insert" ON public.service_cases
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin', 'founder'));

CREATE POLICY "service_cases_update" ON public.service_cases
  FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin', 'founder'));

CREATE POLICY "service_cases_delete" ON public.service_cases
  FOR DELETE TO authenticated
  USING (get_user_role() IN ('admin', 'founder'));
```

### Table 2: `conversation_hooks`

Scripts, talking points, and confident lines. What agents say, not just what they've done. Read before or during calls to eliminate filler conversation and go straight to the point.

```sql
CREATE TABLE public.conversation_hooks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping
  domain          public.app_domain  NOT NULL,
  category        text        NOT NULL,   -- matches service_cases.category values

  -- The hook itself
  hook            text        NOT NULL,   -- the full line the agent can say or paraphrase
  context         text,                   -- when to use this hook (optional guidance)

  -- Ordering
  sort_order      int         NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_hooks_category ON public.conversation_hooks(category);
CREATE INDEX idx_conversation_hooks_domain   ON public.conversation_hooks(domain);

ALTER TABLE public.conversation_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_hooks_select" ON public.conversation_hooks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "conversation_hooks_write" ON public.conversation_hooks
  FOR ALL TO authenticated
  USING (get_user_role() IN ('admin', 'founder'))
  WITH CHECK (get_user_role() IN ('admin', 'founder'));
```

### New Column on `leads`

```sql
-- Migration: 20260610000085_leads_service_interests.sql
ALTER TABLE public.leads
  ADD COLUMN service_interests text[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_leads_service_interests
  ON public.leads USING GIN(service_interests)
  WHERE archived_at IS NULL;
```

`lead_intent` (hot | cold) is untouched. This is a separate column with separate semantics.

### Existing Columns Used (No Changes Needed)


| Column                    | Table   | Used for                                                                                 |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `leads.city`              | `leads` | Auto-populate city filter on the dossier card. Already a promoted top-level text column. |
| `leads.domain`            | `leads` | Scope `service_cases` and `conversation_hooks` queries to the right domain.              |
| `leads.service_interests` | `leads` | (new) Drive the dossier card category filter.                                            |


---

## 5. Lead Form Integration & Ingestion Pipeline

### The Lead Form Change

Two new forms are created by the team:

- **Meta Ads lead form** — updated to include a multi-select interest field
- **Website contact form** — updated to include the same field

The field label shown to leads: *"What are you most interested in?"*
The options (for concierge leads):


| Label                | Value sent in payload |
| -------------------- | --------------------- |
| Travel               | `travel`              |
| Dining & Nightlife   | `dining`              |
| Gifts & Surprises    | `gifts`               |
| Events & Experiences | `events`              |
| Retail & Sourcing    | `retail`              |
| Something Else       | `special`             |


The lead can select multiple. The payload arrives as a comma-separated string or array depending on the form builder.

### Ingestion Pipeline Update

File: `src/lib/services/lead-ingestion.ts`

In the adapter layer (`adaptMetaPayload`, `adaptGooglePayload`, `adaptWebsitePayload`), extract and normalize the interest field:

```typescript
// Parse from form_data — defensive, never throws
function extractServiceInterests(formData: Record<string, unknown>, domain: AppDomain): string[] {
  const raw = formData?.['interest'] ?? formData?.['interests'] ?? formData?.['service_interest'] ?? '';
  const candidates = typeof raw === 'string'
    ? raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : Array.isArray(raw) ? raw.map(String).map(s => s.trim().toLowerCase()) : [];
  
  const valid = DOMAIN_INTERESTS[domain] ?? DOMAIN_INTERESTS['concierge'];
  // Drop unknown values — never block an ingest
  return candidates.filter(c => valid.includes(c));
}
```

The normalized array is written to `leads.service_interests` on INSERT. `form_data` remains immutable after insert (convention unchanged).

**Manual leads (Phase 1.1, shipped 2026-06-12):** the Add Lead modal carries the same field — an optional domain-scoped `FormChip` multi-select. `createManualLead` drops out-of-vocabulary values against the resolved domain via the same `extractServiceInterests` helper and writes `text[]` on its existing INSERT (no second path). A domain switch in the form clears picks outside the new domain's vocabulary.

**Existing leads (Phase 1.1b, shipped 2026-06-12):** interests are editable on the dossier like every other lead field — `InterestsInlineField` in `LeadInfoCard` (`canEdit` gate) → `updateLeadInterests` (same `assertLeadFieldEditAccess` + `revalidateLeadDossier` path as email/source; activity entry logs old → new). This lights up the dossier card for the existing book and WhatsApp-originated leads, which all start with empty interests.

---

## 6. Retrieval Strategy — Why Client-Side Wins

### The Math

At 150 rows, the bottleneck is never the database query. It is the network.


| Approach                        | Typical latency (Vercel → Supabase Mumbai) |
| ------------------------------- | ------------------------------------------ |
| Server FTS query per keystroke  | 80–250ms per search (network dominates)    |
| Load all 150 once, filter in JS | 0.1ms per filter (no network after mount)  |


**Verdict:** Load all 150 cases on page mount. Filter entirely in JavaScript. Zero server round-trips per keystroke.

This stays correct until approximately 800 cases. At that scale, client-side filtering becomes perceptible (~30–50ms on mid-range devices). The GIN index is already in place on `service_cases.search_vector` — switching to server-side FTS at that point requires only a change in the search action, not a schema change.

### Helpdesk Page Strategy

```
Page loads → Server Component RSC fetch → getAllServiceCases(domain) → 
→ Redis hit (1-hour TTL) or Supabase query → 
→ passed as initialData to <HelpdeskSearch /> client component →
→ agent types → JS Array.filter() on full dataset → 
→ results in <5ms, no loading spinner, no debounce needed
```

### Lead Dossier Card Strategy

```
Dossier page loads → Server Component → parallel Promise.all([
  getLeadBySlug(slug),
  getCasesForLead(lead.service_interests, lead.city, lead.domain)  ← DB query, not client-side
]) → rendered server-side → zero client fetches for this card
```

The dossier card uses a server-side query because:

- It needs only 6 rows (filtered, not full dataset)
- It renders on page load, not on user input
- Results are lead-specific and not cacheable globally

---

## 7. Redis Caching Layer

### `getAllServiceCases` — Helpdesk Cache

```
Key pattern:  helpdesk:cases:{domain}
TTL:          3600 seconds (1 hour)
Invalidation: on any service_cases INSERT/UPDATE/DELETE via the admin action layer
Strategy:     cache-aside (read Redis first, fall back to Supabase, write on miss)
```

`service_cases` data changes rarely (added by admin/founder, not in real-time flow). One-hour TTL is appropriate. When a case is added or edited via the admin CRUD surface, the action calls `redis.del('helpdesk:cases:{domain}')` to force a fresh pull on next load.

### `getCasesForLead` — Dossier Card

Not cached in Redis. The dossier already has its own caching via `leadRowSlug` and `leadRowId` keys. The service_cases query for the dossier is a simple indexed lookup (6 rows by category + GIN tag match) — it runs in <5ms and does not need an additional cache layer.

---

## 8. UI Surface 1 — Lead Dossier Interest Card

### Where It Lives

The dossier right panel, top of the right column, above `LeadTasksCard`. **Always rendered** (2026-06-12 — previously gated on interests/city; the gate is gone on both the page and `ServiceInterestCardAsync`).

Component: `src/components/leads/ServiceInterestCard.tsx` — `'use client'` since the search landed; the async wrapper still does all server fetching.

### What It Shows

**Header:** Playfair Display, *"Why we're perfect."* — small section heading with the page-title dot.

**Library search (2026-06-12):** a `SearchBar` under the header searches the lead's domain library. Lazy fetch: the full `{cases}` envelope loads once via `getHelpdeskLibraryAction(lead.domain)` on the first keystroke (Redis 1hr envelope behind it); filtering is synchronous `caseMatchesQuery` (`src/lib/utils/case-search.ts` — THE shared matcher, also used by `HelpdeskSearch`). Results cap at 8 with a count line; clearing the query returns to the curated view. Hooks hide while a query is active (they are interest-scoped, not query-scoped).

**Auto-populated case cards** (up to 6):

- Filtered by: `category = ANY(lead.service_interests)` OR `tags @> ARRAY[lower(lead.city)]`
- Sorted: `is_featured DESC`, `sort_order ASC`
- Each card shows:
  - Title (primary, `--theme-text-primary`)
  - City + Country pill (`--theme-text-tertiary`, small)
  - 2-line summary (truncated with ellipsis)
  - Category pill (`--theme-accent-surface` background, `--theme-accent` text)
  - Outcome note in italic tertiary if present

**Conversation hooks** (below cases, same category scope):

- 3–5 hooks for the matched categories
- Each hook: italic quote-style text, `--theme-text-secondary`
- Small label: *"Talking points"* in `--theme-text-tertiary` uppercase tracking

**No search bar on the dossier card.** It is read-only, auto-populated. Agents who want to search type go to the Helpdesk page. The card is the curated preview; the Helpdesk is the full library.

### Animation

- Card entrance: `framer-motion` stagger — each case card animates in with `opacity: 0 → 1`, `y: 8 → 0`, duration `0.28s`, `EASE_OUT_EXPO` (from `src/lib/constants/motion.ts`)
- Stagger delay: `0.06s` per card
- No animation on conversation hooks — they appear with the card, not staggered

### Empty State

When `lead.service_interests` is empty AND `lead.city` yields no tag matches: the card is not rendered at all. No empty state placeholder — the section simply doesn't exist in the DOM.

When `lead.service_interests` is set but no cases match (unlikely once data is seeded): show a single muted line *"No examples on file for this category yet."* in `--theme-text-tertiary`.

### Design Tokens


| Element              | Token                                                  |
| -------------------- | ------------------------------------------------------ |
| Card background      | `var(--theme-paper)`                                   |
| Card border          | `var(--theme-paper-border)`                            |
| Card shadow          | `var(--shadow-1)`                                      |
| Card radius          | `var(--radius-md)`                                     |
| Title text           | `var(--theme-text-primary)`                            |
| Summary text         | `var(--theme-text-secondary)`                          |
| Outcome note         | `var(--theme-text-tertiary)`, italic                   |
| Category pill bg     | `var(--theme-accent-surface)`                          |
| Category pill text   | `var(--theme-accent)`                                  |
| City pill text       | `var(--theme-text-tertiary)`                           |
| Hook text            | `var(--theme-text-secondary)`, italic                  |
| Section heading      | Playfair Display, `var(--theme-text-primary)`          |
| Talking points label | `var(--theme-text-tertiary)`, 10px, uppercase, tracked |


---

## 9. UI Surface 2 — The Helpdesk Page

### Route

`/(dashboard)/helpdesk/page.tsx`

Sidebar nav item: under the Gia section. Icon: `BookOpen` (lucide-react). Label: *"Helpdesk"*. Visible to all roles.

### Layout

Standard paper shell. Full-width single column. Max-width 860px, centered.

**Page header:**

- Playfair Display: *"Helpdesk."* with the page-title dot
- Subtitle: `--theme-text-tertiary` — *"Search our delivery history. Use it on every call."*

**Search input:**

- Full-width, `--theme-paper-border` border, `--radius-md`
- Placeholder: *"Search by keyword, city, or service…"*
- Prefix icon: `Search` (lucide), `--theme-text-tertiary`
- No debounce — filtering is synchronous, instant
- Controlled input (`useState`)

**Category filter pills:**

- 7 pills: All · Travel · Dining · Gifts · Events · Retail · Special Requests
- Active pill: `var(--theme-accent)` background, `var(--theme-accent-fg)` text
- Inactive pill: `var(--theme-paper-subtle)` background, `var(--theme-text-secondary)` text
- `--radius-full` (fully rounded)
- Single-select — one active at a time

**Result count:**

- Small `--theme-text-tertiary` line below pills: *"24 examples"* or *"3 results for 'rolex'"*

**Case list + detail modal (2026-06-12 — replaced the 3-column card grid for list-page consistency):**

- Results render as a vertical list of compact rows (`CaseListRow`) — important info only:
  - Leading 36px icon tile (category icon from `category-icons.ts`, `--theme-accent-surface` bg)
  - Title (Playfair, truncated) + featured star when `is_featured`
  - One-line summary (`--theme-text-tertiary`, truncated)
  - Trailing cluster: `CategoryTag` pill · city/country · chevron
- Row chrome: `var(--theme-paper)` bg, `var(--theme-paper-border)` border, `var(--shadow-1)`, `var(--radius-md)`; hover `var(--shadow-2)` + `translateY(-1px)` (card-list pattern); keyboard-activatable (`role="button"`, Enter/Space)
- Clicking a row opens **`CaseDetailModal`** (composes `ui/modal.tsx`; loaded via `next/dynamic` + `useMountOnFirstOpen`) showing EVERYTHING saved on the case: category, featured badge, location, full summary (no clamp), outcome note, all tags
- `CategoryTag` (`src/components/intelligence/CategoryTag.tsx`) is THE static category pill — shared by `CaseCard`, `CaseListRow`, and the modal (the filter button stays `CategoryPill`)
- `CaseCard` (stacked preview) remains the dossier `ServiceInterestCard` row

**Empty state (no search results):**

- Centered, `--theme-text-tertiary`
- *"Nothing matches. Try a different keyword."*
- No illustration, no button — keep it quiet

**Conversation Hooks section** (below case results):

- Only shown when a category filter is active (not on "All" tab)
- Section label: *"Talking points for [Category]"* — `--theme-text-tertiary`, uppercase, tracked
- Hooks listed as numbered items, `--theme-text-secondary`, italic
- Compact — not cards, just text rows with numbers

### Client-Side Filter Logic

```typescript
// All 150 cases loaded on mount as initialData
const filtered = useMemo(() => {
  return allCases.filter(c => {
    const matchesCategory = activeCategory === 'all' || c.category === activeCategory;
    if (!query.trim()) return matchesCategory;
    
    const q = query.toLowerCase();
    const matchesQuery =
      c.title.toLowerCase().includes(q) ||
      c.summary.toLowerCase().includes(q) ||
      (c.city ?? '').toLowerCase().includes(q) ||
      (c.country ?? '').toLowerCase().includes(q) ||
      c.tags.some(t => t.includes(q));
    
    return matchesCategory && matchesQuery;
  });
}, [allCases, query, activeCategory]);
```

No FTS at this layer. Plain `includes()` is sufficient and faster than regex for 150 items. At >500 cases, swap this for `fuse.js` (fuzzy, client-side, zero server dependency).

### Animation

- Initial list: stagger entrance, same pattern as dossier card
- Filter/search result change: `AnimatePresence` with `layout` prop on the rows so the list smoothly reflows rather than jumps
- Category pill toggle: `scale: 0.96 → 1.0` on press, 100ms

---

## 10. New Files Map

```
src/
├── app/(dashboard)/
│   └── helpdesk/
│       ├── page.tsx                    ← Server Component. Fetches all cases + hooks as initialData.
│       └── loading.tsx                 ← Skeleton for the page shell + results list.
│
├── components/
│   ├── intelligence/
│   │   ├── CaseCard.tsx               ← Stacked preview card (dossier surface).
│   │   ├── CaseListRow.tsx            ← Helpdesk list row → opens CaseDetailModal.
│   │   ├── CaseDetailModal.tsx        ← Full case details (composes ui/modal.tsx).
│   │   ├── CategoryTag.tsx            ← THE static category pill (card/row/modal).
│   │   ├── category-icons.ts          ← category → Lucide icon map.
│   │   ├── HookList.tsx               ← Conversation hooks list (numbered items).
│   │   ├── CategoryPill.tsx           ← Single category filter pill (shared).
│   │   └── HelpdeskSearch.tsx         ← Client component. Owns query state + filter logic.
│   │
│   └── leads/
│       └── ServiceInterestCard.tsx    ← Dossier section. Server-rendered. Uses CaseCard + HookList.
│
├── lib/
│   ├── services/
│   │   └── intelligence-service.ts   ← getAllServiceCases(), getCasesForLead(), getHooksForCategory()
│   │
│   ├── actions/
│   │   └── intelligence.ts           ← getAllServiceCasesAction(), upsertServiceCaseAction() (admin)
│   │
│   ├── validations/
│   │   └── intelligence-schemas.ts   ← ServiceCaseSchema, ConversationHookSchema (Zod)
│   │
│   └── constants/
│       └── interests.ts              ← DOMAIN_INTERESTS, SERVICE_CATEGORY_LABELS, SERVICE_CATEGORY_ICONS
│
supabase/migrations/
├── 20260610000085_leads_service_interests.sql   ← ADD COLUMN service_interests text[]
└── 20260610000086_call_intelligence_tables.sql  ← service_cases + conversation_hooks + all indexes + RLS
```

### Files Modified (not created)


| File                                                        | Change                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/lib/services/lead-ingestion.ts`                        | Add `extractServiceInterests()` helper; write to `service_interests` on INSERT       |
| `src/app/(dashboard)/leads/[id]/page.tsx`                   | Add `getCasesForLead()` to the `Promise.all` prefetch; pass to `ServiceInterestCard` |
| `src/components/leads/LeadDossierRight.tsx` (or equivalent) | Render `<ServiceInterestCard />` below `LeadInfoCard`                                |
| `src/lib/constants/route-permissions.ts`                    | Add `/helpdesk` to permitted routes for all roles                                    |
| Sidebar nav component                                       | Add Helpdesk nav item under Gia section                                              |


---

## 11. Migration Plan

### Migration 1: `20260610000085_leads_service_interests.sql`

```sql
-- Add service_interests column to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS service_interests text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_leads_service_interests
  ON public.leads USING GIN(service_interests)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.leads.service_interests IS
  'Multi-select service categories from lead form. Values validated against DOMAIN_INTERESTS constant per domain. Distinct from lead_intent (hot/cold).';
```

### Migration 2: `20260610000086_call_intelligence_tables.sql`

Full `service_cases` and `conversation_hooks` table creation with all indexes, RLS policies, and the `updated_at` trigger on `service_cases`.

Note: The `vector` extension is already available on Supabase. The `embedding vector(1536)` column is added in this migration but **the HNSW index is not created** — it is deferred to Phase 2 migration when the column is populated.

---

## 12. Phase 2 — Embeddings (Semantic Search)

### When to Trigger Phase 2

Phase 2 is warranted when **both** of these are true:

1. The case library has grown beyond ~400 entries, and
2. Agents are reporting that searches for synonyms are missing results (e.g., searching "childcare" misses cases tagged `nanny`)

At 150 cases with good tagging, this will not be a problem. Do not prematurley build Phase 2.

### What Changes in Phase 2

**New Trigger.dev job:** `generate-case-embedding`

Fires on every `service_cases` INSERT or UPDATE. Calls `text-embedding-3-small` via OpenAI API with the case's `title + summary + tags joined`. Writes the resulting 1536-dimension vector to `service_cases.embedding`.

**New HNSW index** (Phase 2 migration only):

```sql
-- Only run after embedding column is populated
CREATE INDEX idx_service_cases_embedding
  ON public.service_cases
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**RPC enhancement:** `search_call_intelligence_semantic(query_embedding vector, domain app_domain, limit int)`

The Helpdesk search switches from client-side `includes()` to a two-stage approach:

1. Generate embedding for the query string (single OpenAI API call, ~50ms)
2. Run HNSW cosine similarity search in Supabase (`<=>` operator)
3. Merge with tag-based results, deduplicate, rank

**Why `text-embedding-3-small`:** 1536 dimensions, $0.00002/1k tokens, strong multilingual performance. For 150 cases, total embedding cost is under ₹5. For 1000 cases, under ₹30.

**The `embedding` column exists from Phase 1 day 1** — this is critical. Adding a vector column to a large table later requires a rewrite. Starting with it NULL costs nothing and future-proofs the schema permanently.

---

## 13. Content Brief — Writing the 150 Cases

> **Content must be seeded before a single line of UI code is written.**
> An empty library makes the feature useless and the demo embarrassing.
> This is the non-negotiable prerequisite.

### Target Volume

25 cases per category × 6 categories = 150 total.
Of these, 2 per category (12 total) should be marked `is_featured = true` — these are the crown jewels, the most impressive, the ones that should always surface first.

### Writing Each Case

Every case has 5 required fields and 2 optional:


| Field          | Required | Guidance                                                                                                                                                                                 |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`        | Yes      | One line, max 120 chars. Make it a claim, not a description. *"Sourced a Patek Philippe Nautilus in 36 hours when the global waitlist was 4 years"* — not *"Watch sourcing for client"*. |
| `summary`      | Yes      | 2–3 sentences. What was done. What made it hard or special. Never mention client name or identifying details. Write in past tense, third person.                                         |
| `outcome_note` | No       | What happened after. Numbers, referrals, repeat business, extensions, upgrades. *"Client extended the itinerary twice and referred three families to Indulge."*                          |
| `category`     | Yes      | One of the 6 values.                                                                                                                                                                     |
| `tags`         | Yes      | 4–8 tags minimum. Always include city slug. Think: what would an agent type mid-call?                                                                                                    |
| `city`         | Yes      | Display name: `"Delhi"`, `"Tokyo"`, `"London"`. Not a slug here — this is shown in the UI.                                                                                               |
| `country`      | No       | Only needed for international cases.                                                                                                                                                     |


### Tag Conventions (Enforced)

- City always goes in `tags` as a lowercase slug: `'delhi'`, `'mumbai'`, `'goa'`, `'london'`, `'dubai'`
- The `city` column is the display version (`"Delhi"`); the tag is the searchable version (`'delhi'`)
- No spaces in tags — use underscores: `'private_chef'`, `'sold_out'`, `'same_day'`
- Maximum 10 tags per case — quality over quantity

### Writing Conversation Hooks

For each of the 6 categories, write 4–6 hooks. A hook is a single confident line an agent can say or paraphrase during a call.

Good hooks:

- *"We once arranged a private debenture box at Wimbledon Centre Court for a client who called us 48 hours before the final. The waiting list for that box is normally 12 years."*
- *"One of our clients in Jaipur wanted to gift his daughter something for her university results. We found a miniature glass duck — her favourite animal — from a Murano artisan in Venice. She still talks about it."*
- *"We sourced a Rolex Daytona in Platinum within 72 hours. The dealer waitlist was 3 years. We didn't use a dealer."*

Bad hooks (too vague, no proof):

- *"We can arrange anything you need."*
- *"Our team is very experienced in events."*

### Anti-Patterns to Avoid

- **No client names** — ever. Not even initials or "a client from Delhi who works in finance."
- **No unverifiable claims** — if you can't back it up, don't write it
- **No generic adjectives** — "amazing", "incredible", "world-class" — use specific facts instead
- **No future tense** — these are past deliveries, always past tense

---

## 14. Build Sequence

The correct order. Do not deviate.

```
Step 1 — CONTENT (prerequisite, blocking)
  Team writes all 150 cases and 30+ conversation hooks
  Team seeds them via Supabase dashboard or a temporary admin form
  At least 10 cases per category before any UI demo

Step 2 — MIGRATIONS
  Run migration 1: leads.service_interests column
  Run migration 2: service_cases + conversation_hooks tables

Step 3 — CONSTANTS & TYPES
  src/lib/constants/interests.ts (DOMAIN_INTERESTS + types)

Step 4 — SERVICES
  src/lib/services/intelligence-service.ts
  (getAllServiceCases, getCasesForLead, getHooksForCategory)

Step 5 — ACTIONS
  src/lib/actions/intelligence.ts
  (getAllServiceCasesAction for helpdesk, upsertServiceCaseAction for admin)

Step 6 — INGESTION UPDATE
  src/lib/services/lead-ingestion.ts — extractServiceInterests() + write on INSERT

Step 7 — SHARED COMPONENTS
  CaseCard.tsx, HookList.tsx, CategoryPill.tsx (in src/components/intelligence/)

Step 8 — HELPDESK PAGE
  HelpdeskSearch.tsx (client, owns filter logic)
  helpdesk/page.tsx (server, fetches data, passes initialData)
  helpdesk/loading.tsx (skeleton)
  Add to sidebar nav + route-permissions

Step 9 — DOSSIER CARD
  ServiceInterestCard.tsx
  Add getCasesForLead() to the dossier page Promise.all
  Render ServiceInterestCard in dossier right panel

Step 10 — ADMIN CRUD (optional sprint, can defer)
  Simple form (modal) for admin/founder to add/edit cases without touching Supabase dashboard
```

---

## 15. Sign-off Conditions

Before calling this feature shipped:

```
✓ pnpm tsc --noEmit passes with zero errors
✓ At least 20 cases seeded per category (120 minimum total)
✓ Helpdesk search: typing "rolex" returns relevant cases in < 50ms (client-side filter proof)
✓ Dossier card: a lead with service_interests = ['events'] and city = 'Delhi' shows
    cases matching events category AND cases tagged 'delhi'
✓ A lead with service_interests = [] shows the search-first card (no curated cases, no hooks,
    library search functional) — superseded 2026-06-12: the card is always in the DOM
✓ Helpdesk page unreachable by unauthenticated users (proxy guard)
✓ service_cases INSERT/UPDATE blocked for agent and manager roles (RLS verified)
✓ Ingestion: a test webhook payload with interest = 'travel,events' writes
    service_interests = ['travel', 'events'] to the lead row
✓ Redis cache invalidated correctly on service_cases write
✓ leads.service_interests column exists with GIN index (confirmed in Supabase dashboard)
✓ embedding column exists on service_cases (NULL, no HNSW index yet)
✓ No hex values in any new component — all colors via CSS token variables
✗ No subcategory column — was considered and rejected. Never add it.
✗ No FTS query per keystroke on the Helpdesk page — filtering is client-side only
✗ service_interests must not use the service_category enum — it is text[]
✗ No embedding generation pipeline in Phase 1
```

After sign-off:

1. Update `CLAUDE.md` with the two new tables and their RLS policies
2. Update `../architecture/migrations.md` with the two new migrations
3. Update `../architecture/overview.md` §5 (service→doc map) with `intelligence-service.ts`
4. Add one line to `docs/changelog.md`: *"Call Intelligence — Helpdesk page + Lead dossier interest card. Phase 1 shipped."*

---

## Quick Reference Summary


| Thing                    | Decision                                                     |
| ------------------------ | ------------------------------------------------------------ |
| Number of tables         | 2 (`service_cases`, `conversation_hooks`)                    |
| Taxonomy depth           | 6 categories (enum) + freeform tags. No subcategories.       |
| `service_interests` type | `text[]` — not enum, to support all 4 domains                |
| Lead form field          | Multi-select, maps to `leads.service_interests` on ingest    |
| City source              | `leads.city` — already a top-level column, no changes needed |
| Helpdesk search method   | Client-side JS filter on full dataset (150 rows loaded once) |
| Dossier card data        | Server Component query (6 rows, indexed, no Redis)           |
| Helpdesk data            | Server Component → Redis (1hr TTL) → Supabase                |
| Phase 1 search method    | `String.includes()` client-side                              |
| Phase 2 search method    | pgvector HNSW cosine similarity via Trigger.dev embeddings   |
| When to trigger Phase 2  | >400 cases AND synonym miss reports from agents              |
| Content prerequisite     | 150 cases + 30 hooks seeded **before** build begins          |
| Admin write access       | `admin` and `founder` only (RLS enforced)                    |
| All-role read access     | Yes — all authenticated roles can SELECT                     |


