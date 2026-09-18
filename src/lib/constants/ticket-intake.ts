// THE numbers of the ticket intake sweep (member-ticket-plan.md 7.8b, migration 0219).
// Training phase (founder, 2026-09-18): intake only PROPOSES. Tune these from the outcome
// numbers on the Tickets page, not from a hunch.

export const INTAKE_SETTING_KEY = "ticket_intake_enabled";
export const INTAKE_PROMPT_VERSION = "intake-v1";
export const INTAKE_RUN_KIND = "intake";

/** Whose groups are read: `member.members.membership_status` values. Same call as the profiler's. */
export const INTAKE_MEMBER_STATUSES: readonly string[] = ["Active"];
/** A group never seen before starts this far back, never at the start of its history. Intake is about now. */
export const INTAKE_LOOKBACK_HOURS = 6;
/** A member often sends one request as three messages. A burst is read once the chat has been quiet this long. */
export const INTAKE_SETTLE_SECONDS = 45;
/** A quiet gap this long ends a burst. */
export const INTAKE_BURST_GAP_MINUTES = 20;
/** Earlier messages shown to the reader as context, so "yes, book that one" can be understood. */
export const INTAKE_CONTEXT_MESSAGES = 12;
export const INTAKE_FETCH_LIMIT = 120;
export const INTAKE_MESSAGE_CHAR_CAP = 700;

export const INTAKE_GROUPS_PER_RUN = 40;
export const INTAKE_BURSTS_PER_RUN = 60;
export const INTAKE_PARALLEL_GROUPS = 4;
export const INTAKE_RUN_BUDGET_MS = 40_000;

/** Below this a "request" verdict is recorded in the run ledger and nothing is shown to anyone. */
export const INTAKE_MIN_CONFIDENCE = 0.6;
/** At or above this the card says Serene is sure; between the two it says "is this a request?". */
export const INTAKE_SURE_CONFIDENCE = 0.85;
/** An open card nobody touched for this long is closed as expired (it is no longer a live request). */
export const INTAKE_PROPOSAL_TTL_HOURS = 24;
export const INTAKE_MAX_ATTEMPTS = 3;
export const INTAKE_OUTAGE_STOP = 3;

export const INTAKE_KINDS = ["request", "update", "question", "feedback", "chatter"] as const;
export type IntakeKind = (typeof INTAKE_KINDS)[number];
export const INTAKE_TONES = ["neutral", "happy", "frustrated", "angry"] as const;
export const INTAKE_DISMISS_REASONS = [
  { id: "not_a_request", label: "Not a request" },
  { id: "already_handled", label: "Already handled" },
  { id: "duplicate", label: "Duplicate" },
  { id: "wrong_member", label: "Wrong member" },
  { id: "other", label: "Something else" },
] as const;
export type IntakeDismissReason = (typeof INTAKE_DISMISS_REASONS)[number]["id"];

/**
 * Words that, alone, are never a request. A burst whose member messages are ONLY these (or
 * emoji) is filed as chatter without asking a model: the cheapest correct answer there is.
 * Deliberately tiny and literal. "yes" is NOT here: "yes, book it" style confirmations matter.
 */
export const INTAKE_ACK_WORDS: ReadonlySet<string> = new Set([
  "ok", "okay", "okk", "k", "kk", "thanks", "thank", "you", "thankyou", "thx", "ty", "tysm", "great", "perfect", "noted",
  "cool", "nice", "super", "awesome", "lovely", "received", "got", "it", "done", "good", "morning", "evening", "night",
  "hi", "hello", "hey", "hii", "sure", "fine", "alright", "welcome", "much", "so", "very", "a", "lot", "ji", "sir", "maam", "mam",
]);
