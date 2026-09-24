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

/** The run ledger kind (sia.extraction_runs) and the prompt versions, for the audit trail. */
export const DEEP_READ_RUN_KIND = 'deep_read';
export const DEEP_READ_PLAN_PROMPT_VERSION = 'deep-read-plan-v1';
export const DEEP_READ_LABEL_PROMPT_VERSION = 'deep-read-label-v1';
export const DEEP_READ_ANSWER_PROMPT_VERSION = 'deep-read-answer-v1';

/** Rows a deep read will fetch at most: 12 pages of the query door's export cap. */
export const DEEP_READ_MAX_ROWS = 60_000;
export const DEEP_READ_PAGE_ROWS = 5_000;
/** Rows judged per model call, and calls in flight side by side. */
export const DEEP_READ_BATCH_ROWS = 100;
export const DEEP_READ_PARALLEL_CALLS = 8;
/** Characters of a row's text the judge sees. */
export const DEEP_READ_ROW_TEXT_CAP = 240;
/** A batch that fails after these retries is counted, never re-run forever. */
export const DEEP_READ_BATCH_RETRIES = 3;
/** Sample rows handed to the answer writer as evidence, per label. */
export const DEEP_READ_ANSWER_SAMPLES_PER_LABEL = 6;
/** The whole job's wall-clock budget (Trigger.dev maxDuration is set from this). */
export const DEEP_READ_MAX_MINUTES = 25;
/** Labels a plan may define, at most (a rubric with more is a taxonomy, not a question). */
export const DEEP_READ_MAX_LABELS = 12;

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
