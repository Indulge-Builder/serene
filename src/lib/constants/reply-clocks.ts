// reply-clocks.ts — THE vocabulary of the reply clocks (migration 0253).
//
// Two timers per member group, kept by the trigger on sia.wag_messages (see the migration for the
// words that start and stop them):
//   reply  — the member is waiting for any reply (the concierge goal: under one minute)
//   update — a holding reply ("noted, checking") owes the member the real answer
// The alert job (services/reply-alerts.ts, src/trigger/reply-alerts.ts) walks each running clock
// up its ladder. A step fires once per clock; a staff message stops the clock before the next.

export type ReplyClock = "reply" | "update";
export type ReplyStepTarget = "genies" | "bishops" | "queen" | "founders" | "promiser";
export type ReplyStep = { id: string; to: ReplyStepTarget; afterSeconds: number; severity: 1 | 2 | 3 };

/**
 * Clock 1, seconds after the member's first unanswered message. Around the clock, no quiet hours.
 * The founder's ladder (2026-10-03): the queendom's genies and bishops at 2 minutes, the queen at 5.
 * Founders are not on it for now ("someday, when needed"): add { to: "founders" } back to bring them in.
 */
export const REPLY_LADDER: readonly ReplyStep[] = [
  { id: "genies", to: "genies", afterSeconds: 2 * 60, severity: 1 },
  { id: "bishops", to: "bishops", afterSeconds: 2 * 60, severity: 1 },
  { id: "queen", to: "queen", afterSeconds: 5 * 60, severity: 2 },
];

/** Clock 2, seconds after the promise falls DUE (see updateDueAt). */
export const UPDATE_LADDER: readonly ReplyStep[] = [
  { id: "promiser", to: "promiser", afterSeconds: 0, severity: 1 },
  { id: "bishops", to: "bishops", afterSeconds: 15 * 60, severity: 2 },
  { id: "queen", to: "queen", afterSeconds: 30 * 60, severity: 2 },
];

/** A holding reply that names no time is due this long after it was sent. */
export const UPDATE_DEFAULT_MINUTES = 15;
/** "give me 10 mins" is due at 10 minutes plus this grace. */
export const UPDATE_GRACE_MINUTES = 5;

/**
 * A step whose moment passed more than this long ago is marked handled WITHOUT sending: the switch
 * was just turned on, or the job was down. Nobody gets a burst of stale alerts.
 */
export const REPLY_STEP_MAX_LATE_SECONDS = 10 * 60;

/** The job starts every minute and sleeps until each due step inside that minute. */
export const REPLY_RUN_WINDOW_MS = 57_000;
/** Running clocks read per pass; a busy hour has a few dozen. */
export const REPLY_CLOCKS_READ_LIMIT = 500;

/** When a promise falls due: the time it named plus the grace, else the default. */
export function updateDueAt(holdStartedAt: string, promisedMinutes: number | null): number {
  const minutes = promisedMinutes ? promisedMinutes + UPDATE_GRACE_MINUTES : UPDATE_DEFAULT_MINUTES;
  return new Date(holdStartedAt).getTime() + minutes * 60_000;
}
