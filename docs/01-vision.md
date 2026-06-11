# Vision & Roadmap

> **Purpose:** the product vision, the module roadmap, and what "done" means per module.
> **Audience:** everyone technical; the non-technical version is `00-for-the-board.md`.
> **Source-of-truth scope:** forward direction + module status. Build *history* is `changelog.md` (single source of truth for what shipped).
> **Last verified:** 2026-06-11.

---

## The vision

Eia is the internal operating system for Indulge Global, built to luxury-product standards
because the team lives in it 8–12 hours a day. The previous generation of tooling was wired
together incorrectly; this build started from zero with explicit rules
(`rules/The_Rules.md`), a design constitution (`design/DESIGN-DNA.md`), and a modular
architecture where the base OS never changes when a module lands.

The arc: **run the sales operation (Gia) → add the intelligence layer (Lia) → own the client
relationship (client records → Sia) → extend to further modules (Elia, call intelligence).**

## Module roadmap

| Module | Status | What "done" looks like |
| ------ | ------ | ---------------------- |
| **Eia** (base OS) | ✅ live | One login; theming (5 themes); role/domain authorization at three layers; dashboard shell; notifications; tasks. Done = stable foundation that module work never has to touch — achieved; ongoing hardening via the audit cycle (`audits/`). |
| **Gia** (CRM) | ✅ live | A lead can travel ad → ingestion → fair assignment → worked dossier → resolution → deal without leaving the system, with SLA guardrails and role-correct reporting at every step — achieved. Remaining inside Gia: the WhatsApp AI chatbot (auto-engage until an agent takes over) and the open product questions listed per page spec. |
| **Client records** (post-won flow) | 🔨 current focus | A won deal opens a client record (`deals.client_id` is the reserved hook); the relationship history continues past "won". Done = clients exist as first-class records with their own surface. |
| **Lia** (AI presence) | 🔨 current focus (design-first) | Done for v1 = the four designed surfaces (Panel, Conversation, Inline Suggestion, Action Proposal) live on top of real data, honouring the design law (DNA §15) and the privacy rule that no raw client PII reaches an external model (D-01). |
| **Sia** (Concierge) | ⏸ not started | Scope lands after client records. Done = the concierge team runs their post-won client work inside Eia the way sales runs Gia. See `modules/sia.md`. |
| **Call intelligence / Helpdesk** | 📋 spec complete | Spec: `modules/call-intelligence.md`. Done per its §15 sign-off conditions (taxonomy seeded, dossier interest card, helpdesk page). Awaiting content seeding before build. |
| **Elia** | ❓ undefined | Name reserved; no scope in any repo source — `modules/elia.md`. |

## Current focus (as of 2026-06-11)

Lia AI presence + client records, per the root project status. The June 2026 audit cycle closed its phased
fixes through migration 0103; the performance audit is fully fixed (file deleted — its
do-not-regress rules moved into the `CLAUDE.md` files); remaining open items live in the
design/security audit tables (`audits/`) and in `design/decision-log.md` § Open.

## Where history lives

- **What shipped, when:** `changelog.md` (425+ dated entries since 2026-05-26) — the single
  source of truth.
- **Schema history:** `architecture/migrations.md` (105 migrations indexed).
- **Decisions and reversals:** `rules/The_Rules.md` Decision Log (engineering/architecture)
  and `design/decision-log.md` (design).
