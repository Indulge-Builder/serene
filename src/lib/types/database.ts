// Auto-generated types for Supabase tables.
// Regenerate with: supabase gen types typescript --local > src/lib/types/database.ts

export type UserRole = 'founder' | 'admin' | 'manager' | 'agent' | 'guest';
export type AppDomain =
  | 'concierge'
  | 'onboarding'
  | 'finance'
  | 'marketing'
  | 'tech'
  | 'shop'
  | 'b2b'
  | 'house'
  | 'legacy';

export type Profile = {
  id: string;
  full_name: string;
  username: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  domain: AppDomain;
  job_title: string | null;
  reports_to: string | null;
  is_active: boolean;
  is_on_leave: boolean;
  theme: 'earth' | 'air' | 'water' | 'fire' | 'cosmos';
  timezone: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileAuditLog = {
  id: string;
  profile_id: string;
  changed_by: string;
  changed_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
};

export type AgentRoutingConfig = {
  id: string;
  agent_id: string;
  is_active: boolean;
  shift_start: string | null;
  shift_end: string | null;
  updated_at: string;
};

export type LeadStatus =
  | 'new'
  | 'touched'
  | 'in_discussion'
  | 'won'
  | 'nurturing'
  | 'lost'
  | 'junk';

export type CallOutcome =
  | 'rnr'
  | 'switched_off'
  | 'wrong_number'
  | 'conversing'
  | 'other';

export type LeadPlatform = 'meta' | 'google' | 'website' | 'whatsapp';
export type LeadIntent = 'hot' | 'cold';

export type TaskModule = 'gia' | 'concierge' | 'finance' | 'marketing' | 'tech';
export type TaskType = 'call' | 'whatsapp_message' | 'email' | 'general_follow_up';
export type TaskStatus = 'pending' | 'done' | 'cancelled';

export type Lead = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  domain: string;
  assigned_to: string | null;
  assigned_at: string | null;
  status: LeadStatus;
  lead_intent: LeadIntent | null;
  campaign_id: string | null;
  ad_name: string | null;
  platform: LeadPlatform | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  form_data: Record<string, unknown> | null;
  call_count: number;
  last_call_outcome: CallOutcome | null;
  private_scratchpad: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type LeadActivity = {
  id: string;
  lead_id: string;
  actor_id: string | null;  // null = system/webhook action, no human actor
  action_type: 'lead_created' | 'status_changed' | 'note_added' | 'agent_assigned' | 'call_logged';
  details: Record<string, unknown> | null;
  created_at: string;
};

export type LeadNote = {
  id: string;
  lead_id: string;
  author_id: string;
  content: string;
  call_outcome: CallOutcome | null;
  created_at: string;
};

export type Task = {
  id: string;
  assigned_to: string;
  created_by: string;
  module: TaskModule;
  task_type: TaskType;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskGiaMeta = {
  task_id: string;
  lead_id: string;
  call_outcome: CallOutcome | null;
};

export type Database = {
  public: {
    Views: Record<string, never>;
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, 'id'>>;
        Relationships: [];
      };
      profile_audit_log: {
        Row: ProfileAuditLog;
        Insert: Omit<ProfileAuditLog, 'id' | 'changed_at'> & {
          changed_at?: string;
        };
        Update: Partial<ProfileAuditLog>;
        Relationships: [];
      };
      agent_routing_config: {
        Row: AgentRoutingConfig;
        Insert: Omit<AgentRoutingConfig, 'id' | 'updated_at'> & {
          updated_at?: string;
        };
        Update: Partial<Omit<AgentRoutingConfig, 'id' | 'agent_id'>>;
        Relationships: [];
      };
      leads: {
        Row: Lead;
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'call_count'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          call_count?: number;
        };
        Update: Partial<Omit<Lead, 'id' | 'form_data'>>;
        Relationships: [];
      };
      lead_activities: {
        Row: LeadActivity;
        Insert: Omit<LeadActivity, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<LeadActivity>;
        Relationships: [];
      };
      lead_notes: {
        Row: LeadNote;
        Insert: Omit<LeadNote, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<LeadNote>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Omit<Task, 'id' | 'created_by' | 'module'>>;
        Relationships: [];
      };
      task_gia_meta: {
        Row: TaskGiaMeta;
        Insert: TaskGiaMeta;
        Update: Partial<Pick<TaskGiaMeta, 'call_outcome'>>;
        Relationships: [];
      };
    };
    Functions: {
      get_user_role: {
        Args: Record<never, never>;
        Returns: UserRole;
      };
      get_user_domain: {
        Args: Record<never, never>;
        Returns: AppDomain;
      };
    };
  };
};
