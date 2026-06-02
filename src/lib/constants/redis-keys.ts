// Redis key schema and TTL constants.
// ONLY source of Redis key strings and TTL values in the codebase.
// All Redis operations must reference this file — no inline strings or magic numbers.
//
// Lead key families:
//   lead:list:{role}:{callerDomain}:{userId}:{filterHash}  — role+domain+user scoped paginated list (30s)
//   lead:filter-options:{role}:{domain}:{targetDomain}     — filter dropdown data (300s)
//   lead:row:id:{leadId}     — full lead row by PK (120s, explicit del on mutation)
//   lead:row:slug:{slug}     — full lead row by slug (120s, explicit del on mutation)
//   lead:notes:{leadId}      — notes timeline (120s, explicit del on mutation)
//   lead:activities:{leadId} — activities timeline (120s, explicit del on mutation)

export const REDIS_KEYS = {
  perf: {
    coreFour: (agentId: string, from: string, to: string) =>
      `perf:core-four:${agentId}:${from}:${to}`,
    effort: (agentId: string, period: string, today: string) =>
      `perf:effort:${agentId}:${period}:${today}`,
    outcome: (agentId: string, period: string, today: string) =>
      `perf:outcome:${agentId}:${period}:${today}`,
    benchmarks: (callerDomain: string, period: string, today: string) =>
      `perf:benchmarks:${callerDomain}:${period}:${today}`,
    roster: (domain: string, dateFrom: string, dateTo: string) =>
      `perf:roster:${domain}:${dateFrom}:${dateTo}`,
    agentDetail: (agentId: string, dateFrom: string, dateTo: string) =>
      `perf:agent-detail:${agentId}:${dateFrom}:${dateTo}`,
  },

  task: {
    subtasks: (groupId: string, userId: string) =>
      `task:subtasks:${groupId}:${userId}`,
    remarks: (taskId: string) =>
      `task:remarks:${taskId}`,
    giaList: (userId: string, role: string, domain: string) =>
      `task:gia:${userId}:${role}:${domain}`,
    groupList: (domain: string, role: string) =>
      `task:group-list:${domain}:${role}`,
    personalPage1: (userId: string) =>
      `task:personal:page1:${userId}`,
  },

  // Legacy flat aliases — kept for callers that haven't migrated to task.* yet.
  // Remove once all call sites use REDIS_KEYS.task.subtasks / task.remarks.
  taskSubtasks: (groupId: string, userId: string) =>
    `task:subtasks:${groupId}:${userId}`,

  taskRemarks: (taskId: string) =>
    `task:remarks:${taskId}`,

  dashboardLeadStatus: (domain: string) =>
    `dashboard:lead-status:${domain}`,

  dashboardLeadVolume: (role: string, domain: string, period: string) =>
    `dashboard:lead-volume:${role}:${domain}:${period}`,

  dashboardLeadVolumeMulti: (domains: string[], period: string) =>
    `dashboard:lead-volume:multi:${[...domains].sort().join(',')}:${period}`,

  dashboardCampaigns: (domain: string) =>
    `dashboard:campaigns:${domain}`,

  // Canonical shape: lead:list:{role}:{callerDomain}:{userId}:{filterHash}
  // role and userId each appear exactly once. callerDomain is the session-verified
  // profile domain — not filters.domain — so cross-domain bleed is impossible.
  leadList: (role: string, callerDomain: string, userId: string, filterHash: string) =>
    `lead:list:${role}:${callerDomain}:${userId}:${filterHash}`,

  leadFilterOptions: (role: string, domain: string, targetDomain: string) =>
    `lead:filter-options:${role}:${domain}:${targetDomain}`,

  leadRowId: (leadId: string) =>
    `lead:row:id:${leadId}`,

  leadRowSlug: (slug: string) =>
    `lead:row:slug:${slug}`,

  leadNotes: (leadId: string) =>
    `lead:notes:${leadId}`,

  leadActivities: (leadId: string) =>
    `lead:activities:${leadId}`,

  campaign: {
    campaignList: (domain: string, dateFrom: string, dateTo: string) =>
      `campaign:list:${domain}:${dateFrom?.slice(0, 10) ?? ''}:${dateTo?.slice(0, 10) ?? ''}`,
    campaignDetail: (campaignKey: string, dateFrom: string, dateTo: string) =>
      `campaign:detail:${campaignKey}:${dateFrom?.slice(0, 10) ?? ''}:${dateTo?.slice(0, 10) ?? ''}`,
    campaignDistribution: (campaignKey: string, dateFrom: string, dateTo: string) =>
      `campaign:distribution:${campaignKey}:${dateFrom?.slice(0, 10) ?? ''}:${dateTo?.slice(0, 10) ?? ''}`,
    campaignAdCreative: (campaignKey: string) =>
      `campaign:ad-creative:${campaignKey}`,
  },
} as const;

// ─────────────────────────────────────────────
// buildLeadListKey — deterministic cache key for getLeadsByRole results
//
// callerDomain is the session-verified domain from the caller's profile, NOT
// filters.domain. For manager role the DB constraint uses callerDomain; for
// admin/founder callerDomain scopes the key even when filters.domain is set.
// This prevents two managers in different domains sharing a cache slot when
// filters.domain is null (which it usually is for managers).
//
// Arrays are sorted before joining so [a,b] and [b,a] produce the same key.
// Null/undefined values become '' so the component count stays fixed.
// ─────────────────────────────────────────────
export function buildLeadListKey(
  role:         string,
  callerDomain: string,
  userId:       string,
  filters: {
    domain?:            string | null;
    page?:              number | null;
    pageSize?:          number | null;
    status?:            string[] | null;
    last_call_outcome?: string[] | null;
    source?:            string | null;
    campaign?:          string | null;
    agent_id?:          string | null;
    search?:            string | null;
    date_from?:         string | null;
    date_to?:           string | null;
  },
): string {
  const status  = [...(filters.status  ?? [])].sort().join(',');
  const outcome = [...(filters.last_call_outcome ?? [])].sort().join(',');

  const filterHash = [
    filters.domain   ?? '',
    String(filters.page     ?? 1),
    String(filters.pageSize ?? 30),
    status,
    outcome,
    filters.source   ?? '',
    filters.campaign ?? '',
    filters.agent_id ?? '',
    filters.search   ?? '',
    filters.date_from ?? '',
    filters.date_to   ?? '',
  ].join(':');

  return REDIS_KEYS.leadList(role, callerDomain, userId, filterHash);
}

// ─────────────────────────────────────────────
// leadListKeyPrefix — prefix for scanning/deleting all list keys for a caller
//
// Used by createManualLead to invalidate all cached page/filter combinations.
// Matches every key buildLeadListKey could have produced for this triple.
// ─────────────────────────────────────────────
export function leadListKeyPrefix(role: string, callerDomain: string, userId: string): string {
  return `lead:list:${role}:${callerDomain}:${userId}:`;
}

// TTL values in seconds — never milliseconds.
export const PERF_CORE_FOUR_TTL    = 60;
export const PERF_EFFORT_TTL       = 30;
export const PERF_OUTCOME_TTL      = 60;
export const PERF_BENCHMARKS_TTL   = 120;
export const PERF_ROSTER_TTL       = 120;
export const PERF_AGENT_DETAIL_TTL = 30;

export const CAMPAIGN_LIST_TTL         = 120;
export const CAMPAIGN_DETAIL_TTL       = 120;
export const CAMPAIGN_DISTRIBUTION_TTL = 120;
export const CAMPAIGN_AD_CREATIVE_TTL  = 300;

export const TASK_GIA_TTL           = 60;
export const TASK_GROUP_LIST_TTL    = 120;
export const TASK_PERSONAL_PAGE1_TTL = 30;

export const REDIS_TTL = {
  TASK_SUBTASKS:           30,
  TASK_REMARKS:            30,
  DASHBOARD_LEAD_STATUS:   60,
  DASHBOARD_LEAD_VOLUME:  120,
  DASHBOARD_CAMPAIGNS:    120,
  LEAD_LIST:               30,  // new leads visible within 30s; TTL-only invalidation
  LEAD_FILTER_OPTIONS:    300,  // campaigns + agents change infrequently
  LEAD_ROW:               120,  // dossier data; explicitly invalidated on mutation
  LEAD_NOTES:             120,
  LEAD_ACTIVITIES:        120,
} as const;
