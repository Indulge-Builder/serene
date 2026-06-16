// Usage / active-time tracking row types — hand-declared until
// `supabase gen types typescript` is re-run after migration 0126 is applied
// (the generated Database type does not know the usage_heartbeats /
// usage_daily tables or the get_agent_usage RPC yet). Shapes mirror the
// migration exactly. Types only — no runtime values.

import type { AppDomain, UserRole } from "@/lib/types/database";

/**
 * The Redis presence envelope the client heartbeat SETs under presence:{userId}
 * (REDIS_KEYS.presence). One per active user, EX REDIS_TTL.PRESENCE. The
 * snapshot job reads these to know who was active in the last interval.
 */
export type PresenceEntry = {
  domain: AppDomain;
  role: UserRole;
  /** epoch ms of the heartbeat that wrote this entry (debug/observability only). */
  ts: number;
};

/** usage_daily row — the rollup the dashboard reads. */
export type UsageDailyRow = {
  /** IST calendar day, ISO date string (YYYY-MM-DD). */
  day: string;
  user_id: string;
  domain: AppDomain;
  active_minutes: number;
};

/** One agent's active-minutes for the current IST day, by domain. */
export type AgentUsageToday = {
  user_id: string;
  full_name: string | null;
  domain: AppDomain;
  active_minutes: number;
};

/** One (day, agent, domain) historical active-minutes point. */
export type AgentUsageHistoryPoint = {
  day: string;
  user_id: string;
  full_name: string | null;
  domain: AppDomain;
  active_minutes: number;
};

/** The get_agent_usage RPC envelope (today recomputed live + history rollup). */
export type AgentUsageReport = {
  today: AgentUsageToday[];
  history: AgentUsageHistoryPoint[];
};
