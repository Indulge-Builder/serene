# /elaya — Elaya Chat

> **Purpose:** spec for the Elaya chat page.
> **Audience:** engineers. · **Source-of-truth scope:** this route's behaviour.
> **Last verified:** 2026-06-20 (Elaya Phase 2 agentic writes shipped on this surface) · **Status:** shipped.

Module architecture + phase contracts: `docs/modules/elaya.md`. Build record: `docs/changelog.md`
(2026-06-12 Elaya foundation entry).

## Access

All roles, all domains — `/elaya` is in `ALWAYS_ALLOWED_PREFIXES`. What Elaya can *access* is
enforced per-principal in the tool layer (guests: zero tools), never by the route gate.
Sidebar: MAIN_NAV, Sparkles icon, directly under Dashboard.

## Behaviour

- **RSC seed (`page.tsx`):** `getCurrentProfile()` → `getOrCreateActiveConversation` (24h
  server-side session window from `elaya_settings.session_expiry_hours`) → transcript (last 50)
  + remaining-today message budget. Deterministic greeting from `getElayaTimeGreeting` +
  `pickElayaDailyLine` (no model call on load — ever).
- **Streaming:** `ElayaChatShell` POSTs to `/api/elaya/chat` and consumes SSE frames. The route
  runs the full brain (`runElayaTurn`) — the tool-calling loop plus its read ∪ write registry. Tool
  calls surface as a serif-italic status line ("Looking through your leads…").
- **Agentic writes (Phase 2, migration 0118 `elaya_actions`; `tools/write-registry.ts`):** the brain
  executes low-risk write tools **INLINE** (`add_lead_note`, `create_lead_task`) and **PROPOSES**
  state-changing tools (`update_lead_status`, `reassign_lead`), which mutate only later via the
  confirmation resolver → `executeProposedAction` on an affirmative human reply. Every write — inline
  or resolved — is logged to `elaya_actions` (executed/proposed rows with before/after snapshots).
  This applies identically on **both** the `/elaya` in-app channel and the WhatsApp staff channel.
  (Five task write tools — `create_personal_task`, `create_group_task`, `update_task_status`,
  `update_task` inline; `delete_task` propose-only — also exist via `services/task-mutations.ts`.)
- **Daily cap:** 200/day (config row), counted from IST midnight, enforced in the route before
  any persistence or model call. The composer swaps to the cap notice when exhausted; the server
  remains the authority.
- **Page chrome:** standard header (`type-page-title` + `page-title-dot`), then the canonical
  `.serene-dossier-grid serene-dossier-grid--340` (audit F2 — same grid as `/profile` and
  `/admin/users/[id]`; single column below lg): chat card on `--theme-paper` in the 1fr column,
  `ElayaIdentityCard` as the right 340px sidebar (breathing glyph tile + name,
  `ELAYA_STARTER_PROMPTS` prefill-only starters, capability list; stacks below the chat under
  lg). **Full-height fill:** the page `<main>` is a flex column and the grid is `flex-1`
  (`minHeight: 0`), so both columns stretch to the remaining paper height exactly — no
  `calc(100dvh - Npx)` offsets (removed 2026-06-12). **No visible message counter** — the
  header budget chip and the sidebar budget mirror, "Your compass" label, and line of the day
  were removed 2026-06-12; at cap the header shows "Daily limit reached" and the composer swaps
  to the cap notice. Bubbles per `src/components/CLAUDE.md` § Elaya (Elaya's bubbles show her
  breathing glyph via `showGlyph`).

## Never

- Never render Elaya data without a tool round-trip (no model-fabricated records).
- Never enforce the cap or session expiry client-side only.
- Never let a state-changing write tool mutate in its own proposal turn — `update_lead_status`,
  `reassign_lead`, and `delete_task` propose only; the mutation lands solely in the confirmation
  resolver (`executeProposedAction`) on an affirmative human reply.
