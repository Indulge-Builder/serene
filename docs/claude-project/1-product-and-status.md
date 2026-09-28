# Serene: Product and Status (Claude Project digest)

> **Purpose:** what Serene is, who Indulge is, every module and its status, the two journeys (a lead on the sales floor, a request on the concierge floor), the surfaces, and the trust principles. Start here.
> **Audience:** a claude.ai Project chat that cannot read the repo.
> **Source-of-truth scope:** a digest of `docs/00-for-the-board.md`, `docs/01-vision.md`, `docs/Indulge-Global.md`, `docs/architecture/overview.md` and the `docs/modules/` docs. The built-vs-planned ledger for this pack is `9-roadmap-and-open-items.md`; the concierge side in depth is `12-sia-concierge.md`.
> **Last verified:** not re-checked against code (a digest). Regenerated 2026-09-26 from the docs verified against the code that day (migrations through 0245; production has 0244 applied, 0245 not).

## What Serene is

Serene is the internal operating system **Indulge Global** built for itself. Every teammate logs into
one place, and everything they need lives there: the sales pipeline, the member relationships after
the sale, conversations, tasks, suppliers, performance numbers, and an AI assistant who knows the
business. It is a production platform (73 accounts across nine domains on 2026-09-26) built to
luxury-product standards, because the team lives in it 8 to 12 hours a day.

**Indulge Global** (legal entity Pricetime Technologies Pvt Ltd; HQ Goa, India; founded 2020,
concierge launched 2022; founders Karan Bhangay, CEO, and Advita Bihani, COO; about 50 staff) is an
ultra-luxury, 24/7 personal concierge brand (reservations, travel, rare sourcing, events, wellness)
serving 500+ HNI families, delivered mainly over WhatsApp.

**The look.** Since 2026-07-03 one warm neumorphic (soft-UI) material: cream canvas, porcelain cards,
paired light-and-shadow elevation. **Eight accent themes** (earth, the default; air, water, fire,
candy, rose, moss, lilac) change only the accent family, plus a warm-charcoal dark mode
(`data-neu="dark"`) from a Light / Dark / Auto preference. Law: `docs/design/DESIGN-DNA.md`. Digests:
`4-design-essentials.md`, `10-design-system.md`.

**The architecture is modular:** named floors on one building. The base OS never changes when a
module lands, and that promise held through the two big additions of the summer (the concierge side
and the Python brain).

## The modules and their status

| Module | What it is | Status |
| --- | --- | --- |
| **Serene** (base OS) | Login, the design system, role, domain and seat authorization at every layer, dashboard, tasks, notes, in-app notifications + Web Push with per-user mutes, ⌘K palette, PWA with a per-person icon, the Team page | ✅ live |
| **Gia** (sales CRM) | Ad to ingestion to fair round-robin to the worked dossier to resolution to deal, with SLA guardrails and role-correct reporting, for the four Gia domains. Tables moved to the `gia` schema on 2026-09-17. A Shop-app lead channel with product enquiries (0180). Founder WhatsApp pings for new leads and SLA breaches are paused | ✅ live, daily use |
| **Lead Revival** | A daily sweep finds silent leads; a note-reading gate revives confident ones as a "Revived" task and sends the rest to a review view. Never touches the lead row | ✅ live (R1) |
| **Call Intelligence / Helpdesk** | `/helpdesk` library of past deliveries and talking points, and the dossier interest card. Only onboarding was seeded | ✅ live (Phase 1); Phase 2 (similarity search) not started |
| **Oversight** | Managers and founders drill Teams → Team → Agent into live task work | ✅ live |
| **Elaya** (AI presence) | Chat in the app, on WhatsApp, and in Claude or ChatGPT through the MCP connector. Thinks in a Python brain on AWS with tool search over 52 tools (36 read, 16 write); risky writes are proposed then confirmed; living memory per person; improvement requests; founder-written playbooks; an eval set. Founders get an analyst (read-only SQL, pulse, twice-daily brief, alert sweep, deep reads). On for the Gia domains, concierge, admin, founder and the tech workbench; off for finance, marketing and business. See `5-elaya-jarvis.md` | ✅ live |
| **Sia** (concierge) | The WhatsApp group archive, the `/sia` viewer, three queendoms with seats, member records, Serene tickets, the vendor book, the Freshdesk mirror, all scoped to a person's queendom. See `12-sia-concierge.md` | ✅ live, running beside Freshdesk; cutover not built |
| **Members** (the member twin) | A record per member that fills itself: facts from chat, the Observation box and imports; people and relations; an hourly pulse; a weekly judgement by Serene; one health number; an encrypted vault for cards and IDs; live Zoho money. About 614 members | ✅ live |
| **Tickets** (Serene-native) | State machine, SLA policies, live board, a per-ticket sentinel that suggests moves, intake that proposes tickets from the chats, a training loop the founder approves | 🔨 built and running, not yet the floor's main tool |
| **Vendors** | About 21,600 suppliers and 46,000 past jobs; one ranking; a live extractor reading Freshdesk notes every 5 minutes; a review queue | ✅ live |
| **Freshdesk mirror** | Read-only copy of the Freshdesk account, synced every minute, `/freshdesk` pages | ✅ live |
| **Books** (Zoho) | `/books` for admin and founder; a live finance page per member. Read only | ✅ live |
| **Subscriptions** | Finance and tech tracker for recurring bills and top-ups, encrypted passwords with an audited reveal. No reminders | ✅ live (Phase 1) |
| **MCP connector** | Outside AI apps read Serene as the signed-in person | ✅ live (Phases 1 to 3); writes not built |
| **Mobile** (`/m`) | Four rooms (Dashboard, Tasks, Budget, Activity) plus the Elaya knob for founders and Gia managers on a phone | ✅ live |
| **Hands** | Elaya gets a second WhatsApp number and works with outside agents treated as vendors | 🔨 step 1 committed (migration 0245, not applied); the rest is a plan |

## Who uses it

| Group | Domains | What they work in |
| --- | --- | --- |
| Sales floor (Gia) | onboarding, house, shop, legacy | Leads, deals, the WhatsApp inbox, campaigns, budget, performance, escalations, oversight |
| Concierge floor (Sia) | concierge, seated in one of three queendoms (Anishqa, Ananyshree, Sanika) as queen, bishop, genie or joker; one company-wide Joker head | Members, Sia, Freshdesk, tickets, vendors, tasks |
| Finance, marketing, business | one domain each | Tasks, notes, subscriptions (finance), campaigns (marketing, business); no Elaya for now |
| Tech | the "workbench": reaches almost every page to test; writes stay with admin and founder | everything, read mostly |
| Admin, founder | any domain | everything; the founder has a curated sidebar |

`business` was `b2b` until 2026-09-16 and is not a Gia domain.

## The journey of one lead (the sales floor)

1. A prospect taps a Meta or Instagram ad (or enquires in the Indulge Shop app); a webhook fires.
2. Seconds later the lead exists in Serene: validated, cleaned, deduped by E.164 phone (one phone never
   becomes two active records; a terminal lead re-enquiring spawns a new linked record).
3. Round-robin assigns it: the longest-waiting active agent in the lead's domain (managers are in the
   pool, 0124; people on leave are skipped by one switch on `/settings`).
4. The agent gets a WhatsApp alert, an in-app notification and a Web Push; SLA timers arm. The founder
   copy of every new lead is paused (2026-09-21) and founder SLA escalations are muted per founder
   (2026-09-23); both are reversible.
5. If the prospect messages the WhatsApp line first, the customer Elaya can welcome them once
   (approved template, then conversation) while the lead pipeline still runs. The welcome template id
   is still not confirmed set, so the welcome may be skipping.
6. The agent calls, then logs the call. Every call, note and status change is append-only.
7. The SLA engine watches the clock (new lead not called in 15 minutes: agent nudged; then manager,
   then founder), in business minutes (IST, Mon to Sat, 09:00 to 19:00).
8. Won: a deal row is written before the status flips; walk-in deals are supported; Elaya can propose
   a deal (`log_deal`) for a human yes. Nurturing: an automatic follow-up task. Lost or junk: a reason.
9. Everyone sees role-correct data: agent own leads, manager their domain (with a My Leads / Team Leads
   toggle), founders everything, narrowed by a global domain selector.

## The journey of one member request (the concierge floor)

1. A member writes in their WhatsApp group with the concierge team.
2. The Sia watcher, a silent WhatsApp account in every group, saves the message. It never speaks.
3. Within a minute, ticket intake reads the burst and, if it is a real request, files a suggested
   ticket card for the member's queendom, already drafted. A person creates it or dismisses it.
4. The ticket has deadlines from its SLA policy. Its sentinel nudges the team when one slips and
   suggests the next status move for a person to approve.
5. If a supplier is needed, the ticket suggests the best vendors from the one ranking, with reasons.
   The job lands on the vendor's ledger and closes with the ticket; the team rates the vendor.
6. The member's record fills itself: the profiler files preferences, family and occasions from the
   chat, intake logs tone, and every week Serene writes its own judgement of the relationship.
7. The founders get a short brief twice a day (10:00 and 18:00 IST): who is waiting on a reply, what
   went wrong, what went well, queendom by queendom.

Honest status: the floor still does most of its ticket work in Freshdesk. Serene mirrors Freshdesk
read-only and runs its own tickets alongside, so the move can happen without losing anything.

## The surfaces

**Sales floor:** Dashboard (bento grid) · Leads (list + dossier; `?revival=true` review view) · Deals ·
WhatsApp (shared inbox for the company number) · Campaigns · Budget · Performance · Escalations ·
Oversight · Helpdesk.

**Concierge floor:** Members (list, member page, finance page) · Sia (read-only group viewer) · Tickets
(list, new, ticket page, board; reached from Sia and notifications) · Freshdesk · Vendors (list,
vendor page, Find a vendor).

**Everyone:** Tasks · Notes · Elaya (where switched on) · Profile.

**Admin, founder and configuration:** Team (`/admin/users`, accounts and seats) · Books ·
Subscriptions (also finance and tech) · Settings hub (lead routing roster) with Follow-up Engine, Lead
Revival, Tickets settings, Teach Elaya (Training, Playbooks, Requests) · Ad Creatives · Usage ·
Suggestions · Error Log.

**Off the sidebar:** `/m`, the phone layer (admin and founder phones land there automatically).
Global chrome: the ⌘K command palette, the notification bell on each page's title row, the admin and
founder domain selector, the floating Elaya button, "Send feedback". Per-route detail:
`3-pages-summary.md`.

## Trust principles (enforced in code and the database)

- **People see only what their role and seat allow**, enforced in the database (RLS) and again in every
  server action. An agent sees their own leads, a manager their domain, a concierge seat their own
  queendom's members, founders everything.
- **Nobody promotes themselves.** Role, domain, seat and queendom are set by admin or founder and are
  never self-editable (the seat pin is migration 0243). Deactivation is a flag plus an auth-level ban,
  never a delete.
- **History cannot be quietly rewritten.** Calls, notes, remarks, ticket events, member facts, vendor
  jobs and audit logs are append-only; the few resolve-once exceptions are named in the rules.
- **Private details are handled with care.** Every tool result passes a PII mask before a model sees
  it; chat text going to a model has names swapped for code names first, with a leak check. The one
  approved exception: supplier bills go to the model as images. Member cards and IDs are encrypted in
  the app; opening one asks why and records who looked. WhatsApp notification logs keep only the last
  four phone digits. Audio is transcribed and discarded.
- **Serene never writes to Freshdesk or Zoho.** Both are read-only.
- **The WhatsApp watcher never sends.** It only listens.
- **Secrets stay server-side.** Subscription passwords are pgcrypto-encrypted with a Vault key; every
  reveal writes an audit row first.

## Recent operational facts worth knowing

- **2026-09-26:** the whole company was onboarded from the roster (accounts and seats); Elaya limited to
  the Gia and concierge teams (`ELAYA_DOMAINS`); the Joker head seat (0244); many bishops per queendom
  (0242); nobody can change their own seat (0243); the health score became one number; every Active
  member judged once (about ₹700).
- **2026-09-21 to 09-23:** founder new-lead WhatsApp alerts paused in code; founder SLA escalations and
  "lead won" muted through per-founder preference rows.
- **2026-09-18/19:** the shared Anthropic account hit its monthly limit and stopped the profiler and
  Elaya for a day; failure handling was fixed so a provider outage never counts against a conversation.
- **2026-09-17:** the schema restructure: Gia tables to `gia`, the clients tables renamed to members and
  moved to `member`. Two short outages from embeds across schemas, fixed.
- **2026-09-03/04:** both Elaya channels switched to the Python brain; the Node brain is frozen,
  retirement targeted 2026-10-16.
- **2026-08-27:** the Sia archive went live after a session incident that set the watcher's operating
  rule (freeze, audit read-only, let a human decide).

## What is next

1. The concierge floor on Serene: real verdicts into the ticket training loop, then plan the Freshdesk
   cutover.
2. Elaya's hands (step 1 built).
3. One brain: retire the Node brain (target 2026-10-16).
4. The post-won bridge: a won deal opens (or links) the member record.

The largest known non-feature obligation is DPDP Act compliance phase 2 (consent records, WhatsApp
opt-out, an erasure core), with the substantive rules in force around 14 May 2027. Details:
`9-roadmap-and-open-items.md`.

## Where history lives (repo)

`docs/changelog.md` (the single source of truth, hundreds of dated entries since 2026-05-26) ·
`docs/architecture/migrations.md` (index 0001 to 0245 and production status) · the Decision Logs in
`docs/rules/The_Rules.md` and `docs/design/decision-log.md` · `docs/audits/` (dated snapshots) ·
`docs/TODO.md` (open loose ends).
