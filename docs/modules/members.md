# Members

> **Purpose:** the member twin as built: the identity spine, the stores that hang off it, how facts get in (by hand, from chat, from imports), health, the pulse and Serene's weekly judgement, the card-and-ID vault, the WhatsApp group link, money, and who can see what.
> **Audience:** engineers working on anything that reads or writes a member; product people who want to know what Serene knows about a member and where it came from.
> **Source-of-truth scope:** the `member` schema and its gates, `src/lib/constants/member-facets.ts`, the member services and cores, the member Trigger.dev tasks, and the member scripts. The pages are in [../pages/members.md](../pages/members.md); Zoho is in [../integrations/zoho-books.md](../integrations/zoho-books.md); Elaya's member tools are in [../modules/elaya.md](../modules/elaya.md).
> **Last verified:** 2026-09-26 against migrations 0181, 0194, 0201, 0202 (members rename), 0211, 0215 to 0218, 0220, 0236, 0241 to 0244; `src/lib/services/` (members-service, member-mutations, member-relations, member-health, member-observation-reader, member-profiler, member-assessment, member-vault), `src/lib/utils/vault-crypto.ts`, `src/lib/actions/members.ts`, `src/lib/elaya/access.ts`, `src/trigger/member-*.ts`, `scripts/members/*`, `scripts/import-members-and-map-groups.py`.

## What the member twin is

A member is someone who holds an Indulge membership. Serene keeps one record per membership
(a couple is one member with two people under it) and builds a "twin" around it: what we know
about them, who is around them, what they asked for, how they sound, what is coming up, how
healthy the relationship is, and Serene's own judgement of it. The concierge floor (queens,
bishops, genies, jokers, organised in queendoms) works from this record, and so does Elaya.

The rule that shaped it: **facts are rows, scores are computed.** The spine holds identity and
join keys only. Everything else is a row with a source, a confidence and evidence, and every
number a person sees (health, activity, the judgement) is derived from rows, never typed onto
the member.

The member twin is part of Sia, the concierge side of Serene. The WhatsApp group archive and
the Sia page are in [sia.md](sia.md) and [../pages/sia.md](../pages/sia.md); tickets are in
[tickets.md](tickets.md).

## At a glance

| Piece | Status | Where |
| --- | --- | --- |
| Identity spine `member.members` | live, 614 members loaded 2026-09-15 | 0181, 0194, 0202, 0211, 0217 |
| Facts, people, relations, timeline, coming up, snapshot | live | 0194 (renamed 0202, moved 0211) |
| The Observation box (free text in, facts out) | live | `member-observation-reader.ts`, `addObservationCore` |
| The chat profiler (reads WhatsApp groups, files facts) | on since 2026-09-18, Active members only | `member-profiler.ts`, 0215 to 0220 |
| Health score | live, one number since 2026-09-26 | `computeHealthScore`, `member-health.ts` |
| The pulse (activity numbers) | live, hourly | 0241, `member-assessment.ts` |
| Serene's judgement | live, weekly and on demand | 0241, `member-assessment.ts` |
| The vault (cards and IDs, encrypted) | live | 0236, `member-vault.ts`, `vault-crypto.ts` |
| Freshdesk contact notes imported | done 2026-09-24 | [../data-imports/freshdesk-contact-notes.md](../data-imports/freshdesk-contact-notes.md) |
| Live Zoho money | live, read only | [../integrations/zoho-books.md](../integrations/zoho-books.md) |
| Documents and embeddings (`member_documents`, `member_chunks`) | tables only, nothing writes them | 0194 |
| Member app feed, memberships history, won-deal to member bridge | not built | see "Not built" |

## The identity spine

`member.members` is one row per membership. It started as `public.clients` (migration 0181,
2026-09-04), gained its queendom and join keys in 0194 (2026-09-15), was renamed to `members`
in 0202 (2026-09-17, with every column, gate, policy and stored word) and moved into the
`member` schema in 0211 the same afternoon. Old `/clients` links redirect to `/members`
(`next.config.ts`).

| Column | What it holds |
| --- | --- |
| `full_name` | the name on the membership ("Rahul & Naina Verma" is fine) |
| `primary_phone` (unique), `alt_phones` | E.164, parsed strictly by the importer; NULL when it did not parse |
| `queendom_id` | the queendom that serves the member (`sia.queendoms`). This is the access boundary |
| `tier`, `membership_type`, `membership_status`, `membership_start`, `membership_end`, `membership_amount_inr` | the membership summary. Statuses: Active, Expired, Trial. Tiers: premium, celebrity, genie, standard, monthly_trial |
| `freshdesk_contact_id`, `zoho_customer_id`, `app_member_id` (unique) | join keys to the other systems |
| `wa_group_jid` | the linked WhatsApp group, a **mirror** kept by a trigger (0217). Never written by code |
| `wa_invite_link` | the invite URL from the old app export. Proves nothing about a link |
| `identity_status` | `unverified` / `verified`. Verified when the group mapping confirmed the phone |
| `sources`, `import_raw` | which imports touched the row, and the untouched source rows (so messy data never corrupts a typed column) |
| `consent` | jsonb reserved for DPDP consent. Nothing reads or writes it yet |

Dynamic data (addresses, preferences, city, email, company) is never a column. It is a fact.
The New member form's email and city become identity facts.

## The stores

All in the `member` schema. Table names kept their `member_` prefix when they moved (0211).

| Table | What it holds | Who writes | Signed-in users (RLS) |
| --- | --- | --- | --- |
| `members` | the spine | cores (admin client) and the importer | read, insert, update where `can_access_member_queendom(queendom_id)`; no delete |
| `member_people` | the humans under a membership: primary, spouse, partner, child, parent, sibling, staff, other, with phone, note and `can_request` | the People card, the profiler (with `can_request = false`) | full CRUD through `member_visible` |
| `member_facts` | typed facts. **Append only**, with source, confidence, evidence, `observed_at`, `superseded_by` | every fact writer below | read; a human may insert only an `agent_note` with their own id; `superseded_by` is set by the service role |
| `member_relations` | the relationship map: one row per (member, entity kind, entity id, relation), with strength and an evidence count | `upsertMemberRelation` only | read |
| `member_events` | the timeline, partitioned by month (2024-01 to 2027-03 plus a default) | the profiler (one line per conversation), the judgement (`assessment` events) | read |
| `member_anticipations` | "coming up": occasion, renewal, pattern, follow_up, trip, silence, with a due date and suggested action | the profiler | read |
| `member_snapshot` | one jsonb per member: `pulse`, `assessment`, and a reserved `narrative`. Each writer merges its own key | the pulse function, the judgement | read |
| `member_health_policy` | the 15 health signals with delta and half-life | seeded in 0194; no UI edits it | read (everyone) |
| `member_health_events` | the health ledger. **Append only** | the Health card (by hand), ticket intake | read; a human may insert only `manual_adjust` |
| `member_access_log` | every page open of a member. **Append only** (the DPDP trail) | the member page, the finance page, the ticket page | insert own; admin/founder read |
| `member_vault`, `member_vault_access` | encrypted cards and IDs, and their trail | `member-vault.ts` | vault: no policy at all; trail: admin/founder read |
| `member_documents`, `member_chunks` | prose and masked chunks with `vector(1024)` embeddings | nothing yet | documents read; chunks no policy |
| `members_list` (view) | the spine plus the pulse and judgement as sortable columns (0241), `security_invoker` | n/a | the members RLS applies |

Related tables outside the schema point at a member by `member_id`: `sia.wag_groups` and
`sia.wag_contacts` (the WhatsApp link), `sia.tickets`, `sia.extraction_runs` (every model run
over member data), `freshdesk.tickets` and `freshdesk.contacts`, `gia.deals` (a foreign key
that nothing fills yet), `public.vendor_engagements` (vendor jobs).

Table-level detail and relationships: [../architecture/database.md](../architecture/database.md).
Query helper: `memberDb(client)` in `src/lib/supabase/schemas.ts`; eslint refuses an unscoped
`.from('member_…')`.

## The vocabulary (`src/lib/constants/member-facets.ts`)

One file. The SQL CHECKs on `member_facts.facet`, `.source` and `.polarity`, on
`member_anticipations.kind` and on `member_vault.kind` mirror these lists, so a new value there
is one entry here plus a CHECK migration. Event kinds, tiers and statuses have no CHECK.

| List | Values |
| --- | --- |
| Facets (`CLIENT_FACETS`) | identity, address, family, dietary, preference, interest, occasion, travel, budget_signal, contact_rule, note |
| Essentials card facets | address, family, dietary, contact_rule |
| Preferences card facets | preference, interest, travel, occasion, budget_signal |
| Fact sources (`FACT_SOURCES`) | agent_note ("Team note"), typeform, atlas, freshdesk_contact, freshdesk_ticket, whatsapp_group, ticket, app_taste, app_behaviour, import. The SQL CHECK also allows `freshdesk_note` (0236, the contact-notes import); the TS list does not have it yet |
| Polarity | likes, dislikes, neutral |
| Event kinds | message_in, message_out, ticket_created, ticket_status, ticket_resolved, note_added, app_view, app_save, app_wish, app_taste, location, payment, invoice, renewal, call, fact_added, health_signal, assessment |
| `MONEY_EVENT_KINDS` | payment, invoice, renewal (the one list the Money card, the finance page and `withoutMemberMoney` read) |
| Relation kinds | spouse, child, staff, uses, prefers, avoids, visits, lives_in, travels_to, knows, collects, follows; entity kinds person, vendor, place, venue, brand, interest, member |
| Anticipation kinds | occasion, renewal, pattern, follow_up, trip, silence |
| Tiers, statuses | see the spine table; `tierFromLabel()` never invents a tier |
| Vault kinds | card, aadhaar, passport, pan, driving_licence, other_id, other |
| `FACT_KEY_LABELS` | human labels for the well-known keys (`identity.birthday` → "Birthday", `preference.seat` → "Flight seat", …) |

Also here: `HEALTH_BASELINE` (70), `computeHealthScore()`, `VAULT_REVEAL_SECONDS` (60).

## Facts: provenance, confidence, supersede

Every fact says where it came from. The confidence ladder is deliberate, so a machine never
outranks a person:

| Source of the fact | `source` | Confidence |
| --- | --- | --- |
| A person corrects a value on the page | `agent_note` | 1.0 |
| The Observation box's reader | `agent_note` (with a `run_id` and the note it came from) | 0.9 |
| The seeder (Atlas, Typeform, Freshdesk contact fields, the sheets) | atlas, typeform, freshdesk_contact, import | 0.9 |
| The Freshdesk contact-notes import | `freshdesk_note` | 1.0 for the note itself, 0.9 for an address, 0.85 for facts the reader found in a note |
| The chat profiler | `whatsapp_group` (group, message ids, a short quote) | capped at 0.85; below 0.5 dropped |

Rules:

- **Append only.** A value is never edited. A correction inserts a new row and stamps
  `superseded_by` on the old one. `addFactCore` retires every current row that says the same
  thing (same facet, key and value, case-insensitive), or the old value would come straight
  back from a second source.
- **Agreeing sources are one line.** On read, `collapseAgreeingFacts()` (members-service) groups
  current facts by facet, key, value and polarity; the most confident (then newest) leads and
  every source is listed ("· 2 sources").
- **Conflicts are a person's call.** The profiler skips a fact identical to a current one and
  adds a different one beside it; it never overwrites.
- **Machines can file under their own source.** `addFactCore(input, actor, provenance?)` takes a
  `FactProvenance` (`source`, `confidence`, `evidence`, `observed_at`) for imports and readers.

## How facts get in

| Path | What it does | Code |
| --- | --- | --- |
| The seed (2026-09-15) | 6,757 facts over 493 members from Atlas, Typeform, Freshdesk contact fields and the member sheets | `scripts/members/seed-member-facts.py` |
| The Observation box | a teammate writes free text; the reader files facts and relations and keeps the sentence as a note | `addObservationCore` |
| A correction on the page | double-click a value on Essentials or Preferences | `addMemberFactAction` with `supersedes_id` |
| The chat profiler | reads each linked group's finished conversations | `member-profiler.ts` |
| The contact-notes import (2026-09-24) | the Freshdesk contact Notes tab: vault items, address facts, and the rest through the Observation reader | `scripts/members/import-freshdesk-notes.ts` |

There is no "add a fact" form. New facts come through the Observation box or a machine.

### The Observation reader

`member-observation-reader.ts`, used by `addObservationCore` and the contact-notes import.

- One routing-tier call (Haiku today) through the Elaya provider, no tools, the text masked
  by `maskPii` to the configured depth. Prompt `observation-v2`, answer capped at 2,400 tokens
  (raised from 900 on 2026-09-24, when long notes came back cut).
- It returns the sentence with spelling fixed, up to 12 facts (facet, key, value, polarity) and
  up to 8 relations (brand, person, place, interest). Anything outside the vocabulary is
  dropped. A family member's own details go inside the family fact, never into the member's
  own drawers.
- **Fails closed for facts, open for the note.** On any failure the sentence is saved as written
  and nothing is filed.

`addObservationCore` writes a `sia.extraction_runs` row (`kind: observation`), then the note
(facet `note`, the person's exact words kept in evidence), then the facts the twin does not
already hold word for word, then the relations through `upsertMemberRelation`. The action takes
3 to 2,000 characters.

## The write cores

The member write surface is a set of context-free cores on the admin client. The caller checks
access first (`canAccessMember`), the core trusts the actor. `actions/members.ts` calls them, and
any future Elaya member write tool must call the same cores (R-01). Elaya has no member write
tool today.

| File | Cores |
| --- | --- |
| `member-mutations.ts` | `createMemberCore` (refuses a phone that belongs to another member; seeds email and city as identity facts), `updateMemberCore`, `addFactCore` (with supersede and provenance), `addObservationCore`, `addPersonCore` / `updatePersonCore` / `deletePersonCore`, `linkGroupCore`, `addHealthAdjustCore` (by hand), `logMemberAccess` (best effort, never throws) |
| `member-relations.ts` | `upsertMemberRelation` (insert at strength 0.6, or bump the evidence count and strength by 0.1) and `relationEntityId` ("brand:louis-vuitton"). The one relation write; the Observation box and the profiler both call it |
| `member-health.ts` | `addHealthSignalCore`: the way a machine moves health (see Health) |
| `member-vault.ts` | the vault cores (see The vault) |

`member-relations.ts`, `member-health.ts`, `member-vault.ts`, `member-profiler.ts` and
`member-assessment.ts` are free of `server-only` on purpose so laptop scripts (plain `tsx`) can
import them. Trigger.dev would cope either way: its build replaces `server-only` with an empty
module.

## The chat profiler

`src/lib/services/member-profiler.ts` reads the WhatsApp chat of each **linked** member group,
one finished conversation at a time, and files what it learns: facts, the people around the
member, relations, one timeline line per conversation (a summary and a tone), and anything with
a future date as "coming up".

### How one reading works

1. `sia.profiler_due_groups(p_limit, p_statuses)` lists groups that have something new. Only
   groups linked to a member are ever listed, and only for members whose status is in
   `PROFILER_MEMBER_STATUSES` (Active, the founder's call on 2026-09-18). The longest-waiting
   group comes first (0220); a group just read goes to the back.
2. The group's chat since its bookmark (up to 600 messages) is cut into conversations. Six quiet
   hours end one; a conversation still going is left alone. A window is capped at 9,000
   characters and each message at 900.
3. **Names never reach the model.** Every sender gets a stable code name per group
   (`sia.codenames`: MEMBER, STAFF_n, VENDOR_n). A sender is staff when tagged staff in the
   contacts, seen in six or more member groups, or named "… Indulge". Known names in the text
   become codes, `maskPii` takes phones and emails, and a leak check stops the reading if a real
   name survives. `openVault()` is this vault; the judgement, the ticket draft (`ticket-draft-core.ts`) and ticket intake reuse it.
4. One reasoning-tier call through the Elaya provider, low effort, 8,000-token allowance, a
   two-minute timeout. Prompt `profiler-v1.1`. Every call is a `sia.extraction_runs` row with
   the masked input, tokens and an estimated cost.
5. The answer is checked field by field (unknown facets and kinds dropped, a fact with no
   message number behind it dropped), codes are turned back into names, and the writer files.

### Failures, the flush and the schedule

**Failure rules.** A failed reading writes nothing and does not move the bookmark. After three
failed readings of the same conversation the sweep steps over it (`fail_count` on
`sia.profiler_group_state`, reason in `last_error`, the runs stay findable). A model call that
throws counts only when another reading succeeded in the same run, the proof the provider was up;
three provider failures in a row stop the run. This came from the 2026-09-18 spend-limit outage,
when refusals were counted against conversations.

**The flush on a ticket (2026-09-21).** When ticket intake decides a burst of member messages
deserves a card, it calls `profileGroupNow(groupJid, memberId, { untilAt })` before drafting, so
a preference said an hour earlier is on file. Same messages, same bookmark; it steps aside when
the bookmark is more than 6 hours behind (that backlog is the sweep's) and reads at most 3
conversations. Intake itself: [tickets.md](tickets.md).

**Running it.** `src/trigger/member-profiler.ts`, every 10 minutes, one run at a time, skips a
late start. A run keeps starting readings for 7.5 minutes, reads 3 groups side by side (in order
inside a group), is offered up to 60 groups and sends at most 180 conversations. Switch:
`elaya_settings.member_profiler_enabled` (true only when the row is exactly `true`). It was
switched on 2026-09-18, off 2026-09-19 when the Anthropic account hit its monthly limit, and on
again 2026-09-21 19:08 IST with 67% of the Active members' history read. TODO: verify whether
the history read has finished.

**Cost.** The whole Active history was estimated at about 87,000 messages and about 40 dollars
(reasoning tier, Sonnet 5 pricing in `PROFILER_COST_PER_MTOK`). A day of new conversations is far
less.

**Known limits.** A couple sharing one group is one member to the profiler; a fact about one can
land on the shared profile (per-person tagging is a later phase). The scored exam for comparing
prompt versions is not built; the founder's pilot review stood in for it.

**Pilot.** `scripts/members/profile-pilot.ts` runs the same path as a dry run and writes its report
outside the repo (it holds real names).

## Health

The health score is one number, 0 to 100. Since 2026-09-26 it is **Serene's latest judgement plus
every health signal logged after it**, each signal fading by its half-life:

```text
score = clamp(0..100, base + Σ delta × 0.5^(age_days / half_life_days))
base  = the latest judgement's score (signals before it are ignored), or 70 before any judgement
```

`computeHealthScore(events, now, base)` in `member-facets.ts` is the one formula; the list and the
member page both use it (`members-service.ts`). The next judgement re-bases it. Bands: under 50
"Needs care", 50 to 74 "Steady", 75 and up "Happy" (`HealthPill`). The card also shows the change
over 30 days and the top three reasons: the signals since the judgement, else the strongest ones.

**The signals** (`member_health_policy`; the delta is copied onto the event at write time, so a
policy change never rewrites history):

| Signal | Delta | Half-life (days) | Written today by |
| --- | --- | --- | --- |
| complaint | -12 | 60 | ticket intake |
| praise | +5 | 90 | ticket intake |
| frustration_tone | -4 | 30 | ticket intake |
| manual_adjust | the person's choice, -20 to +20, with a note | 90 | the Health card |
| sla_breach -6, slow_first_response -3, reopened -5, resolved_on_time +2, resolved_late -3, silence_from_us -4, client_went_quiet -2, renewed +8, downgraded -8, escalated_to_founder -10, delight_delivered +6 | as listed | 30 to 180 | nothing yet |

**From the chat (2026-09-19).** Ticket intake reads every burst of member messages and labels its
kind and tone. When it is at least 75% sure, feedback with a frustrated or angry tone is a
complaint, feedback with a happy tone is praise, and a frustrated or angry tone on any other kind
of message is `frustration_tone`. The same signal is written at most once per member per 24 hours,
with the member's own words as the reason and a pointer to the messages. `addHealthSignalCore`
does the write. The profiler reads tone too but does not write health: the score should move on
what is happening now.

**Live re-judgement.** A signal with |delta| ≥ 10 (a complaint today) queues a fresh judgement at
once (`startMemberAssessment`), so the score re-bases within minutes, not on Sunday.

## The pulse and Serene's judgement

Both from migration 0241 and `src/lib/services/member-assessment.ts`.

**The pulse** is plain numbers, computed in one SQL statement for every member by
`member.compute_member_pulse()` (SECURITY DEFINER, service role only) and merged into
`member_snapshot.data->pulse`:

- last message from the member side (a staff contact is never the member), messages from them and
  from us in the last 30 days;
- requests in the last 90 days across Freshdesk **and** Serene's tickets, open requests,
  escalations, all-time Freshdesk tickets;
- last contact (the later of message or ticket);
- `activity_score` 0 to 100: recency up to 50 points (fading in a straight line to zero at 60
  days), messages up to 30 (20 in 30 days is full), requests up to 20 (6 in 90 days is full).

It runs hourly at minute 7 (`member-pulse`) and before every on-demand judgement. It costs only
database time (about 7.5 s for 614 members at launch).

**The judgement** (`assessMember`) is one reasoning-tier read per member, low effort, over the
masked record of the last 180 days: up to 60 facts, 40 requests (with reply and resolve hours,
escalations, reopens), 40 timeline lines (the profiler's summaries and tones), 40 health signals,
what is coming up, the pulse and the membership. It answers, by field in plain text (never JSON):

- `score`, `engagement`, `satisfaction`, `value` (0 to 100);
- `risk`: low / watch / high, shown as "Settled", "Watch", "At risk";
- a one-line verdict, strengths, concerns and next actions, each with its evidence, and a
  confidence.

The prompt says: judge from the record only, quiet is not unhappy, a complaint resolved well is a
strength of the service, tier matters for value only. The result is merged into
`member_snapshot.data->assessment` and also written as an `assessment` event on the timeline (the
history of what Serene thought). Every call is a `sia.extraction_runs` row (`kind: assessment`,
prompt `member-assessment-v1`).

**Names.** The record is masked with the profiler's vault when the member has a linked group, a
local masker otherwise, and every active staff name and first name (4+ letters) becomes STAFF,
because Freshdesk subjects and summaries name colleagues. A leak check runs on the input and on
the answer; a leak writes nothing.

**When it runs.** `member-assessment-weekly`, Sundays 04:00 IST: Active members not judged in the
last 7 days, up to 400, three at a time, inside a 25-minute budget. Switch:
`elaya_settings.member_assessment_enabled` (on unless it says exactly `false`). On demand:
"Assess now" on the member page (`assessMemberNowAction` → `member-assess-one`, one run per member
per hour by idempotency key).

**Cost.** About ₹2 to ₹3 a member. All 348 Active members were judged on 2026-09-26 from a laptop
(347 done in 19 minutes, about ₹700; 3 refused by the leak check).

## The vault (cards and IDs)

Migration 0236, `src/lib/services/member-vault.ts`, `src/lib/utils/vault-crypto.ts`. The team books
on members' behalf with the member's own card, passport, Aadhaar or PAN, which used to sit as plain
text notes in Freshdesk. The founder chose to keep them in Serene, encrypted.

- **Encrypted in the app.** AES-256-GCM with a key that lives only in the app's environment
  (`MEMBER_VAULT_KEY`, 32 bytes base64). The database, its backups and dumps hold ciphertext only.
  The member id is bound in as authenticated data, so a ciphertext moved to another member's row
  does not open. Rotation: `MEMBER_VAULT_KEY_VERSION` and `MEMBER_VAULT_KEY_PREVIOUS`.
- **No RLS policy for signed-in users.** A session client, Elaya's read door and every export see
  nothing. Only the service role, behind the gated actions.
- **In the clear:** a label, the last four digits (`lastFourOf`), an expiry month. The number and
  the CVV exist only in the ciphertext.
- **Every add, reveal, delete and import** is an append-only `member_vault_access` row with who and
  why. A reveal asks for the reason first, writes the trail row **before** decrypting, and the page
  shows the secret for 60 seconds.
- **Never part of any read.** Not in the dossier, a tool result or a model prompt. The profiler,
  intake and the Observation reader never see it.

Who may do what: list = anyone who can see the member; add and reveal = the same, except the Joker
head (`canUseMemberVault`); remove = admin and founder, behind a `ConfirmDialog`. A removal is a
real delete (a member may ask for their details to be gone); the trail keeps that it happened.

On record (changelog 2026-09-24): some cards were imported with the CVV, as the founder decided.
Card network rules forbid a merchant from keeping a CVV after payment; Indulge holds these as the
member's agent. Written member consent for card-on-file is not recorded anywhere in Serene.

## The WhatsApp group link

The source of truth is `sia.wag_groups.member_id`. Three things write it, all through
`updateSiaGroupMapping` (sia-service): the Sia group panel's member picker, the member page's
WhatsApp card (`linkGroupCore`), and the mapper script. A link sets `group_kind = member`; an
unlink sets `unmapped`.

`member.members.wa_group_jid` mirrors it. The trigger `sia.sync_member_wa_group` (0217) recomputes
the member who lost a group and the one who gained it on every insert, relink, activation change
or delete. The list's WhatsApp chip and the "No WhatsApp group" filter read the mirror, because
PostgREST cannot join across schemas. **Never write the mirror from code.** `wa_invite_link` is a
different fact and says nothing about a link.

How groups got linked: the spine importer's three-signal matcher (the member's phone is in exactly
one group, that group holds exactly one known member phone, the subject agrees with the name) gave
207 automatic links on 2026-09-04, a by-name batch added 134 on 2026-09-16 and an orphan batch 58
on 2026-09-18, each reviewed by the founder. After that batch: 401 groups linked, 213 members with
no group (69 of them Active), 64 member-type groups still unlinked. TODO: verify today's counts.
Hidden phone numbers (WhatsApp privacy ids) are recovered offline by `scripts/sia-lid-backfill.py`
(see [sia.md](sia.md)).

The member page links to the group with `siaGroupHref(jid)` (`/sia?group=<jid>`), which opens that
chat in Sia.

## Money

Two layers, one gate.

- **What Serene holds:** the membership amount on the spine, and money events on the timeline
  (`MONEY_EVENT_KINDS`: payment, invoice, renewal). Nothing writes money events yet, so that list
  is empty today.
- **What Zoho holds:** read live on `/members/[id]/finance` by the spine's `zoho_customer_id`
  through `getMemberFinance`. Contract, budget and caching:
  [../integrations/zoho-books.md](../integrations/zoho-books.md).

**The gate.** `canSeeMemberFinance(principal)` in `src/lib/elaya/access.ts` is the one place to
narrow money to a role. Decided 2026-09-15: everyone who can see the member sees their money,
except a guest. Narrowed 2026-09-26: the Joker head sees no member money. For such a viewer the
member page applies `withoutMemberMoney(detail)` on the server (drops the membership amount and the
money events), so no figure reaches the browser; the finance page redirects back to the member;
Elaya's `get_member_finance` and the money part of `get_member_360` refuse.

## Access

One fact decides who sees a member: **the member's `queendom_id` against the viewer's seat.**

| Viewer | Sees |
| --- | --- |
| admin, founder | every member, including those with no queendom |
| a seated concierge teammate (queen, bishop, genie, joker: `profiles.sia_role` + `profiles.queendom_id`) | the members of their own queendom |
| the Joker head (one company-wide seat, 0244) | every member who belongs to a queendom; not those with none |
| anyone else, including an unseated concierge account | nobody |

- **SQL:** `public.can_access_member_queendom(queendom)` and `public.member_visible(member_id)`
  (both stay in `public`; 0211 widened their search path). Every member store, Sia ticket and
  intake policy calls them, so 0244 gave the Joker head their reach without touching a policy.
- **TypeScript twin:** `canAccessMember(principal, memberQueendomId)` in `lib/elaya/access.ts`. Every
  member action (`gate()` in `actions/members.ts`), every service-role read and every Elaya member
  tool asks it first, because the admin client bypasses RLS.
- **The seat cannot be self-assigned.** 0243 pins `sia_role` and `queendom_id` on the self branch of
  `profiles_update`, so only admin and founder change a seat. Queen and joker are one active holder
  per queendom; bishops can be many (0242); one active Joker head company-wide (0244). The seat
  model itself: [../architecture/auth-and-rbac.md](../architecture/auth-and-rbac.md).
- **Page reach:** `/members` is in the concierge domain's route map; admin and founder bypass it;
  the tech workbench reaches the page but RLS shows it nothing unless the person is admin.
- **The trail:** opening the member page, the finance page or a ticket's member help window writes
  `member_access_log` (`members_page`, `finance_page`, `ticket_help`). Elaya's reads do not.

Migrations 0242, 0243 and 0244 (many bishops, the own-seat pin, the Joker head) are applied to
production (checked with `supabase migration list --linked` on 2026-09-26).

Open, from the 0243 audit: seat changes are not written to `profile_audit_log`, and
`linkMemberGroupAction` checks the caller can see the member but not the group.

## What Elaya reads

Elaya reads the same dossier the page renders, on the admin client, behind the same queendom gate
(`getMemberDetailAsAdmin`, never called from a page). The tools, briefly:

| Tool | What it returns |
| --- | --- |
| `get_member_360` | **the first call for any member question**: identity, team, health, the live WhatsApp state (who spoke last, waiting on us), recent messages, requests, Sia tickets and suggestions, coming up, facts, people, relations, timeline, vendor jobs, deals, money (when allowed). Fits itself under 24,000 characters |
| `get_member_overview`, `get_member_profile`, `get_member_recent_messages`, `search_member_history`, `get_member_finance`, `list_members` | the depth reads, a topic search over the profiler's summaries, facts and messages, and the filtered roster (city and company come from facts) |

Full contracts and both brains: [elaya.md](elaya.md). For analytical questions, founders and admins
query the `elaya_read` views (`members`, `member_facts`, `member_people`, `member_relations`,
`member_coming_up`, `member_timeline`, `member_health_events`) with the verified metrics:
[elaya-analyst.md](elaya-analyst.md). The vault is in none of them.

## Background jobs

| Trigger.dev task | Schedule | Switch | Does |
| --- | --- | --- | --- |
| `member-profiler` | every 10 min | `member_profiler_enabled` (off unless exactly true) | the chat profiler sweep |
| `member-pulse` | hourly at :07 | none | `compute_member_pulse()` |
| `member-assessment-weekly` | Sunday 04:00 IST | `member_assessment_enabled` (on unless exactly false) | judges Active members not judged in 7 days |
| `member-assess-one` | on demand | none | the "Assess now" button and the live re-judgement |

Ticket intake (every minute) also writes health signals and calls the profiler's flush; it is
documented in [tickets.md](tickets.md). The Trigger.dev deploy and conventions:
[../integrations/trigger-dev.md](../integrations/trigger-dev.md).

## Scripts and imports

All dry-run by default; bulk writes to production stay in a person's hands. Reports that carry real
names are written outside the repo. The source CSVs live in the git-ignored `cleint-data/` folder
(the misspelling is the folder's real name).

| Script | What it does |
| --- | --- |
| `scripts/import-members-and-map-groups.py` | THE spine importer and group mapper: builds one member per human from the exports and the 2026-09-15 sheets (`export-1.csv`, `export-2.csv`) with a strict phone parser, upserts `member.members`, writes approved group links, links staff contacts by phone. `--apply` writes; `--review <csv> --skip-import --apply` applies a founder-approved mapping batch |
| `scripts/members/seed-member-facts.py` | seeds `member_facts` from Atlas, Typeform, Freshdesk contact fields and the sheets; idempotent |
| `scripts/members/import-freshdesk-notes.ts` | the contact-notes import (vault, address, reader lanes); idempotent on the note id; `--reread` for notes that gave no facts. Results and what is left: [../data-imports/freshdesk-contact-notes.md](../data-imports/freshdesk-contact-notes.md) |
| `scripts/members/profile-pilot.ts` | the profiler's dry run |

## Not built

- **Member app feed.** The App card waits for the member app's events (wishes, saves, tastes, city).
  A later phase by the founder's call of 2026-09-18.
- **Memberships history and the won-deal to member bridge.** `gia.deals.member_id` exists with a
  foreign key, but deal creation always writes null.
- **Money events.** Nothing writes payment, invoice or renewal events to the timeline.
- **Documents and embeddings.** `member_documents` and `member_chunks` (`vector(1024)`, HNSW) exist
  with no writer; meaning search waits on an embedding provider decision.
- **The narrative** ("In a few words" on the page) is a reserved snapshot key; nothing writes it.
- **Most health signals** (SLA, reopen, renewal, silence and others) have no writer; no screen edits
  the health policy.
- **Coming-up items** cannot be marked acted or dismissed yet.
- **Per-person tagging** inside a shared group, and the profiler's scored exam.
- **The `consent` column** is unused.

## Files

| File | Role |
| --- | --- |
| `src/lib/constants/member-facets.ts` | the vocabulary, `computeHealthScore`, vault kinds |
| `src/lib/constants/member-profiler.ts`, `member-assessment.ts` | the numbers of the profiler, the pulse and the judgement (`MEMBER_SORTS` lives in the second) |
| `src/lib/services/members-service.ts` | all `/members` reads on the session client; `getMemberDetailAsAdmin`; `memberQueendom`; `withoutMemberMoney` |
| `src/lib/services/member-mutations.ts`, `member-relations.ts`, `member-health.ts`, `member-vault.ts` | the write cores |
| `src/lib/services/member-observation-reader.ts`, `member-profiler.ts`, `member-assessment.ts` | the three model readers |
| `src/lib/utils/vault-crypto.ts` | the vault's encryption |
| `src/lib/actions/members.ts` | every member action (Zod → `requireProfile` → `canAccessMember` → core → `revalidatePath`) |
| `src/lib/validations/member-schema.ts`, `src/lib/types/member.ts` | schemas and types |
| `src/lib/elaya/access.ts` | `canAccessMember`, `canSeeMemberFinance`, `canUseMemberVault` |
| `src/trigger/member-profiler.ts`, `member-assessment.ts` | the four tasks |
| `supabase/migrations/` 0181, 0194, 0202 (`20260917000202_members_rename.sql`), 0211, 0215 to 0218, 0220, 0236, 0241 to 0244 | the schema history. Index: [../architecture/migrations.md](../architecture/migrations.md) |
