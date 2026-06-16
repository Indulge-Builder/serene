// Redis key schema and TTL constants.
// ONLY source of Redis key strings and TTL values in the codebase.
// All Redis operations must reference this file — no inline strings or magic numbers.
//
// Lead key families:
//   lead:list:v:{role}:{domain}         — version counter (INCR on any lead mutation)
//   lead:list:{role}:{callerDomain}:{userId}:{filterHash}  — version-validated list cache (30s);
//     value is { v, result } where v is the counter value at write time (perf audit C-3)
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
    // Visibility is now user-specific (creator OR subtask assignee).
    // Domain/role are NOT part of the key — two users in the same domain
    // see different sets of groups depending on what they created or are assigned in.
    groupList: (userId: string) =>
      `task:group-list:${userId}`,
  },

  // Range-namespaced keys — include from:to so different date windows don't share a slot.
  // When p_date_from/p_date_to are null (all-time), the segment is 'all'.
  dashboardLeadStatus: (domain: string, from?: string | null, to?: string | null) =>
    `dashboard:lead-status:${domain}:${from ?? 'all'}:${to ?? 'all'}`,

  dashboardLeadVolume: (role: string, domain: string, from?: string | null, to?: string | null) =>
    `dashboard:lead-volume:${role}:${domain}:${from ?? 'all'}:${to ?? 'all'}`,

  dashboardLeadVolumeMulti: (domains: string[], from?: string | null, to?: string | null) =>
    `dashboard:lead-volume:multi:${[...domains].sort().join(',')}:${from ?? 'all'}:${to ?? 'all'}`,

  dashboardCampaigns: (domain: string, from?: string | null, to?: string | null) =>
    `dashboard:campaigns:${domain}:${from ?? 'all'}:${to ?? 'all'}`,

  dashboardAgentTasks: (userId: string) =>
    `dashboard:agent-tasks:${userId}`,

  // Version counter — INCR this on any lead mutation to atomically invalidate
  // all cached list pages for a role+domain without a Redis SCAN.
  // Key persists indefinitely (no TTL) — tiny memory footprint.
  leadListVersion: (role: string, domain: string) =>
    `lead:list:v:${role}:${domain}`,

  // Canonical shape: lead:list:{role}:{callerDomain}:{userId}:{filterHash}
  // role and userId each appear exactly once. callerDomain is the session-verified
  // profile domain — not filters.domain — so cross-domain bleed is impossible.
  // The version is NOT in the key (perf audit C-3): the stored value carries the
  // counter value it was written under, and the reader validates it against the
  // live counter in the same MGET — one Upstash round trip instead of two, while
  // an INCR still atomically voids every prior page.
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

  // Call Intelligence helpdesk library — one envelope { cases, hooks } per
  // domain (3600s). Invalidated on every admin service_cases/hook write via
  // the intelligence actions; the dossier card query is NOT cached (6-row
  // indexed lookup, lead-specific — see intelligence-service.ts header).
  helpdeskCases: (domain: string) =>
    `helpdesk:cases:${domain}`,

  // Usage / active-presence (adoption tracking). The client heartbeat SETs
  // this every 60s while the tab is visible AND interacted-with in the last
  // ~2 min — one SET per active user, value { domain, role, ts }, EX
  // PRESENCE_TTL. NO DB write on this path. The 1-min snapshot job reads all
  // live presence:* keys (SCAN) and appends to usage_heartbeats. TTL > the
  // 60s heartbeat interval so a key survives one missed beat but expires
  // within ~1 snapshot window of the user going idle/hidden.
  presence: (userId: string) =>
    `presence:${userId}`,
} as const;

// The glob the snapshot job SCANs to enumerate live presence keys.
export const PRESENCE_KEY_PATTERN = 'presence:*';

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
// The leadListVersion counter is validated against the stored value's `v`
// field at read time, not embedded in the key (perf audit C-3).
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
    sort_order?:        string | null;
    // Manager My/All view — distinct cache slots so the two never collide
    view?:              string | null;
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
    filters.date_from  ?? '',
    filters.date_to    ?? '',
    filters.sort_order ?? 'desc',
    filters.view       ?? '',
  ].join(':');

  return REDIS_KEYS.leadList(role, callerDomain, userId, filterHash);
}

// TTL values in seconds — never milliseconds.
export const TASK_GIA_TTL            = 60;
export const TASK_PERSONAL_PAGE1_TTL = 30;
export const TASK_GROUP_LIST_TTL     = 120;

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
  HELPDESK_CASES:        3600,  // brag library changes rarely; explicit del on admin write
  PRESENCE:              150,   // > 60s heartbeat interval; survives one missed beat, expires ~1 snapshot window after idle/hidden
} as const;
