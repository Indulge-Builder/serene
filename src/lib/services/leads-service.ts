import { createClient } from '@/lib/supabase/server';
import type { Lead, LeadActivity, LeadNote, UserRole, AppDomain } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Query: single lead by ID
// ─────────────────────────────────────────────
export async function getLeadById(leadId: string): Promise<Lead | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .is('archived_at', null)
    .single();

  if (error || !data) return null;
  return data as Lead;
}

// ─────────────────────────────────────────────
// Query: leads for agent (only their own)
// ─────────────────────────────────────────────
export async function getLeadsForAgent(agentId: string): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('assigned_to', agentId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Lead[];
}

// ─────────────────────────────────────────────
// Query: leads for a domain (manager view)
// ─────────────────────────────────────────────
export async function getLeadsForDomain(domain: string): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('domain', domain)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Lead[];
}

// ─────────────────────────────────────────────
// Query: all leads (admin / founder)
// ─────────────────────────────────────────────
export async function getAllLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Lead[];
}

// ─────────────────────────────────────────────
// Query: role-aware lead list (dispatches to correct fn)
// ─────────────────────────────────────────────
export async function getLeadsByRole(
  role: UserRole,
  userId: string,
  domain: AppDomain,
): Promise<Lead[]> {
  if (role === 'agent') return getLeadsForAgent(userId);
  if (role === 'manager') return getLeadsForDomain(domain);
  return getAllLeads();
}

// ─────────────────────────────────────────────
// Query: lead activities timeline
// ─────────────────────────────────────────────
export async function getLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as LeadActivity[];
}

// ─────────────────────────────────────────────
// Query: lead notes
// ─────────────────────────────────────────────
export async function getLeadNotes(leadId: string): Promise<LeadNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as LeadNote[];
}

// ─────────────────────────────────────────────
// Round-robin: next eligible agent in a domain
// ─────────────────────────────────────────────
export async function getNextRoundRobinAgent(domain: string): Promise<string | null> {
  const supabase = await createClient();

  // Fetch all active agents in this domain, ordered by when they were last assigned a lead
  const { data: agents, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('domain', domain as import('@/lib/types/database').AppDomain)
    .eq('role', 'agent')
    .eq('is_active', true);

  if (error || !agents || agents.length === 0) return null;

  // For each agent, find their most recent lead assignment
  const agentIds = agents.map((a) => a.id);

  const { data: recentLeads } = await supabase
    .from('leads')
    .select('assigned_to, assigned_at')
    .in('assigned_to', agentIds)
    .is('archived_at', null)
    .order('assigned_at', { ascending: false });

  // Build a map: agentId → most recent assigned_at
  const lastAssigned: Record<string, Date | null> = {};
  for (const agentId of agentIds) {
    lastAssigned[agentId] = null;
  }
  if (recentLeads) {
    for (const lead of recentLeads) {
      if (lead.assigned_to && lead.assigned_at && !lastAssigned[lead.assigned_to]) {
        lastAssigned[lead.assigned_to] = new Date(lead.assigned_at);
      }
    }
  }

  // Check which agents have an active routing config
  const { data: routingConfigs } = await supabase
    .from('agent_routing_config')
    .select('agent_id')
    .in('agent_id', agentIds)
    .eq('is_active', true);

  const activeAgentIds = new Set((routingConfigs ?? []).map((r) => r.agent_id));

  const eligibleAgents = agentIds.filter((id) => activeAgentIds.has(id));
  if (eligibleAgents.length === 0) return null;

  // Sort: agents with no previous assignment first (null), then by oldest assignment
  eligibleAgents.sort((a, b) => {
    const aTime = lastAssigned[a];
    const bTime = lastAssigned[b];
    if (!aTime && !bTime) return 0;
    if (!aTime) return -1;
    if (!bTime) return 1;
    return aTime.getTime() - bTime.getTime();
  });

  return eligibleAgents[0];
}
