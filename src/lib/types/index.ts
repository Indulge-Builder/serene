export type { Profile, ProfileAuditLog, AgentRoutingConfig, UserRole, AppDomain, Database, CallOutcome } from "./database";
export type { DateRange, DatePreset } from "@/lib/utils/date-range";

/** Shared action response shape — Rule 10 */
export type ActionResult<T = null> = {
  data: T | null;
  error: string | null;
};

/**
 * THE canonical assignable-user projection (dry-audit M-4 + M-11).
 * Produced by getAssignableUsers() in profiles-service and
 * getAssignableUsersAction() in actions/profiles.ts.
 * Never re-declare a Pick<Profile, …> assignee shape — derive slimmer
 * shapes from this one (see AssigneeSlim in tasks-service).
 */
export type AssignableUser = Pick<
  Profile,
  "id" | "full_name" | "avatar_url" | "role" | "domain"
>;

// ─── Resolved-relation intersection helpers (dry-audit L-3) ────────────────
// THE way to express "row + joined profile fields". Never hand-write a fresh
// `& { author: … }` / `& { assignee: … }` intersection — name the shape with
// one of these so the intent (a service-layer join projection) is documented.

/** Row + resolved author profile. Default: non-null `{ full_name }`. */
export type WithAuthor<T, TAuthor = { full_name: string }> = T & { author: TAuthor };
/** Row + resolved assignee profile. Default: nullable `{ full_name }`. */
export type WithAssignee<T, TAssignee = { full_name: string } | null> = T & { assignee: TAssignee };
/** Row + resolved actor profile (activity/audit rows). Default: nullable `{ full_name }`. */
export type WithActor<T, TActor = { full_name: string } | null> = T & { actor: TActor };

// ─── Dashboard summary types ───────────────────────────────────────────────
// Shape must exactly match what get_dashboard_summary RPC returns.
// Used by getDashboardSummary() in dashboard-service.ts and consumed by widget props.

import type { LeadStatus, AppDomain, Profile } from "./database";

export type DashboardAgentTask = {
  id:            string;
  title:         string;
  task_category: 'personal' | 'group_subtask';
  task_type:     string;
  priority:      'urgent' | 'high' | 'normal';
  status:        'to_do' | 'in_progress' | 'in_review';
  due_at:        string | null;
  is_overdue:    boolean;
  context_label: string | null;
  lead_id:       string | null;
};

// The dashboard "Recent Activity" widget is a LEAD rollup (migration 0132): one
// card per lead, most-recently-worked first — current status, latest call
// outcome, latest note. Not an event stream. Sourced from `leads` (which already
// denormalises all of this), scoped Mine/Team.
export type DashboardRecentLead = {
  lead_id:           string;
  lead_slug:         string | null;
  lead_name:         string | null;
  /** leads.domain — founder/manager domain tag. */
  lead_domain:       string | null;
  /** Current lead status. */
  status:            string;
  /** Latest call outcome on the lead (rnr | switched_off | …), or null. */
  last_call_outcome: string | null;
  /** When the lead was last worked — the card's timestamp + sort key. */
  last_activity_at:  string | null;
  /** Currently-assigned agent id. */
  assigned_to:       string | null;
  /** Currently-assigned agent name ("by <agent>"). */
  assignee_name:     string | null;
  /** The latest note body on the lead (trimmed), or null. */
  note_body:         string | null;
};

/** @deprecated kept as an alias for the `agent_activity` seed key; use DashboardRecentLead. */
export type DashboardAgentActivity = DashboardRecentLead;

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

export type DashboardMultiDomainVolumePoint = {
  label: string;
  [domain: string]: number | string;
};

export type DashboardMultiDomainVolumeSummary = {
  domains: AppDomain[];
  totals:  Record<AppDomain, number>;
  series:  DashboardMultiDomainVolumePoint[];
};

// ─── Performance — manager / founder view types ───────────────────────────
import type { OutcomeBreakdownItem } from "@/lib/services/performance-service";
import type { BudgetCampaignRow, BudgetGaugeSummary } from "@/lib/services/ad-spend-service";

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
  totalLeads:           number;
  totalCallsMade:       number;
  leadsWon:             number;
  totalDealAmount:      number;
  dealTypeBreakdown:    { dealType: string; count: number; totalAmount: number }[];
  pipelineBreakdown:    { status: string; count: number }[];
  callOutcomeBreakdown: OutcomeBreakdownItem[];
};

// ─── Performance — domain health overview ────────────────────────────────────
// Used by getDomainHealthMetrics.
// conversionRate is computed in the service layer (null when won + lost = 0).

export type DomainHealthCard = {
  domain:          AppDomain;
  totalLeads:      number;
  leadsWon:        number;
  leadsLost:       number;
  callsLogged:     number;
  inDiscussion:    number;
  nurturing:       number;
  conversionRate:  number | null;
  totalCallsMade:  number;
  totalRevenue:    number;
  /** Deals closed in the period — COUNT from public.deals by won_at (0107) */
  totalDeals:      number;
};

// ─── Performance — founder-set domain targets (domain_targets, 0105) ────────

export type DomainTarget = {
  domain:       AppDomain;
  metric:       'deals_closed';
  target_value: number;
  period:       'month';
};

/**
 * Assembled by dashboard/page.tsx from getDashboardSummary() (RPC) +
 * getLeadVolumeByRange() / getLeadVolumeByDomains() for the active date filter.
 * Volume is NOT in the RPC — bucket granularity is computed in the service layer.
 */
/** @deprecated — agent_tasks is now DashboardAgentTask[] directly on DashboardSummary */
// DashboardAgentTasksSummary removed — shape flattened into DashboardSummary.agent_tasks

export type DashboardSummary = {
  agent_tasks:    DashboardAgentTask[];
  agent_activity: DashboardAgentActivity[];
  lead_status:    DashboardLeadStatusSummary;
  campaigns:      DashboardCampaignStatusMix[];
  /** Manager: single-domain line chart for profile.domain */
  lead_volume:       DashboardLeadVolumeSummary | null;
  /** Admin/founder: multi-domain "All" tab — seeded on first paint */
  lead_volume_multi: DashboardMultiDomainVolumeSummary | null;
  /** Count of non-terminal leads with no activity in 5+ days. Agent role: always 0. */
  cold_leads_count?: number;
  /**
   * Agent snapshot counts (migration 0115) — LIVE pipeline states, never
   * scoped by the dashboard date filter. Non-agent roles: always 0.
   */
  pending_calls_count?: number;
  new_leads_count?: number;
  /**
   * Manager+: campaign budget rows for the active date range, assembled by
   * dashboard/page.tsx from getBudgetSummary() (not in the RPC — spend lives
   * in ad_spend_daily). Manager rows are pre-filtered to their domain.
   * Agent role: always null.
   */
  budget_summary?: BudgetCampaignRow[] | null;
  /**
   * Manager+: the org-wide ad-account fuel gauge (recharged → spent →
   * remaining + ROI roll-up) for the active date range, assembled by
   * dashboard/page.tsx from getBudgetSummary() + getAccountRecharges() via
   * buildBudgetGaugeSummary(). ALWAYS org-wide (recharges carry no domain).
   * Agent role / RPC failure: null.
   */
  budget_gauge?: BudgetGaugeSummary | null;
};
