// THE shared Elaya per-lead access gate + lead display helpers (dry-audit
// 2026-06-20 D6+D15). canAccessLead is a SECURITY predicate — it was previously
// duplicated verbatim in tools/registry.ts and tools/write-registry.ts, which
// meant a future change edited in one registry could silently diverge read vs
// write authority. One implementation, both registries import it.
//
// It mirrors the leads.ts action-layer hasAccess pattern (Q-13 — the per-resource
// gate the tool runs BEFORE a core; reads re-verify because getLeadBySlug serves
// from a shared Redis row cache, so RLS alone is not the only gate).

import type { StaffPrincipal } from '@/lib/elaya/principal';
import type { LeadWithAssignee } from '@/lib/services/leads-service';
import { LEAD_STATUS_LABELS } from '@/lib/constants/lead-statuses';
import type { LeadStatus } from '@/lib/types/database';

export function canAccessLead(principal: StaffPrincipal, lead: LeadWithAssignee): boolean {
  if (principal.role === 'admin' || principal.role === 'founder') return true;
  if (principal.role === 'manager') return lead.domain === principal.domain;
  if (principal.role === 'agent') return lead.assigned_to === principal.userId;
  return false;
}

/** Human label for a lead in model-facing tool summaries ("this lead" fallback). */
export function leadDisplayName(lead: { first_name: string | null; last_name: string | null }): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'this lead';
}

/** Human label for a lead status in model-facing tool summaries. */
export function statusLabel(status: string): string {
  return LEAD_STATUS_LABELS[status as LeadStatus] ?? status;
}

// ─── Members (migration 0194) ─────────────────────────────────────────────────

/**
 * THE member access predicate for server code and tools: admin and founder see every member;
 * everyone else sees the members of their own queendom. The SQL twin is member_visible()
 * (RLS). Pure; safe in 'use client' modules and the Python bridge alike.
 */
/**
 * Who may open a member's finance page. Decided 2026-09-15: money shows to everyone who
 * can see the member. This is the ONE place to narrow it later (a role list, a sia_role
 * check) without touching the page or the links that point at it.
 */
export function canSeeMemberFinance(principal: { role: string; sia_role?: string | null }): boolean {
  return principal.role !== "guest";
}

export function canAccessMember(
  principal: { role: string; queendom_id?: string | null },
  memberQueendomId: string | null | undefined,
): boolean {
  if (principal.role === "admin" || principal.role === "founder") return true;
  return Boolean(principal.queendom_id) && principal.queendom_id === memberQueendomId;
}

// ── Test leads (2026-09-24) ───────────────────────────────────────────────────────────
import { ELAYA_EVAL_ACCOUNT_NAME, ELAYA_TEST_LEAD_NAME_RE, ELAYA_TEST_LEAD_SLUG_SUFFIX } from '@/lib/constants/elaya';

/** The eval harness's seeded lead, by slug or name. */
export function isTestLead(lead: { slug?: string | null; name?: string | null }): boolean {
  return (
    (typeof lead.slug === 'string' && lead.slug.endsWith(ELAYA_TEST_LEAD_SLUG_SUFFIX)) ||
    (typeof lead.name === 'string' && ELAYA_TEST_LEAD_NAME_RE.test(lead.name))
  );
}

/** Drop test leads from what a real user sees; the eval account keeps them (its exam needs them). */
export function hideTestLeads<T>(rows: T[], principal: { displayName: string }, pick: (row: T) => { slug?: string | null; name?: string | null }): T[] {
  if (principal.displayName === ELAYA_EVAL_ACCOUNT_NAME) return rows;
  return rows.filter((r) => !isTestLead(pick(r)));
}
