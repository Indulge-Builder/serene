# Vision & Roadmap

> **Purpose:** the product vision, the module roadmap, and what "done" means per module.
> **Audience:** everyone technical; the non-technical version is `00-for-the-board.md`.
> **Source-of-truth scope:** forward direction + module status. Build *history* is `changelog.md` (single source of truth for what shipped).
> **Last verified:** 2026-06-20 (migration range re-verified against `supabase/migrations/`).

---

## The vision

Serene is the internal operating system for Indulge Global, built to luxury-product standards
because the team lives in it 8–12 hours a day. The previous generation of tooling was wired
together incorrectly; this build started from zero with explicit rules
(`rules/The_Rules.md`), a design constitution (`design/DESIGN-DNA.md`), and a modular
architecture where the base OS never changes when a module lands.

The arc: **run the sales operation (Gia) → add the intelligence layer (Elaya) → own the client
relationship (client records → Sia) → extend to further modules (Elaya, call intelligence).**

## Module roadmap

| Module | Status | What "done" looks like |
| ------ | ------ | ---------------------- |
| **Serene** (base OS) | ✅ live | One login; theming (5 themes); role/domain authorization at three layers; dashboard shell; in-app notifications **+ Web Push** (VAPID, 0120) reaching every device off the existing `createNotification` seam; tasks; OTP-code password reset (corporate-link-scanner-safe); installable PWA with a per-user app-icon picker (0121). Done = stable foundation that module work never has to touch — achieved; ongoing hardening via the audit cycle (`audits/`). |
| **Gia** (CRM) | ✅ live | A lead can travel ad → ingestion → fair assignment → worked dossier → resolution → deal without leaving the system, with SLA guardrails and role-correct reporting at every step — achieved. Remaining inside Gia: the WhatsApp AI chatbot (auto-engage until an agent takes over) and the open product questions listed per page spec. |
| **Client records** (post-won flow) | 🔨 current focus | A won deal opens a client record (`deals.client_id` is the reserved hook); the relationship history continues past "won". Done = clients exist as first-class records with their own surface. |
| **Elaya** (AI presence) | ✅ live (Phase 2) | The four designed surfaces sit on real data (DNA §15), the PII gateway holds (no raw client PII reaches an external model — D-01). Live: provider-neutral brain + 6 read-only tools (in-app SSE chat + WhatsApp staff channel), Phase 2 agentic writes (E3, 0118 — `add_lead_note`/`create_lead_task` execute inline; `update_lead_status`/`reassign_lead` propose-only behind an English+Hinglish confirmation resolver, every write through the `elaya_actions` trust ledger), and voice dictation (Deepgram Nova-2 Hinglish; audio transcribed in-memory, never stored). Remaining: the WhatsApp customer persona. |
| **Sia** (Concierge) | ⏸ not started | Scope lands after client records. Done = the concierge team runs their post-won client work inside Serene the way sales runs Gia. See `modules/sia.md`. |
| **Call intelligence / Helpdesk** | ✅ live (Phase 1) | Phase 1 shipped (0109/0110): `leads.service_interests` taxonomy, `service_cases` + `conversation_hooks` (all-authenticated read / admin+founder write, weighted FTS), the `/helpdesk` page with client-side filtering on a Redis-cached library, and the dossier service-interest card surfacing matched cases + hooks. Spec: `modules/call-intelligence.md`. Phase 2 (embedding similarity / HNSW) deferred. |
| **Lead Revival** | ✅ live (R1) | A daily Trigger.dev sweep (07:30 IST, the project's first cron task) finds silent leads, runs each through a note-AI suppression gate (one structured revive/dismiss/unsure call reusing Elaya's `routing` provider + PII layer, fails closed to `unsure`), and either revives a confident one with a "Revived" follow-up task (the E2 `createLeadTaskCore` path — never touching the lead row) or sends the rest to a review tab (`/leads?revival=true`). Tables `revival_policies` + `revival_candidates` (0119). Full contract: `modules/revival.md`. |
| **Elaya** | ❓ undefined | Name reserved; no scope in any repo source — `modules/elaya.md`. |

## Current focus (as of 2026-06-15)

Client records (the post-won flow) + the Elaya WhatsApp customer persona, per the root project
status — now that Elaya's read tools, Phase 2 agentic writes, and voice input have shipped. The
June 2026 audit cycle closed its phased fixes through migration 0103; the performance audit is
fully fixed (file deleted — its do-not-regress rules moved into the `CLAUDE.md` files); remaining
open items live in the design/security audit tables (`audits/`) and in `design/decision-log.md`
§ Open.

## Where history lives

- **What shipped, when:** `changelog.md` (hundreds of dated entries since 2026-05-26) — the single
  source of truth.
- **Schema history:** `architecture/migrations.md` (full migration index, through 0137; the numbered sequence skips 0131).
- **Decisions and reversals:** `rules/The_Rules.md` Decision Log (engineering/architecture)
  and `design/decision-log.md` (design).
