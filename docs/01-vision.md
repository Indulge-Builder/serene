# Vision & Roadmap

> **Purpose:** the product vision, the module roadmap, and what "done" means per module.
> **Audience:** everyone technical; the non-technical version is `00-for-the-board.md`.
> **Source-of-truth scope:** forward direction and module status. Build *history* is `changelog.md` (the single source of truth for what shipped).
> **Last verified:** 2026-09-26 (module status checked against the module docs refreshed that day, `supabase/migrations/` through 0245, and production's applied list through 0244).

---

## The vision

Serene is the internal operating system for Indulge Global, built to luxury-product standards
because the team lives in it 8 to 12 hours a day. The previous tooling was wired together badly;
this build started from zero with explicit rules (`rules/The_Rules.md`), a design constitution
(`design/DESIGN-DNA.md`), and a modular architecture where the base OS does not change when a
module lands.

The arc: **run the sales operation (Gia), add the intelligence layer (Elaya), own the member
relationship after the sale (Sia: members, tickets, vendors), then give Elaya hands so she can
act in the world, not only in Serene.**

As of late September 2026 the first three steps are live. Sales runs on Gia. The concierge floor
has its WhatsApp archive, its member records, its own ticketing and its vendor book inside
Serene, although day-to-day ticket work still happens in Freshdesk. Elaya serves both halves.
The fourth step has started.

## Module roadmap

| Module | Status | What "done" looks like, and where it stands |
| ------ | ------ | ------------------------------------------- |
| **Serene** (base OS) | ✅ live | One login; role, domain and seat authorization at every layer; the neumorphic design with eight themes and a dark mode; dashboard; in-app notifications and Web Push; tasks; notes; installable PWA with a per-person icon; a phone layer at `/m`. Done means module work never has to touch the foundation. That holds; hardening continues through the audit cycle (`audits/`). |
| **Gia** (sales CRM) | ✅ live | A lead travels ad, ingestion, fair assignment, the worked dossier, resolution and deal without leaving Serene, with SLA guardrails and correct reporting at every step. Achieved. Its tables moved to the `gia` schema on 2026-09-17. A shop-app lead channel was added (0180). Founder WhatsApp pings for new leads and SLA breaches are paused. `modules/gia.md`. |
| **Lead Revival** | ✅ live (R1) | A daily sweep finds silent leads, a note-reading gate decides, confident ones get a "Revived" follow-up task and the rest go to a review tab. It never changes the lead itself. `modules/revival.md`. |
| **Call intelligence / Helpdesk** | ✅ live (Phase 1) | The `/helpdesk` library of cases and conversation hooks, surfaced on each lead's page. Phase 2 (similarity search) is not started. `modules/call-intelligence.md`. |
| **Oversight** | ✅ live | Managers and founders see what every team and person is working on right now. `pages/oversight.md`. |
| **Elaya** (AI presence) | ✅ live | Serves the Gia teams, the concierge floor, admins, founders and the tech team (finance, marketing and business are off for now). In the app, on WhatsApp, and in Claude or ChatGPT through the read-only MCP connector. Thinks in a Python brain on AWS with tool search over 52 tools; every write goes through the same cores the app uses; risky writes are proposed and confirmed. Remembers each person, logs the team's corrections, follows founder-written playbooks, and is gated by an eval set. Founders also get an analyst: SQL over a locked read-only schema, a live pulse, a twice-daily brief, an alert sweep and background deep reads. Not built yet: in-app approve/dismiss proposal cards, MCP writes, embeddings, voice replies, and reading images, files and voice notes in chats (planned in `architecture/media-understanding-plan.md`). The old Node brain is frozen, with retirement targeted for 2026-10-16. `modules/elaya.md`, `modules/elaya-analyst.md`. |
| **Sia** (concierge) | ✅ live, running beside Freshdesk | Done means the concierge team runs its member work inside Serene the way sales runs Gia. Live: the WhatsApp group archive (since 2026-08-27), the `/sia` viewer, three queendoms with seats (queen, bishop, genie, joker, and one company-wide Joker head), the read-only Freshdesk mirror, member records, Serene tickets and the vendor book, all scoped to a person's queendom. Still missing: the cutover from Freshdesk and the won-deal to member bridge. `modules/sia.md`. |
| **Members** (the member twin) | ✅ live | Every member has a record that fills itself: facts from chat (the profiler), the Observation box and imports; people and relations; an hourly activity pulse; a weekly judgement by Serene; one health number; an encrypted vault for cards and IDs; money read live from Zoho Books. About 614 members in three queendoms. Not built: the link from a won deal to a member (`deals.member_id` is never set), a member-app feed, money events, writers for most health signals. `modules/members.md`. |
| **Tickets** (Serene-native) | 🔨 built, not yet the team's main tool | Tickets with a state machine, SLA policies, a live board and a sentinel that watches deadlines and suggests moves for a person to approve. Intake reads the member groups and proposes tickets (824 proposals in the week to 2026-09-25). A training loop turns the team's verdicts into instructions the ticket AI follows, once the founder approves them; it has no verdicts yet. Done means the floor works tickets here instead of Freshdesk. `modules/tickets.md`. |
| **Vendors** | ✅ live | About 21,600 suppliers and 46,000 past jobs. One ranking answers "best vendor for this request" for the Find page, tickets, Elaya and the MCP connector. The book keeps itself current from Freshdesk notes and bills every 5 minutes, with a "Needs a look" queue where a person confirms, merges or removes new rows. Not built: screens for vendor status, capabilities or logging jobs by hand; Sia's WhatsApp groups do not feed vendors yet. `modules/vendors.md`. |
| **Subscriptions** | ✅ live | The company's recurring tools and bills, with encrypted passwords and an audited reveal; list, calendar and spend views. No reminders yet. `modules/subscriptions.md`. |
| **Books** (Zoho) | ✅ live, read-only | `/books` for the organisation's ledger (admin and founder) and a live finance page per member. Serene never writes to Zoho. `integrations/zoho-books.md`. |
| **MCP connector** | ✅ live (Phases 1 to 3) | Claude, ChatGPT and other AI apps can read Serene as the signed-in person, with the same permissions. Phase 4 (writes) is not built. `integrations/mcp.md`. |
| **Mobile** (`/m`) | ✅ live | A pocket surface for founders and managers: four rooms and the Elaya knob. `modules/mobile-ops.md`. |
| **Hands** | 🔨 step 1 built | Elaya gets a second WhatsApp number and can work with outside agents treated as vendors. Step 1 (migration 0245, the connector and services) is committed but not applied. The rest is a plan. `architecture/hands-plan.md`. |

## Current focus (as of 2026-09-26)

1. **The concierge floor on Serene.** The whole company was onboarded from the roster on
   2026-09-26, seats and queendom scoping are in place at every layer, and Elaya is on for the
   floor. Next: get real verdicts into the ticket training loop, then plan the Freshdesk cutover.
2. **Elaya's hands.** Step 1 of `architecture/hands-plan.md` is built.
3. **One brain.** Retire the frozen Node brain (target 2026-10-16) once nothing depends on it.

The open loose ends that are not features live in `TODO.md`.

## Where history lives

- **What shipped, when:** `changelog.md` (hundreds of dated entries since 2026-05-26), the single
  source of truth.
- **Schema history:** `architecture/migrations.md` (the full index to 0245, with numbering quirks
  and production status).
- **Decisions and reversals:** `rules/The_Rules.md` Decision Log (engineering) and
  `design/decision-log.md` (design).
