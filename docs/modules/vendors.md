# Vendors

> **Purpose:** the vendor relationship layer. Who we work with, what each vendor does and refuses,
> how every job with them went, how the team rates them, and a live score that picks the best
> vendor for a request.
> **Audience:** engineers (Ethan first, this is the build contract for the vendor PR).
> **Source-of-truth scope:** the vendor data model, the scoring model, and how Elaya reads it.
> **Status:** spec, written 2026-09-04; **built 2026-09-05** on `vendor-master-table` (migrations
> 0182–0184 + the `lib/` layer, all verified locally on a clean Postgres 17.6 container — NOT yet
> applied to prod, no UI yet). Supersedes the shape in PR #3. Where this doc and the code differ,
> the code + `docs/changelog.md` 2026-09-05 win; the deltas are marked **Built:** below.

## Why this doc exists

PR #3 landed a good first cut: a `vendors` table distilled from about 50,000 Freshdesk tickets,
with per-category and per-city usage counts, a trigram name search, and a private invoices
bucket. That answers "who have we used most for Dining in Delhi", and we keep that.

It cannot answer the questions that matter more as the concierge work moves into Serene:

- Who is the *best* vendor for this ticket, not just the most used one.
- What has our relationship with this vendor been, job by job.
- How does this vendor score on speed, reliability, quality, pricing, and how does that score
  move on its own as agents keep working with them.
- Which agent prefers which vendor, and which agent should avoid one.
- What a vendor does and does not do. A travel vendor may be great for visas and useless for
  ticket booking. Some vendors refuse whole ticket types.
- The vision in the Concierge doc: a match score for this vendor against this specific client,
  with a reason, and the top three alternatives.

A row that bakes counts into the vendor can only describe the past and only changes when the
import is rerun. The rule for this module: **facts are rows, scores are computed.** Every
number a person sees is derived from an event ledger, never hand maintained on the vendor row.

This is the same shape the clients spine set in migration 0181: a thin identity table, the raw
import kept untouched in `import_raw`, and the dynamic layer hanging off it in its own tables.

## The shape in one picture

```text
vendors (spine)              one row per vendor. identity, contacts, aliases, status, import_raw
  ├── vendor_capabilities     what it offers / declines, per category + service + cities
  ├── vendor_engagements      APPEND-ONLY. one row per ticket or job we did with the vendor
  ├── vendor_reviews          APPEND-ONLY. a team member rating one engagement or the vendor
  └── vendor_notes            APPEND-ONLY. free-text commentary, authored and timestamped
vendor-invoices bucket       private. PDFs referenced from vendor_engagements.invoice_paths

score  = computed over engagements + reviews (never stored on the spine)
rank   = capabilities filter → score → top N with reasons
```

## Data model

Migration numbers: 0182, 0183, 0184 with today's date prefix. **0179 and 0180 are taken and
applied on prod** (the Elaya brain switch and the shop product enquiries); 0181 is the clients
spine. The Supabase CLI matches on the version number, so a file reusing 0179 is silently skipped.

### `vendors` (0182): the spine

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK `gen_random_uuid()` | Not bigint. Sia's `wag_groups.vendor_id` and `wag_contacts.vendor_id` (0169) are `uuid` and wait for this table. 43 of 46 tables use `id uuid`. |
| `name` | `text` not null | Display name as we know the vendor. |
| `name_key` | `text` generated `lower(btrim(name))` unique | The dedup identity, the `subscription_tools` (0168) pattern. |
| `aliases` | `text[]` not null default `{}` | Spelling variants seen in tickets. GIN index. Keep from PR #3. |
| `category` | `text` | What the vendor sells. A `SERVICE_CATEGORY` slug from `lib/constants/interests.ts` where it maps (`travel`, `dining`, `gifts`, `events`, `retail`, `special`), else the raw Freshdesk label. |
| `subcategory` | `text` | Free text. |
| `category_source` | `text` CHECK `hand` / `rule` / `ticket-category` | Keep from PR #3. |
| `status` | `text` not null default `active` CHECK `active` / `paused` / `blacklisted` | `paused` = do not suggest for now. `blacklisted` = never suggest, and the ranker says why. |
| `contacts` | `jsonb` not null default `[]`, CHECK `jsonb_typeof = 'array'` | `[{ name: string \| null, phones: string[], emails: string[] }]`. Phones are **E.164** (Rule 06, `normalizeToE164()` in the loader). A null name is the vendor's general line, keep that. |
| `primary_phone` | `text` | E.164, nullable. Partial index. This is how Sia matches a WhatsApp contact to a vendor. |
| `home_city` | `text` | Where the vendor is based. Cities served come from engagements and capabilities, not from here. |
| `identity_status` | `text` not null default `unverified` CHECK `unverified` / `verified` | Same meaning as clients. The merged names from the Freshdesk clean-up stay unverified until a human confirms. |
| `sources` | `text[]` not null default `{}` | `freshdesk`, `sia`, `manual`. |
| `import_raw` | `jsonb` not null default `{}` | **PR #3's computed row goes here untouched**: `ticket_categories`, `service_cities`, `agents`, `invoices`, `times_used`, `first_used`, `last_used`, `invoice_count`. It stays as the audit trail of the import. Nothing reads it for ranking once engagements are loaded. |
| `notes` | `text` | Free text about the vendor. |
| `created_at`, `updated_at` | `timestamptz` | `update_updated_at()` trigger, never recreated. |

Indexes: `gin (name extensions.gin_trgm_ops)` (the full 0098 pattern, opclass schema-qualified),
`gin (aliases)`, `(category)`, `(status)`, `(primary_phone) where primary_phone is not null`.

Same migration wires the Sia hooks, the 0181 way:

```sql
alter table sia.wag_groups   add constraint wag_groups_vendor_fk
  foreign key (vendor_id) references public.vendors(id) on delete set null;
alter table sia.wag_contacts add constraint wag_contacts_vendor_fk
  foreign key (vendor_id) references public.vendors(id) on delete set null;
```

### `vendor_capabilities` (0182): what it does and refuses

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `vendor_id` | `uuid` FK `vendors` on delete cascade | |
| `category` | `text` not null | `SERVICE_CATEGORY` slug or domain vocabulary (`getDomainInterests`). |
| `service` | `text` | The finer service inside the category: `visa`, `ticket_booking`, `hotel`, `chauffeur`. Null = the whole category. Vocabulary is a `defineEnum` in `lib/constants/vendors.ts`, grown as we learn. |
| `stance` | `text` not null CHECK `offers` / `declines` | `declines` is how "this vendor does not want these tickets" is recorded. The ranker hard-excludes it. |
| `cities` | `text[]` not null default `{}` | Where this capability applies. Empty = anywhere. |
| `note` | `text` | "Only weekday deliveries", "minimum 48h notice". |
| `set_by` | `uuid` FK `profiles` | Null when seeded by the import. |
| `created_at`, `updated_at` | | |

Unique on `(vendor_id, category, coalesce(service, ''))`. Seeded from PR #3's per-category counts
as `offers` rows. `declines` rows only ever come from a human.

### `vendor_engagements` (0184): the ledger, append-only

One row per ticket or job we did with a vendor. This is the table every score reads.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `vendor_id` | `uuid` FK `vendors` not null, **on delete restrict** | **Built:** a vendor with history is never hard-deleted (blacklist it); a merge script re-points rows first. |
| `client_id` | `uuid` FK `clients` on delete set null | The human this job was for. This is what makes the client-vs-vendor match score possible later. Null when the Freshdesk contact did not map to a client. |
| `lead_id` | `uuid` FK `leads` on delete set null | Gia-side hook for pre-won work. Usually null. |
| `agent_id` | `uuid` FK `profiles` on delete set null | The staff member who ran the job. Resolved from the Freshdesk agent name against `profiles.full_name` at load time. |
| `agent_name_raw` | `text` | The name as Freshdesk had it, kept when no profile matched (ex-staff). Never shown as a person, only as history. |
| `category` | `text` not null | Same vocabulary as capabilities. |
| `service` | `text` | |
| `city` | `text` | |
| `source` | `text` not null CHECK `freshdesk` / `sia` / `manual` / `ticket` | `ticket` is reserved for the in-app ticketing that Sia will bring. |
| `source_ref` | `text` not null | Freshdesk ticket id, WhatsApp message id, or the manual row's own id. **Unique on `(source, source_ref)`**, the `lead_product_enquiries.external_lead_id` idempotency pattern: rerunning the loader is safe. |
| `started_at` | `timestamptz` not null | Ticket opened / job requested. |
| `closed_at` | `timestamptz` | Job finished. |
| `outcome` | `text` not null default `unknown` CHECK `completed` / `cancelled` / `failed` / `unknown` | Feeds reliability. |
| `amount_inr` | `numeric` | What we paid, INR only, never auto-converted (the subscriptions currency rule). |
| `invoice_paths` | `text[]` not null default `{}` | Paths in the `vendor-invoices` bucket. **Every invoice PDF from the archive becomes a path on its ticket's engagement**, so the 1 GB upload is fully referenced instead of 5 per vendor. |
| `note` | `text` | |
| `created_by` | `uuid` FK `profiles` on delete set null | **Built:** who logged it (null for imports) — distinct from `agent_id`, who ran it. |
| `created_at` | `timestamptz` | |

**Built:** `response_hours` and `on_time` were dropped — Freshdesk never recorded either, so
they would only ever have been null. Speed and reliability are manual review dimensions.

Indexes: `(vendor_id, started_at desc)`, `(client_id) where client_id is not null`,
`(agent_id) where agent_id is not null`, `(category, city)`.

**Append-only (Rule 08, A-11).** No user UPDATE or DELETE policy. One carve-out, logged in the
Decision Log when 0184 ships: a service-role UPDATE that **closes** an open engagement (`closed_at`,
`outcome`, `amount_inr`, `invoice_paths`, `note`), the resolve-once posture of
`revival_candidates` — `closeEngagementCore`, `WHERE closed_at IS NULL`, exactly once. Rows from the Freshdesk archive arrive already closed and are never touched.

### `vendor_reviews` (0184): append-only

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `vendor_id` | `uuid` FK not null | |
| `engagement_id` | `uuid` FK `vendor_engagements` | Null for a general review. |
| `reviewer_id` | `uuid` FK `profiles` not null | |
| `speed`, `quality`, `pricing`, `reliability` | `smallint` CHECK 1..5, each nullable | **Built:** four dimensions — `communication` dropped (founder call 2026-09-05). A CHECK requires at least one rating or a comment. | Columns, not a jsonb bag, so the score is one `avg()` per dimension. The dimension list is `REVIEW_DIMENSIONS` in `lib/constants/vendors.ts`; adding one is a column migration. |
| `comment` | `text` | Sanitized (Rule 06). |
| `created_at` | `timestamptz` | |

No UPDATE or DELETE. A changed mind is a new review; the score uses the latest per reviewer per
engagement (`DISTINCT ON` inside `get_vendor_score_inputs`). `reviewer_id` FK is `on delete restrict`;
`vendor_id` FK is `on delete restrict` (ledger). A review on an engagement takes `vendor_id` FROM
the engagement (`addReviewCore`) so the two can never disagree.

### `vendor-invoices` bucket (0183)

Keep PR #3's migration nearly as is: private bucket, provisioned in SQL, flat paths keyed on the
Freshdesk `attachment_id`, no write policy (service-role only), reads via admin-client signed
URLs. Two changes: the number, and the SELECT policy narrows to the vendor audience below.

## Access and RLS

Vendor contacts are business data, but the invoices carry pricing and the engagement ledger
carries client ids. The clients spine chose admin/founder only. Vendors need a wider floor,
because the concierge and shop teams are the ones picking vendors all day.

**Decided 2026-09-05 (founder): admin/founder only, for now.**

- SELECT on all five tables and the bucket: `(SELECT get_user_role()) IN ('admin','founder')`
  (the 0181 clients posture). The concierge / shop floor widens this with the Sia UI — one
  migration on the five policies + one line (`VENDOR_ROLES`) in `actions/vendors.ts`.
- The service layer reads on the **admin client** (the ranker also serves sessionless Elaya
  turns), so the gated action / Elaya principal is the trust boundary; RLS is its mirror.
- No user write policies anywhere (the deals posture). Writes go through `lib/actions/vendors.ts`
  on the admin client behind `requireProfile()`; the action is the trust boundary.
- Bulk import and backfill run on the admin client from `scripts/`.

Route: a `/vendors` page lands with the Sia UI, not in this tranche. Until then Elaya is the
surface.

## Scoring

Scores are **computed, never stored on `vendors`** (the subscriptions status pattern). Phase 1
computes in the service layer over one SQL rollup per vendor; if it is slow on 21,800 vendors,
Phase 2 adds a materialized rollup refreshed by a Trigger.dev schedule (the revival sweep
pattern). The row shape does not change between phases.

Inputs, all derived, over a rolling 12 months unless stated:

| Signal | Derived from | What it says |
| --- | --- | --- |
| Volume | count of engagements, per category and per city | "who have we used most" (PR #3's lookup, now live) |
| Recency | max `started_at` | still an active relationship |
| Reliability | `completed` over `completed + failed + cancelled` | does what it says |
| Reviews | avg of the filled manual dimensions (`speed`, `quality`, `pricing`, `reliability`), latest per (reviewer, engagement) | the team's judgement |
| Team sentiment | count `preferred` minus count `avoid`, over those who spoke | the floor's gut |

**Built:** `SCORE_WEIGHTS` = volume 2.5 · recency 1.5 · reliability 2.5 · reviews 2.5 ·
sentiment 1.0 (sum 10). A component with NO data (no decided outcomes, no reviews, no
preferences) is dropped and the rest renormalise — never a fake neutral. The one SQL rollup is
`get_vendor_score_inputs` (0184, Q-13 revoked tier); the weighting is `computeVendorScore` in
`lib/utils/vendor-score.ts`, so tuning a weight is never a migration.

Output: a 0 to 10 score plus a **reasons list**, the same shape the Concierge vision shows in the
sidebar ("8.5, matches budget and route preference; note: chose a different operator last time").
Weights live in `SCORE_WEIGHTS` in `lib/constants/vendors.ts` for Phase 1; they move to a config
table (the `revival_policies` pattern) the day someone wants to tune them without a deploy.

**Client match score (the vision, Phase 2):** the same function takes an optional `clientId` and
adds that client's own history with the vendor: engagements, outcomes, complaints in reviews.
Nothing new is stored for this; it is why `vendor_engagements.client_id` exists from day one.

## The ranker: "best vendor for this ticket"

One service function, the only ranking in the codebase (R-01):

```ts
rankVendorsForRequest({
  category, service?, city?, clientId?, agentId?, limit = 5,
}) → { vendor, score, reasons[], flags[] }[]
```

1. Candidates: `status = 'active'`, a `vendor_capabilities` row with `stance = 'offers'` for the
   category (and service when given), no `declines` row for it, cities empty or containing the
   city.
2. Score each candidate.
3. Agent layer: an `avoid` preference for `agentId` removes the vendor and says so in `flags`;
   `preferred` adds a fixed boost and a reason.
4. Return the top N with reasons. A `paused` or `blacklisted` vendor never appears, and
   `get_vendor_details` tells the agent why when asked directly.

Elaya's tool, the future ticket screen in Sia, and the Chrome extension all call this one
function. None of them re-rank.

## Elaya

Read tools in `lib/elaya/tools/registry.ts`, role-gated like the rest, every result through
`maskPii()` (vendor phones are still phones):

| Tool | Roles | Wraps |
| --- | --- | --- |
| `find_vendors` | concierge + shop staff, manager+ elsewhere | `rankVendorsForRequest` |
| `get_vendor_details` | same | spine + capabilities + last 10 engagements + score with reasons |

Write tools, later, in `write-registry.ts`: `review_vendor` (inline, wraps the review core),
`set_vendor_preference` (inline). Both follow the core rule: the tool and the action call the
same function in `lib/services/vendor-mutations.ts`.

## How data gets in, and stays fresh

1. **Backfill (Ethan's loader).** The stage scripts move into `scripts/vendors/` so the import is
   reproducible in the repo, like `import-clients-and-map-groups.py`. Each Freshdesk ticket that
   used a vendor becomes one `vendor_engagements` row (`source = 'freshdesk'`,
   `source_ref = ticket id`, agent resolved against `profiles`, client resolved against
   `clients.freshdesk_contact_id`, every invoice attachment on `invoice_paths`). Capabilities are
   seeded from the per-category counts. The computed row goes to `import_raw`.
2. **Sia.** When a vendor WhatsApp group is mapped (`wag_groups.vendor_id`), the group mapper
   fills `primary_phone` and contacts. Later, Sia's meaning layer emits engagements with
   `source = 'sia'`.
3. **Tickets.** When in-app tickets exist, closing one with a vendor attached writes the
   engagement (`source = 'ticket'`) and asks the agent for a one-tap review. This is the moment
   the score moves by itself.
4. **Manual.** `logVendorEngagement`, `reviewVendor`, `setVendorPreference`,
   `setVendorCapability` actions, and the Elaya writes, for everything in between.

## File map (built 2026-09-05; `scripts/vendors/` and the Elaya tools are still to come)

```text
supabase/migrations/20260905000182_vendors.sql                 vendors + vendor_capabilities + Sia FKs
supabase/migrations/20260905000183_vendor_invoices_bucket.sql  PR #3's bucket, renumbered, read narrowed to admin/founder
supabase/migrations/20260905000184_vendor_ledger.sql           engagements + reviews + get_vendor_score_inputs RPC
src/lib/utils/vendor-score.ts       computeVendorScore + vendorFlags — the pure score math (no DB)
src/lib/constants/vendors.ts        VENDOR_STATUS, CAPABILITY_STANCE, ENGAGEMENT_SOURCE/OUTCOME,
                                    REVIEW_DIMENSIONS, VENDOR_SERVICES, SCORE_WEIGHTS
                                    (all via defineEnum where they are simple id/label lists)
src/lib/validations/vendor-schema.ts
src/lib/types/vendor.ts
src/lib/services/vendors-service.ts        reads: search, details, rankVendorsForRequest, score rollup
src/lib/services/vendor-mutations.ts       cores: create/update/status, capability, log + close engagement, review, preference
src/lib/actions/vendors.ts                 Zod → requireProfile(['admin','founder']) → actorFromProfile → core → { data, error }
src/lib/elaya/tools/registry.ts            find_vendors, get_vendor_details          ← NOT YET (deferred with the parity/Python conflicts)
scripts/vendors/                           Ethan's loader + bucket upload, checked in ← NOT YET
```

## Decisions (founder, 2026-09-05)

1. **Read audience.** Admin/founder only for now; widens with the Sia UI.
2. **Review dimensions.** `speed`, `quality`, `pricing`, `reliability` — four, all manually
   entered (none exist in Freshdesk). `communication` dropped.
3. **Score weights.** `SCORE_WEIGHTS` in `lib/constants/vendors.ts` (volume 2.5 · recency 1.5 ·
   reliability 2.5 · reviews 2.5 · sentiment 1.0). Tune there; a config table later if needed.
4. **Category mapping.** Still Ethan's — the loader's job (`scripts/vendors/`, not built yet).
   `VENDOR_SERVICES` starts with a modest list and has no SQL CHECK so it grows without a migration.
5. **Blacklist authority.** Admin/founder only — the same `VENDOR_ROLES` gate as every other write.

**Deferred, by the founder's call:** the Elaya tools (the `elaya-data.ts` parity rule + the
Python-brain double-implementation conflicts), the `/vendors` UI (the founder supplies it), the
loader rewrite, and the stale “NOT yet applied” markers in the migrations ledger.

## What we keep from PR #3, unchanged in spirit

The per-category ranking idea (now a query over engagements), the trigram name search, the
aliases, the null-name general contact lines, the private bucket in a migration, the
`jsonb_typeof` checks, the container verification habit, and the changelog discipline.
