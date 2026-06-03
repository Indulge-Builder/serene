export type { Profile, ProfileAuditLog, AgentRoutingConfig, UserRole, AppDomain, Database, CallOutcome } from "./database";

/** Shared action response shape — Rule 10 */
export type ActionResult<T = null> = {
  data: T | null;
  error: string | null;
};

// ─── Dashboard summary types ───────────────────────────────────────────────
// Shape must exactly match what get_dashboard_summary RPC returns.
// Used by getDashboardSummary() in dashboard-service.ts and consumed by widget props.

import type { LeadStatus, AppDomain } from "./database";

export type DashboardAgentTask = {
  id:            string;
  title:         string;
  task_category: 'personal' | 'group_subtask' | 'gia_followup';
  task_type:     string;
  priority:      'urgent' | 'high' | 'normal';
  status:        'to_do' | 'in_progress' | 'in_review';
  due_at:        string | null;
  is_overdue:    boolean;
  context_label: string | null;
  lead_id:       string | null;
};

export type DashboardAgentActivity = {
  id:          string;
  action_type: string;
  details:     Record<string, unknown> | null;
  created_at:  string;
  lead_id:     string | null;
  lead_name:   string | null;
};

export type DashboardLeadStatusCount = {
  status: LeadStatus;
  count:  number;
};

export type DashboardAgentStatusBreakdown = {
  agent_id:   string;
  agent_name: string;
  counts:     Partial<Record<LeadStatus, number>>;
  total:      number;
};

export type DashboardLeadStatusSummary = {
  totals:  DashboardLeadStatusCount[];
  byAgent: DashboardAgentStatusBreakdown[];
};

export type DashboardCampaignStatusMix = {
  campaign: string;
  total:    number;
  mix:      Partial<Record<LeadStatus, number>>;
};

export type DashboardVolumeDataPoint = {
  label: string;
  count: number;
};

export type DashboardLeadVolumeSummary = {
  total:  number;
  series: DashboardVolumeDataPoint[];
};

// ─── Performance — manager / founder view types ───────────────────────────
import type { OutcomeBreakdownItem } from "@/lib/services/performance-service";

export type AgentRosterRow = {
  id:                     string;
  full_name:              string;
  avatar_url:             string | null;
  domain:                 AppDomain;
  totalLeads:             number;
  leadsWon:               number;
  conversionRate:         number | null;
  totalDealAmount:        number;
  avgResponseTimeMinutes: number | null;
};

export type AgentDetailMetrics = {
  callsToday:           number;
  newLeadsAttended:     number;
  followUpsCompleted:   number;
  leadsWon:             number;
  totalDealAmount:      number;
  dealTypeBreakdown:    { dealType: string; count: number; totalAmount: number }[];
  pipelineBreakdown:    { status: string; count: number }[];
  callOutcomeBreakdown: OutcomeBreakdownItem[];
};

/**
 * Assembled by dashboard/page.tsx from getDashboardSummary() (RPC) +
 * getLeadVolumeByPeriod() (separate call for the week default).
 * lead_volume is NOT in the RPC — time-bucketing is too period-dependent.
 */
/** @deprecated — agent_tasks is now DashboardAgentTask[] directly on DashboardSummary */
// DashboardAgentTasksSummary removed — shape flattened into DashboardSummary.agent_tasks

export type DashboardSummary = {
  agent_tasks:    DashboardAgentTask[];
  agent_activity: DashboardAgentActivity[];
  lead_status:    DashboardLeadStatusSummary;
  campaigns:      DashboardCampaignStatusMix[];
  // null for admin/founder (volume skipped in RSC; multi-domain fetch fires on mount)
  lead_volume:    DashboardLeadVolumeSummary | null;
};
