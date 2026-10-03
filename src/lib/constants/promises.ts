// promises.ts — THE vocabulary of the promise tracker (migration 0255; the founder's update alert,
// 2026-10-03). Elaya reads a member group and keeps one sia.promises row per thing Indulge owes the
// member; the alert pass walks the open rows past their due time. Numbers here, never inline.

export type PromiseStatus = "open" | "delivered" | "dropped";
export type PromiseWaitingOn = "us" | "vendor" | "member";

/** A group is read again only after this much quiet since its newest message (a burst settles first). */
export const PROMISE_SETTLE_SECONDS = 60;
/** ...and never more often than this, however busy the chat. */
export const PROMISE_MIN_GAP_SECONDS = 180;
/** Groups read per sweep run (each is one routing-tier call). */
export const PROMISE_GROUPS_PER_RUN = 12;
/** The stretch of chat Elaya reads: the newest messages, no older than the lookback. */
export const PROMISE_READ_MESSAGES = 45;
export const PROMISE_LOOKBACK_HOURS = 72;
/** A promise with no due time Elaya could read or infer is due this long after it was made. */
export const PROMISE_DEFAULT_DUE_MINUTES = 60;
/** Bounds on a due time Elaya returns: never sooner than 5 minutes, never later than 3 days. */
export const PROMISE_DUE_MIN_MINUTES = 5;
export const PROMISE_DUE_MAX_MINUTES = 3 * 24 * 60;
/** An open promise untouched for this long is closed as dropped (the chat moved on). */
export const PROMISE_STALE_DAYS = 7;

export const PROMISE_MAX_OUTPUT_TOKENS = 1200;
export const PROMISE_TIMEOUT_MS = 45_000;
export const PROMISE_RUN_KIND = "promise_read";
export const PROMISE_PROMPT_VERSION = "promise-v1";
