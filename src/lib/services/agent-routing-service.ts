// All DB queries for agent_routing_config — Rule 03.

import { createClient } from "@/lib/supabase/server";
import { giaDb } from "@/lib/supabase/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROUTING_POOL_ROLES } from "@/lib/constants/roles";
import type { AgentRoutingConfig, AgentRosterRow, AppDomain } from "@/lib/types/database";

/** Get routing config for a single agent. Returns null if not found. Session client — UI/action use only. */
export async function getAgentRoutingConfig(
  agentId: string,
): Promise<AgentRoutingConfig | null> {
  const supabase = await createClient();
  const { data, error } = await giaDb(supabase)
    .from("agent_routing_config")
    .select("*")
    .eq("agent_id", agentId)
    .single();

  if (error || !data) return null;
  return data as AgentRoutingConfig;
}

/**
 * Same as getAgentRoutingConfig but uses adminClient.
 * Required in webhook and Trigger.dev contexts where no user session exists.
 * Used by lib/actions/sla.ts to fetch shift config when scheduling SLA timers.
 */
export async function getAgentRoutingConfigAdmin(
  agentId: string,
): Promise<AgentRoutingConfig | null> {
  const admin = createAdminClient();
  const { data, error } = await giaDb(admin)
    .from("agent_routing_config")
    .select("*")
    .eq("agent_id", agentId)
    .single();
  if (error || !data) return null;
  return data as AgentRoutingConfig;
}

/**
 * Get a joined roster of pool members (agents + managers) + their routing config.
 *
 * domain = '*' → everyone in the routing pool (admin/founder access only — caller must enforce)
 * domain = specific → pool members in that domain only (includes the requesting
 *   manager's own row + any peer managers, so a manager can edit their own
 *   shift/pool the same way they edit their agents')
 *
 * Pool membership = ROUTING_POOL_ROLES (agents + managers). The `!inner` join on
 * agent_routing_config means a pool member with no config row is absent until the
 * auto-create trigger / backfill gives them one (migration 0124).
 *
 * Uses adminClient — this is a cross-profiles read that RLS would block
 * for managers. Two-layer security: caller must verify domain at action level.
 * ORDER BY domain ASC, full_name ASC.
 */
export async function getAgentRosterByDomain(
  domain: AppDomain | '*',
): Promise<AgentRosterRow[]> {
  const admin = createAdminClient();

  let query = admin
    .from('profiles')
    .select('id, full_name, avatar_url, job_title, domain, is_active, is_on_leave')
    .in('role', ROUTING_POOL_ROLES)
    .order('domain', { ascending: true })
    .order('full_name', { ascending: true });

  if (domain !== '*') {
    query = query.eq('domain', domain);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  if (data.length === 0) return [];

  // profiles is public, agent_routing_config is gia: PostgREST cannot embed across
  // schemas, so read the configs for this roster separately and join here. The old
  // `!inner` rule is kept — a pool member with no config row is left out.
  const { data: configs, error: configError } = await giaDb(admin)
    .from('agent_routing_config')
    .select('id, agent_id, is_active, shift_start, shift_end, shift_days')
    .in('agent_id', data.map((row) => row.id));
  if (configError || !configs) {
    console.error('[agent-routing-service] getAgentRosterByDomain config read failed:', configError?.message);
    return [];
  }
  const configByAgent = new Map(configs.map((c) => [c.agent_id, c]));

  return data.filter((row) => configByAgent.has(row.id)).map((row) => {
    const config = configByAgent.get(row.id);
    return {
      id:                 row.id,
      full_name:          row.full_name,
      avatar_url:         row.avatar_url,
      job_title:          row.job_title,
      domain:             row.domain as AppDomain,
      is_active:          row.is_active,
      is_on_leave:        row.is_on_leave,
      routing_is_active:  config?.is_active ?? true,
      routing_config_id:  config?.id ?? '',
      shift_start:        config?.shift_start ?? null,
      shift_end:          config?.shift_end ?? null,
      shift_days:         config?.shift_days ?? null,
    };
  });
}

/**
 * Write shift_start / shift_end for a single agent.
 * Pass null for both to clear the shift window.
 * Uses adminClient — RLS would block manager writing to another profile's config.
 */
export async function setAgentShift(
  agentId: string,
  shiftStart: string | null,
  shiftEnd: string | null,
  shiftDays: number[] | null,
): Promise<{ data: AgentRoutingConfig | null; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await giaDb(admin)
    .from('agent_routing_config')
    .update({ shift_start: shiftStart, shift_end: shiftEnd, shift_days: shiftDays })
    .eq('agent_id', agentId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AgentRoutingConfig, error: null };
}

/**
 * Set is_active on an agent's routing config.
 * This is the holiday switch — toggling false removes agent from assignment pool.
 */
export async function setRoutingActive(
  agentId: string,
  isActive: boolean,
): Promise<{ data: AgentRoutingConfig | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await giaDb(supabase)
    .from("agent_routing_config")
    .update({ is_active: isActive })
    .eq("agent_id", agentId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AgentRoutingConfig, error: null };
}
