# /elaya — Elaya Chat

> **Purpose:** spec for the Elaya chat page (foundation phase — read-only).
> **Audience:** engineers. · **Source-of-truth scope:** this route's behaviour.
> **Last verified:** 2026-06-12 · **Status:** shipped.

Module architecture + phase contracts: `docs/modules/elia.md`. Build record: `docs/changelog.md`
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
- **Streaming:** `ElayaChatShell` POSTs to `/api/elaya/chat` and consumes SSE frames. Tool calls
  surface as a serif-italic status line ("Looking through your leads…").
- **Daily cap:** 200/day (config row), counted from IST midnight, enforced in the route before
  any persistence or model call. The composer swaps to the cap notice when exhausted; the server
  remains the authority.
- **Page chrome:** standard header (`type-page-title` + `page-title-dot`), chat card on
  `--theme-paper` at `calc(100dvh - 190px)`; bubbles per `src/components/CLAUDE.md` § Elaya.

## Never

- Never render Elaya data without a tool round-trip (no model-fabricated records).
- Never enforce the cap or session expiry client-side only.
- Never add a write/mutating tool to this surface — Phase 2 goes through `elaya_actions` proposals.
