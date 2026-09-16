# Serene — Product & Status (Claude Project digest)

> Digest of `docs/00-for-the-board.md`, `docs/01-vision.md`, `docs/Indulge-Global.md`,
> `docs/modules/*`, and `docs/changelog.md` (through 2026-08-22). Source of truth is the repo docs;
> regenerate when they change. Built-vs-planned status is canonical in `9-roadmap-and-open-items.md`.

## What Serene is

Serene is the internal operating system **Indulge Global** built for itself. Every team member logs
into one place for the sales pipeline, prospect conversations, tasks, performance numbers, AI
assistance, recurring bills, and work-distribution controls. It is a production platform — agents
live in it 8–12 hours a day — built to luxury-product standards.

Since 2026-07-03 the surface is a **neumorphic (soft-UI) system**: one cream material
(`#ECE8E1` canvas / `#F1EDE6` surface), paired light-and-shadow elevation, Marshmallow radii, and
**eight** accent themes that change *only* the accent family. A warm-charcoal **dark mode**
(`data-neu="dark"`) rides the same tokens. The pre-neumorphic "dark canvas + floating paper"
description is retired everywhere except the auth screens' atmosphere. Full detail:
`4-design-essentials.md` and `10-design-system.md`.

**Indulge Global** (legal entity Pricetime Technologies Pvt Ltd; HQ Goa, India; founded 2020,
concierge launched 2022; founders Karan Bhangay (CEO) & Advita Bihani (COO); ~50 staff) is an
ultra-luxury, 24/7 personal concierge brand — reservations, travel, rare sourcing, events, wellness
— serving 500+ HNI families across 180+ countries, delivered primarily over WhatsApp with an AI +
human touch.

The architecture is modular — named "floors" on one building. Adding a floor never rebuilds the
building.

| Module | What it is | Status |
| ------ | ---------- | ------ |
| **Serene** (base OS) | Login, the neumorphic design system (8 themes + light/dark/auto appearance), role/domain authorization at three layers, dashboard shell, ⌘K command palette, notifications (in-app + Web Push + per-user channel mutes), tasks, OTP password reset, PWA with a per-user home-screen icon and a branded boot screen | ✅ live |
| **Gia** (CRM) | The sales floor — full lead journey: ad → ingestion → fair assignment → worked dossier → resolution → deal, with SLA guardrails and role-correct reporting | ✅ live, daily use |
| **Elaya** (AI presence) | Not a chatbot — a per-user assistant/compass. **Live:** provider-neutral brain; **12 read + 12 write tools**; in-app SSE chat + floating widget + the `/m` mobile screen; WhatsApp staff channel; a hard-capped **customer** WhatsApp channel (welcome-blast + prospect conversation); Deepgram voice input; propose→confirm for risky writes; `elaya_actions` audit ledger; per-user persona, durable learned memory, and a per-user **Notes** section she reads. See `5-elaya-jarvis.md` | ✅ live (Jarvis Phases 1–4 + the customer channel) |
| **Call Intelligence / Helpdesk** | Phase 1 live (0109/0110): `leads.service_interests text[]` + `service_cases` + `conversation_hooks`, `/helpdesk`, the dossier ServiceInterestCard, Redis-cached library with client-side filtering. Phase 2 (embedding similarity) deferred | ✅ live (Phase 1) |
| **Lead Revival** (R1) | Daily Trigger.dev cron sweep (07:30 IST) finds silent leads → note-AI 3-verdict gate (revive/dismiss/unsure, reuses Elaya's routing model, fails closed) → confident revive opens a "Revived" follow-up task (never mutates the lead row); unsure/overflow → review tab `/leads?revival=true`. Migration 0119 | ✅ live |
| **Oversight** | manager+ three-tier drill (Teams → Team → Agent) over the append-only `task_events` stream (0144) + live presence rails | ✅ live |
| **Mobile Ops** (`/m`) | The pocket surface: four role-driven rooms (Dashboard · Tasks · Budget · Activity) + the Elaya knob, domain-swipe paging, one Realtime activity feed. Admin/founder phones auto-open it. Full contract `docs/modules/mobile-ops.md`; digest in `11-mobile-and-pwa.md` | ✅ live (rooms built for admin/founder + manager) |
| **Subscriptions & Bills** | Finance + Tech tracker for recurring bills, memberships and prepaid top-ups: list/calendar/overview views, payment + top-up history, private invoice bucket, encrypted credentials with an audited reveal, per-tool spend rollups. Migrations 0163–0168 | ✅ live (Phase 1 — no reminders, nothing background) |
| **Client records** | Post-won flow — a won deal opens a client record (`deals.client_id` is the reserved hook) | 🔨 current focus |
| **Sia** (Concierge) | Won clients as ongoing relationships, on top of client records | ⏸ not started |

## The journey of one lead (the heart of Gia)

1. Prospect taps a Meta/Instagram ad and submits details → webhook fires.
2. Seconds later the lead exists in Serene — validated, cleaned, deduped by phone (one phone never
   becomes two active records; a terminal lead re-enquiring spawns a new linked record).
3. Auto-assigned round-robin (fair taxi rank: longest-waiting active agent in the lead's domain;
   on-leave agents skipped via one switch on `/settings`). Managers are in the same pool
   (migration 0124).
4. Agent gets a WhatsApp alert; founders get a quiet copy; an in-app notification fires (and a Web
   Push to installed PWAs); SLA timers arm.
5. If the prospect messages the WhatsApp line first instead, the **customer Elaya** can welcome them
   (approved template → conversational blast) while the normal lead pipeline still runs — the
   customer layer is additive and never replaces round-robin or the notifications.
6. Agent calls outside Serene, then logs the call — every call/note/status change is recorded
   append-only (history can never be quietly rewritten).
7. SLA engine watches the clock (new lead not called in 15 min → agent nudged; 30 → manager;
   45 → founder; plus touched/in_discussion/nurturing rules and call-outcome cadences — see
   `8-integrations-and-jobs.md`). IST business hours Mon–Sat 09–19, with per-agent shift overrides.
   Response-time metrics are counted in **business minutes** (migration 0161), so nights and
   Sundays no longer inflate the number.
8. Won → a deal row is written to the deals ledger **before** the status flips (walk-in purchases
   supported too), and the gold petal celebration fires once on `/deals`. Nurturing → auto
   follow-up task. Lost/junk → reason required.
9. Everyone sees role-correct data live: agent own pipeline, manager their domain, founders
   everything across the four sales domains (Onboarding, House, Shop, Legacy).

## The surfaces (sidebar pages)

**Main:** Dashboard (bento-grid home) · **Elaya** (AI chat) · **Leads** (pipeline list + per-lead
dossier; `?revival=true` is the revival review tab) · **Deals** (closed-business ledger) ·
**Tasks** (personal + group projects + auto-created Gia follow-ups) · **Subscriptions** (recurring
bills — finance/tech + admin/founder) · **WhatsApp** (shared team inbox) · **Helpdesk** (Call
Intelligence library) · **Notes** (per-user free-form notes Elaya reads).

**Analytics:** Performance (agent self-scorecard / manager roster / founder Agents+Domains) ·
Oversight (manager+ three-tier work drill) · Campaigns · Budget (ad spend vs outcomes; managers see
their domain's spend, admin/founder get the recharge ledger too) · Escalations.

**Configuration / admin:** Settings (agent roster + the follow-up-engine and lead-revival editors) ·
Ad Creatives · Elaya Training (the customer knowledge base) · User Management · Usage · Suggestions ·
Error Log · Profile.

**Off the sidebar:** `/m` — the mobile Ops surface (admin/founder phones land there automatically;
"View desktop site" in the drawer opts out). Global chrome: the **⌘K command palette** (actions +
live lead/deal/task search + Go-to), the notification bell (a layout-mounted provider, so live
inserts survive navigation), and condensing sticky page headers.

In-app notifications fan out as **Web Push** (VAPID) to installed PWAs — the in-app row stays the
source of truth; push is a best-effort second channel (iOS only when added to the home screen).
Per-user notification preferences (migration 0133) let staff mute non-transactional categories per
channel. Details per page: `3-pages-summary.md`.

## Trust principles (plain words, all enforced in code/DB)

- Role-based visibility enforced **in the database** (RLS), not just hidden in the UI — and again in
  every server action (two layers, neither trusts the other).
- Logs and activity tables are append-only — no UPDATE/DELETE, ever (the documented exceptions are
  narrow and listed in `6-engineering-rules.md` A-11).
- Privileged changes (role/domain, deactivation) are admin/founder-gated and audited; nobody
  self-promotes.
- Client PII never reaches outside AI services as raw data (D-01); every Elaya tool result passes a
  PII mask; WhatsApp notification logs keep only the last 4 phone digits.
- Secrets stay in the database: subscription passwords are pgcrypto-encrypted with a **Supabase
  Vault** key, never sent to the client except on an explicit reveal — and every reveal writes an
  append-only audit row (0166/0167).

## Recent operational changes worth knowing (not code)

- **2026-08-06 — legacy book consolidated to one owner.** All 184 legacy leads moved to Amit
  Agarwal, his `profiles.domain` moved `onboarding → legacy` (the sanctioned round-robin pool
  lever), and Manasvani's routing switch was turned off. Every move wrote a `lead_activities`
  audit row with `method: 'bulk_migration'`, so prior ownership is recoverable.
- **2026-08-06 — Zoho onboarding import.** ~101 Zoho-worked onboarding leads merged into Serene by
  E.164 phone (51 inserted, 43 enriched+reassigned, plus history: 403 notes and 10 open tasks). His
  remaining 1,391 onboarding leads were unassigned for redistribution. The `zoho_record_id` marker
  in `attribution` is the idempotency key.
- **2026-08-07 — the Obsidian vault was retired.** The retrieval stack that agents actually read is
  the code, `CLAUDE.md`, `docs/`, and `graphify-out/`. Its hand-written tooling lives in
  `scripts/obsidian-vault/`; `graphify export obsidian` no longer exists.

## What's next (after current focus)

Client records (post-won flow) is the current focus · Sia on top of client records · **DPDP Act
compliance phase 2** (consent/lawful-basis records, WhatsApp STOP handling, an erasure core) is the
largest known non-feature obligation, with the substantive Rules coming into force ~14 May 2027 ·
Subscriptions phase 2 (reminders/notifications) is deliberately unbuilt. See
`9-roadmap-and-open-items.md`.

## Where history lives (repo)

`docs/changelog.md` — single source of truth, 700+ dated entries since 2026-05-26 ·
`docs/architecture/migrations.md` — migration index (files run through `0168`) ·
Decision Logs in `docs/rules/The_Rules.md` (engineering) and `docs/design/decision-log.md` (design) ·
`docs/audits/` — dated audit reports (the DPDP audit is the live one).
