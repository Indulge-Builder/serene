// constants/member-assessment.ts — THE numbers of the member pulse and the member judgement
// (migration 0241). Pure data; the prompt lives with the reader in services/member-assessment.ts.

/** Bump on ANY prompt or output-shape change: every run records it, so a replay is comparable. */
export const ASSESSMENT_PROMPT_VERSION = "member-assessment-v1";
export const ASSESSMENT_RUN_KIND = "assessment";
/** The switch row in elaya_settings: ON unless it says exactly false (a judgement costs about ₹2 and reaches no member). */
export const ASSESSMENT_SETTING_KEY = "member_assessment_enabled";
/** Only these membership statuses are judged by the sweep; "Assess now" on a page judges anyone. */
export const ASSESSMENT_MEMBER_STATUSES: readonly string[] = ["Active"];
/** A member judged more recently than this is skipped by the sweep (the button ignores it). */
export const ASSESSMENT_MIN_DAYS_BETWEEN = 7;
/** How far back the record goes into the prompt. */
export const ASSESSMENT_WINDOW_DAYS = 180;
export const ASSESSMENT_EVENTS_LIMIT = 40;
export const ASSESSMENT_TICKETS_LIMIT = 40;
export const ASSESSMENT_FACTS_LIMIT = 60;
export const ASSESSMENT_HEALTH_LIMIT = 40;
/** Members judged side by side in a sweep, and the run's time budget (the weekly task's maxDuration minus a margin). */
export const ASSESSMENT_PARALLEL = 3;
export const ASSESSMENT_RUN_BUDGET_MS = 25 * 60_000;
export const ASSESSMENT_SWEEP_LIMIT = 400;
/** Thinking counts against the allowance on the Claude 5 family; the answer itself is short. */
export const ASSESSMENT_MAX_OUTPUT_TOKENS = 6_000;
export const ASSESSMENT_TIMEOUT_MS = 120_000;

export const ASSESSMENT_RISKS = ["low", "watch", "high"] as const;
export type AssessmentRisk = (typeof ASSESSMENT_RISKS)[number];
export const ASSESSMENT_RISK_LABELS: Record<AssessmentRisk, string> = { low: "Settled", watch: "Watch", high: "At risk" };

/** The list's sort options (0241). `active` = Active first, then the pulse; the default. */
export const MEMBER_SORTS = ["active", "score", "name"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];
export const MEMBER_SORT_LABELS: Record<MemberSort, string> = { active: "Most active", score: "Serene's score", name: "Name" };
