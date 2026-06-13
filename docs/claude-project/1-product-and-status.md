# Serene — Product & Status (Claude Project digest)

> Generated digest of `docs/00-for-the-board.md`, `docs/01-vision.md`, `docs/modules/*` — 2026-06-11.
> Source of truth is the repo docs; regenerate when they change.

## What Serene is

Serene is the internal operating system Indulge Global (India's premier luxury concierge brand,
based in Goa) built for itself. Every team member logs into one place for the sales pipeline,
prospect conversations, tasks, performance numbers, and work-distribution controls. It is a
production platform — agents live in it 8–12 hours a day — built to luxury-product standards:
dark textured canvas + floating paper content, five themes, calm/precise/refined.

The architecture is modular — named "floors" on one building. Adding a floor never rebuilds
the building:

| Module | What it is | Status |
| ------ | ---------- | ------ |
| **Serene** (base OS) | Login, theming (5 themes), role/domain authorization at three layers, dashboard shell, notifications, tasks | ✅ live |
| **Gia** (CRM) | The sales floor — full lead journey: ad → ingestion → fair assignment → worked dossier → resolution → deal, with SLA guardrails and role-correct reporting | ✅ live, daily use |
| **Client records** | Post-won flow — a won deal opens a client record (`deals.client_id` is the reserved hook) | 🔨 current focus |
| **Elaya** (AI presence) | Not a chatbot — a presence/compass surfacing insights. Four designed surfaces: Panel, Conversation, Inline Suggestion, Action Proposal. Design-first: fully specified (DESIGN-DNA §15), **no code wired yet** beyond the breathing glyph | 🔨 current focus (design-first) |
| **Sia** (Concierge) | Won clients as ongoing relationships, on top of client records | ⏸ not started |
| **Call intelligence / Helpdesk** | Spec complete (`docs/modules/call-intelligence.md`); awaiting content seeding | 📋 spec only |
| **Elaya** | Name reserved, scope undefined | ❓ |

## The journey of one lead (the heart of Gia)

1. Prospect taps a Meta/Instagram ad and submits details → webhook fires.
2. Seconds later the lead exists in Serene — validated, cleaned, deduped by phone (one phone never
   becomes two active records; a terminal lead re-enquiring spawns a new linked record).
3. Auto-assigned round-robin (fair taxi rank: longest-waiting active agent in the lead's
   domain; on-leave agents skipped via one switch on /settings).
4. Agent gets a WhatsApp alert; founders get a quiet copy; an in-app notification fires;
   SLA timers arm.
5. Agent calls outside Serene, then logs the call — every call/note/status change is recorded
   append-only (history can never be quietly rewritten).
6. SLA engine watches the clock (e.g. new lead not called in 15 min → agent nudged; 30 min →
   manager alerted; eight rules total across the lifecycle, IST business hours Mon–Sat 9–19).
7. Won → deal recorded in the deals ledger (walk-in purchases supported too). Nurturing →
   auto follow-up task 3 months out. Lost/junk → reason required.
8. Everyone sees role-correct data live: agent own pipeline, manager their domain, founders
   everything across the four sales domains (Onboarding, Indulge House, Indulge Shop, Legacy).

## The surfaces (sidebar pages)

Dashboard (bento-grid home) · Elaya (AI chat — read-only foundation: asks about your own leads,
tasks, deals, numbers and the case library via permission-scoped tools; 200 msgs/day shared
across channels; staff can also message Elaya over WhatsApp on the shared Gupshup number —
their number routes to the same brain with the same role-scoped tools; voice notes (WhatsApp)
and a composer mic (in-app) are transcribed to text and run through the same brain — voice is
an input transform only, replies stay text) · Leads
(pipeline list + per-lead dossier) · Deals (closed-business ledger) · WhatsApp (shared team
inbox — unknown number auto-creates a lead; staff numbers route to Elaya instead) · Tasks (personal + group projects + auto-created
Gia follow-ups) · Campaigns (which ads produce leads/wins) · Performance (agent/manager/founder
scoreboards) · Settings (agent roster/rota) · Admin: Users, Ad Creatives, Error Log · Profile.
Details per page: `3-pages-summary.md`.

## Trust principles (plain words, all enforced in code/DB)

- Role-based visibility enforced **in the database** (RLS), not just hidden in the UI.
- Logs and activity tables are append-only — no UPDATE/DELETE, ever.
- Privileged changes need a second actor and are audited (nobody self-promotes).
- Client PII never reaches outside AI services (D-01); WhatsApp notification logs keep only
  the last 4 phone digits.

## What's next (after current focus)

Sia on top of client records · an "answers desk" for agents (instant consistent answers to
"can we arrange X?") · a WhatsApp auto-assistant engaging new enquiries until an agent takes
over (schema columns exist — `bot_active` etc. — no code yet).

## Where history lives (repo)

`docs/changelog.md` — single source of truth, 425+ dated entries since 2026-05-26 ·
`docs/architecture/migrations.md` — 105 migrations indexed · Decision Logs in
`docs/rules/The_Rules.md` (engineering) and `docs/design/decision-log.md` (design).
