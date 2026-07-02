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
