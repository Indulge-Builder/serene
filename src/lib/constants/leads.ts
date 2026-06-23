// Going-cold window — the SINGLE source of truth for "a lead has gone quiet".
//
// A lead is "going cold" when its last_activity_at is older than this window
// AND its status is non-terminal (not won/lost/junk). NULL last_activity_at
// (never-contacted) is deliberately NOT cold — that is SLA-01A's territory.
//
// This is a ROLLING window (now − N days, to the second), not an IST calendar
// boundary — every consumer measures the same relative offset at query time.
//
// Consumers (keep ZERO inline copies of this math — call goingColdCutoff()):
//   • getLeadsByRole / getLeadsForExport   (src/lib/services/leads-service.ts)
//   • getGoingColdLeads                     (src/lib/services/sla-service.ts)
//   • get_leads_status_counts RPC           (receives the cutoff as p_going_cold)
//
// SQL side: the dashboard widget reads the same window via the
// public.cold_lead_cutoff() function (migration 20260623…), whose `interval`
// is pinned to COLD_LEAD_THRESHOLD_DAYS below. If you change the number here,
// change it there in the SAME commit — they are the only two places it lives.
export const COLD_LEAD_THRESHOLD_DAYS = 5;

/** The going-cold window in milliseconds (COLD_LEAD_THRESHOLD_DAYS × one day). */
export const COLD_LEAD_THRESHOLD_MS = COLD_LEAD_THRESHOLD_DAYS * 86_400_000;

/**
 * ISO timestamp of the going-cold cutoff: leads whose `last_activity_at` is
 * STRICTLY BEFORE this are cold. THE only way to derive the cold cutoff in TS —
 * never re-inline `new Date(Date.now() - …)`.
 *
 * @param now epoch ms to measure from (defaults to `Date.now()`; injectable for tests).
 */
export function goingColdCutoff(now: number = Date.now()): string {
  return new Date(now - COLD_LEAD_THRESHOLD_MS).toISOString();
}
