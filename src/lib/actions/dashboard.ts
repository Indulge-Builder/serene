'use server';

import { z } from 'zod';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import {
  getAgentTasksSummary,
  getAgentRecentActivity,
  getLeadStatusSummary,
  getLeadsByCampaign,
  getLeadVolumeByRange,
  getLeadVolumeByDomains,
  getLeadVolumeForDomain,
  type AgentActivity,
  type LeadStatusSummary,
  type CampaignStatusMix,
  type LeadVolumeSummary,
  type MultiDomainVolumeSummary,
} from '@/lib/services/dashboard-service';
import type { DashboardAgentTask } from '@/lib/types';
import type { AppDomain } from '@/lib/types/database';
import type { DateRange } from '@/lib/utils/date-range';
import { resolvePresetToRange } from '@/lib/utils/date-range';
import { GIA_DOMAIN_ENUM, GIA_DOMAINS } from '@/lib/constants/domains';

// ─────────────────────────────────────────────
// Shared date-range validation schema
// Accepts from/to as ISO strings; validates ordering; rejects inverted ranges.
// ─────────────────────────────────────────────
const DateRangeSchema = z.object({
  from: z.string().datetime({ message: 'Invalid from date.' }),
  to:   z.string().datetime({ message: 'Invalid to date.'   }),
}).refine(
  ({ from, to }) => new Date(from) < new Date(to),
  { message: 'Date range is invalid: from must be before to.' },
);

function parseDateRange(from: string | null | undefined, to: string | null | undefined): DateRange | undefined {
  if (!from || !to) return undefined;
  const parsed = DateRangeSchema.safeParse({ from, to });
  return parsed.success ? parsed.data : undefined;
}

// ─────────────────────────────────────────────
// Agent Tasks
// ─────────────────────────────────────────────
export async function getAgentTasksSummaryAction(
  _agentId: string,
): Promise<{ data: DashboardAgentTask[] | null; error: string | null }> {
  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  const data = await getAgentTasksSummary(profile.id);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Agent Recent Activity
// ─────────────────────────────────────────────
export async function getAgentRecentActivityAction(
  _agentId: string,
): Promise<{ data: AgentActivity[] | null; error: string | null }> {
  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  const data = await getAgentRecentActivity(profile.id, profile.role, profile.domain);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Lead Status Summary (manager widget)
// ─────────────────────────────────────────────
const LeadStatusInputSchema = z.object({
  from: z.string().datetime().nullable().optional(),
  to:   z.string().datetime().nullable().optional(),
}).superRefine((val, ctx) => {
  if (val.from && val.to && new Date(val.from) >= new Date(val.to)) {
    ctx.addIssue({ code: 'custom', message: 'from must be before to.' });
  }
});

export async function getLeadStatusSummaryAction(
  _role:   string,
  _domain: string,
  from?:   string | null,
  to?:     string | null,
): Promise<{ data: LeadStatusSummary | null; error: string | null }> {
  const parsed = LeadStatusInputSchema.safeParse({ from, to });
  if (!parsed.success) return { data: null, error: 'Invalid date range.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const dateRange = parseDateRange(from, to);
  const data = await getLeadStatusSummary(profile.role, profile.domain as AppDomain, undefined, dateRange);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Campaign breakdown (manager widget)
// ─────────────────────────────────────────────
export async function getLeadsByCampaignAction(
  _role:   string,
  _domain: string,
  from?:   string | null,
  to?:     string | null,
): Promise<{ data: CampaignStatusMix[] | null; error: string | null }> {
  const parsed = LeadStatusInputSchema.safeParse({ from, to });
  if (!parsed.success) return { data: null, error: 'Invalid date range.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const dateRange = parseDateRange(from, to);
  const data = await getLeadsByCampaign(profile.role, profile.domain as AppDomain, undefined, dateRange);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Lead Pipeline — single domain drill-down (admin/founder domain picker)
// ─────────────────────────────────────────────
const LeadStatusDomainSchema = z.object({
  domain: z.enum(GIA_DOMAIN_ENUM),
  from:   z.string().datetime().nullable().optional(),
  to:     z.string().datetime().nullable().optional(),
}).superRefine((val, ctx) => {
  if (val.from && val.to && new Date(val.from) >= new Date(val.to)) {
    ctx.addIssue({ code: 'custom', message: 'from must be before to.' });
  }
});

export async function getLeadStatusForDomainAction(
  targetDomain: AppDomain,
  from?:        string | null,
  to?:          string | null,
): Promise<{ data: LeadStatusSummary | null; error: string | null }> {
  const parsed = LeadStatusDomainSchema.safeParse({ domain: targetDomain, from, to });
  if (!parsed.success) return { data: null, error: 'Invalid domain or date range.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const effectiveDomain = profile.role === 'manager'
    ? (profile.domain as AppDomain)
    : parsed.data.domain;

  const dateRange = parseDateRange(from, to);
  const data = await getLeadStatusSummary(profile.role, profile.domain as AppDomain, effectiveDomain, dateRange);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Campaign Performance — single domain drill-down (admin/founder domain picker)
// ─────────────────────────────────────────────
const CampaignDomainSchema = z.object({
  domain: z.enum(GIA_DOMAIN_ENUM),
  from:   z.string().datetime().nullable().optional(),
  to:     z.string().datetime().nullable().optional(),
}).superRefine((val, ctx) => {
  if (val.from && val.to && new Date(val.from) >= new Date(val.to)) {
    ctx.addIssue({ code: 'custom', message: 'from must be before to.' });
  }
});

export async function getLeadsByCampaignForDomainAction(
  targetDomain: AppDomain,
  from?:        string | null,
  to?:          string | null,
): Promise<{ data: CampaignStatusMix[] | null; error: string | null }> {
  const parsed = CampaignDomainSchema.safeParse({ domain: targetDomain, from, to });
  if (!parsed.success) return { data: null, error: 'Invalid domain or date range.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const effectiveDomain = profile.role === 'manager'
    ? (profile.domain as AppDomain)
    : parsed.data.domain;

  const dateRange = parseDateRange(from, to);
  const data = await getLeadsByCampaign(profile.role, profile.domain as AppDomain, effectiveDomain, dateRange);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Lead Volume (manager widget) — date range
// ─────────────────────────────────────────────
const VolumeRangeSchema = z.object({
  from: z.string().datetime({ message: 'Invalid from date.' }),
  to:   z.string().datetime({ message: 'Invalid to date.'   }),
}).refine(
  ({ from, to }) => new Date(from) < new Date(to),
  { message: 'from must be before to.' },
);

export async function getLeadVolumeByRangeAction(
  from: string,
  to:   string,
): Promise<{ data: LeadVolumeSummary | null; error: string | null }> {
  const parsed = VolumeRangeSchema.safeParse({ from, to });
  if (!parsed.success) return { data: null, error: 'Invalid date range.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const data = await getLeadVolumeByRange(
    profile.role,
    profile.domain as AppDomain,
    parsed.data,
  );
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Multi-domain Lead Volume (admin/founder domain-picker)
// ─────────────────────────────────────────────
const DomainsVolumeSchema = z.object({
  from:    z.string().datetime(),
  to:      z.string().datetime(),
  domains: z.array(z.enum(GIA_DOMAIN_ENUM)).min(1).max(GIA_DOMAINS.length),
}).refine(({ from, to }) => new Date(from) < new Date(to), { message: 'from must be before to.' });

export async function getLeadVolumeByDomainsAction(
  from:    string,
  to:      string,
  domains: AppDomain[],
): Promise<{ data: MultiDomainVolumeSummary | null; error: string | null }> {
  const parsed = DomainsVolumeSchema.safeParse({ from, to, domains });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const data = await getLeadVolumeByDomains(
    parsed.data.domains as AppDomain[],
    { from: parsed.data.from, to: parsed.data.to },
  );
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Single-domain Lead Volume for a specific domain (admin/founder domain tab drill-down)
// ─────────────────────────────────────────────
const SingleDomainVolumeSchema = z.object({
  from:   z.string().datetime(),
  to:     z.string().datetime(),
  domain: z.enum(GIA_DOMAIN_ENUM),
}).refine(({ from, to }) => new Date(from) < new Date(to), { message: 'from must be before to.' });

export async function getLeadVolumeForDomainAction(
  from:         string,
  to:           string,
  targetDomain: AppDomain,
): Promise<{ data: LeadVolumeSummary | null; error: string | null }> {
  const parsed = SingleDomainVolumeSchema.safeParse({ from, to, domain: targetDomain });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const effectiveDomain = profile.role === 'manager'
    ? (profile.domain as AppDomain)
    : parsed.data.domain;

  const data = await getLeadVolumeForDomain(effectiveDomain, { from: parsed.data.from, to: parsed.data.to });
  return { data, error: null };
}

// Re-export resolvePresetToRange so client components can call it for default range labels
// without importing from lib/utils directly (which is fine for client — no server deps there).
export { resolvePresetToRange };
