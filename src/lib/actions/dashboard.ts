'use server';

import { z } from 'zod';
import { getCurrentProfile } from '@/lib/services/profiles-service';
import {
  getAgentTasksSummary,
  getAgentRecentActivity,
  getLeadStatusSummary,
  getLeadsByCampaign,
  getLeadVolumeByPeriod,
  type AgentTasksSummary,
  type AgentActivity,
  type LeadStatusSummary,
  type CampaignStatusMix,
  type LeadVolumeSummary,
  type VolumePeriod,
} from '@/lib/services/dashboard-service';
import type { AppDomain } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Agent Tasks
// ─────────────────────────────────────────────
export async function getAgentTasksSummaryAction(
  _agentId: string,
): Promise<{ data: AgentTasksSummary | null; error: string | null }> {
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

  // Always use verified profile id — never trust client-supplied agentId
  const data = await getAgentRecentActivity(profile.id);
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
