// elaya-jobs.ts — THE vocabulary for Elaya's background work (migration 0235, 2026-09-24):
// the deep-read job, the labels it writes back, and the live alert sweep. Numbers live here, never
// inline in a service.

// ── Deep read ────────────────────────────────────────────────────────────────
export const ELAYA_JOB_KINDS = ['deep_read'] as const;
export type ElayaJobKind = (typeof ELAYA_JOB_KINDS)[number];
export const ELAYA_JOB_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type ElayaJobStatus = (typeof ELAYA_JOB_STATUSES)[number];

/** The subjects a label can sit on (mirrors the CHECK in 0235). */
export const ELAYA_LABEL_SUBJECTS = ['freshdesk_ticket', 'member', 'whatsapp_group', 'lead', 'sia_ticket', 'whatsapp_message', 'vendor'] as const;
export type ElayaLabelSubject = (typeof ELAYA_LABEL_SUBJECTS)[number];

/** A job either answers a question (the default) or tops up a saved label set with the rows it has not judged yet. */
export const DEEP_READ_MODES = ['answer', 'refresh'] as const;
export type DeepReadMode = (typeof DEEP_READ_MODES)[number];

/** The run ledger kind (sia.extraction_runs) and the prompt versions, for the audit trail. */
export const DEEP_READ_RUN_KIND = 'deep_read';
export const DEEP_READ_PLAN_PROMPT_VERSION = 'deep-read-plan-v2';
export const DEEP_READ_LABEL_PROMPT_VERSION = 'deep-read-label-v2';
export const DEEP_READ_ANSWER_PROMPT_VERSION = 'deep-read-answer-v2';

/** The read never caps the rows: a question over the whole history reads the whole history. What
 *  bounds one RUN is time (DEEP_READ_MAX_MINUTES); past it the job saves where it got to and continues
 *  in a new run, and every verdict is saved per batch so nothing judged is ever judged twice. */
export const DEEP_READ_PAGE_ROWS = 5_000;
/** A page that hits the door's statement timeout is halved, down to this, before the job gives up. */
export const DEEP_READ_MIN_PAGE_ROWS = 500;
/** Rows judged per model call, and calls in flight side by side (the rate gate below slows this
 *  down the moment the provider says so; it never fails the job on a rate limit). */
export const DEEP_READ_BATCH_ROWS = 100;
export const DEEP_READ_PARALLEL_CALLS = 12;
/** Characters of a row's text the judge sees. */
export const DEEP_READ_ROW_TEXT_CAP = 240;
/** A batch that fails after these retries is counted, never re-run forever. */
export const DEEP_READ_BATCH_RETRIES = 3;
/** Rows still unjudged after the first pass are asked again, this many passes, while time remains. */
export const DEEP_READ_UNJUDGED_PASSES = 3;
/** The rate gate: on a 429 / overloaded reply every worker pauses this long (or the provider's
 *  retry-after when longer), doubling per hit up to the max; a batch gives up after this many hits. */
export const DEEP_READ_RATE_PAUSE_MS = 8_000;
export const DEEP_READ_RATE_PAUSE_MAX_MS = 60_000;
export const DEEP_READ_RATE_RETRIES = 8;
/** Trust: rows read below this share of the count get ONE re-read; the answer then states the share.
 *  Never a refusal: a number with its coverage stated beats no number. */
export const DEEP_READ_COVERAGE_MIN_PCT = 99;
/** Leave this much of the run's budget to save labels and hand over to the continuation run. */
export const DEEP_READ_CONTINUE_MARGIN_MS = 120_000;
/** Money. The estimate the founder sees and the switch that asks before a big spend: rows to judge ×
 *  cost per thousand (measured 24 Sep 2026: $0.335 for 4,694 rows, plan and answer included). */
export const DEEP_READ_COST_PER_1000_ROWS_USD = 0.08;
export const DEEP_READ_ROWS_PER_SECOND = 200;
export const DEEP_READ_USD_TO_INR = 88;
/** Row `elaya_deep_read_spend_cap_usd`: above this estimate a read stops and asks the founder first
 *  (start_deep_read with confirm_spend runs it). Missing row = the default. */
export const DEEP_READ_SPEND_CAP_SETTING_KEY = 'elaya_deep_read_spend_cap_usd';
export const DEEP_READ_SPEND_CAP_DEFAULT_USD = 50;
/** Sample rows handed to the answer writer as evidence, per label. */
export const DEEP_READ_ANSWER_SAMPLES_PER_LABEL = 6;
/** The whole job's wall-clock budget (Trigger.dev maxDuration is set from this). */
export const DEEP_READ_MAX_MINUTES = 25;
/** Labels a plan may define, at most (a rubric with more is a taxonomy, not a question). */
export const DEEP_READ_MAX_LABELS = 12;

// ── The nightly label top-up ─────────────────────────────────────────────────
/** Row `elaya_labels_refresh_enabled`: ON unless the row says exactly false (a top-up reads only
 *  the rows a set has not judged, so it costs cents; the off switch is one row, no deploy). */
export const LABELS_REFRESH_SETTING_KEY = 'elaya_labels_refresh_enabled';
/** Only label sets a person asked about inside this many days are kept current. */
export const LABELS_REFRESH_DAYS = 30;
/** Sets topped up per night, at most. */
export const LABELS_REFRESH_MAX_SETS = 20;

// ── The live alert sweep ─────────────────────────────────────────────────────
export const ALERTS_SETTING_KEY = 'elaya_alerts_enabled';
export const ALERTS_STATE_KEY = 'elaya_alerts_state';
export const ALERT_KINDS = ['unanswered', 'tone', 'ticket_escalated', 'ticket_reopened', 'silent_turn'] as const;
export type ElayaAlertKind = (typeof ALERT_KINDS)[number];
/** A member whose last word stood unanswered this long is an alert (inside the active hours). */
export const ALERT_UNANSWERED_MINUTES = 60;
/** How far back the unanswered check looks. */
export const ALERT_UNANSWERED_MAX_HOURS = 24 * 7;
/** Founders are woken for an unanswered member only in these IST hours; anger and escalations at any hour. */
export const ALERT_ACTIVE_HOURS_IST: readonly [number, number] = [8, 23];
/** The same kind of alert for the same group is not repeated inside this window. */
export const ALERT_COOLDOWN_HOURS = 6;
/** New member messages younger than this are left to settle before a tone read. */
export const ALERT_SETTLE_SECONDS = 120;
/** Messages the tone judge reads per group. */
export const ALERT_TONE_CONTEXT_MESSAGES = 14;
/** Groups judged per sweep, at most. */
export const ALERT_TONE_GROUPS_PER_SWEEP = 30;
export const ALERT_TONE_PROMPT_VERSION = 'alert-tone-v1';
export const ALERT_RUN_KIND = 'alerts';
/** A user message with no assistant row after this long is a silent turn: tech is told. */
export const SILENT_TURN_MINUTES = 3;
/** The sweep's own wall-clock budget. */
export const ALERT_RUN_BUDGET_MS = 200_000;
