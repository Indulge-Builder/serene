# Vision & Roadmap

> **Purpose:** the product vision, the module roadmap, and what "done" means per module.
> **Audience:** everyone technical; the non-technical version is `00-for-the-board.md`.
> **Source-of-truth scope:** forward direction + module status. Build *history* is `changelog.md` (single source of truth for what shipped).
> **Last verified:** 2026-07-02 (migration range re-verified against `supabase/migrations/`).

---

## The vision

Serene is the internal operating system for Indulge Global, built to luxury-product standards
because the team lives in it 8–12 hours a day. The previous generation of tooling was wired
together incorrectly; this build started from zero with explicit rules
(`rules/The_Rules.md`), a design constitution (`design/DESIGN-DNA.md`), and a modular
architecture where the base OS never changes when a module lands.

The arc: **run the sales operation (Gia) → add the intelligence layer (Elaya) → own the client
relationship (client records → Sia) → extend to further modules (call intelligence, oversight, and beyond).**

## Module roadmap

| Module | Status | What "done" looks like |
| ------ | ------ | ---------------------- |
| **Serene** (base OS) | ✅ live | One login; theming (6 themes: Earth, Air, Water, Fire, Martini, Candy; Cosmos/Coffee/Macha retired 2026-07-02 via migration 0156); role/domain authorization at three layers; dashboard shell; in-app notifications **+ Web Push** (VAPID, 0120) reaching every device off the existing `createNotification` seam; tasks; OTP-code password reset (corporate-link-scanner-safe); installable PWA with a per-user app-icon picker (0121). Done = stable foundation that module work never has to touch — achieved; ongoing hardening via the audit cycle (`audits/`). |
| **Gia** (CRM) | ✅ live | A lead can travel ad → ingestion → fair assignment → worked dossier → resolution → deal without leaving the system, with SLA guardrails and role-correct reporting at every step — achieved. The WhatsApp prospect auto-assistant shipped 2026-06-26 (see the Elaya row). Remaining inside Gia: the open product questions listed per page spec. |
| **Client records** (post-won flow) | 🔨 current focus | A won deal opens a client record (`deals.client_id` is the reserved hook); the relationship history continues past "won". Done = clients exist as first-class records with their own surface. |
| **Elaya** (AI presence) | ✅ live (Phase 2 + Jarvis) | The four designed surfaces sit on real data (DNA §15), the PII gateway holds (no raw client PII reaches an external model, per D-01). Live: the provider-neutral brain with 12 role-gated read tools + 12 write tools (in-app SSE chat + WhatsApp staff channel; inline writes like `add_lead_note`/`create_lead_task`/`log_call`/task writes, plus propose-only `update_lead_status`/`reassign_lead`/`log_deal`/`delete_task` behind an English+Hinglish confirmation resolver, every write through the `elaya_actions` trust ledger). Jarvis Phases 1-4 shipped 2026-06-25/26: channel-parity data layer (`elaya-data.ts` + 0149 sessionless RPC twins), per-user persona, durable learned memory, and role-gated manager/founder capability reads. Voice dictation (Deepgram; audio transcribed in-memory, never stored). The WhatsApp customer persona shipped 2026-06-26 (the outward welcome-blast + a hard-capped prospect Elaya, `docs/modules/customer-welcome-blast.md`; live once the Gupshup template id env var is set). The per-user Notes section shipped 2026-06-26 (`elaya_notes` + `/notes`; Elaya reads a user's free-form notes as CONTEXT, never permission). Remaining: semantic retrieval (embeddings) + super-powers (web). The brain reads learned memory and notes directly via `getUserPersona`/`getNotesForElaya` (the old `retrieveMemoryContext` seam was removed 2026-07-02); a future embeddings layer starts from those call sites. |
| **Sia** (Concierge) | ⏸ not started | Scope lands after client records. Done = the concierge team runs their post-won client work inside Serene the way sales runs Gia. See `modules/sia.md`. |
| **Call intelligence / Helpdesk** | ✅ live (Phase 1) | Phase 1 shipped (0109/0110): `leads.service_interests` taxonomy, `service_cases` + `conversation_hooks` (all-authenticated read / admin+founder write, weighted FTS), the `/helpdesk` page with client-side filtering on a Redis-cached library, and the dossier service-interest card surfacing matched cases + hooks. Spec: `modules/call-intelligence.md`. Phase 2 (embedding similarity / HNSW) deferred. |
| **Lead Revival** | ✅ live (R1) | A daily Trigger.dev sweep (07:30 IST, the project's first cron task) finds silent leads, runs each through a note-AI suppression gate (one structured revive/dismiss/unsure call reusing Elaya's `routing` provider + PII layer, fails closed to `unsure`), and either revives a confident one with a "Revived" follow-up task (the E2 `createLeadTaskCore` path — never touching the lead row) or sends the rest to a review tab (`/leads?revival=true`). Tables `revival_policies` + `revival_candidates` (0119). Full contract: `modules/revival.md`. |
| **Oversight** | ✅ live | Managers and founders drill into what every team is doing right now: the `/oversight` route (three-tier drill: domains → team rail → agent rail) over the append-only `task_events` stream (migration 0144, Realtime-enabled) plus live presence. Spec: `docs/oversight.md`. |

## Current focus (as of 2026-07-02)

Client records (the post-won flow). The Elaya WhatsApp customer persona shipped 2026-06-26,
so client records is the remaining focus item. The
June 2026 audit cycle closed its phased fixes through migration 0103; the performance audit is
fully fixed (file deleted, its do-not-regress rules moved into the `CLAUDE.md` files); remaining
open items live in the design/security audit tables (`audits/`) and in `design/decision-log.md`
§ Open.

## Where history lives

- **What shipped, when:** `changelog.md` (hundreds of dated entries since 2026-05-26) — the single
  source of truth.
- **Schema history:** `architecture/migrations.md` (full migration index, through 0156; the numbered sequence skips 0131).
- **Decisions and reversals:** `rules/The_Rules.md` Decision Log (engineering/architecture)
  and `design/decision-log.md` (design).
