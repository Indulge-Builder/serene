'use server';

import { z } from 'zod';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import {
  getAgentTasksSummary,
  getAgentRecentActivity,
  getLeadStatusSummary,
  getLeadsByCampaign,
  getLeadVolumeByPeriod,
  getLeadVolumeByDomains,
  type AgentActivity,
  type LeadStatusSummary,
  type CampaignStatusMix,
  type LeadVolumeSummary,
  type MultiDomainVolumeSummary,
  type VolumePeriod,
} from '@/lib/services/dashboard-service';
import type { DashboardAgentTask } from '@/lib/types';
import type { AppDomain } from '@/lib/types/database';
import { GIA_DOMAIN_ENUM, GIA_DOMAINS } from '@/lib/constants/domains';

// ─────────────────────────────────────────────
// Agent Tasks
// ─────────────────────────────────────────────
export async function getAgentTasksSummaryAction(
  _agentId: string,
): Promise<{ data: DashboardAgentTask[] | null; error: string | null }> {
  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  // Always use verified profile id — never trust client-supplied agentId
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

  // Always use verified profile id/role/domain — never trust client-supplied agentId
  const data = await getAgentRecentActivity(profile.id, profile.role, profile.domain);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Lead Status Summary (manager widget)
// ─────────────────────────────────────────────
export async function getLeadStatusSummaryAction(
  _role: string,
  _domain: string,
): Promise<{ data: LeadStatusSummary | null; error: string | null }> {
  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const data = await getLeadStatusSummary(profile.role, profile.domain as AppDomain);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Campaign breakdown (manager widget)
// ─────────────────────────────────────────────
export async function getLeadsByCampaignAction(
  _role: string,
  _domain: string,
): Promise<{ data: CampaignStatusMix[] | null; error: string | null }> {
  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const data = await getLeadsByCampaign(profile.role, profile.domain as AppDomain);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Lead Pipeline — single domain drill-down (admin/founder domain picker)
// ─────────────────────────────────────────────
const LeadStatusDomainSchema = z.object({
  domain: z.enum(GIA_DOMAIN_ENUM),
});

export async function getLeadStatusForDomainAction(
  targetDomain: AppDomain,
): Promise<{ data: LeadStatusSummary | null; error: string | null }> {
  const parsed = LeadStatusDomainSchema.safeParse({ domain: targetDomain });
  if (!parsed.success) return { data: null, error: 'Invalid domain.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  // Managers are locked to their own domain regardless of targetDomain
  const effectiveDomain = profile.role === 'manager'
    ? (profile.domain as AppDomain)
    : parsed.data.domain;

  const data = await getLeadStatusSummary(profile.role, profile.domain as AppDomain, effectiveDomain);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Campaign Performance — single domain drill-down (admin/founder domain picker)
// ─────────────────────────────────────────────
const CampaignDomainSchema = z.object({
  domain: z.enum(GIA_DOMAIN_ENUM),
});

export async function getLeadsByCampaignForDomainAction(
  targetDomain: AppDomain,
): Promise<{ data: CampaignStatusMix[] | null; error: string | null }> {
  const parsed = CampaignDomainSchema.safeParse({ domain: targetDomain });
  if (!parsed.success) return { data: null, error: 'Invalid domain.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  // Managers are locked to their own domain regardless of targetDomain
  const effectiveDomain = profile.role === 'manager'
    ? (profile.domain as AppDomain)
    : parsed.data.domain;

  const data = await getLeadsByCampaign(profile.role, profile.domain as AppDomain, effectiveDomain);
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Lead Volume (manager widget — period toggle)
// ─────────────────────────────────────────────
const VolumePeriodSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'quarter']),
});

export async function getLeadVolumeByPeriodAction(
  _role: string,
  _domain: string,
  period: VolumePeriod,
): Promise<{ data: LeadVolumeSummary | null; error: string | null }> {
  const parsed = VolumePeriodSchema.safeParse({ period });
  if (!parsed.success) {
    return { data: null, error: 'Invalid period.' };
  }

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const data = await getLeadVolumeByPeriod(
    profile.role,
    profile.domain as AppDomain,
    parsed.data.period,
  );
  return { data, error: null };
}

// ─────────────────────────────────────────────
// Multi-domain Lead Volume (admin/founder domain-picker)
// ─────────────────────────────────────────────
const DomainsVolumeSchema = z.object({
  period:  z.enum(['today', 'week', 'month', 'quarter']),
  domains: z.array(z.enum(GIA_DOMAIN_ENUM)).min(1).max(GIA_DOMAINS.length),
});

export async function getLeadVolumeByDomainsAction(
  period: VolumePeriod,
  domains: AppDomain[],
): Promise<{ data: MultiDomainVolumeSummary | null; error: string | null }> {
  const parsed = DomainsVolumeSchema.safeParse({ period, domains });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  const data = await getLeadVolumeByDomains(parsed.data.domains as AppDomain[], parsed.data.period);
return { data, error: null };
}

// ─────────────────────────────────────────────
// Single-domain Lead Volume for a specific domain (admin/founder domain tab drill-down)
// ─────────────────────────────────────────────
const SingleDomainVolumeSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'quarter']),
  domain: z.enum(GIA_DOMAIN_ENUM),
});

export async function getLeadVolumeForDomainAction(
  period: VolumePeriod,
  targetDomain: AppDomain,
): Promise<{ data: LeadVolumeSummary | null; error: string | null }> {
  const parsed = SingleDomainVolumeSchema.safeParse({ period, domain: targetDomain });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const profile = await getCurrentProfile();
  if (!profile) return { data: null, error: 'Not authenticated.' };

  if (!['manager', 'admin', 'founder'].includes(profile.role)) {
    return { data: null, error: 'Unauthorized.' };
  }

  // Managers are locked to their own domain regardless of targetDomain
  const effectiveDomain = profile.role === 'manager'
    ? (profile.domain as AppDomain)
    : parsed.data.domain;

  // Pass 'manager' role so getLeadVolumeByPeriod always applies the domain filter
  const data = await getLeadVolumeByPeriod('manager', effectiveDomain, parsed.data.period);
  return { data, error: null };
}
