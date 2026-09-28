# Vendors

> **Purpose:** the vendor book. Who Indulge works with, what each supplier does and refuses, every job
> we gave them, how the team rates them, a live score, and the one ranking that picks the best vendor
> for a request. Also the one home for the three vendor pages (`/vendors`, `/vendors/[id]`,
> `/vendors/find`).
> **Audience:** engineers working on vendors, tickets or Elaya's vendor tools.
> **Source-of-truth scope:** the vendor data model, access, scoring and ranking, the live extractor,
> the review / merge / remove workflow, and the vendor pages. Tickets, Elaya and the Freshdesk mirror
> have their own docs and are linked, not repeated.
> **Last verified:** 2026-09-26 against `supabase/migrations/` 0183 to 0192, 0214, 0221, 0227 to 0230,
> `src/lib/services/vendors-service.ts`, `vendor-mutations.ts`, `vendor-extract.ts`,
> `vendor-extract-sync.ts`, `vendor-search-intent.ts`, `ticket-vendor.ts`, `src/lib/utils/vendor-score.ts`,
> `src/lib/constants/vendors.ts`, `src/lib/actions/vendors.ts`, `src/components/vendors/`,
> `src/app/(dashboard)/vendors/`, `src/trigger/vendor-extract.ts` and the two Elaya tool registries.

## What it is

About 21,600 suppliers (hotels, restaurants, florists, drivers, ticket agents, the people behind them)
with 46,000+ past jobs, distilled from the Freshdesk archive and kept current by a job that reads new
Freshdesk notes. The rule of the module: **facts are rows, scores are computed.** Nothing a person sees
as a number is stored on the vendor row; it is derived from the job ledger and the reviews every time
it is read.

How it got here:

| When | What | Migrations |
| --- | --- | --- |
| 2026-09-11 / 09-12 | PR #3: the tables, the Freshdesk archive import, the three pages, Find a vendor, Elaya's two read tools. Data loaded on production 2026-09-11, code merged 2026-09-12. | 0183 to 0192 (plus the `0000` base enums) |
| 2026-09-17 / 09-18 | PR #4: the live extractor reads new Freshdesk notes into the tables. Running on production since 2026-09-18. | 0214 |
| 2026-09-18 | The module opens to the whole concierge domain. Tickets gain a vendor. | 0221 |
| 2026-09-19 | Elaya's vendor tools opened to the same audience (gated per person). | none |
| 2026-09-21 | PR #5: contact search, merge, remove / restore, the Find-a-vendor timeout and category fix, and the review workflow ("Needs a look", "Looks right"). | 0227 to 0230 |
| 2026-09-25 | Find a vendor rebuilt as one search card and one "Best matches" card. | none |

## The shape in one picture

```text
vendors (spine)                one row per supplier: identity, contacts, aliases, status, import_raw
  ├── vendor_capabilities       what it offers / declines, per request category + service + cities
  ├── vendor_engagements        the ledger. one row per job (vendor, source, source_ref) = unique
  ├── vendor_reviews            append-only. a teammate rating a job (4 dimensions) or the vendor
  ├── vendor_notes              append-only. free-text notes, authored and timestamped
  └── vendor_agent_preferences  one teammate's sticky note: preferred / avoid + a line of why
vendor_merges                  append-only. every merge, with the deleted row in full
vendor_removals                append-only. every Remove, deleted or hidden, with the row in full
vendor-invoices bucket         private. bills referenced from vendor_engagements.invoice_paths
freshdesk.conversations        + vendor_extracted_at / vendor_extract_attempts = the extractor's queue

score = computed per read from one SQL rollup (never stored)
rank  = past-job title search (or capability fallback) → score → personal layer → top N with reasons
```

Vendors live in `public`. They were not moved by the 2026-09-17 schema restructure (they are in
neither `GIA_TABLES` nor `MEMBER_TABLES`); only `vendor_engagements.client_id` was renamed
`member_id` (0202).

## Data model

### `vendors` (0183, widened by 0214, 0227)

| Column | Notes |
| --- | --- |
| `id` | `uuid` PK. `sia.wag_groups.vendor_id`, `sia.wag_contacts.vendor_id` and `sia.tickets.vendor_id` point here (`ON DELETE SET NULL`). |
| `name`, `name_key` | `name_key = lower(btrim(name))`, generated, UNIQUE. The dedup identity. |
| `aliases` | `text[]`, GIN index. Spelling variants. A merge adds the loser's name here, so the extractor matches that spelling next time. |
| `category` | What the supplier IS, free text (no CHECK). The 11 built-ins are `VENDOR_CATEGORIES`; a category added by hand in the UI is as real as a built-in. |
| `subcategory`, `category_source` | `category_source` CHECK: `hand`, `rule`, `ticket-category`, `unresolved`, `client-excluded`. |
| `status` | `active` (default) / `paused` / `blacklisted`. The ranker only returns `active`. |
| `contacts` | `jsonb` array of `{ name, phones[], emails[] }`. A null name is the vendor's general line. Phones E.164. |
| `primary_phone`, `home_city` | `primary_phone` is the strongest matching key for the extractor. |
| `identity_status` | `unverified` (default) / `verified`. Archive imports and extractor rows are born `unverified`; "Looks right" is the one write that verifies (one way only). |
| `freshdesk_ref` | Freshdesk reference kept from the import. |
| `sources` | `text[]` CHECK over `VENDOR_SOURCES`: `freshdesk` (the archive), `freshdesk_live` (the extractor), `sia`, `manual`, `ticket`. |
| `import_raw` | `jsonb` object. The archive import's computed row, and under `freshdesk_live` the extractor's evidence (ticket id, the quote it read, near-miss names). Read only through `readExtractionEvidence()`. |
| `notes` | Free text from the import. Team notes live in `vendor_notes`. |
| `search_text`, `search_key` | Generated (0187, re-pointed in 0227): name, aliases, subcategory, home city, primary phone, and contact names and phones. Trigram-indexed. Emails are left out on purpose ("gmail" matches thousands of rows). |
| `deleted_at`, `deleted_by` | 0227. Set = hidden: out of the list, search, Find a vendor and every ranking, but every fact kept and restorable. |
| `created_at`, `updated_at` | `update_updated_at()` trigger. |

### `vendor_capabilities` (0183)

What a vendor offers or declines: `category` (a `REQUEST_CATEGORIES` value, the Freshdesk ticket
vocabulary), `service` (a `VENDOR_SERVICES` value or null for the whole category), `stance`
(`offers` / `declines`), `cities` (empty = anywhere), `note`, `set_by` (null for machine writes).
Unique on `(vendor_id, category, coalesce(service, ''))`. Seeded as `offers` from the archive's
per-category counts; the extractor adds rows as it learns. A `declines` row is hard-excluded by
every search path. Editable config, CASCADE on delete.

Two category vocabularies exist and never join: `VENDOR_CATEGORIES` answers "what is this supplier"
(browsing), `REQUEST_CATEGORIES` answers "what was the request filed under" (the ranker). A hotel is
Hospitality but is booked through Travel tickets. See the comment block in `constants/vendors.ts`.

### `vendor_engagements` (0185): the ledger

One row per job: `vendor_id` (`ON DELETE RESTRICT`), `member_id`, `lead_id`, `agent_id`,
`agent_name_raw` (the Freshdesk agent name when no Serene profile matches), `title` (the ticket
subject, which is what the history search reads), `category`, `service`, `city`, `source`,
`source_ref`, `started_at`, `closed_at`, `outcome` (`completed` / `cancelled` / `failed` /
`unknown`), `amount_inr` (INR only, never converted), `invoice_paths`, `note`, `created_by`.

- **Unique on `(vendor_id, source, source_ref)`.** One job per vendor per ticket; re-running any
  writer is safe.
- **Append-only, with two sanctioned existing-row writes** (Decision Log): `closeEngagementCore`
  closes an open job exactly once (`closed_at`, `outcome`, amount, files, note), and
  `logEngagementCore`'s provenance path refines a repeat of the same ticket (fills empty fields,
  never overwrites, never changes the id). `merge_vendors` may also fold a duplicate job into its
  twin (the A-11 exception of 2026-09-19).
- Archive rows have `member_id` NULL (the export never carried the requester). Extractor and ticket
  rows carry the member from the mirrored or Serene ticket.

### `vendor_reviews` (0185)

Append-only. `vendor_id`, optional `engagement_id`, `reviewer_id`, four 1 to 5 ratings (`speed`,
`quality`, `pricing`, `reliability`, each nullable; `REVIEW_DIMENSIONS`), `comment`. A CHECK needs at
least one rating or a comment. The score takes the latest review per (reviewer, job) and averages
across reviewers, so a teammate who rates a later job adds a review rather than replacing their
first. A review on a job takes its `vendor_id` from the job, so the two cannot disagree.

### `vendor_notes` (0186)

Append-only team notes: `vendor_id` (CASCADE), `author_id`, `content`, `created_at`.

### `vendor_agent_preferences` (0191): the sticky note

One teammate's stance on one vendor, `preferred` or `avoid`, with an optional note (max 500
characters). One row per (vendor, teammate), editable, CASCADE on both sides. It feeds the score's
`sentiment` component, the ranker's personal layer and the team's takes on the vendor page. See
**Scoring** and **The ranker**.

This table exists today. A 2026-09-07 changelog entry says it was "removed entirely"; that removal
was reversed on 2026-09-11 (review round one, item 4) because the founder's original brief asked for
it, and 0191 re-created it.

### `vendor_merges` (0227) and `vendor_removals` (0230)

Both append-only, RLS on, service-role writes only.

- `vendor_merges`: `kept_vendor_id`, `merged_vendor_id` (no FK, the row is gone), `merged_name`,
  `merged_row` (the deleted spine row in full), `moved` (counts), `merged_by`. It is also the trail
  that lets an old vendor id still land on the keeper.
- `vendor_removals`: `vendor_id` (no FK), `vendor_name`, `mode` (`deleted` / `hidden`), `vendor_row`,
  `history` (jobs, reviews, notes at the moment of the decision), `removed_by`. For a deleted vendor
  this row is the only surviving copy.

### `vendor-invoices` bucket (0184)

Private. Keys are the Freshdesk attachment id, so a vendor row can be rebuilt without stranding its
files. No write policy (service role only). Reads mint a one-hour signed URL per click
(`signVendorInvoiceAction`); a URL is never stored.

### The RPCs

All service-role only (Q-13 revoked tier); the app calls them on the admin client behind its own
gate.

| Function | Migration | What it does |
| --- | --- | --- |
| `get_vendor_score_inputs` | 0185, re-declared 0191 | The one rollup per vendor: windowed volume, category and city counts, recency, outcomes, review averages, `preferred_count` / `avoid_count`, all-time `total_used`. Asked for up to 500 ids per call. |
| `get_vendor_agent_usage`, `get_vendor_category_usage` | 0185 | "Used most by" and "Ticket categories handled" on the vendor page. |
| `search_vendors`, `count_vendors` | 0187, 0227 | The list page and every name search. Same predicate, so the pager and rows agree. Exclude removed vendors. |
| `get_vendor_categories`, `get_vendor_cities` | 0187, 0192 | Vocabularies, returned as one `text[]` so no row cap applies. |
| `get_vendor_candidates` | 0188, 0192, 0227 | The capability fallback set. `ORDER BY id` so `callAdminRpcAll` can page it past the 1,000-row response cap. |
| `find_vendors_by_history` | 0189, 0190, 0228, 0229 | Searches the titles of past jobs. See **The ranker**. |
| `merge_vendors` | 0227 | The one-transaction merge. |
| `remove_vendor` | 0230 | Delete-or-hide, decided inside the transaction. |
| `immutable_contact_search_text` | 0227 | Helper for the generated search columns. |
| `can_access_vendors()` | 0221 | The SQL mirror of the access rule; every vendor SELECT policy uses it. |

For Elaya's read-only SQL, `elaya_read.vendors`, `vendor_jobs`, `vendor_reviews` and
`vendor_capabilities` expose clean columns (0223). See [elaya-analyst.md](elaya-analyst.md).

## Access

One rule, three places that say it:

| Layer | Where | Who |
| --- | --- | --- |
| Pages | `hasVendorAccess(profile)` in `src/lib/utils/route-access.ts` | admin, founder, the whole concierge domain (any role), and the tech workbench (page only) |
| Actions and Elaya | `hasVendorActionAccess(profile)` (the same file); `requireVendorAccess()` in `actions/vendors.ts`; `canAskAboutVendors` in `elaya-data.ts` | admin, founder, the whole concierge domain |
| Database | `public.can_access_vendors()` (0221), used by the SELECT policy on every vendor table and the invoice bucket | same as actions |

Exceptions, all admin/founder only (`requireProfile(['admin','founder'])`) because they are the
writes that are not additive: `setVendorStatusAction` (pause / blacklist takes a vendor out of
everybody's ranking), `mergeVendorsAction`, `removeVendorAction` and `setVendorDeletedAction`
(restore). `verifyVendorAction` ("Looks right") is open to everyone with vendor access.

There are no user write policies. Every write goes through an action (Zod, the gate,
`actorFromProfile`, a core in `vendor-mutations.ts`, `revalidatePath`) on the admin client. The
service reads on the admin client too, because the ranker also serves sessionless Elaya turns on
WhatsApp; the caller's gate is the trust boundary and RLS is its mirror.

`/vendors` is in the concierge list of `DOMAIN_ROUTE_MAP` and in `FOUNDER_NAV_PREFIXES`, so both see
it in the sidebar.

## The pages

All three are server pages that redirect to `/login` without a session and to `/dashboard` when
`hasVendorAccess` is false. Each has a `loading.tsx`.

### `/vendors`: the list

- **Header:** title with the page dot, a **Find a vendor** link, and **Add vendor**
  (`AddVendorButton` → `AddVendorModal`). Add vendor has six fields: Name and Category required;
  What they do, Phone, Email, City optional. "What they do" writes an `offers` capability as a second
  write, because a vendor with no capability never shows up in the fallback ranking. The category
  select ends in "+ Add a category".
- **"Needs a look"** (`VendorReviewQueue`): the eight newest vendors the extractor wrote that nobody
  has confirmed (`identity_status = unverified`, `sources` holds `freshdesk_live`, not removed), with
  the ticket, the words the model read and its near-miss names, plus the total count. Archive rows
  are also unverified but are left out, or they would drown it. Renders nothing when empty.
- **Filter strip** (`VendorsFilters` over the shared `FilterBar` + `useUrlFilters`): search and
  category, URL-driven (`?search=`, `?category=`, `?page=`).
- **Table** (`VendorsTable`, display-only): Vendor, Category, City, Times used, Score. A row opens the
  vendor page with `?from=` so Back returns to the same filters. The score shows an em dash until
  someone has judged the vendor; a paused or blacklisted vendor shows its status in that cell.
- **Pager:** the shared `ui/Pagination`, 30 a page (`VENDOR_LIST_PAGE_SIZE`).
- **Data:** `listVendors()` = `search_vendors` + `count_vendors` + one `get_vendor_score_inputs` call
  for the page's ids; `getVendorCategories()`; `listVendorsNeedingReview()`. No Redis;
  `revalidatePath` on every write.

### `/vendors/[id]`: the vendor page

- **Back** goes to `?from=` when it starts with `/vendors`, else to the list.
- **An id that no longer exists:** `resolveMergedVendorId()` follows the `vendor_merges` trail (up to
  five hops) and redirects to the keeper; otherwise 404.
- **Header:** the vendor name, and `VendorAdminActions` (Merge in, and Remove or Restore) for
  admin, founder and the tech workbench. See **Keeping the book clean**.
- **Review banner** (`VendorVerifyBanner`) on an extractor row that is unverified and not removed:
  the ticket it came from, the quote the model read, the likely duplicates, and **Looks right**.
- **Removed banner** when `deleted_at` is set. A hidden vendor still opens by direct link, because
  that is how someone restores it.
- **Top row** on the shared `.serene-dossier-grid`: `VendorIdentityCard` (status pill, category chip
  that is also the editor `VendorCategoryPicker`, contacts, what it offers and declines, ticket
  categories handled, "Used most by") and `VendorScoreCard` (the 0 to 10 `VendorScoreRing`, times used,
  the four dimensions as `StarRating` rows, and "Your take", the `VendorPreferenceControl` with the
  team's takes beneath). The ring and the stars are deliberately different shapes so a computed score
  and a human rating are never confused.
- **Below:** `VendorNotesCard` (append a note, optimistic, the draft survives an error) and
  `VendorInvoicesCard` (the five most recent bills with the total; Open mints a signed URL).
- **Data:** one `getVendorDetail()` (spine, capabilities, 20 recent jobs, 20 recent reviews, the
  score inputs, notes, usage, invoices, preferences), `getVendorInvoices()`, `getVendorCategories()`,
  and `getLikelyDuplicates()` when the banner or the admin actions need it.

### `/vendors/find`: Find a vendor

`FindVendorPanel` on one search card: a line on how the ranking works, one field with Find inside it,
three example requests while the box is empty, and "understood as" chips once typing. The chips come
from a local keyword parse against our own vocabularies and the cities we actually serve
(`getVendorCities()`); a person can clear or correct them, and they are never required. Find calls
`rankVendorsAction`, which passes the caller as the asking teammate. The answer is one "Best matches"
card (`VendorMatches`): rank, score ring, name, the reasons, any cautions as chips. The request rides
along as `?q=` so returning from a vendor page re-runs it.

## Scoring

`computeVendorScore()` in `src/lib/utils/vendor-score.ts` is the pure score math (no DB, safe on the
client). It reads one row of `get_vendor_score_inputs`. Engagements are windowed to 12 months
(`SCORE_WINDOW_MONTHS`); reviews and marks are all-time.

| Component | Weight | Signal |
| --- | --- | --- |
| volume | 2.5 | jobs in the window (in the asked category when there is one), log-saturating at 20 |
| recency | 1.5 | 1 when used this month, down to 0 at the window's edge |
| reliability | 2.5 | completed over completed + failed + cancelled; only when a job has a decided outcome |
| reviews | 2.5 | average of the filled dimensions, mapped 1..5 to 0..1 |
| sentiment | 1.0 | (preferred - avoid) over the teammates who marked it, mapped to 0..1 |

Weights are `SCORE_WEIGHTS` in `constants/vendors.ts` (sum 10). A component with no data is dropped
and the rest renormalise, never a fake neutral. Every component that has data adds one plain reason
("Used 12 times in the last 12 months", "Rated 4.2/5 across 3 reviews").

**The displayed score waits for a judgement.** Volume and recency are activity, not quality. Until a
vendor has a review or a job with a decided outcome, `score` is null (an em dash on screen, "nobody
has rated them" to Elaya) while `ranking` still orders the list. A preference mark alone does not
unlock the displayed score.

`vendorFlags()` adds cautions without excluding: failed jobs in the window, "N teammates marked
avoid", and "Identity not yet verified".

The member-match idea from the spec exists only as one reason: "Used N times for this member before"
when the request names a member.

## The ranker

`rankVendorsForRequest()` in `vendors-service.ts` is the only ranking in the codebase (R-01). The
`/vendors/find` page, the ticket page's suggestions, Elaya's `find_vendors` and the MCP connector
all call it; none re-rank.

1. **Read the request** (`readVendorRequest()` in `vendor-search-intent.ts`): one routing-tier call
   (Haiku through the Elaya provider, no tools, about 1.3 s and ₹0.03) returns category, service,
   city and 3 to 8 search terms, most important first. The model never names a vendor. Its category
   and service are display only, never filters (a wrong guess would empty the search); its city is
   trusted when the caller gave none. Fails open: any failure returns null and the raw phrase is
   searched.
2. **Search past jobs** (`find_vendors_by_history`): the terms against the titles of every past job,
   weighted by rarity and position (0190). Words carried by more than 5% of titles are dropped before
   the join and at most five words join, always keeping the rarest (0228: "request" appears in 23% of
   titles and made the search time out). The caller's category chip adds 40% to a job filed under it
   and the service 20%, but no longer filters (0229: the power bank job was filed under retail, the
   chip said special-request, and the one vendor who had done it was excluded). The city still
   filters on the vendor's service area. Declines, status and `deleted_at` are honoured.
3. **Fallback** when no title matched or there was no phrase: `get_vendor_candidates` (an `offers`
   capability for the category and service, no covering `declines`, status active, not removed),
   paged past the row cap.
4. **A search that died is not a search that found nothing.** `findVendorsByHistory` uses
   `callAdminRpcChecked` (`rpc-helpers.ts`, `{ rows, ok }`). When the history search fails the ranker
   still falls back to the usage list, but every row carries "Could not search past jobs for these
   words, ranked by how often each is used", so the reader can see which question was answered.
5. **Score and order.** A title match outranks usage (`1000 + matches × 10 + score`), and the first
   reason quotes a matching job title as evidence.
6. **Personal layer (0191).** The asking teammate's own `avoid` removes the vendor from their answer;
   their own `preferred` adds `PREFERRED_BOOST` (1.0) and a reason with their note. Other teammates'
   marks reach the answer only through sentiment and the "N teammates marked avoid" flag. The action
   always passes the caller's own id, never a client-supplied one.
7. Top N (default 5, max 20), with reasons and flags.

## The live extractor (0214)

Keeps the book current from the Freshdesk mirror ([../integrations/freshdesk.md](../integrations/freshdesk.md)).
It calls Freshdesk not at all; it reads what the mirror already holds, so it costs no API budget and
can re-read history if the rules improve.

- **Schedule:** `src/trigger/vendor-extract.ts`, every 5 minutes, `maxDuration` 300 s. No settings
  switch; it runs whenever the Trigger.dev worker is deployed.
- **Queue:** `freshdesk.conversations.vendor_extracted_at IS NULL` and
  `vendor_extract_attempts < 3`, oldest first. Forward only: everything mirrored before 0214 was
  marked read. A range can be re-opened by setting the column back to NULL.
- **Cycle** (`runVendorExtractCycle` in `vendor-extract-sync.ts`): claims 40 notes, reads 3 at a
  time, within a 240 s budget. Notes of one ticket are read oldest first, so a phone in a later note
  can attach to a vendor named earlier.
- **The read** (`extractVendorsFromNote` in `vendor-extract.ts`): one routing-tier call per note, with
  the note's images and PDFs sent as files through the provider's file part (39% of notes carry a
  file; the supplier is often only on the bill). Budget: 4 files, 5 MB each, 16 MB per note, 60 s per
  call. Phones and emails are swapped for `[PHONE_1]`-style placeholders before `maskPii` and swapped
  back after, so the model never sees a real number but can say which one is the vendor's. Bill
  images go to the model unmasked, a founder-approved exception recorded in the Decision Log. The
  prompt mostly says what is NOT a vendor (the client, our staff, a product, an address, chatter),
  and Indulge's own entities are also filtered at the write (`isOwnEntity`). **Fails closed:** a bad
  reply writes nothing and the note stays queued.
- **Matching, in tiers, each a fact:** a phone that belongs to exactly one vendor (a shared
  switchboard identifies nobody), then an exact name or alias, then the same name once legal forms
  like "Private Limited" are stripped, then a close name only when it is at least 8 characters, one
  name contains the other, and the shorter is at least 82% of the longer, with exactly one candidate
  passing. Short or person-shaped names are never fuzzy-matched. A new spelling becomes an alias. A
  near miss (up to three names that contain ours or are contained by it) is recorded as
  `possible_duplicate_of` and a new row is created anyway; a later phone that points at a different
  vendor is flagged, never merged.
- **Writes** go through the same cores as the UI (`createVendorCore`, `upsertCapabilityCore`,
  `logEngagementCore`) with provenance: `source = freshdesk_live`, `source_ref` = the Freshdesk ticket
  id, `identity_status = unverified`. Category and service come from the ticket's own fields, not the
  model. Each note is marked read the moment its own writes land. A failed read, or a write a core
  refused after a good read, counts an attempt; at 3 the note is given up and logged loudly, and
  `vendor_extracted_at` stays NULL so the give-up is queryable.
- **Settle pass,** every cycle, no model: walks every open `freshdesk_live` job (keyset paged, 200 a
  page) and closes it through `closeEngagementCore` once the mirrored ticket is Resolved or Closed.
- **Cost:** about 20 paise a note, roughly ₹3,300 a month at the account's volume (agreed with the
  founder). A quiet period costs nothing.
- **Bench:** `scripts/vendors/copy-notes-for-testing.ts` copies real notes and their files from
  production's mirror into the local one (read-only on production); `run-extract-once.ts` drives one
  cycle and prints every row. About five rupees a round.

## Keeping the book clean: review, merge, remove

Every extractor row is born unverified. A person finishes the job with one of three answers:

| Answer | Where | Who | What happens |
| --- | --- | --- | --- |
| It is real | **Looks right** on the vendor page | anyone with vendor access | `verifyVendorCore` sets `identity_status = verified`. One way only: doubt is Merge or Remove, never un-verify. |
| It is another row under a different spelling | **Merge in**, on the row you keep | admin, founder | `merge_vendors` folds the other row into this one |
| It was never a supplier | **Delete** or **Hide**, on its page | admin, founder | `remove_vendor` deletes or hides it |

**The merge shortlist** (`getLikelyDuplicates`) opens the Merge dialog before anyone types. It offers
facts only: the names the extractor flagged as near misses, any live vendor with the same primary
phone, and names that are one of this vendor's aliases (or the reverse). Never fuzzy, because the
button beside it is Merge. A name search is available for everything else.

**Merge** (`merge_vendors`, one transaction). Many tables reference a vendor id and three of them
(jobs, capabilities, preferences) carry a UNIQUE the move can collide with, so it is one SQL
function, all or nothing. Jobs, capabilities,
reviews, notes, preferences, `sia.tickets`, and the WhatsApp group and contact links move to the
keeper. Where the keeper already has the same job (same source and ticket), the duplicate is folded:
every empty field on the keeper is filled from it, its reviews follow to the surviving job, and the
emptied row is deleted. Capabilities fold with cities unioned and a `declines` on either side
winning. Every fold is a COALESCE, so the keeper never loses a fact. The loser's name becomes an
alias. The deleted spine row is written to `vendor_merges` first. Merging into a removed vendor is
refused; merging a removed vendor into a live one is allowed.

**Remove** (`remove_vendor`, 0230). A vendor with no jobs, no reviews and no notes is genuinely
deleted, because there is nothing to lose (capabilities and preferences do not count; they cascade).
A vendor with any history is hidden instead (`deleted_at`), because its jobs record money that
moved. The page shows which is coming ("Delete" or "Hide" on the button and in the confirm), but the
function counts again under a row lock, so a job written a second earlier still wins. Either way a
`vendor_removals` row keeps the vendor as it was. **Restore** clears `deleted_at`
(`setVendorDeletedCore`); a deleted vendor cannot be restored.

Hiding is deliberately not a status. `paused` and `blacklisted` answer "how should we treat this
supplier" (a blacklisted vendor still appears, so nobody re-adds it). `deleted_at` answers "is this a
supplier at all".

**Old ids keep working.** A bookmark, a ticket note or last week's Elaya chat that names a merged-away
id lands on the keeper: the page redirects and `get_vendor_details` answers with the keeper and says
so.

## Vendors on tickets

A Serene ticket can carry a vendor (`sia.tickets.vendor_id`). The wiring lives in
`src/lib/services/ticket-vendor.ts` and is documented in [tickets.md](tickets.md). What matters here:

- Suggestions on the ticket come from `rankVendorsForRequest` with the ticket's own words, city and
  member. Nothing is re-ranked.
- Choosing a vendor opens a job on the vendor's ledger (`source = ticket`, `source_ref` = the ticket
  number). Changing vendor closes the first job as cancelled. Ending the ticket closes the job with
  the outcome the resolution implies and the cost from the Money card, inside
  `moveTicketStatusCore`, so every path that ends a ticket feeds the score.
- Moving a ticket to Awaiting vendor requires a vendor.
- After resolving, the ticket asks "How did this vendor do?" (`VendorReviewForm`,
  `reviewTicketVendorCore`): one review per ticket, filed against that ticket's job. This is today the
  only place in the UI where a vendor review is entered.

## Elaya and the MCP connector

Two read tools, `find_vendors` (wraps the ranker; the request goes through in the user's own words
and the staff principal is the asking teammate) and `get_vendor_details` (contacts, offers and
declines, the last 10 jobs, ratings, the score with reasons, the team's takes). Both are defined in
the Node registry and run on the Python brain through the bridge, so WhatsApp and in-app answer the
same way. Every staff role carries them; who may use them is decided per person inside the tool
(`canAskAboutVendors`, the vendor audience above). An unconfirmed extractor row comes back marked
`unverified`, a removed vendor is named as removed, and a merged-away id answers with the keeper.
The MCP connector publishes the same two tools and a `vendor_shortlist` prompt. There are no vendor
write tools.

Details, prompts and the bridge: [elaya.md](elaya.md) and [../integrations/mcp.md](../integrations/mcp.md).

## How the archive got in (one-off, 2026-09-11)

The historical book came from a manual Freshdesk export (tickets to 25 August 2026) run through an
extraction outside this repo, then loaded by the scripts in `scripts/vendors/`. The loader resolves
agent names against the profiles of the database it writes to, which is why data never travels in a
PR: it runs against the target database. Every script refuses a remote host without
`--yes-write-to-production`.

```bash
supabase db push                                                                       # 1. tables + bucket
npx tsx scripts/vendors/load-vendors.ts --yes-write-to-production                     # 2. data (insert-only on rerun)
npx tsx scripts/vendors/dedupe-vendors.ts --yes-write-to-production --replay scripts/vendors/vendor-merges.csv
npx tsx scripts/vendors/dedupe-vendors.ts --yes-write-to-production --purge-junk     # 3. merges BEFORE purges
npx tsx scripts/vendors/dedupe-vendors.ts --yes-write-to-production --purge-clients
npx tsx scripts/vendors/upload-vendor-invoices.ts --yes-write-to-production --skip-existing   # 4. the files
```

Result on production: 21,580 vendors, 25,596 capabilities, 46,574 jobs, 4,977 invoice files, no
junk-labelled rows. The loader is insert-only after the first load and maps merged-away spellings to
their survivor, so a rerun re-inserts only the rows the purges removed; run the three cleanup steps
after every load. `--wipe` is a true rebuild and deletes every `source = freshdesk` row, which is why
the extractor writes `freshdesk_live` instead. `vendor-merges.csv` holds the 154 reviewed merge
decisions (an optional third column `canonical` lets a smaller row survive when it is the right
identity). The purge's `NOT_JUNK` list spares rows the extraction mislabelled.

## File map

```text
supabase/migrations/20260911000183_vendors.sql                 spine + capabilities + Sia FKs
supabase/migrations/20260911000184_vendor_invoices_bucket.sql  private bucket
supabase/migrations/20260911000185_vendor_ledger.sql           engagements + reviews + rollup + usage RPCs
supabase/migrations/20260911000186_vendor_notes.sql            vendor_notes
supabase/migrations/20260911000187_vendor_search.sql           search columns, search/count, vocabularies
supabase/migrations/20260911000188_vendor_candidates.sql       get_vendor_candidates
supabase/migrations/20260911000189/0190_vendor_history_*.sql   find_vendors_by_history, ranked terms
supabase/migrations/20260911000191_vendor_agent_preferences.sql the sticky note + rollup counts
supabase/migrations/20260911000192_vendor_rpc_row_cap.sql      RPC shapes past the 1,000-row cap
supabase/migrations/20260918000214_vendor_extraction_queue.sql the extractor queue + freshdesk_live source
supabase/migrations/20260918000221_vendors_for_concierge.sql   can_access_vendors() + policies
supabase/migrations/20260921000227..0230_*.sql                 contact search, merge, deleted_at, history fixes, remove
src/lib/constants/vendors.ts          THE vocabulary, weights, limits and extractor numbers
src/lib/types/vendor.ts               row types
src/lib/validations/vendor-schema.ts  Zod
src/lib/utils/vendor-score.ts         computeVendorScore + vendorFlags (pure)
src/lib/services/vendors-service.ts   every read + THE ranker + the review-workflow reads
src/lib/services/vendor-mutations.ts  THE write cores (UI, extractor and tickets all use them)
src/lib/services/vendor-search-intent.ts  readVendorRequest (fails open)
src/lib/services/vendor-extract.ts    the model read of one note (fails closed)
src/lib/services/vendor-extract-sync.ts   the cycle + settleOutcomes
src/lib/services/ticket-vendor.ts     the ticket ↔ vendor link
src/lib/actions/vendors.ts            every vendor server action
src/trigger/vendor-extract.ts         the 5-minute schedule
src/components/vendors/               the list, the vendor page cards, Find a vendor, admin actions, review queue
src/app/(dashboard)/vendors/          page.tsx, [id]/page.tsx, find/page.tsx (+ loading.tsx each)
scripts/vendors/                      loader, dedupe (+ vendor-merges.csv), invoice uploader, extractor bench, test-find-phrases
```

## Decisions

1. **Audience.** Admin/founder while the module was built; the whole concierge domain since
   2026-09-18 (founder). Pause / blacklist, merge and remove stay admin/founder.
2. **Four review dimensions,** all entered by hand: speed, quality, pricing, reliability.
   `communication` was left out; it comes back as one column if the team keeps writing "hard to reach".
3. **Weights** 2.5 / 1.5 / 2.5 / 2.5 / 1.0, tuned in `SCORE_WEIGHTS`. A config table only if someone
   needs to tune without a deploy.
4. **No bridge to lead interests.** Vendors serve concierge tickets, not Gia leads.
5. **Per-teammate preferred / avoid is kept** (0191, founder's original brief).
6. **The extractor starts from 2026-09-17** and never re-reads the 210,773 notes mirrored before it.
7. **Bill images go to the model unmasked** (founder-approved, Decision Log).
8. **A machine never merges.** It flags; a person merges.
9. **Remove deletes a row with no history and hides one with history** (founder, 2026-09-19).

## Not built, and known gaps

- **No UI to pause or blacklist.** `setVendorStatusAction` exists with no caller in the UI.
- **No UI to edit capabilities** beyond the one "What they do" line on Add vendor;
  `deleteCapabilityAction` has no caller.
- **No manual job logging or closing on the vendor page** (`logEngagementAction`,
  `closeEngagementAction` unused by the UI). Jobs come from the archive, the extractor and tickets.
- **No review form on the vendor page.** Reviews are entered after a ticket resolves.
- **Sia does not feed vendors yet:** nothing fills vendor contacts from a mapped vendor WhatsApp
  group, and no job is written with `source = sia`.
- **The member-match score** is one reason line, not a score. The Chrome extension was never built.
- **The tech workbench sees Merge and Remove** on the vendor page (`hasElevatedPageAccess`), but the
  actions refuse anyone who is not admin or founder.
- **A ranking weakness reported on 2026-09-18:** "AC technician" matched airline jobs on the letters
  "AC". Not re-tested after 0228 / 0229. TODO: verify.
- **In progress, not shipped:** agent vendors (`vendors.kind` = `human` / `agent`, migration 0245) for
  the hands plan: the migration is committed (step 1, 2026-09-26) but not applied to production. See
  [../architecture/hands-plan.md](../architecture/hands-plan.md).
