// All DB queries for agent_routing_config — Rule 03.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentRoutingConfig, AgentRosterRow, AppDomain } from "@/lib/types/database";

/** Get routing config for a single agent. Returns null if not found. */
export async function getAgentRoutingConfig(
  agentId: string,
): Promise<AgentRoutingConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_routing_config")
    .select("*")
    .eq("agent_id", agentId)
    .single();

  if (error || !data) return null;
  return data as AgentRoutingConfig;
}

/** Get routing configs for all agents in a given domain. */
export async function getRoutingConfigsByDomain(
  domain: string,
): Promise<AgentRoutingConfig[]> {
  const supabase = await createClient();
  // Join via profiles to filter by domain
  const { data, error } = await supabase
    .from("agent_routing_config")
    .select("*, profiles!inner(domain)")
    .eq("profiles.domain", domain as import('@/lib/types/database').AppDomain);

  if (error || !data) return [];
  return data as AgentRoutingConfig[];
}

/** Get all active routing configs (for round-robin pool). */
export async function getActiveRoutingConfigs(): Promise<AgentRoutingConfig[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_routing_config")
    .select("*")
    .eq("is_active", true);

  if (error || !data) return [];
  return data as AgentRoutingConfig[];
}

/**
 * Get a joined roster of agents + their routing config.
 *
 * domain = '*' → all agents (admin/founder access only — caller must enforce)
 * domain = specific → agents in that domain only
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
    .select(`
      id,
      full_name,
      avatar_url,
      job_title,
      domain,
      is_active,
      is_on_leave,
      agent_routing_config!inner (
        id,
        is_active,
        shift_start,
        shift_end
      )
    `)
    .eq('role', 'agent')
    .order('domain', { ascending: true })
    .order('full_name', { ascending: true });

  if (domain !== '*') {
    query = query.eq('domain', domain);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => {
    const config = Array.isArray(row.agent_routing_config)
      ? row.agent_routing_config[0]
      : row.agent_routing_config;
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
): Promise<{ data: AgentRoutingConfig | null; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('agent_routing_config')
    .update({ shift_start: shiftStart, shift_end: shiftEnd })
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
  const { data, error } = await supabase
    .from("agent_routing_config")
    .update({ is_active: isActive })
    .eq("agent_id", agentId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AgentRoutingConfig, error: null };
}
