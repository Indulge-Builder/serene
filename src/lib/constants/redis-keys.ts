// Redis key schema and TTL constants.
// ONLY source of Redis key strings and TTL values in the codebase.
// All Redis operations must reference this file — no inline strings or magic numbers.
//
// Lead key families:
//   lead:list:v:{role}:{domain}         — version counter (INCR on any lead mutation)
//   lead:list:{role}:{callerDomain}:{userId}:{filterHash}:v{N}  — versioned list cache (30s)
//   lead:filter-options:{role}:{domain}:{targetDomain}          — filter dropdown data (300s)
//   lead:row:id:{leadId}     — full lead row by PK (120s, explicit del on mutation)
//   lead:row:slug:{slug}     — full lead row by slug (120s, explicit del on mutation)
//   lead:notes:{leadId}      — notes timeline (120s, explicit del on mutation)
//   lead:activities:{leadId} — activities timeline (120s, explicit del on mutation)

export const REDIS_KEYS = {
  task: {
    giaList: (userId: string, role: string, domain: string) =>
      `task:gia:${userId}:${role}:${domain}`,
    personalPage1: (userId: string) =>
      `task:personal:page1:${userId}`,
  },

  dashboardLeadStatus: (domain: string) =>
    `dashboard:lead-status:${domain}`,

  dashboardLeadVolume: (role: string, domain: string, period: string) =>
    `dashboard:lead-volume:${role}:${domain}:${period}`,

  dashboardLeadVolumeMulti: (domains: string[], period: string) =>
    `dashboard:lead-volume:multi:${[...domains].sort().join(',')}:${period}`,

  dashboardCampaigns: (domain: string) =>
    `dashboard:campaigns:${domain}`,

  dashboardAgentTasks: (userId: string) =>
    `dashboard:agent-tasks:${userId}`,

  // Version counter — INCR this on any lead mutation to atomically invalidate
  // all cached list pages for a role+domain without a Redis SCAN.
  // Key persists indefinitely (no TTL) — tiny memory footprint.
  leadListVersion: (role: string, domain: string) =>
    `lead:list:v:${role}:${domain}`,

  // Canonical shape: lead:list:{role}:{callerDomain}:{userId}:{filterHash}:v{version}
  // role and userId each appear exactly once. callerDomain is the session-verified
  // profile domain — not filters.domain — so cross-domain bleed is impossible.
  // version is embedded so incrementing the counter auto-voids all prior pages.
  leadList: (role: string, callerDomain: string, userId: string, filterHash: string, version: number) =>
    `lead:list:${role}:${callerDomain}:${userId}:${filterHash}:v${version}`,

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
// version is the current value of leadListVersion(role, callerDomain) — always
// read from Redis immediately before calling this function.
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
  version: number,
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

  return REDIS_KEYS.leadList(role, callerDomain, userId, filterHash, version);
}

// TTL values in seconds — never milliseconds.
export const TASK_GIA_TTL            = 60;
export const TASK_PERSONAL_PAGE1_TTL = 30;

export const REDIS_TTL = {
  DASHBOARD_AGENT_TASKS:   30,
  DASHBOARD_LEAD_STATUS:   60,
  DASHBOARD_LEAD_VOLUME:  120,
  DASHBOARD_CAMPAIGNS:    120,
  LEAD_LIST:               30,  // new leads visible within 30s; TTL-only safety net
  LEAD_FILTER_OPTIONS:    300,  // campaigns + agents change infrequently
  LEAD_ROW:               120,  // dossier data; explicitly invalidated on mutation
  LEAD_NOTES:             120,
  LEAD_ACTIVITIES:        120,
} as const;
