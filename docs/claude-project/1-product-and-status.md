# Serene — Product & Status (Claude Project digest)

> Generated digest of `docs/00-for-the-board.md`, `docs/01-vision.md`, `docs/modules/*` — 2026-06-15.
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
| **Elaya** (AI presence) | Not a chatbot — a presence/compass. **Live**: 6 read-only tools + SSE chat at `/api/elaya/chat` (Phase 1); Phase 2 agentic writes (E3) — 4 write tools (`add_lead_note`/`create_lead_task` execute inline; `update_lead_status`/`reassign_lead` propose-only, run through a pure-code confirmation resolver before each turn), `elaya_actions` state-machine ledger, every write wraps the shared `lead-mutations.ts` core (cache/activity/SLA/notify inherited identically); WhatsApp staff channel (a staff number routes to the same brain/tools/cap, one reply); voice input (Deepgram Nova-2 Hinglish, in-app composer mic + inbound WhatsApp voice notes; audio never stored, never auto-sends) | ✅ live |
| **Sia** (Concierge) | Won clients as ongoing relationships, on top of client records | ⏸ not started |
| **Call intelligence / Helpdesk** | Phase 1 live (migrations 0109/0110): `leads.service_interests text[]` + `service_cases` + `conversation_hooks`, `/helpdesk` page, dossier ServiceInterestCard, Redis-cached library (client-side filtering) | ✅ live |
| **Lead Revival** (R1) | Daily Trigger.dev cron sweep (07:30 IST) finds silent leads → note-AI 3-verdict gate (revive/dismiss/unsure, reuses Elaya routing model, fails closed) → confident revive opens a "Revived" follow-up task (never mutates the lead row); unsure/overflow → review tab `/leads?revival=true`. Migration 0119 (`revival_policies` + `revival_candidates`) | ✅ live |

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
(pipeline list + per-lead dossier; the `?revival=true` review tab surfaces leads the daily
Lead Revival sweep flagged unsure/over-cap for a human call) · Deals (closed-business ledger) ·
WhatsApp (shared team inbox — unknown number auto-creates a lead; staff numbers route to Elaya
instead) · Tasks (personal + group projects + auto-created
Gia follow-ups) · Campaigns (which ads produce leads/wins) · Performance (agent/manager/founder
scoreboards) · Settings (agent roster/rota) · Admin: Users, Ad Creatives, Error Log · Profile.
In-app notifications now also fan out as Web Push (VAPID) to installed PWAs — the in-app row stays
the source of truth; the push is a best-effort second channel (iOS only when added to the home
screen). Details per page: `3-pages-summary.md`.

## Trust principles (plain words, all enforced in code/DB)

- Role-based visibility enforced **in the database** (RLS), not just hidden in the UI.
- Logs and activity tables are append-only — no UPDATE/DELETE, ever.
- Privileged changes need a second actor and are audited (nobody self-promotes).
- Client PII never reaches outside AI services (D-01); WhatsApp notification logs keep only
  the last 4 phone digits.

## What's next (after current focus)

Client records (post-won flow) remains the current focus · Sia on top of client records · a
customer-facing WhatsApp auto-assistant engaging new enquiries until an agent takes over is
**still not built** — its schema columns (`bot_active`, `is_bot`) stay dormant. (The Elaya
**staff** WhatsApp channel — staff numbers routed to the same brain/tools — is already live; the
unbuilt piece is the customer-facing bot specifically.)

## Where history lives (repo)

`docs/changelog.md` — single source of truth, 425+ dated entries since 2026-05-26 ·
`docs/architecture/migrations.md` — 121 migrations indexed (0001–0121) · Decision Logs in
`docs/rules/The_Rules.md` (engineering) and `docs/design/decision-log.md` (design).
