import { createClient } from '@/lib/supabase/server';
import type { Lead, LeadActivity, LeadNote, Task, UserRole, AppDomain } from '@/lib/types/database';

export type LeadNoteWithAuthor = LeadNote & { author_name: string };
export type LeadActivityWithActor = LeadActivity & { actor_name: string | null };
export type LeadTaskForDossier = Task & { task_type: Task['task_type'] };

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
// Helper: fetch profile name map by IDs
// ─────────────────────────────────────────────
async function getProfileNameMap(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids);

  const map: Record<string, string> = {};
  for (const p of data ?? []) map[p.id] = p.full_name;
  return map;
}

// ─────────────────────────────────────────────
// Query: lead notes with author names
// ─────────────────────────────────────────────
export async function getLeadNotesFull(leadId: string): Promise<LeadNoteWithAuthor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  const notes = data as LeadNote[];

  const authorIds = [...new Set(notes.map((n) => n.author_id))];
  const nameMap = await getProfileNameMap(authorIds);

  return notes.map((n) => ({
    ...n,
    author_name: nameMap[n.author_id] ?? 'Unknown',
  }));
}

// ─────────────────────────────────────────────
// Query: lead activities with actor names
// ─────────────────────────────────────────────
export async function getLeadActivitiesFull(leadId: string): Promise<LeadActivityWithActor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  const activities = data as LeadActivity[];

  const actorIds = [...new Set(
    activities.map((a) => a.actor_id).filter((id): id is string => id !== null),
  )];
  const nameMap = await getProfileNameMap(actorIds);

  return activities.map((a) => ({
    ...a,
    actor_name: a.actor_id ? (nameMap[a.actor_id] ?? 'Unknown') : null,
  }));
}

// ─────────────────────────────────────────────
// Query: next pending task for a lead (Gia module)
// ─────────────────────────────────────────────
export async function getNextLeadTask(leadId: string): Promise<Task | null> {
  const supabase = await createClient();

  const { data: metaRows } = await supabase
    .from('task_gia_meta')
    .select('task_id')
    .eq('lead_id', leadId);

  if (!metaRows || metaRows.length === 0) return null;

  const taskIds = metaRows.map((m) => m.task_id);

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .in('id', taskIds)
    .eq('status', 'pending')
    .not('due_at', 'is', null)
    .order('due_at', { ascending: true })
    .limit(1);

  if (!tasks || tasks.length === 0) return null;
  return tasks[0] as Task;
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
