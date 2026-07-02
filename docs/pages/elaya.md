# /elaya — Elaya Chat

> **Purpose:** spec for the Elaya chat page.
> **Audience:** engineers. · **Source-of-truth scope:** this route's behaviour.
> **Last verified:** 2026-07-02 (Jarvis Phases 1–4, the Notes section, and the 2026-07-02 memory-retrieval rework all live on this surface) · **Status:** shipped.

Module architecture + phase contracts: `docs/modules/elaya.md`. Build record: `docs/changelog.md`
(2026-06-12 Elaya foundation entry).

## Access

All roles, all domains: `/elaya` is in `ALWAYS_ALLOWED_PREFIXES`, alongside `/notes` (the personal
notes surface Elaya reads as context). What Elaya can *access* is enforced per-principal in the
tool layer (guests: zero tools), never by the route gate. Sidebar: MAIN_NAV, Sparkles icon,
directly under Dashboard.

## Behaviour

- **RSC seed (`page.tsx`):** `getCurrentProfile()` → **`resolveElayaChatSeed(profile)`**
  (`elaya-service.ts`). This is the ONE shared seed; the floating `ElayaWidget` and the dashboard
  `EmbeddedElayaChat` use the same function via `getElayaChatSeedAction`, never a re-inlined copy.
  It resolves the active conversation (24h server-side session window from
  `elaya_settings.session_expiry_hours`), the transcript, the deterministic greeting
  (`getElayaTimeGreeting` + `pickElayaDailyLine`, no model call on load, ever), and the
  remaining-today message budget.
- **Streaming:** `ElayaChatShell` POSTs to `/api/elaya/chat` and consumes SSE frames. The route
  order is: auth gate → per-user burst limiter (`createRateLimiter`, 20/min, keyed on the profile
  id) → Zod → daily cap. The route runs the full brain (`runElayaTurn`): the tool-calling loop
  (max 10 iterations) over the read ∪ write registry. Tool calls surface as a serif-italic status
  line ("Looking through your leads…").
- **Read tools (12, role-gated; `tools/registry.ts`):** 8 all-staff (`search_leads`,
  `get_cold_leads`, `get_lead_details`, `get_my_tasks`, `find_teammate`, `search_deals`,
  `get_performance_snapshot`, `get_helpdesk_content`) plus `get_escalations` /
  `get_domain_health` / `get_campaigns` (manager+) and `get_budget` (admin/founder). Every read
  fetches through `elaya-data.ts` (the parity rule), so behaviour is identical on WhatsApp.
- **Agentic writes (12 tools; `tools/write-registry.ts`, ledger `elaya_actions`, migration 0118):**
  the brain executes the eight low-risk tools **INLINE** (`add_lead_note`, `log_call`,
  `create_lead_task`, `create_personal_task`, `create_group_task`, `create_subtask`,
  `update_task_status`, `update_task`) and **PROPOSES** the four state-changing tools
  (`update_lead_status`, `reassign_lead`, `log_deal`, `delete_task`), which mutate only later via
  the confirmation resolver → `executeProposedAction` on an affirmative human reply. Every write,
  inline or resolved, is logged to `elaya_actions` (executed/proposed rows with before/after
  snapshots). This applies identically on **both** the `/elaya` in-app channel and the WhatsApp
  staff channel.
- **Jarvis personalisation (2026-06-25/26):** every turn folds three things into the prompt as
  **context only, never permission** (the Golden Rule, `docs/modules/elaya.md`): (a) the per-user
  persona prefs (`user_context.context.persona`, edited on `/profile`); (b) the durable learned
  memory (`user_context.context.learned`, updated by a throttled Haiku summarizer in `memory.ts`
  every 4th user message, bounded to ~900 chars, so the surface gets smarter the more it is used);
  (c) the user's `/notes` (migration 0152, `getNotesForElaya`, capped at
  `ELAYA_NOTES_PROMPT_BUDGET`). The old `retrieveMemoryContext` seam was removed 2026-07-02; the
  brain reads `getUserPersona` + `getNotesForElaya` directly.
- **Voice dictation:** `DictationButton` (`variant="composer"`) mounts as the MessageBar leading
  slot inside `ElayaChatShell`: record → transcribe (`transcribeAudioAction`, Deepgram) → the
  transcript fills the composer as an editable draft. Never auto-sends.
- **Daily cap:** 200/day (config row `elaya_settings.daily_message_cap`), counted from IST
  midnight, enforced in the route before any persistence or model call. The composer swaps to the
  cap notice when exhausted; the server remains the authority.
- **Page chrome:** the page itself renders only the header (`type-page-title` +
  `page-title-dot`, plus a `TOP_BAR_ENABLED` `PageControls` cluster) and `ElayaChatShell`. The
  SHELL owns the canonical `.serene-dossier-grid serene-dossier-grid--340` grid: chat card on
  `--theme-paper` in the 1fr column; the right 340px rail stacks `ElayaFeedbackCard` (the
  suggestion-inbox entry, added 2026-06-20) above `ElayaIdentityCard` (breathing glyph tile +
  name, `ELAYA_STARTER_PROMPTS` prefill-only starters, capability list). The rail stacks below the
  chat under lg. **Full-height fill:** the page `<main>` is a flex column and the shell grid is
  `flex-1` (`minHeight: 0`), so both columns stretch to the remaining paper height exactly, with
  no `calc(100dvh - Npx)` offsets (removed 2026-06-12). **No visible message counter**; at cap the
  header shows "Daily limit reached" and the composer swaps to the cap notice. Bubbles per
  `src/components/CLAUDE.md` § Elaya (Elaya's bubbles show her breathing glyph via `showGlyph`).
- **Not the only mount:** the same `ElayaChatShell` renders in the floating `ElayaWidget` (every
  dashboard route except `/elaya`; `hideIdentity` chat-only mode) and in `EmbeddedElayaChat`
  inside the dashboard Elaya-presence widget. Zero shell fork, so every capability above shows up
  in all mounts automatically.

## Related surfaces

- The WhatsApp STAFF channel runs the same brain, tools, cap, and session
  (`docs/modules/elaya.md`).
- The outward CUSTOMER channel (welcome blast + prospect replies) is a separate, hard-capped
  brain that never touches this page: `docs/modules/customer-welcome-blast.md`. Its training
  library is curated at `/admin/elaya-training` (manager+).

## Never

- Never render Elaya data without a tool round-trip (no model-fabricated records).
- Never enforce the cap or session expiry client-side only.
- Never let a state-changing write tool mutate in its own proposal turn — `update_lead_status`,
  `reassign_lead`, `log_deal`, and `delete_task` propose only; the mutation lands solely in the
  confirmation resolver (`executeProposedAction`) on an affirmative human reply.
- Never treat persona, learned memory, or notes as permission. They are prompt context; the
  toolset + data scope are fixed in code from the verified principal.
