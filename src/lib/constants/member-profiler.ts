// constants/member-profiler.ts — THE member profiler's numbers (migration 0215,
// plan-sia-intelligence.md). Pure data; the prompt lives with the reader in the service.

/** Bump on ANY prompt or output-shape change: every run records it, so a replay is comparable. */
export const PROFILER_PROMPT_VERSION = "profiler-v1";

/** A conversation is over after this many quiet hours; only finished conversations are read. */
export const PROFILER_QUIET_HOURS = 6;
/** A window is cut early at this size so one call stays bounded (~4 chars a token). */
export const PROFILER_WINDOW_MAX_CHARS = 9_000;
/** A window with fewer member-side text messages than this teaches nothing; it is skipped, not sent. */
export const PROFILER_MIN_MEMBER_MESSAGES = 1;
/**
 * The answer's allowance. Thinking is on by default on the reasoning tier and its tokens count
 * against this, so a small number returns NO text at all on a long conversation (the 2026-09-18
 * pilot: 8 of 30 windows spent exactly their 1,800 tokens reasoning). Generous on purpose; the
 * reader also asks for low effort.
 */
export const PROFILER_MAX_OUTPUT_TOKENS = 8_000;
export const PROFILER_CALL_TIMEOUT_MS = 120_000;
/** One message's text is cut at this length inside a window. */
export const PROFILER_MESSAGE_CHAR_CAP = 900;
/** Messages fetched per group per pass; the rest wait for the next pass. */
export const PROFILER_FETCH_LIMIT = 600;

/** A chat-derived fact is never as sure as a human's note (1.0) or the onboarding form (0.9). */
export const PROFILER_CONFIDENCE_CAP = 0.85;
/** Below this the model is guessing; the fact is dropped, not stored. */
export const PROFILER_CONFIDENCE_FLOOR = 0.5;
/** Present in this many member groups = staff, whatever the roster says (plan rule 4's guard). */
export const PROFILER_BROAD_SENDER_MIN_GROUPS = 6;

/** The cloud task's budget per run: groups looked at, windows sent to the model. */
export const PROFILER_GROUPS_PER_RUN = 12;
/**
 * Conversations sent to the model per run. One reading takes about five seconds, so forty fit
 * inside the task's four-minute budget. At this pace the approved history run (about 87,000
 * messages across 281 Active members, 2026-09-18) drains in a day or two; afterwards the day's
 * new conversations are far fewer than this and the number stops mattering.
 */
export const PROFILER_WINDOWS_PER_RUN = 40;
/**
 * Whose groups are read: `member.members.membership_status` values (the CLIENT_STATUSES ids).
 * The founder's call on 2026-09-18: Active members only, for now. Passed to
 * sia.profiler_due_groups (0218), so widening it is this one line and no migration.
 */
export const PROFILER_MEMBER_STATUSES: readonly string[] = ["Active"];
/**
 * Failed readings of the SAME conversation before the sweep steps over it, so one bad
 * conversation can never hold a group's bookmark forever. A provider outage is not a failed
 * reading (see the sweep).
 */
export const PROFILER_MAX_ATTEMPTS = 3;
/** Provider-side failures in a row, within one run, that mean "the provider is down": stop. */
export const PROFILER_OUTAGE_STOP = 3;

export const PROFILER_SETTING_KEY = "member_profiler_enabled";
export const PROFILER_RUN_KIND = "profiler";
/** Rough cost per million tokens for the run ledger's estimate (the reasoning tier is Sonnet 5: $2 in, $10 out); not billing. */
export const PROFILER_COST_PER_MTOK = { input: 2, output: 10 } as const;
