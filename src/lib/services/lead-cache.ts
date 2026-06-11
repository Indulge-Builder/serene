// THE lead cache-invalidation helper. Every lead-mutating server action calls
// this instead of hand-assembling redis.del/incr blocks, so the documented
// invariants are structural, not copy-paste-enforced:
//
//   • Dual-key invariant — a lead row is cached under BOTH leadRowId(leadId)
//     and leadRowSlug(slug); `row: true` always deletes both (slug del skipped
//     only when the lead has no slug). Deleting only leadRowId is a silent
//     no-op on normal dossier traffic (root CLAUDE.md Pattern Notes).
//   • Await-before-revalidate — all ops settle inside one awaited Promise.all
//     wrapped in try/catch-warn, so callers can safely call revalidatePath
//     immediately after. Redis failure stays non-fatal (warn, never throw).
//   • List invalidation is two INCRs on the version counters (agent + manager
//     for the lead's domain) — atomically voids all cached list pages without
//     a SCAN.
//
// Dashboard volume keys are intentionally NOT deleted here: their read-side
// keys always embed an ISO from:to range, so a targeted del cannot enumerate
// them — freshness is TTL-only (120s), per lib/CLAUDE.md.

import { redis } from "@/lib/redis";
import { REDIS_KEYS } from "@/lib/constants/redis-keys";

export type LeadCacheScope = {
  /** Lead row dual-key: leadRowId + leadRowSlug (requires leadId; slug when set). */
  row?: boolean;
  /** Notes timeline: leadNotes(leadId). */
  notes?: boolean;
  /** Activities timeline: leadActivities(leadId). */
  activities?: boolean;
  /** List pages: INCR leadListVersion for agent + manager (requires domain). */
  lists?: boolean;
  /** Dashboard all-time slots: dashboardLeadStatus + dashboardCampaigns (requires domain). */
  dashboard?: boolean;
};

/**
 * Invalidate Redis caches affected by a lead mutation. Always awaited by the
 * caller, before any revalidatePath, so the cache layer is consistent before
 * the RSC layer is told it can re-render.
 *
 * @param site action name for the warn log, e.g. "updateLeadStatus"
 */
export async function invalidateLeadCaches(
  site: string,
  lead: { leadId?: string; slug?: string | null; domain?: string },
  scope: LeadCacheScope,
): Promise<void> {
  const ops: Promise<unknown>[] = [];
  const { leadId, slug, domain } = lead;

  if (scope.row && leadId) {
    ops.push(redis.del(REDIS_KEYS.leadRowId(leadId)));
    if (slug) ops.push(redis.del(REDIS_KEYS.leadRowSlug(slug)));
  }
  if (scope.notes && leadId) ops.push(redis.del(REDIS_KEYS.leadNotes(leadId)));
  if (scope.activities && leadId) ops.push(redis.del(REDIS_KEYS.leadActivities(leadId)));

  if (scope.lists && domain) {
    ops.push(redis.incr(REDIS_KEYS.leadListVersion("agent", domain)));
    ops.push(redis.incr(REDIS_KEYS.leadListVersion("manager", domain)));
  }
  if (scope.dashboard && domain) {
    ops.push(redis.del(REDIS_KEYS.dashboardLeadStatus(domain)));
    ops.push(redis.del(REDIS_KEYS.dashboardCampaigns(domain)));
  }

  try {
    await Promise.all(ops);
  } catch (e) {
    console.warn(`[leads-action:${site}] redis invalidation failed`, e);
  }
}
