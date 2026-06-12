'use server';

import { z } from 'zod';
import { requireProfile } from '@/lib/actions/_auth';
import {
  getAgentTasksSummary,
  getAgentRecentActivity,
  getLeadStatusSummary,
  getLeadsByCampaign,
  getLeadVolumeByDomains,
  getLeadVolumeForDomain,
  type AgentActivity,
  type LeadStatusSummary,
  type CampaignStatusMix,
  type LeadVolumeSummary,
  type MultiDomainVolumeSummary,
} from '@/lib/services/dashboard-service';
import {
  getBudgetSummary,
  filterBudgetRowsByDomain,
  type BudgetCampaignRow,
} from '@/lib/services/ad-spend-service';
import type { DashboardAgentTask } from '@/lib/types';
import type { AppDomain } from '@/lib/types/database';
import type { DateRange } from '@/lib/utils/date-range';
import { resolvePresetToRange } from '@/lib/utils/date-range';
import { GIA_DOMAIN_ENUM, GIA_DOMAINS } from '@/lib/constants/domains';

// ─────────────────────────────────────────────
// Shared widget-scope schemas (dry-audit H-5 — was six near-identical schemas)
// from/to are ISO strings; ordering validated; domain is the optional
// admin/founder drill-down target.
// ─────────────────────────────────────────────
const WidgetScopeSchema = z.object({
  from:   z.string().datetime({ message: 'Invalid from date.' }).nullable().optional(),
  to:     z.string().datetime({ message: 'Invalid to date.'   }).nullable().optional(),
  domain: z.enum(GIA_DOMAIN_ENUM).optional(),
}).superRefine((val, ctx) => {
  if (val.from && val.to && new Date(val.from) >= new Date(val.to)) {
    ctx.addIssue({ code: 'custom', message: 'from must be before to.' });
  }
});

// Volume queries always require a concrete range + target domain.
const VolumeScopeSchema = z.object({
  from:   z.string().datetime({ message: 'Invalid from date.' }),
  to:     z.string().datetime({ message: 'Invalid to date.'   }),
  domain: z.enum(GIA_DOMAIN_ENUM),
}).refine(
  ({ from, to }) => new Date(from) < new Date(to),
  { message: 'from must be before to.' },
);

const DomainsVolumeSchema = z.object({
  from:    z.string().datetime(),
  to:      z.string().datetime(),
  domains: z.array(z.enum(GIA_DOMAIN_ENUM)).min(1).max(GIA_DOMAINS.length),
}).refine(({ from, to }) => new Date(from) < new Date(to), { message: 'from must be before to.' });

/** Build a DateRange from already-validated from/to (both required for a range to apply). */
function toDateRange(from: string | null | undefined, to: string | null | undefined): DateRange | undefined {
  return from && to ? { from, to } : undefined;
}

/**
 * The manager-domain override, once (dry-audit H-5). Managers are always
 * pinned to their own domain regardless of the requested target; admin and
 * founder get the target they asked for. No target → unscoped summary.
 */
function effectiveWidgetDomain(role: string, callerDomain: AppDomain, target: AppDomain): AppDomain;
function effectiveWidgetDomain(role: string, callerDomain: AppDomain, target?: AppDomain): AppDomain | undefined;
function effectiveWidgetDomain(role: string, callerDomain: AppDomain, target?: AppDomain): AppDomain | undefined {
  if (!target) return undefined;
  return role === 'manager' ? callerDomain : target;
}

// ─────────────────────────────────────────────
// Agent Tasks
// ─────────────────────────────────────────────
export async function getAgentTasksSummaryAction(
  _agentId: string,
): Promise<{ data: DashboardAgentTask[] | null; error: string | null }> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const data = await getAgentTasksSummary(profile.id);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Agent Recent Activity
// ─────────────────────────────────────────────
export async function getAgentRecentActivityAction(
  _agentId: string,
): Promise<{ data: AgentActivity[] | null; error: string | null }> {
  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const data = await getAgentRecentActivity(profile.id, profile.role, profile.domain);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Lead Pipeline (manager widget + admin/founder domain picker)
// No targetDomain → role-scoped summary ("All"). With targetDomain →
// single-domain drill-down (managers are pinned to their own domain).
// ─────────────────────────────────────────────
export async function getLeadStatusSummaryAction(
  from?:         string | null,
  to?:           string | null,
  targetDomain?: AppDomain,
): Promise<{ data: LeadStatusSummary | null; error: string | null }> {
  const parsed = WidgetScopeSchema.safeParse({ from, to, domain: targetDomain });
  if (!parsed.success) return { data: null, error: 'Invalid domain or date range.' };

  const auth = await requireProfile(['manager', 'admin', 'founder']);
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const data = await getLeadStatusSummary(
    profile.role,
    profile.domain as AppDomain,
    effectiveWidgetDomain(profile.role, profile.domain as AppDomain, parsed.data.domain),
    toDateRange(parsed.data.from, parsed.data.to),
  );
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Campaign breakdown (manager widget + admin/founder domain picker)
// ─────────────────────────────────────────────
export async function getLeadsByCampaignAction(
  from?:         string | null,
  to?:           string | null,
  targetDomain?: AppDomain,
): Promise<{ data: CampaignStatusMix[] | null; error: string | null }> {
  const parsed = WidgetScopeSchema.safeParse({ from, to, domain: targetDomain });
  if (!parsed.success) return { data: null, error: 'Invalid domain or date range.' };

  const auth = await requireProfile(['manager', 'admin', 'founder']);
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const data = await getLeadsByCampaign(
    profile.role,
    profile.domain as AppDomain,
    effectiveWidgetDomain(profile.role, profile.domain as AppDomain, parsed.data.domain),
    toDateRange(parsed.data.from, parsed.data.to),
  );
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Multi-domain Lead Volume (admin/founder "All" tab)
// Kept separate from the single-domain action: it returns
// MultiDomainVolumeSummary, a genuinely different shape.
// ─────────────────────────────────────────────
export async function getLeadVolumeByDomainsAction(
  from:    string,
  to:      string,
  domains: AppDomain[],
): Promise<{ data: MultiDomainVolumeSummary | null; error: string | null }> {
  const parsed = DomainsVolumeSchema.safeParse({ from, to, domains });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const auth = await requireProfile(['manager', 'admin', 'founder']);
  if (!auth.ok) return auth.result;

  const data = await getLeadVolumeByDomains(
    parsed.data.domains as AppDomain[],
    { from: parsed.data.from, to: parsed.data.to },
  );
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Single-domain Lead Volume (admin/founder domain tab drill-down)
// ─────────────────────────────────────────────
export async function getLeadVolumeForDomainAction(
  from:         string,
  to:           string,
  targetDomain: AppDomain,
): Promise<{ data: LeadVolumeSummary | null; error: string | null }> {
  const parsed = VolumeScopeSchema.safeParse({ from, to, domain: targetDomain });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const auth = await requireProfile(['manager', 'admin', 'founder']);
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const data = await getLeadVolumeForDomain(
    effectiveWidgetDomain(profile.role, profile.domain as AppDomain, parsed.data.domain),
    { from: parsed.data.from, to: parsed.data.to },
  );
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Campaign Budget (manager budget widget refresh / cohort change)
// Spend joined to lead + deal outcomes via getBudgetSummary (ad-spend-service).
// Managers are pinned to their own domain via effectiveWidgetDomain — the
// domain is derived from the campaign-key prefix, same map lead ingestion uses.
// ─────────────────────────────────────────────
const BudgetScopeSchema = z.object({
  from:   z.string().datetime({ message: 'Invalid from date.' }),
  to:     z.string().datetime({ message: 'Invalid to date.'   }),
  domain: z.enum(GIA_DOMAIN_ENUM).optional(),
}).refine(
  ({ from, to }) => new Date(from) < new Date(to),
  { message: 'from must be before to.' },
);

export async function getBudgetSummaryWidgetAction(
  from: string,
  to:   string,
  targetDomain?: AppDomain,
): Promise<{ data: BudgetCampaignRow[] | null; error: string | null }> {
  const parsed = BudgetScopeSchema.safeParse({ from, to, domain: targetDomain });
  if (!parsed.success) return { data: null, error: 'Invalid domain or date range.' };

  const auth = await requireProfile(['manager', 'admin', 'founder']);
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  // Managers always get their own domain regardless of the request; admin and
  // founder get the target they asked for (or the all-domain view).
  const requested = profile.role === 'manager'
    ? (profile.domain as AppDomain)
    : parsed.data.domain;
  const scopeDomain = effectiveWidgetDomain(
    profile.role,
    profile.domain as AppDomain,
    requested,
  );

  const rows = await getBudgetSummary(parsed.data.from, parsed.data.to);
  return {
    data: scopeDomain ? filterBudgetRowsByDomain(rows, scopeDomain) : rows,
    error: null,
  };
}

// Re-export resolvePresetToRange so client components can call it for default range labels
// without importing from lib/utils directly (which is fine for client — no server deps there).
export { resolvePresetToRange };
