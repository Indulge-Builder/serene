# Serene Documentation

> **Purpose:** the index — what every file in `docs/` is, the reading orders, and where to find anything.
> **Audience:** everyone. · **Source-of-truth scope:** the docs tree itself. Code is always the ultimate source of truth — docs describe reality, never aspiration; where a doc and the code disagree, the code wins and the doc gets fixed.
> **Last verified:** 2026-06-11 (docs restructure).

---

## The tree

```text
docs/
├── README.md                ← this index
├── 00-for-the-board.md      ← the whole product in plain English (non-technical)
├── 01-vision.md             ← vision, module roadmap, per-module "done"
├── changelog.md             ← THE single source of truth for what shipped, in order
├── _restructure-proposal.md ← the 2026-06-11 restructure plan (meta; cites old paths by design)
├── architecture/
│   ├── overview.md          ← system map, request flow, service→doc registry, hooks, Realtime
│   ├── database.md          ← every table's purpose + relationships (narrative)
│   ├── database_architecture.sql ← raw pg_dump schema snapshot
│   ├── auth-and-rbac.md     ← roles×domains, profiles foundation, sessions, RLS policy
│   ├── caching.md           ← Redis key registry, TTLs, invalidation contracts
│   └── migrations.md        ← conventions + full migration index (0001–0103)
├── design/
│   ├── DESIGN-DNA.md        ← the design constitution (law)
│   ├── design-system.md     ← component implementation reference
│   └── decision-log.md      ← dated design decisions + open design questions
├── rules/
│   └── The_Rules.md         ← the engineering constitution + rule-change Decision Log
├── pages/                   ← one spec per route (template below)
│   dashboard · leads · lead-dossier · tasks · deals · campaigns · performance
│   whatsapp · settings · auth · profile · user-management · ad-creatives · error-log
├── modules/
│   ├── gia.md               ← the CRM module: lifecycle, end-to-end flow, SLA engine
│   ├── elaya.md               ← AI presence (in design)
│   ├── sia.md               ← concierge module (not started)
│   ├── elaya.md              ← reserved (undefined)
│   └── call-intelligence.md ← helpdesk/call-intel spec (planned)
├── integrations/
│   ├── lead-ingestion.md    ← Pabbly/Meta webhook pipeline + raw-payload policy
│   ├── whatsapp-gupshup.md  ← Gupshup config, webhook, templates, orchestrator, logs
│   ├── trigger-dev.md       ← async jobs: SLA timers + task reminders
│   └── upstash-redis.md     ← Redis connection + failure policy
├── operations/
│   ├── environments.md      ← every env var: purpose, where used, exposure (no values)
│   └── deployment.md        ← providers, build commands, runtime constraints, checklist
├── audits/                  ← dated point-in-time audit reports (design, security; the
│                               performance audit was deleted once fully fixed — 2026-06-11)
├── claude-project/          ← generated digests for the Claude.ai Project knowledge
│                               (upload set + guide in its README; never cite as truth)
└── _archive/                ← pre-restructure originals (do not cite; delete later)
```

Code-adjacent references (not in `docs/`): root `CLAUDE.md` and the per-folder `CLAUDE.md`
files hold the working conventions AI sessions and engineers apply while writing code —
component prop contracts, per-function registries, migration inventory. The docs tree links to
them rather than duplicating them.

## Reading orders

**New engineer (day one, in order):**

1. `00-for-the-board.md` — what the product is
2. `architecture/overview.md` — the system map
3. `rules/The_Rules.md` — the laws
4. `architecture/auth-and-rbac.md` → `architecture/database.md` — the foundation
5. root `CLAUDE.md` — the working conventions
6. the `pages/*.md` spec for whatever you're touching, plus `architecture/caching.md` before
   touching any lead/dashboard/task read path

**Designer:**

1. `design/DESIGN-DNA.md` (the law) → 2. `design/design-system.md` (how it's implemented)
→ 3. `design/decision-log.md` (what's been decided/what's open) → 4. `00-for-the-board.md`
for product context

**Board / non-technical:** `00-for-the-board.md`, then `01-vision.md` if curious.

## "I want X" → read Y

| You want… | Read |
| --------- | ---- |
| What is this product? (no jargon) | `00-for-the-board.md` |
| What's live vs planned; what's "done" per module | `01-vision.md` |
| What shipped on date D | `changelog.md` |
| How the whole system fits together / request flow | `architecture/overview.md` |
| What a table is for / schema | `architecture/database.md` (+ the `.sql` dump) |
| Who can see/do what; sessions; RLS philosophy | `architecture/auth-and-rbac.md` |
| Redis keys, TTLs, invalidation | `architecture/caching.md` |
| A migration's purpose / conventions | `architecture/migrations.md` |
| Any visual rule (colour, motion, type, spacing) | `design/DESIGN-DNA.md` |
| How a UI component behaves | `design/design-system.md` (+ `src/components/CLAUDE.md`) |
| Why a design choice was made / open design questions | `design/decision-log.md` |
| An engineering rule (A/S/D/P/V/Q) | `rules/The_Rules.md` |
| How page `/x` works | `pages/x.md` |
| Lead lifecycle, SLA rules, ad→deal flow | `modules/gia.md` |
| How leads enter the system | `integrations/lead-ingestion.md` |
| Anything WhatsApp/Gupshup | `integrations/whatsapp-gupshup.md` |
| Delayed jobs / reminders / SLA mechanics | `integrations/trigger-dev.md` |
| An env var | `operations/environments.md` |
| How to deploy / build commands | `operations/deployment.md` |
| Known issues from the June 2026 audits | `audits/` + open tables therein |

## The page-spec template

Every file in `pages/` follows this exact structure:

```text
Header block  — purpose (1 line) · audience · source-of-truth scope · last-verified date
1. Purpose    — what the page is for, in a few sentences
2. Who sees it — role × domain access, route guards
3. Data sources — services / RPCs / actions / cache namespaces
4. Components — component inventory + where their contracts live
5. States     — loading / empty / error behaviour
6. Invariants — pointer to the must-never-be-violated list (kept in Deep dive)
7. Open items — known gaps and deferred decisions
8. Deep dive  — the preserved detailed reference sections (original numbering kept)
```

## Maintenance rules

- **Every meaningful change gets a `changelog.md` entry** (Q-06a) — before or alongside the
  code.
- **One home per topic.** A fact lives in exactly one file; everywhere else is a one-line
  pointer. If you find the same rule in two files, that's a bug — fix it by pointing.
- **Update `Last verified` when you re-verify a doc against code** — and only then.
- **Never cite `_archive/`** — those files carry known drift and exist only as a safety net
  until a later cleanup deletes the folder.
- **A wrong doc is worse than a gap.** If you can't verify a claim in code, write
  `TODO: verify` instead of guessing.
