# Serene — Product & Status (Claude Project digest)

> Digest of `docs/00-for-the-board.md`, `docs/01-vision.md`, `docs/Indulge-Global.md`,
> `docs/modules/*`, and `docs/changelog.md` (through 2026-06-26). Source of truth is the repo docs;
> regenerate when they change. Built-vs-planned status is canonical in `9-roadmap-and-open-items.md`.

## What Serene is

Serene is the internal operating system **Indulge Global** built for itself. Every team member logs
into one place for the sales pipeline, prospect conversations, tasks, performance numbers, AI
assistance, and work-distribution controls. It is a production platform — agents live in it 8–12
hours a day — built to luxury-product standards: dark textured canvas + floating paper content,
five themes, calm/precise/refined.

**Indulge Global** (legal entity Pricetime Technologies Pvt Ltd; HQ Goa, India; founded 2020,
concierge launched 2022; founders Karan Bhangay (CEO) & Advita Bihani (COO); ~50 staff) is an
ultra-luxury, 24/7 personal concierge brand — reservations, travel, rare sourcing, events, wellness
— serving 500+ HNI families across 180+ countries, delivered primarily over WhatsApp with an AI +
human touch.

The architecture is modular — named "floors" on one building. Adding a floor never rebuilds the
building.

| Module | What it is | Status |
| ------ | ---------- | ------ |
| **Serene** (base OS) | Login, theming (5 themes), role/domain authorization at three layers, dashboard shell, notifications (in-app + Web Push), tasks, OTP password reset, PWA with per-user home-screen icon | ✅ live |
| **Gia** (CRM) | The sales floor — full lead journey: ad → ingestion → fair assignment → worked dossier → resolution → deal, with SLA guardrails and role-correct reporting | ✅ live, daily use |
| **Elaya** (AI presence) | Not a chatbot — a per-user assistant/compass. **Live**: provider-neutral brain; 11 read tools + 11 write tools; in-app SSE chat (`/api/elaya/chat`) + floating widget; WhatsApp staff channel; Deepgram voice input; propose→confirm for risky writes; `elaya_actions` audit ledger; per-user persona + durable learned-memory ("Jarvis" Phases 1–4). See `5-elaya-jarvis.md`. **Planned**: customer-facing WhatsApp persona, in-app proposal cards, notes section | ✅ live (Phases 1–4); customer bot planned |
| **Call Intelligence / Helpdesk** | Phase 1 live (migrations 0109/0110): `leads.service_interests text[]` + `service_cases` + `conversation_hooks`, `/helpdesk` page, dossier ServiceInterestCard, Redis-cached library (client-side filtering). Phase 2 (embedding similarity) deferred | ✅ live (Phase 1) |
| **Lead Revival** (R1) | Daily Trigger.dev cron sweep (07:30 IST) finds silent leads → note-AI 3-verdict gate (revive/dismiss/unsure, reuses Elaya routing/Haiku model, fails closed) → confident revive opens a "Revived" follow-up task (never mutates the lead row); unsure/overflow → review tab `/leads?revival=true`. Migration 0119 | ✅ live |
| **Client records** | Post-won flow — a won deal opens a client record (`deals.client_id` is the reserved hook) | 🔨 current focus |
| **Sia** (Concierge) | Won clients as ongoing relationships, on top of client records | ⏸ not started |

## The journey of one lead (the heart of Gia)

1. Prospect taps a Meta/Instagram ad and submits details → webhook fires.
2. Seconds later the lead exists in Serene — validated, cleaned, deduped by phone (one phone never
   becomes two active records; a terminal lead re-enquiring spawns a new linked record).
3. Auto-assigned round-robin (fair taxi rank: longest-waiting active agent in the lead's domain;
   on-leave agents skipped via one switch on `/settings`). Managers are now in the same pool
   (migration 0124).
4. Agent gets a WhatsApp alert; founders get a quiet copy; an in-app notification fires (and a Web
   Push to installed PWAs); SLA timers arm.
5. Agent calls outside Serene, then logs the call — every call/note/status change is recorded
   append-only (history can never be quietly rewritten).
6. SLA engine watches the clock (new lead not called in 15 min → agent nudged; 30 → manager;
   45 → founder; plus touched/in_discussion/nurturing rules and call-outcome cadences — see
   `8-integrations-and-jobs.md`). IST business hours Mon–Sat 09–19, with per-agent shift overrides.
7. Won → a deal row is written to the deals ledger **before** the status flips (walk-in purchases
   supported too). Nurturing → auto follow-up task. Lost/junk → reason required.
8. Everyone sees role-correct data live: agent own pipeline, manager their domain, founders
   everything across the four sales domains (Onboarding, Indulge House, Indulge Shop, Legacy).

## The surfaces (sidebar pages)

Dashboard (bento-grid home) · **Elaya** (AI chat — reads your own leads/tasks/deals/numbers and the
case library, and makes changes on your behalf with confirmation for risky ones; 200 msgs/day
shared across channels; staff can also message Elaya over WhatsApp; voice notes and a composer mic
transcribe to text) · **Leads** (pipeline list + per-lead dossier; the `?revival=true` review tab
surfaces leads the daily sweep flagged) · **Deals** (closed-business ledger) · **WhatsApp** (shared
team inbox — unknown number auto-creates a lead; staff numbers route to Elaya instead; inbound media
supported) · **Tasks** (personal + group projects + auto-created Gia follow-ups; Completed-history
modal) · **Campaigns** (which ads produce leads/wins) · **Performance** (agent self-scorecard /
manager roster / founder Agents+Domains scoreboards) · **Oversight** (manager+ 3-tier work-in-
progress drill: Teams → Team → Agent, with live activity rails) · **Escalations** (what needs
intervention now — SLA breaches, overdue tasks, going cold; agents get a self-scoped mirror) ·
**Helpdesk** (Call Intelligence library) · **Settings** (agent roster/rota, + admin/founder
sub-pages for the follow-up engine and lead-revival policies) · **Budget** (admin/founder ad
spend-vs-outcomes + per-account recharge ledger) · Admin: **Users**, **Ad Creatives**, **Usage**
(adoption tracking), **Suggestions** (staff feedback triage), **Error Log** · **Profile**.

In-app notifications fan out as **Web Push** (VAPID) to installed PWAs — the in-app row stays the
source of truth; push is a best-effort second channel (iOS only when added to the home screen).
Per-user notification preferences (migration 0133) let staff mute non-transactional categories per
channel. Details per page: `3-pages-summary.md`.

## Trust principles (plain words, all enforced in code/DB)

- Role-based visibility enforced **in the database** (RLS), not just hidden in the UI — and again in
  every server action (two layers, neither trusts the other).
- Logs and activity tables are append-only — no UPDATE/DELETE, ever (two narrow, documented
  exceptions: WhatsApp delivery receipts, task-remark suppression).
- Privileged changes (role/domain, deactivation) are admin/founder-gated and audited; nobody
  self-promotes.
- Client PII never reaches outside AI services as raw data (D-01); every Elaya tool result passes a
  PII mask; WhatsApp notification logs keep only the last 4 phone digits.

## What's next (after current focus)

Client records (post-won flow) is the current focus · Sia on top of client records · the
**customer-facing WhatsApp auto-assistant** (Elaya welcoming a brand-new lead with brochures /
testimonials / podcast, plus an admin training page) is **planned, not built** — its
`resolveCustomerPrincipal()` is a throwing stub and the dormant `bot_active`/`is_bot` columns are
never set. (The Elaya **staff** WhatsApp channel is already live; the unbuilt piece is the
customer-facing bot specifically.) The **notes section** (free-form user notes Elaya reads per turn)
has a built seam (`retrieveMemoryContext`) but no UI yet. See `9-roadmap-and-open-items.md`.

## Where history lives (repo)

`docs/changelog.md` — single source of truth, 600+ dated entries since 2026-05-26 ·
`docs/architecture/migrations.md` — migration index (files run through `0149`) ·
Decision Logs in `docs/rules/The_Rules.md` (engineering) and `docs/design/decision-log.md` (design).
