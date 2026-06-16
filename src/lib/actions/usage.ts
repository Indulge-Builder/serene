'use server';

// Usage / active-time tracking actions.
//
// recordPresenceAction — THE heartbeat hot path. Called by <UsagePresence>
//   every 60s while the tab is visible AND interacted-with in the last ~2 min.
//   requireProfile() (any role) → ONE Redis SET via recordPresence. NO DB write
//   on this path, NO Zod input (it takes nothing — identity is the verified
//   profile, never client-supplied). Returns the lightweight { data, error }
//   contract; the client ignores the body.
//
// getAgentUsageAction — the admin/founder dashboard read. requireProfile(
//   ['admin','founder']) (the action-layer gate) → getAgentUsage (which ALSO
//   re-gates in the service layer, per spec — defence in depth). The RPC behind
//   it is admin-client-only and trusts no caller-supplied role (Q-13).

import { requireProfile } from '@/lib/actions/_auth';
import { recordPresence, getAgentUsage } from '@/lib/services/usage-service';
import type { ActionResult } from '@/lib/types';
import type { AgentUsageReport } from '@/lib/types/usage';

/**
 * Record one active-presence heartbeat for the calling user. The client only
 * calls this when the gate (visibility + recent interaction) passes, so a beat
 * arriving here always means "active right now". One Redis SET, no DB write.
 */
export async function recordPresenceAction(): Promise<ActionResult<{ ok: true }>> {
  const auth = await requireProfile(); // any authenticated role — everyone's usage counts
  if (!auth.ok) return auth.result;
  const { id, domain, role } = auth.profile;

  await recordPresence(id, { domain, role, ts: Date.now() });
  return { data: { ok: true }, error: null };
}

/**
 * The usage report for the admin/founder adoption dashboard: today's active
 * minutes per agent+domain + 30 days of daily history. Gated admin/founder
 * here AND in the service layer; a non-admin/founder caller gets a rejected
 * result (the service returns null → mapped to the unauthorized error).
 */
export async function getAgentUsageAction(): Promise<ActionResult<AgentUsageReport>> {
  const auth = await requireProfile(['admin', 'founder']);
  if (!auth.ok) return auth.result;

  const report = await getAgentUsage();
  if (!report) {
    return { data: null, error: 'Unable to load usage data.' };
  }
  return { data: report, error: null };
}
