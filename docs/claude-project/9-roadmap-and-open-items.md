# Serene — Roadmap & Open Items (Claude Project digest)

> Digest of `docs/01-vision.md`, `docs/the-next-phase.md`, `docs/architecture/elaya-jarvis-
> architecture.md`, `docs/audits/2026-06-25-elaya-full-audit.md`, and `docs/changelog.md` (through
> 2026-06-26). **This is the canonical built-vs-planned ledger for the pack** — when a feature's
> status matters, trust this file. The live record of change is `docs/changelog.md`; verify against
> the live DB before assuming a migration/table/RPC exists.

## Module status

| Module | Status | "Done" means |
|--------|--------|--------------|
| **Serene** (base OS) | ✅ LIVE | one login, 5 themes, 3-layer role/domain auth, dashboard shell, in-app + Web Push notifications, tasks, OTP reset, PWA + per-user icon. Stable; hardened via the audit cycle. |
| **Gia** (CRM) | ✅ LIVE, daily use | a lead travels ad → ingestion → fair assignment → worked dossier → resolution → deal without leaving the system, with SLA guardrails + role-correct reporting end-to-end. |
| **Elaya** (AI presence) | ✅ LIVE (Phases 1–4) | provider-neutral brain; 11 read + 11 write tools; in-app SSE + WhatsApp staff channel; voice input; propose→confirm; per-user persona + durable learned memory. *Remaining:* customer persona, in-app proposal cards, notes UI. |
| **Call Intelligence / Helpdesk** | ✅ LIVE (Phase 1) | service-interest taxonomy + `service_cases`/`conversation_hooks` + `/helpdesk` + the dossier card. *Phase 2 (embedding similarity / HNSW) deferred.* |
| **Lead Revival** | ✅ LIVE (R1) | a daily sweep finds silent leads, runs the note-AI gate, revives confident ones with a "Revived" task or sends borderline ones to a review tab — never touching the lead row. |
| **Client records** | 🔨 CURRENT FOCUS | a won deal opens a client record; relationship history continues post-win (`deals.client_id` is the reserved hook). Not built yet. |
| **Sia** (Concierge) | ⏸ NOT STARTED | the concierge team runs post-won client work inside Serene the way sales runs Gia. No scope defined. |

## What's live vs. in the working tree (not yet on prod)

Most of the recent work is live; a few migrations/features sit in the working tree pending a prod
apply. **Verify before relying on these in a prod context.**

**In the working tree / NOT yet applied to prod:**
- **Migration 0144** (`task_events` + the 3 oversight RPCs) → the whole **`/oversight`** 3-tier drill.
- **Migration 0146** (`get_agent_performance_trend`) → the **agent `/performance` self-scorecard
  redesign** (real trend data, fabricated sparklines removed).
- The **dashboard fuel-gauge rebuild** of `manager-budget` (tied to the budget restructure).
- A few edge-case Elaya polish items pending further testing.
- The newest migration files on disk are `0145`–`0149` (2026-06-25); the Elaya "Jarvis" Phase-1 twins
  (0149) and the WhatsApp dedup index (0148) and the slug fix (0147) **are** live on prod.

**Live on prod** (selected, from the 2026-06-20→26 work): the entire Elaya "Jarvis" Phases 1–4
(data layer, persona, memory, capability tools), all Elaya audit fixes + the polish batch, `log_deal`,
the slug fix, the WhatsApp idempotency index, the `/escalations` enhancements (agent self-view, global
domain filter, live-compute breaches, recipient chips), the `/settings` hub split, the `/budget`
admin/founder restriction, the dashboard spatial-grid + widget work, and the performance Domains-tab
drill fixes.

## Next features (planned, designed, not built)

The detailed handoff is `docs/the-next-phase.md`. Two features, in order:

### 1. `log_deal` — DONE (ahead of the handoff doc)
The handoff doc lists `log_deal` as the next thing to build, but **the code already has it**: a
propose→confirm Elaya write tool wrapping `recordDealCore` (extracted into `lead-mutations.ts`), with
`deal_type` derived from the lead's domain (`DOMAIN_DEAL_CONFIG`) and the action_type in the
`elaya_actions` ledger. If you read the handoff, treat `log_deal` as complete and move to feature 2.

### 2. Customer WhatsApp welcome-blast + training page — PLANNED (the big one)
A new **outward-facing** surface: Elaya talking to **customers**, not staff. `resolveCustomerPrincipal()`
is a **throwing stub** today; the dormant `bot_active`/`is_bot` columns are never set. The vision (from
the founder): when a brand-new number messages Indulge, Elaya welcomes them like a world-class,
non-salesy, psychology-trained salesperson — intro to the company, brochures, work examples,
testimonials, reviews, the podcast — a warm, human, conversational "blast", then an ongoing
conversation. Plus an admin **training page** to upload the videos / URLs / images / docs / company
facts she draws from.

Hard constraints baked into the design:
- **The Golden Rule still holds** — the customer principal gets `persona:'customer'`, **NO staff
  toolset**, and a tiny capability set (send prepared material + answer from a curated KB). A customer
  can never read leads/deals/tasks/other customers. Gated in **code**, never the prompt.
- **WhatsApp 24h window + templates** — the first outbound to a cold number MUST be an approved Gupshup
  **template**; the free-form blast follows once they reply (a new "welcome" template needs Gupshup
  approval, a founder-side step).
- **Routing fork** — the customer hook goes in the **else** branch of the whatsapp webhook (after the
  staff gate, which stays first and untouched), inside `after()`; a new number must still become a lead
  (round-robin, founder/agent notifications) — the customer layer is additive.
- **One-blast-per-lead idempotency** — a "welcomed" flag; a redelivery/second message never re-blasts.
- **Curated KB is the only source of company facts** — never let the model invent services/prices;
  money is ₹ only.
- **Build order:** design doc + founder sign-off → training data model + admin page (clone the
  ad-creatives admin feature) → the customer principal + persona → the welcome-blast orchestrator →
  the ongoing conversation.

### 3. Notes section — PLANNED (the phase after)
The seam is already built: `retrieveMemoryContext(principal, question)` returns `{ learned, notes }`
(notes is `[]` today). The work: a staff **Notes UI** + a `notes` table + actions/service, wired into
`retrieveMemoryContext` so Elaya reads them per turn. At scale, swap the load-all retrieval to semantic
search (the `vector` extension is already installed — a one-function change by design).

### Later (not started)
- In-app proposal cards (the Approve/Dismiss SSE card; today's writes confirm via a chat "yes").
- Voice replies / TTS (ElevenLabs is locked for a future phase; voice is input-only today).
- WhatsApp closed-window template fallback (re-open an expired 24h session — audit item H4b).
- `get_usage` Elaya tool (its `getAgentUsage` is session-bound; needs a sessionless refactor first).

## Open Elaya audit items (still unfixed)

The Elaya subsystem is fundamentally healthy — **no critical or High-severity bugs remain** (the audit
doc removes resolved findings, so it lists only what's open). Remaining:

**Medium (enhancement, not defects):**
- **M8** — no in-app proposal *card* (add an SSE `proposal` frame + an Approve/Dismiss modal).
- **H4b** — no WhatsApp closed-window template fallback when the 24h session expires.

**Low/nit cluster (~20 items), e.g.:**
- `get_performance_snapshot` lacks a domain arg for admin/founder on WhatsApp.
- `supersedePriorProposals` failure could leave two live proposals (use a partial UNIQUE index).
- `executeProposedAction` can leave a `proposed` row after the write succeeds (stamp at start).
- No "cancel" acknowledgement on a declined proposal (the injection-critical `classifyConfirmation`
  gate is deliberately binary; adding a third "cancel" verdict is deferred).
- `delete_task` lacks a before-snapshot (existence re-check only).
- No per-turn inline-write idempotency (a model double-emit could duplicate a note/task).
- Cross-channel confirmation (a "yes" on WhatsApp could confirm an in-app proposal) — document or
  compare channel.
- Token accounting ignores cache tokens; `isError` flag not threaded into Anthropic `is_error`.
- The cap check is mildly TOCTOU (concurrent messages can exceed the soft cap by one).

**Founder preference:** when one of these is fixed, **delete it** from
`docs/audits/2026-06-25-elaya-full-audit.md` (don't annotate "resolved").

## Other known TODOs

- **Email deliverability (Brevo):** auth emails send via a custom Brevo SMTP but land in spam —
  `indulge.global` isn't fully authenticated in Brevo. Fix = add/authenticate the domain (DKIM + SPF)
  in Brevo and match the Supabase "Sender email" to the verified sender. (`docs/TODO.md`.)
- **Trigger.dev prod worker:** SLA/task notifications only fire once the worker is deployed against the
  `tr_prod_` key (`npx trigger.dev@latest deploy` + swap `TRIGGER_SECRET_KEY`). The `/escalations`
  *surface* already computes breaches live regardless; this is about the *alerts* firing.

## Per-module open product questions (from the page specs)

Small, known gaps that aren't bugs: archived leads are invisible to phone search (RLS bakes in
`archived_at IS NULL`); group accent/icon/member chips are UI-only (no DB columns); a duplicate active
resubmission doesn't re-ping the original agent; `/error-log` has no replay action yet (manual fixes).
These live in the individual `docs/pages/*.md` specs.
