// elaya-cost.ts — THE cost and progress envelope of one Elaya turn (cost audit 2026-10-01, P1
// "bound cost and detect lack of progress"). Numbers live here, never inline in a brain.
//
// The live staff brain is Python (backend/app/brain/loop.py), which MIRRORS these numbers with a
// comment naming this file; change both together. The Node brain reads them directly.

/** Every serialized tool result of one turn, added up: past this the loop stops offering tools and
 *  answers from what it has (the 118k-token p95 turns were replays of 20 results, not one big one). */
export const TURN_TOOL_RESULT_BUDGET_CHARS = 90_000;
/** Uncached input tokens billed across one turn's calls, added up: past this the turn closes. */
export const TURN_INPUT_TOKENS_CAP = 250_000;
/** One request's whole context (uncached + cache writes + cache reads): past this the turn closes
 *  before the window itself refuses the next call. */
export const TURN_CONTEXT_TOKENS_CAP = 180_000;
/** The same tool answering with an error this many times in a row is a dead end, not a retry. */
export const TURN_REPEATED_ERRORS_MAX = 3;
/** Identical reads inside one turn (same tool, same arguments) are answered from the first result. */
export const TURN_DUPLICATE_READ_NOTE =
  'This is the same lookup, with the same arguments, as an earlier call in this turn. Reuse that result; it has not changed.';

// ── Evidence carried between turns (the reliable-agent plan: "store stable IDs and evidence
//    pointers between turns; retrieve details on demand") ────────────────────────────────
/** Tool calls kept per assistant message (the first N of the turn, in order). */
export const EVIDENCE_PER_TURN_MAX = 8;
/** Characters of each result kept as its summary (the masked, serialized result's head). */
export const EVIDENCE_SUMMARY_CHARS = 220;
/** The whole evidence block folded into the next turns, at most. */
export const EVIDENCE_BLOCK_BUDGET_CHARS = 1_800;
/** How many earlier assistant messages contribute evidence. */
export const EVIDENCE_TURNS_BACK = 4;

// ── Settings rows (migration 0254) ──────────────────────────────────────────
/** A day's ceiling, in dollars, for the chat features below; `null` (the seed) = no ceiling. */
export const CHAT_DAILY_CAP_SETTING_KEY = 'elaya_chat_daily_cap_usd';
/** {specialist id: 'routing' | 'reasoning' | 'heavy'}: a founder moves one specialist to another tier without a deploy. */
export const SPECIALIST_TIERS_SETTING_KEY = 'elaya_specialist_tiers';

// ── The usage ledger's feature names for the chat path (public.llm_usage_events.feature) ──
export const CHAT_USAGE_FEATURES = ['chat_turn', 'chat_closing', 'chat_router', 'memory_reader'] as const;
