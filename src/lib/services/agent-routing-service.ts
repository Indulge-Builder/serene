// All DB queries for agent_routing_config — Rule 03.

import { createClient } from "@/lib/supabase/server";
import type { AgentRoutingConfig } from "@/lib/types/database";

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
