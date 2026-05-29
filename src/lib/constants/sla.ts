/**
 * sla.ts — Gia SLA Engine constants
 *
 * Source of truth for all SLA rule codes, thresholds, and business-hours config.
 * Pure data — no DB deps, no imports from services or actions.
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
