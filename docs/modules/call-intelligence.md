# Call Intelligence and the Helpdesk

> **Purpose:** the as-built reference for Call Intelligence: the library of past deliveries and talking points agents use on a live call, its taxonomy, tables, reads, caching, the two surfaces, and how to add content.
> **Audience:** engineers, and whoever writes the library content.
> **Source-of-truth scope:** the module contract. The `/helpdesk` route spec is `../pages/helpdesk.md`; the dossier card's place on the page is `../pages/lead-dossier.md`. Phase 1 shipped 2026-06-12 (migrations 0109, 0110); Phase 2 (semantic search) is not built.
> **Last verified:** 2026-09-26 against `src/lib/services/intelligence-service.ts`, `src/lib/actions/intelligence.ts`, `src/lib/constants/interests.ts`, `src/lib/services/lead-ingestion.ts`, `src/components/intelligence/*`, `src/components/leads/ServiceInterest*.tsx`, `src/app/(dashboard)/helpdesk/page.tsx`, migrations 0109/0110/0210, and the Elaya `get_helpdesk_content` tool on both brains.

---

## 1. What it is

Agents call high-net-worth leads who decide in the first minute whether Indulge is worth their
time. Agents struggled to recall the right past delivery on the spot and fell back on "we can
arrange anything". Call Intelligence gives them specific, city-aware proof and ready lines:

- **Surface A, the dossier card** ("Why we're perfect."): on every lead's page, up to six past
  deliveries matched to the lead's stated interests and city, plus talking points, plus a search
  over the whole library.
- **Surface B, the Helpdesk page** (`/helpdesk`): the full library for one Gia domain, searched
  instantly in the browser, used mid-call when the conversation goes somewhere unexpected.

Both read the same two tables: `service_cases` (the curated deliveries) and
`conversation_hooks` (category talking points). Elaya can read the library too
(`get_helpdesk_content`, §7).

## 2. Taxonomy

Six service categories for the concierge-style domains (`SERVICE_CATEGORY_*` in
`src/lib/constants/interests.ts`). There is no Postgres enum: `service_cases.category` is `text`
and `leads.service_interests` is `text[]`, because shop, house and legacy have their own words.

| Value | Label | Covers |
| ----- | ----- | ------ |
| `travel` | Travel | Custom itineraries, hotels, flights, transfers, travel matched to the member's taste |
| `dining` | Dining | Hard-to-get tables, club entry, private dining, parties |
| `gifts` | Gifts | Rare sourcing, personality-matched gifts, occasion reminders |
| `events` | Events | Sports (F1, IPL, Wimbledon), concerts, once-in-a-lifetime experiences |
| `retail` | Retail | Sold-out and waitlisted items: watches, sneakers, jewellery, yachts, jets |
| `special` | Special Requests | Everything else that is legal where the member is |

**Per-domain interest vocabulary.** `DOMAIN_INTERESTS` in `src/lib/constants/interests.ts` owns
the valid `leads.service_interests` values per domain: onboarding and concierge use the six
above; shop uses watches, perfumes, jewellery, fashion, accessories, art; house uses interior,
renovation, staff, security, smart_home, garden; legacy uses estate, investments, art,
philanthropy, succession, legal. `getDomainInterests(domain)` falls back to the concierge list.
Unknown values are **dropped, never rejected**, so a bad interest string never blocks a lead.

**Tags** are the only fine-grained vocabulary (no subcategories, by decision): city slugs
(`delhi`, `london`), service words (`rolex`, `nanny`, `private_chef`), qualifiers (`48hrs`,
`sold_out`), impressions (`member_loved`). Lowercase, underscores, no spaces, at most ten.
**Every case carries its city slug as a tag**; that is what the dossier's city match reads.

## 3. Data model

All three live in the `gia` schema since 2026-09-17 (migration 0210) and are read through
`giaDb(client)`.

**`gia.service_cases`** (0110): `id`, `domain app_domain`, `category text`, `tags text[]`,
`title` (one claim, up to 120 characters), `summary` (2 to 3 sentences, no member names),
`outcome_note`, `city` and `country` (display), `is_featured`, `sort_order`, `created_by`,
timestamps, a generated weighted `search_vector` (title A; summary, city, country B; tags C,
built through the immutable `public.immutable_array_to_string` wrapper), and
`embedding vector(1536)`, NULL until Phase 2 (no HNSW index yet). Indexes: GIN on
`search_vector` and `tags`, B-tree on category, domain, `lower(city)`, and
`(is_featured, sort_order)`. RLS: every authenticated user can read; insert, update and delete are
admin/founder only.

**`gia.conversation_hooks`** (0110): `id`, `domain`, `category`, `hook` (the line itself),
`context` (when to use it), `sort_order`, `created_at`. RLS: all authenticated read, admin/founder
write.

**`gia.leads.service_interests`** (0109): `text[] NOT NULL DEFAULT '{}'` with a GIN index on
active leads. Separate from `lead_intent` (hot/cold).

## 4. How interests reach a lead

- **Webhooks and WhatsApp:** `extractServiceInterests(formData, domain)` in
  `src/lib/services/lead-ingestion.ts` reads `interest` / `interests` / `service_interest` from
  the form payload (comma string or array), lowercases, and keeps only values in the domain's
  vocabulary. Written on the lead INSERT; `form_data` stays immutable.
- **Add Lead modal:** an optional chip multi-select from `getDomainInterests(domain)`; a domain
  switch drops picks outside the new vocabulary; `createManualLead` re-drops unknowns server-side
  through the same helper.
- **Existing leads:** editable on the dossier (`InterestsInlineField` in `LeadInfoCard` →
  `updateLeadInterests`, same field-edit gate as email and source, logs an activity with old and
  new values). WhatsApp-originated leads start empty, so this is how they light up the card.

## 5. Reads and caching

| Read | Where | Cache |
| ---- | ----- | ----- |
| `getHelpdeskLibrary(domain, client?)` | the full `{ cases, hooks }` for one domain | Redis `helpdesk:cases:{domain}` (`REDIS_KEYS.helpdeskCases`), 1 hour; only a complete read is cached; Redis failure falls through to a live read |
| `getCasesForLead(interests, city, domain, client?)` | up to 6 cases where `category` is one of the interests OR `tags` contains the city slug; `is_featured DESC, sort_order ASC` | none (a small indexed read) |
| `getHooksForCategories(categories, domain, client?)` | hooks for the lead's interest categories | none |

All three take an optional client since 2026-09-26: pages pass nothing (the session client);
Elaya's data seam passes the admin client, because a sessionless caller reads as `anon`, sees
nothing under the `TO authenticated` policy, and would have cached an empty library for an hour
for everyone.

**Why the Helpdesk filters in the browser.** At a few hundred rows the network is the cost, not
the query. The page loads the whole domain library once and filters it synchronously with
`caseMatchesQuery` (`src/lib/utils/case-search.ts`, THE shared matcher). Zero server round trips
per keystroke. This stays right until roughly 500 to 800 cases; past that, swap in a fuzzy client
filter first, then the Phase 2 search. The GIN index on `search_vector` is already there.

## 6. The two surfaces

**Surface A, the dossier card.** `ServiceInterestCardAsync` (server) fetches cases and hooks in
one `Promise.all` behind its own Suspense boundary at the top of the dossier's right column, and
renders `ServiceInterestCard` (client). The card is always mounted: header "Why we're perfect.",
a search box (the first keystroke fetches the domain library once through
`getHelpdeskLibraryAction(lead.domain)`, then filters in the browser, up to 8 results), the
matched `CaseCard`s, the `HookList` talking points (hidden while a search is active), an
inline empty state when nothing matches, and a footer link to `/helpdesk?category=<first
interest>`. The body scrolls inside a 300px cap. Detail: `../pages/lead-dossier.md`.

**Surface B, `/helpdesk`.** Reachable by every signed-in person (`ALWAYS_ALLOWED_PREFIXES`), but
hidden from the concierge sidebar (`DOMAIN_NAV_HIDDEN`, 2026-09-18). Admin and founder pick the
domain shelf with the global domain selector; everyone else reads their own Gia domain, or
`DEFAULT_GIA_DOMAIN` (onboarding) if they are not in one. `HelpdeskSearch` owns the query and the
single-select category pills (composed in the shared `FilterBar`), lists `CaseListRow`s that open
`CaseDetailModal` with everything saved on a case, and shows the category's hooks when a category
is active. Detail: `../pages/helpdesk.md`.

**Writing to the library.** Admin and founder only: `AddSuggestionButton` ("+ Suggestion") opens
`AddSuggestionModal`, THE one create-or-edit form (pass `serviceCase` to edit; the Edit button in
`CaseDetailModal` opens it). It calls `upsertServiceCaseAction` (Zod, `requireProfile(['admin',
'founder'])`, `sanitizeText`, insert or update on `id`, then an awaited delete of the Redis key
for the old and new domain, then `revalidatePath('/helpdesk')`). The service_cases RLS is the
second gate. **Not built:** deleting a case from the UI, and any UI for hooks (hook writes are SQL
only; `upsertConversationHookAction` was removed 2026-07-02 with no callers).

## 7. Elaya

`get_helpdesk_content` is a read tool on both brains (`src/lib/elaya/tools/registry.ts`,
`backend/app/tools/registry.py`). It reads the library through the admin client (the 2026-09-26
fix above). With interests or a city it returns the matched cases and hooks; with neither, a
featured slice, never the whole library. A caller outside the Gia domains reads the onboarding
library and the result names `sourceDomain`, so Elaya labels the material as onboarding's.
Tool contract: `elaya.md`.

## 8. The content

The library was seeded on 2026-06-12 by `scripts/seed-call-intelligence.ts` from
`scripts/data/call-intelligence-seed.json`: 150 cases and 30 hooks for `onboarding` (25 cases
and 5 hooks per category), distilled from the Freshdesk export. The script checks every row
against the table contract (including the city-tag rule) and refuses to re-run without `--force`.
Everything since goes through the admin form. Current row counts: TODO: verify (read-only count
on `gia.service_cases` per domain). The other Gia domains (house, shop, legacy) had no seeded
cases at launch.

Rules for writing a case:

- **Title** is a claim, not a label: "Sourced a Patek Philippe Nautilus in 36 hours when the
  waitlist was 4 years", not "Watch sourcing for member".
- **Summary** is 2 to 3 sentences, past tense, third person: what was done and what made it hard.
- **Never a member's name** or anything that identifies them. No unverifiable claims, no empty
  adjectives ("world-class"), no future tense.
- **Tags**: 4 to 8, always the city slug; `city` holds the display name ("Delhi").
- Mark 2 per category `is_featured` so they surface first.

A good hook is one confident line with proof ("We sourced a Rolex Daytona in 72 hours. The dealer
waitlist was 3 years."), not "we can arrange anything".

## 9. Phase 2: semantic search (not built)

Build it only when **both** hold: the library passes about 400 cases per domain, and agents report
synonym misses ("childcare" not finding `nanny`). The plan: an embeddings provider (none exists
in the codebase; Anthropic has no embeddings endpoint), a job that embeds `title + summary + tags`
on every write into the dormant `embedding` column, an HNSW index created only once the column is
filled, and a search that merges vector and tag results. The column already exists so the move
needs no table rewrite.

## 10. File map

| Area | Path |
| ---- | ---- |
| Reads | `src/lib/services/intelligence-service.ts` |
| Actions | `src/lib/actions/intelligence.ts` (`getHelpdeskLibraryAction`, `upsertServiceCaseAction`) |
| Validation | `src/lib/validations/intelligence-schemas.ts` |
| Vocabulary | `src/lib/constants/interests.ts` (`SERVICE_CATEGORY_*`, `DOMAIN_INTERESTS`, `getDomainInterests`) |
| Matcher | `src/lib/utils/case-search.ts` (`caseMatchesQuery`) |
| Ingestion | `extractServiceInterests` in `src/lib/services/lead-ingestion.ts` |
| Shared components | `src/components/intelligence/` (`CaseCard`, `CaseListRow`, `CaseDetailModal`, `CategoryTag`, `CategoryPill`, `HookList`, `HelpdeskSearch`, `AddSuggestionButton`, `AddSuggestionModal`, `category-icons.ts`); contracts in its `CLAUDE.md` |
| Dossier card | `src/components/leads/ServiceInterestCard.tsx`, `ServiceInterestCardAsync.tsx` |
| Page | `src/app/(dashboard)/helpdesk/page.tsx` |
| Seed | `scripts/seed-call-intelligence.ts`, `scripts/data/call-intelligence-seed.json` |
| Migrations | `20260612000109_leads_service_interests.sql`, `20260612000110_call_intelligence_tables.sql`, `20260917000210_gia_schema.sql` (the move) |

## 11. Invariants

1. No subcategory column. Tags are the fine-grained vocabulary.
2. `service_interests` is `text[]`, never the enum; unknown values are dropped, never rejected.
3. No server search per keystroke on either surface. Filtering is client-side on the loaded
   library, through `caseMatchesQuery`.
4. Every case carries its city slug as a tag.
5. One suggestion form (`AddSuggestionModal`) for create and edit; one action.
6. The Edit and "+ Suggestion" buttons are hidden for non-admins as a courtesy only; the action
   and RLS are the gate.
7. A library write awaits the Redis delete before `revalidatePath` (P-08).
8. A sessionless reader passes the admin client, or the empty result gets cached for everyone.

## 12. Open items

- No delete path in the UI; no UI for hooks.
- Only onboarding was seeded; house, shop and legacy libraries depend on the team adding cases.
  TODO: verify current counts per domain.
- Phase 2 (semantic search) per §9.
