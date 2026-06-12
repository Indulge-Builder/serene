/**
 * sla.ts — Gia SLA Engine constants
 *
 * Business-hours config + the engine's static vocabulary (rule-code types,
 * auto-task titles, cadence outcome set). Pure data — no DB deps, no imports
 * from services or actions.
 *
 * SINCE PHASE 2 (config-driven engine, migration 0111): rule thresholds,
 * recipients, and active flags live in the `sla_policies` table and are read
 * per job run via sla-service.getSlaPolicies(). SLA_RULES below is retained as
 * the PARITY REFERENCE — the 0111 seed was copied from it (with statusTrigger
 * 'active' stored as the real status 'nurturing') and any edit to live
 * behaviour happens in the DB, not here. Do not re-point the engine at this
 * constant.
 *
 * SLA rules:
 *   SLA-01x  New lead            — 15min (agent), 30min (manager)
 *   SLA-02x  Touched lead        — 1440min / 24h (agent), 2160min / 36h (manager)
 *   SLA-03x  In-discussion lead  — 1440min / 24h (agent), 2160min / 36h (manager)
 *   SLA-04x  Active lead         — 5760min / 4 biz-days (agent + manager)
 *
 * All thresholds are in *business* minutes (IST, Mon–Sat, 09:00–19:00).
 */

// ─── Business hours config ────────────────────────────────────────────────────

export const BUSINESS_HOURS = {
  timezone:  'Asia/Kolkata',
  startHour: 9,   // 09:00 IST inclusive
  endHour:   19,  // 19:00 IST exclusive (19:00 = end of day)
  offDays:   [0], // Sunday = 0 (JS Date.getDay())
} as const;

// ─── SLA rule config type ─────────────────────────────────────────────────────

export type SlaRecipient = 'agent' | 'manager';

export interface SlaRuleConfig {
  statusTrigger:    'new' | 'touched' | 'in_discussion' | 'active';
  businessMinutes:  number;
  recipient:        SlaRecipient;
}

// ─── SLA rules map ────────────────────────────────────────────────────────────

export const SLA_RULES = {
  'SLA-01A': { statusTrigger: 'new',           businessMinutes: 15,   recipient: 'agent'   },
  'SLA-01B': { statusTrigger: 'new',           businessMinutes: 30,   recipient: 'manager' },
  'SLA-02A': { statusTrigger: 'touched',       businessMinutes: 1440, recipient: 'agent'   },
  'SLA-02B': { statusTrigger: 'touched',       businessMinutes: 2160, recipient: 'manager' },
  'SLA-03A': { statusTrigger: 'in_discussion', businessMinutes: 1440, recipient: 'agent'   },
  'SLA-03B': { statusTrigger: 'in_discussion', businessMinutes: 2160, recipient: 'manager' },
  'SLA-04A': { statusTrigger: 'active',        businessMinutes: 5760, recipient: 'agent'   },
  'SLA-04B': { statusTrigger: 'active',        businessMinutes: 5760, recipient: 'manager' },
} as const satisfies Record<string, SlaRuleConfig>;

export type SlaRuleCode = keyof typeof SLA_RULES;

// ─── Auto-task titles (agent-facing / A rules only) ───────────────────────────

export const SLA_AUTO_TASK_TITLES: Record<Extract<SlaRuleCode, `SLA-${string}A`>, string> = {
  'SLA-01A': 'New lead untouched — follow up now',
  'SLA-02A': 'No update in 24 hours — follow up on lead',
  'SLA-03A': 'Discussion stalled — re-engage lead',
  'SLA-04A': 'Less than 3 call attempts in 4 days',
} as const;

// ─── Outcome cadence (CAD-01 family, sla_policies trigger_kind='outcome') ────

/**
 * Call outcomes that arm the daily follow-up cadence. Vocabulary is the
 * "unreached" subset of CALL_OUTCOMES (constants/call-outcomes.ts) — never
 * invent values here; the sla_policies CAD rows carry the same strings.
 */
export const CADENCE_OUTCOMES = ['rnr', 'switched_off', 'wrong_number'] as const;
export type CadenceOutcome = (typeof CADENCE_OUTCOMES)[number];

export const CADENCE_RULE_BY_OUTCOME: Record<CadenceOutcome, string> = {
  rnr:          'CAD-01A',
  switched_off: 'CAD-01B',
  wrong_number: 'CAD-01C',
};

/** Lead statuses the cadence may act on — non-terminal, never junk/lost/nurturing. */
export const CADENCE_ARMABLE_STATUSES = ['new', 'touched', 'in_discussion'] as const;

/** Outcomes older than this never arm or sustain a cadence (pre-go-live guard). */
export const CADENCE_FRESHNESS_DAYS = 7;

/** Cadence task due time: this many business minutes after the tick fires. */
export const CADENCE_TASK_DUE_BUSINESS_MINUTES = 120;

export const CADENCE_TASK_TITLES: Record<CadenceOutcome, string> = {
  rnr:          'No response on last call — try again today',
  switched_off: 'Phone was switched off — try again today',
  wrong_number: 'Wrong number on file — verify and re-attempt today',
};

// ─── Status cadence (CAD with trigger_kind='status', migration 0114) ─────────

/**
 * A CAD-prefixed code marks a policy as a CADENCE rule regardless of
 * trigger_kind: on fire it creates a follow-up task (open-task guard) and
 * re-arms instead of sending a one-shot breach notification. Outcome cadences
 * (CAD-01x) re-arm daily at shift open; status cadences (CAD-02A) re-arm
 * threshold_minutes ahead and live/die with the lead's status.
 */
export function isCadenceCode(code: string): boolean {
  return code.startsWith('CAD-');
}

/** Task titles for status-cadence rules, keyed by policy code. */
export const STATUS_CADENCE_TASK_TITLES: Record<string, string> = {
  'CAD-02A': 'Discussion open 48 hours — follow up',
};

// ─── Status → applicable rule codes ──────────────────────────────────────────

/**
 * Returns the SLA rule codes that apply for a given lead status.
 * Used by scheduleSlaTimersForLead to avoid iterating all rules.
 */
export function getRulesForStatus(status: string): SlaRuleCode[] {
  return (Object.entries(SLA_RULES) as [SlaRuleCode, SlaRuleConfig][])
    .filter(([, cfg]) => cfg.statusTrigger === status)
    .map(([code]) => code);
}

/**
 * Returns only the activity-refresh rules (SLA-02 and SLA-03).
 * These are the rules refreshed by addLeadCallNote — SLA-01 is NOT refreshed by activity.
 */
export function getActivityRefreshRules(): SlaRuleCode[] {
  return ['SLA-02A', 'SLA-02B', 'SLA-03A', 'SLA-03B'];
}
