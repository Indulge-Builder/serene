# Serene Documentation

> **Purpose:** the index. What every file in `docs/` is, the reading orders, and where to find anything.
> **Audience:** everyone. · **Source-of-truth scope:** the docs tree itself. Code is always the ultimate source of truth. Docs describe reality, never aspiration. Where a doc and the code disagree, the code wins and the doc gets fixed.
> **Last verified:** 2026-09-26 (full-tree refresh against `supabase/migrations/` through 0245, `src/`, `src/trigger/`, `backend/` and `connector/`; production has every migration through 0244 applied. Seven new docs, every other doc re-verified or marked as a dated snapshot).

---

## What changed in the 2026-09-26 refresh

The docs had last been audited on 2026-07-02, at migration 0156. Since then the product grew a
second half. The refresh brought every doc up to the code and added homes for the parts that had
none:

- **New:** `modules/members.md`, `modules/tickets.md`, `modules/elaya-analyst.md`,
  `pages/members.md`, `pages/tickets.md`, `pages/sia.md`, `integrations/sia-connector.md`, and
  `claude-project/12-sia-concierge.md`.
- **Rewritten:** the four top-level docs; all of `architecture/` except the plans; `modules/sia.md`
  (was a stub), `elaya.md`, `vendors.md` (was a spec), `subscriptions.md`, `gia.md`,
  `call-intelligence.md` and `mobile-ops.md` (both were plans); `integrations/freshdesk.md`,
  `zoho-books.md`, `trigger-dev.md` and `whatsapp-gupshup.md`; `operations/environments.md`,
  `deployment.md` and `maintenance.md`; `design/design-system.md`; most `pages/` specs; and
  the `claude-project/` pack.
- **Patched with dated notes, not rewritten:** `design/DESIGN-DNA.md` (the law: a "what changed
  since July" table and "As built" / "Superseded" notes where it drifted). `design/design-serene.md`
  is marked as a superseded July snapshot.
- **Where a page is documented inside its module or integration doc** (one home per topic):
  the vendor pages live in `modules/vendors.md`, `/freshdesk` in `integrations/freshdesk.md`,
  `/books` in `integrations/zoho-books.md`, `/subscriptions` in `modules/subscriptions.md`, the
  Teach Elaya pages in `modules/elaya.md`, and `/m` in `modules/mobile-ops.md`.

## The tree

```text
docs/
├── README.md                  this index
├── 00-for-the-board.md        the whole product in plain English (non-technical)
├── 01-vision.md               vision, module roadmap, what "done" means per module
├── TODO.md                    the short live list of open loose ends
├── Indulge-Global.md          the company dossier (external facts: press, founders, funding)
├── changelog.md               THE single source of truth for what shipped, in order
├── instruction-for-claude.md  a working-memory brief for chat-based Claude sessions
│
├── architecture/
│   ├── overview.md            system map, request flow, every service and its home doc, Realtime, hooks
│   ├── database.md            every table by schema (public, gia, member, sia, freshdesk, elaya_read)
│   ├── database_architecture.sql  raw pg_dump from 2026-06-12 (before 0108); migrations are the truth
│   ├── auth-and-rbac.md       roles, domains, seats and queendoms, who can see and do what
│   ├── caching.md             Redis key registry, TTLs, invalidation contracts
│   ├── migrations.md          conventions, production status, and the full index (0001 to 0245)
│   ├── schema-restructure-plan.md  SHIPPED 2026-09-17 (gia + member schemas); kept as the runbook
│   ├── mcp-plan.md            the MCP connector plan: Phases 1 to 3 shipped, Phase 4 (writes) open
│   ├── hands-plan.md          PLAN: Elaya gets hands (a second WhatsApp number, agent vendors); step 1 built
│   └── media-understanding-plan.md  PLAN: Elaya's eyes (reading images, files, voice, video); nothing built
│
├── modules/                   how a part of the product works end to end
│   ├── gia.md                 the sales CRM: lead lifecycle, ad to deal, the SLA engine
│   ├── revival.md             Lead Revival: silence, then the note-AI gate, then revive or review
│   ├── call-intelligence.md   the helpdesk library and the dossier service-interest card
│   ├── elaya.md               THE home for Elaya: access, brains, tools, channels, memory, playbooks, Teach Elaya
│   ├── elaya-analyst.md       the founder layer: ask the database, pulse, brief, alerts, deep read
│   ├── customer-welcome-blast.md  the customer-facing WhatsApp Elaya (welcome + prospect replies)
│   ├── voice-dictation.md     Deepgram speech to text (one mic cluster, every voice surface)
│   ├── web-push.md            Web Push (VAPID), the second notification channel
│   ├── mobile-ops.md          the /m phone layer: four rooms and the Elaya knob
│   ├── sia.md                 THE hub for the concierge side: layers, queendoms, seats, links out
│   ├── members.md             the member twin: spine, facts, profiler, health, judgement, vault, money
│   ├── tickets.md             Serene's own ticketing: state machine, SLA, sentinel, intake, training loop
│   ├── vendors.md             the vendor book, ranking, live extractor, review workflow, and the vendor pages
│   └── subscriptions.md       the subscriptions and bills tracker, and its page
│
├── pages/                     one spec per route (template below)
│   dashboard · leads · lead-dossier · deals · campaigns · performance · budget · ad-creatives
│   helpdesk · tasks · whatsapp · oversight · escalations · notes · elaya · elaya-training
│   members · tickets · sia · settings · user-management · profile · auth
│   error-log · usage · suggestions
│
├── integrations/              the outside world
│   ├── lead-ingestion.md      Pabbly / Meta / shop app webhooks and the raw-payload policy
│   ├── whatsapp-gupshup.md    Gupshup: webhook, templates, the staff gate, sends and logs
│   ├── sia-connector.md       the Baileys WhatsApp group watcher on AWS Fargate
│   ├── freshdesk.md           the read-only Freshdesk mirror, and the /freshdesk pages
│   ├── zoho-books.md          read-only Zoho Books, the /books page, member finance
│   ├── mcp.md                 the MCP connector: Claude, ChatGPT and other AI apps reading Serene
│   ├── mcp-team-guide.md      the team's one page on connecting Serene to Claude or ChatGPT
│   ├── trigger-dev.md         every background and scheduled task
│   └── upstash-redis.md       the Redis connection and its failure policy
│
├── operations/
│   ├── environments.md        every env var: purpose, where used, exposure (never values)
│   ├── deployment.md          every deploy target: Vercel, Trigger.dev, AWS (brain + watcher), Supabase
│   ├── maintenance.md         recurring duties and open upkeep items
│   ├── engine-health-check.md the daily SLA / revival engine runbook
│   └── pwa-install-guide.md   installing Serene as an app
│
├── design/
│   ├── DESIGN-DNA.md          the design constitution (law)
│   ├── design-system.md       how the components implement it
│   ├── control-system.md      buttons, fields, selection controls, focus: the control families
│   ├── decision-log.md        dated design decisions and open design questions
│   └── design-serene.md       the 2026-07-03 design-department handoff (see its header for status)
│
├── rules/
│   └── The_Rules.md           the engineering constitution and the rule-change Decision Log
│
├── data-imports/              one-off data loads and what is left of them
│   └── freshdesk-contact-notes.md
├── audits/                    dated point-in-time audit reports (never edited after the fact)
├── ai/
│   └── claude-project-instructions.md  the custom-instruction text for a claude.ai Project
├── claude-project/            generated digests for the claude.ai Project knowledge (regenerated from these docs)
└── notion-files/              an old Notion export, kept for reference only; never cite as truth
```

Code-adjacent references (not in `docs/`): the root `CLAUDE.md` and the per-folder `CLAUDE.md`
files (`src/lib/`, `src/lib/services/`, `src/lib/actions/`, `src/lib/elaya/`, `src/components/`,
`src/app/`, `supabase/migrations/`) hold the working conventions and the file-by-file registries.
`backend/README.md` and `connector/README.md` cover the two AWS services at code level. The docs
tree links to them rather than copying them.

Planning files at the repo root (`master-plan.md`, `member-ticket-plan.md`,
`plan-sia-intelligence.md`, `plan-whatsapp.md`, `plan-elaya.md`, `elaya-workflow.md`,
`port-inventory.md`) are working plans and narratives. Most of what they planned has shipped and
is now written up in the module docs above. Treat them as history and intent, never as the
description of today.

## Reading orders

**New engineer, day one, in order:**

1. `00-for-the-board.md`: what the product is
2. `architecture/overview.md`: the system map
3. `rules/The_Rules.md`: the laws
4. `architecture/auth-and-rbac.md`, then `architecture/database.md`: the foundation
5. the root `CLAUDE.md`: the working conventions
6. the `modules/` and `pages/` docs for whatever you are touching, plus `architecture/caching.md`
   before touching any lead, dashboard or task read path

**Working on the concierge side (Sia):**

1. `modules/sia.md`: the hub, the queendoms and seats
2. `modules/members.md`, then `pages/members.md`
3. `modules/tickets.md`, then `pages/tickets.md`
4. `integrations/sia-connector.md`, `pages/sia.md`, `integrations/freshdesk.md`
5. `modules/vendors.md`

**Working on Elaya:** `modules/elaya.md`, then `modules/elaya-analyst.md`, then
`integrations/mcp.md`. Code level: `src/lib/elaya/CLAUDE.md` and `backend/README.md`.

**Designer:** `design/DESIGN-DNA.md` (the law), then `design/control-system.md` and
`design/design-system.md` (how it is built), then `design/decision-log.md` (what is decided and
what is open), then `00-for-the-board.md` for product context.

**Board / non-technical:** `00-for-the-board.md`, then `01-vision.md` if curious.

## "I want X" → read Y

| You want… | Read |
| --------- | ---- |
| What is this product? (no jargon) | `00-for-the-board.md` |
| What is live vs planned; what "done" means per module | `01-vision.md` |
| What shipped on date D | `changelog.md` |
| The open loose ends right now | `TODO.md` |
| Who Indulge Global is (company facts) | `Indulge-Global.md` |
| How the whole system fits together | `architecture/overview.md` |
| What a table is for, which schema it lives in | `architecture/database.md` |
| A migration's purpose, numbering, or whether it is applied | `architecture/migrations.md` |
| Who can see or do what (roles, domains, seats, queendoms) | `architecture/auth-and-rbac.md` |
| Redis keys, TTLs, invalidation | `architecture/caching.md` |
| How the `gia` / `member` schema move was done (runbook) | `architecture/schema-restructure-plan.md` |
| Any visual rule (colour, motion, type, spacing) | `design/DESIGN-DNA.md` |
| How a button, field or selection control should behave | `design/control-system.md` |
| How a UI component behaves | `design/design-system.md` (+ `src/components/CLAUDE.md`) |
| Why a design choice was made; open design questions | `design/decision-log.md` |
| An engineering rule (R/A/S/D/P/V/Q) | `rules/The_Rules.md` |
| How page `/x` works | `pages/x.md` (see the list above for pages that live in a module doc) |
| Lead lifecycle, SLA rules, ad to deal | `modules/gia.md` |
| Lead Revival | `modules/revival.md` |
| Everything Elaya: access, tools, brains, channels, memory, playbooks | `modules/elaya.md` |
| Elaya's analyst: SQL questions, the pulse, the brief, alerts, deep reads | `modules/elaya-analyst.md` |
| The customer WhatsApp Elaya (welcome blast + replies) | `modules/customer-welcome-blast.md` |
| The concierge side: queendoms, seats, what Sia is made of | `modules/sia.md` |
| What Serene knows about a member and where it came from | `modules/members.md` |
| Serene's tickets, the sentinel, intake, the training loop | `modules/tickets.md` |
| Vendors: the book, ranking, the live extractor, the vendor pages | `modules/vendors.md` |
| Subscriptions and bills | `modules/subscriptions.md` |
| The phone layer at `/m` | `modules/mobile-ops.md` |
| How leads enter the system | `integrations/lead-ingestion.md` |
| Anything Gupshup (the company WhatsApp number) | `integrations/whatsapp-gupshup.md` |
| The WhatsApp group watcher (Sia archive) | `integrations/sia-connector.md` |
| The Freshdesk mirror and the `/freshdesk` pages | `integrations/freshdesk.md` |
| Zoho Books, `/books`, member money | `integrations/zoho-books.md` |
| Claude / ChatGPT / other AI apps reading Serene | `integrations/mcp.md` |
| The team's one page on connecting an AI app | `integrations/mcp-team-guide.md` |
| Background jobs, schedules, which switch gates them | `integrations/trigger-dev.md` |
| An env var | `operations/environments.md` |
| How to deploy anything | `operations/deployment.md` |
| Is the SLA / revival engine healthy today | `operations/engine-health-check.md` |
| Recurring upkeep (partitions, pinned versions, the watcher phone) | `operations/maintenance.md` |
| Known issues from past audits | `audits/` |
| Elaya getting hands (the plan) | `architecture/hands-plan.md` |
| Elaya reading images, files, voice and video (the plan) | `architecture/media-understanding-plan.md` |

## The page-spec template

Every file in `pages/` follows this structure:

```text
Header block  purpose (1 line) · audience · source-of-truth scope · last-verified date
1. Purpose    what the page is for, in a few sentences
2. Who sees it  role, domain and seat access, route guards
3. Data sources  services, RPCs, actions, cache namespaces
4. Components  component inventory and where their contracts live
5. States     loading, empty and error behaviour
6. Invariants  what must never be violated
7. Open items  known gaps and deferred decisions
8. Deep dive  the detailed reference sections
```

## Maintenance rules

- **Every meaningful change gets a `changelog.md` entry** (Q-06a), before or alongside the code.
- **One home per topic.** A fact lives in exactly one file; everywhere else is a one-line pointer.
  If you find the same rule in two files, that is a bug: fix it by pointing.
- **Update `Last verified` when you re-verify a doc against code**, and only then. Say what you
  checked it against.
- **A plan dies when it ships.** Its as-built facts move into the module or page doc that owns the
  topic. The plan is then deleted, or kept only as a runbook with a status line saying so.
- **A wrong doc is worse than a gap.** If you cannot verify a claim in code, write `TODO: verify`
  instead of guessing.
- **Audits are snapshots.** Never edit an audit to match later code. A fully fixed audit can be
  deleted once its lasting rules have moved into the `CLAUDE.md` files or `The_Rules.md`.
- **Write plainly.** Simple words, short sentences, no em-dashes in new text.
