'use server';

import { z } from 'zod';
import { requireProfile } from '@/lib/actions/_auth';
import { formErrors } from '@/lib/validations/form-errors';
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
  getAccountRecharges,
  buildBudgetGaugeSummary,
  type BudgetGaugeSummary,
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
// Recent Lead Activity (lead rollup — migration 0132)
// scope 'team' (default): role-scoped — agent: own leads; manager: own domain;
// admin/founder: targetDomain when set, else all-org. scope 'mine': leads
// assigned to the caller, any role (agents see no toggle; their feed is always
// own). targetDomain is the global domain selector for admin/founder.
// ─────────────────────────────────────────────
export async function getAgentRecentActivityAction(
  _agentId: string,
  targetDomain?: AppDomain,
  scope: 'mine' | 'team' = 'team',
): Promise<{ data: AgentActivity[] | null; error: string | null }> {
  // Validate the optional drill-down target is a real Gia domain (a crafted
  // value can never widen scope — effectiveWidgetDomain pins non-admin/founder)
  // and the scope is one of the two literals.
  const parsed = z.object({
    domain: z.enum(GIA_DOMAIN_ENUM).optional(),
    scope:  z.enum(['mine', 'team']),
  }).safeParse({ domain: targetDomain, scope });
  if (!parsed.success) return { data: null, error: 'Invalid domain or scope.' };

  const auth = await requireProfile();
  if (!auth.ok) return auth.result;
  const profile = auth.profile;

  const data = await getAgentRecentActivity(
    profile.id,
    profile.role,
    profile.domain,
    effectiveWidgetDomain(profile.role, profile.domain as AppDomain, parsed.data.domain),
    parsed.data.scope,
  );
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
  if (!parsed.success) return { data: null, error: formErrors.generic };

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
  if (!parsed.success) return { data: null, error: formErrors.generic };

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
  if (!parsed.success) return { data: null, error: formErrors.generic };

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
  if (!parsed.success) return { data: null, error: formErrors.generic };

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
// Campaign Budget fuel gauge (budget widget refresh / cohort change — admin/founder)
// The org-wide ad-account "tank": recharged → spent → remaining + an ROI
// roll-up, for the active date range. ALWAYS org-wide regardless of role —
// recharges carry no domain, so there is no domain param and no manager pin
// (a per-domain "remaining" would mix domain-filtered spend with org recharges
// = a finance error). Admin/founder gate only — the gauge is finance-visible.
// ─────────────────────────────────────────────
const GaugeScopeSchema = z.object({
  from: z.string().datetime({ message: 'Invalid from date.' }),
  to:   z.string().datetime({ message: 'Invalid to date.'   }),
}).refine(
  ({ from, to }) => new Date(from) < new Date(to),
  { message: 'from must be before to.' },
);

export async function getBudgetGaugeWidgetAction(
  from: string,
  to:   string,
): Promise<{ data: BudgetGaugeSummary | null; error: string | null }> {
  const parsed = GaugeScopeSchema.safeParse({ from, to });
  if (!parsed.success) return { data: null, error: formErrors.generic };

  // Admin/founder only (mirrors the /budget page + the budget widget roles).
  const auth = await requireProfile(['admin', 'founder']);
  if (!auth.ok) return auth.result;

  const [rows, recharges] = await Promise.all([
    getBudgetSummary(parsed.data.from, parsed.data.to),
    getAccountRecharges(parsed.data.from, parsed.data.to),
  ]);

  return { data: buildBudgetGaugeSummary(rows, recharges), error: null };
}

// Re-export resolvePresetToRange so client components can call it for default range labels
// without importing from lib/utils directly (which is fine for client — no server deps there).
export { resolvePresetToRange };
