# Serene: Roadmap and Open Items (Claude Project digest)

> **Purpose:** the built-vs-planned ledger for this pack: module status, what is written but not applied, the current focus, what is next, and the open items worth knowing, grouped by area.
> **Audience:** a claude.ai Project chat that cannot read the repo.
> **Source-of-truth scope:** a digest of `docs/01-vision.md`, `docs/TODO.md`, the "Open items" and "Not built" sections of the module, page and integration docs, `docs/design/decision-log.md` (Open), and `docs/audits/`. **When a feature's status matters, trust this file over the others in the pack**, and trust the repo docs over this file.
> **Last verified:** not re-checked against code (a digest). Regenerated 2026-09-26 from the docs verified against the code that day (migrations through 0245; production has 0244 applied, 0245 not).

## The arc

Run the sales operation (**Gia**), add the intelligence layer (**Elaya**), own the member relationship
after the sale (**Sia**: members, tickets, vendors), then give Elaya **hands** so she can act in the
world, not only inside Serene. As of late September 2026 the first three steps are live and the fourth
has started. Sales runs on Gia. The concierge floor has its WhatsApp archive, member records, its own
ticketing and its vendor book in Serene, although day-to-day ticket work still happens in Freshdesk.

## Module status (2026-09-26)

| Module | Status | What "done" means, and where it stands |
| --- | --- | --- |
| **Serene** (base OS) | ✅ live | Module work never touches the foundation. Holds; hardening continues through the audits |
| **Gia** (sales CRM) | ✅ live | A lead travels ad to deal without leaving Serene, with SLA guardrails. Achieved. Tables in the `gia` schema since 2026-09-17; Shop-app channel added; founder pings paused |
| **Lead Revival** | ✅ live (R1) | Silent leads revived as tasks or sent to review; never changes the lead |
| **Call Intelligence** | ✅ live (Phase 1) | Library + dossier card. Only onboarding seeded. Phase 2 (similarity search) not started |
| **Oversight** | ✅ live | Managers and founders see live task work |
| **Elaya** | ✅ live | Python brain, 52 tools, three channels plus the customer channel, living memory, playbooks, requests, evals, the analyst. Not built: proposal cards, MCP writes, embeddings, voice replies; Node brain retirement targeted 2026-10-16 |
| **Sia** (concierge) | ✅ live beside Freshdesk | Done = the floor runs its member work in Serene the way sales runs Gia. Missing: the Freshdesk cutover and the won-deal to member bridge |
| **Members** | ✅ live | The twin fills itself (profiler, Observation, imports), pulse, weekly judgement, one health number, vault, Zoho money. Not built: the bridge, the member-app feed, money events, most health-signal writers |
| **Tickets** | 🔨 built, not the main tool yet | Done = the floor works tickets here instead of Freshdesk. Intake proposes cards in production; no human verdicts yet, so no lessons |
| **Vendors** | ✅ live | One ranking, a live extractor, a review queue. Not built: screens for status, capabilities and manual jobs; Sia vendor groups do not feed vendors |
| **Subscriptions** | ✅ live (Phase 1) | No reminders, no notifications, nothing in the background, by contract |
| **Books** (Zoho) | ✅ live, read only | `/books` and member finance |
| **MCP connector** | ✅ live (Phases 1 to 3) | Phase 4 (writes with confirmation) not built |
| **Mobile** (`/m`) | ✅ live | Four rooms for founders and Gia managers. Per-role room sets never built; the tech-expense card is a placeholder |
| **Hands** | 🔨 step 1 committed | Migration 0245 (schema `hands`, `vendors.kind`), `hands-service.ts`, `hands-mutations.ts`, a second Baileys process in `connector-hands/`. **Not applied**; no page, no tool, no traffic. Layers D to F not started |

## What is written but not applied

- **Migration 0245 (hands)** is the only one. Every migration through 0244 is applied on production
  (checked 2026-09-26 with `supabase migration list --linked`). 0245 as first committed dropped `gia` and
  `member` from PostgREST's exposed schemas; its author fixed it before any push (commit 9f486fc). Apply
  it only after a dry run, when step 1 is ready. A `supabase db push` applies **every** pending file, so a
  push for anything else would also apply 0245.
- The changelog entries for 0242 to 0244 still say "not applied yet"; they are applied.

## Current focus (2026-09-26)

1. **The concierge floor on Serene.** The company was onboarded from the roster on 2026-09-26; seats
   and queendom scoping are in place at every layer; Elaya is on for the floor. Next: real verdicts into
   the ticket training loop (accept or dismiss cards, so the lesson writer has something to learn from),
   then plan the Freshdesk cutover.
2. **Elaya's hands.** Step 1 built; `docs/architecture/hands-plan.md` has the rest and the founder
   decisions it waits on.
3. **One brain.** Retire the frozen Node brain (target 2026-10-16) once nothing depends on it.

## Next up, after the focus

- **The post-won bridge:** a won deal opens or links a member record (`gia.deals.member_id` exists with
  a foreign key and nothing sets it). The relationship then runs in one place from advert to the
  hundredth request.
- **Freshdesk cutover pieces:** the pilot queendom, the history import (`origin = freshdesk_import`), the
  member app reading Serene tickets, WhatsApp delivery of ticket alerts, the daily digest.
- **MCP Phase 4:** write tools with confirmation.
- **Elaya's eyes** (`docs/architecture/media-understanding-plan.md`, written 2026-09-26, a **plan,
  nothing built**): today Elaya and every reader see text only, while tens of thousands of files sit
  unread (about 28,000 images, 3,400 documents and 1,000 voice notes in the member groups; about
  59,000 Freshdesk notes with a file). The plan: read every file once, when it lands, into plain text
  and a few fields in one `media_readings` table, so every reader stays a text reader. The only file
  reading today is the vendor extractor's bills. Founder decisions are marked in the plan.
- **Elaya for finance, marketing and business**, once she has tools and data for them.
- **DPDP Act phase 2** (the largest non-feature obligation; substantive rules in force around 14 May
  2027, per `docs/audits/2026-07-02-dpdp-compliance-audit.md`): a consent / lawful-basis record at every
  ingestion point, WhatsApp STOP handling, an erasure core (erasure is structurally impossible today:
  the July audit counted ten append-only tables holding PII, and the member side has added more), a
  breach workflow, a data-principal rights flow, read-access logging
  beyond the member access log, a processor registry. The member `consent` column is reserved and
  unused; written card-on-file consent for vault cards is not recorded.

## Open items by area

### Security and access (from `docs/TODO.md`)

- **The sign-up hole.** `handle_new_user` (last defined in 0201) copies role, domain, seat and queendom
  from sign-up metadata, which the person signing up controls. Safe only while public sign-up is off on
  production (checked 2026-09-26: off). Durable fix: stop trusting user metadata, and turn sign-up off
  in `supabase/config.toml`.
- `linkMemberGroupAction` checks only that the caller can see the member, not their role or the group's
  queendom (a seated teammate calling it directly could pull another queendom's group into their scope).
- Ticket priority approval is enforced only in the page (`setTicketPriorityAction` trusts `approve`).
- Seat changes (`sia_role`, `queendom_id`) are not written to `profile_audit_log`.
- The tech workbench sees buttons it cannot use (Sia console, Freshdesk Sync now, vendor Merge and
  Remove, Teach Elaya saves), and a non-manager workbench teammate sees the full admin budget view.
- `getElayaChatSeedAction` is the one Elaya entry point without `hasElayaAccess` (returns only the
  caller's own seed). Elaya training writes are not pinned to a manager's own domain.
- Decisions left as they are by the founder: two concierge-domain accounts hold the founder role;
  `find_teammate` is a company-wide directory; a vendor's job history carries member names from every
  queendom.

### Bugs and gaps found in the 2026-09-26 refresh

- **`public.tasks` is not in the Realtime publication**, so the group workspace's live subtask updates
  never arrive (a one-line migration, or drop the dead subscription).
- The dashboard Pending Calls tile links to `/tasks?tab=gia`, a tab deleted on 2026-06-17.
- Two payment-status vocabularies on tickets (Money card: not started / requested / paid / waived;
  sentinel: unpaid / partial / paid).
- The seeded watch and bag ticket SLA rows have no escalation ladder, and the most specific row wins
  whole, so those tickets never escalate.
- The ticket board ignores every filter except the queendom.
- Members: identity facts (birthday, company, city) have no card; the Health filter works on the current
  page only; the Health sort uses the judgement score, not the live number; Requests shows Freshdesk
  only; stale "arrives in M2" copy on the Money card.
- Freshdesk ticket page: the requester is not linked to the member page; "Open in Sia" goes to bare
  `/sia` instead of the group.
- Team page: a Gia manager cannot open `/admin/users/[id]` although the page would admit them (the
  route map blocks it); invited accounts start with a blank phone (and a blank phone turns WhatsApp
  messages into leads); roster placements left open after onboarding.
- Oversight: a tech workbench agent gets the unclamped all-teams view.

### Environments and jobs

- Confirm the `GUPSHUP_*` variables on the Trigger.dev production worker (a 2026-09-22 finding: the
  brief's WhatsApp send failed there). Without them the brief, the alerts and the Sia watcher alarm lose
  their WhatsApp leg quietly.
- Confirm the `ZOHO_*` variables on the Trigger.dev worker (the brief skips money without them).
- **1,877 lead SLA timers sit in `pending` past their fire time** (oldest about 101 days, about 58 a
  week). Timers do fire again (the 2026-09-21 Trigger.dev key problem is resolved in practice), so this
  is likely rows not closed when a run is skipped. It keeps the engine health check's row 2 red. Not
  diagnosed.
- `scripts/engine-health-check.sql` fails as written since the `gia` schema move.
- **Partition upkeep:** nothing creates new monthly partitions. `sia.wag_*` and `member_events` run to
  2027-03, `sia.ticket_events` to 2027-12; later rows land in the default partition.
- The revival sweep runs at **02:00 IST** (`0 2 * * *` in `Asia/Calcutta`); comments and `CLAUDE.md`
  saying 07:30 are wrong (the Trigger.dev doc still asks to confirm on the dashboard).
- The analyst switches (`daily_briefing_enabled`, `elaya_alerts_enabled`) were seeded off; their live
  values are rows, so check before assuming the brief or alerts are on.

### Email and messaging

- **Brevo sender domain** (DKIM / SPF) not fully authenticated, so auth emails can land in spam.
- **`GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID`** not confirmed set; until it is, the customer welcome no-ops.
- Gupshup delivery receipts are acknowledged but not stored, so ticks beyond "sent" do not show.
- Founder new-lead WhatsApp alerts are paused in code (`FOUNDER_LEAD_ALERTS_PAUSED`); founder SLA
  escalations and "lead won" are muted per founder. Both reversible.

### Elaya

- Not built: the in-app Approve/Dismiss proposal card, MCP writes, embeddings (notes and memory load
  whole within a 6,000-character budget; build when someone's notes outgrow it), voice replies, the Exam
  page, reading images and files (the media-understanding plan above).
- `src/lib/elaya/CLAUDE.md` still says 12 read and 12 write tools (36 and 16 today); `backend/README.md`
  calls the brain "a FastAPI skeleton".
- The remaining Low items from `docs/audits/2026-06-25-elaya-full-audit.md` (fixed items are deleted from
  that doc, not annotated; read it for the current list).

### Stale code comments and registries (the docs are right)

Root `CLAUDE.md`, `.env.example` and the Freshdesk task header say Freshdesk allows 50 calls a minute
(it is 400 for the account, 100 for ticket endpoints); the root `CLAUDE.md` vendor rows describe Remove
and Merge rules that changed; `connector/README.md` and the watcher Dockerfile describe the pre-Fargate
state; the "no `server-only` because of Trigger.dev" comments give the wrong reason (the Trigger.dev
build stubs `server-only`; only laptop `tsx` scripts care).

### Design (from `docs/design/decision-log.md`, Open)

Decisions waiting: build `/dev/components` or retire that decision in favour of the specimen scripts;
sanction or remove two blurs outside the list (`LoadingVeil`, the `/m` scrims); the form label standard
(sentence case vs uppercase micro-label); Elaya's message shape (DNA says never bubbles; the shipped chat
uses bubbles); Elaya as a floating button (DNA says not; it ships); the route progress bar and page
transitions in DNA §14 (not built); CVA for variants (not a dependency); the orphaned `--z-veil` token.
The 2026-09-25 UI audit and the 2026-09-26 mobile audit are in `docs/audits/`; the mobile audit's main
findings were fixed the same day.

### Smaller product gaps

- Archived leads are invisible to phone search (RLS bakes in `archived_at IS NULL`).
- The revival review view has no way in from the UI.
- A duplicate active lead resubmission does not re-ping the original agent (an open product question).
- Won-deal capture is two steps (insert, then the status flip).
- Repeat reminders on tasks have no UI (only Elaya sets them); ticket tasks look like any task.
- Subscriptions: department-wide access is the permanent model (founder decision); no reminders.
- `/error-log` has no replay action.
- Call Intelligence: only onboarding was seeded; no delete path and no UI for hooks.
- Installed PWA icons from before a re-plate keep the old icon until the app is re-added.

## Counts that go stale (re-count before quoting)

WhatsApp groups linked to members (401 on 2026-09-18); how much of the Active members' history the
profiler has read (67% on 2026-09-21); Serene tickets and human verdicts (none as of 2026-09-25); Call
Intelligence cases per domain.
