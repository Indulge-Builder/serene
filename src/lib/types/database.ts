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
export type TaskStatus = 'to_do' | 'in_progress' | 'in_review' | 'completed' | 'error' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'normal';
export type TaskCategory = 'personal' | 'group_subtask' | 'gia_followup';

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
  personal_details: Record<string, string> | null;
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
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  task_category: TaskCategory;
  group_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskGroup = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  created_by: string;
  domain: string;
  created_at: string;
  updated_at: string;
};

export type TaskMessage = {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  is_suppressed: boolean;
  suppressed_by: string | null;
  suppressed_at: string | null;
};

export type TaskAuditLog = {
  id: string;
  task_id: string;
  changed_by: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
};

export type TaskGiaMeta = {
  task_id: string;
  lead_id: string;
  call_outcome: CallOutcome | null;
};

export type LeadRawPayload = {
  id: string;
  lead_id: string | null;
  source: string;
  payload: Record<string, unknown>;
  ingestion_error: string | null;
  received_at: string;
};

export type AdCreative = {
  id: string;
  campaign_key: string;
  ad_name: string | null;
  video_url: string;
  thumbnail_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationType = 'lead_assigned' | 'lead_won' | 'task_due' | 'task_assigned' | 'mention' | 'system';

export type Notification = {
  id:           string;
  recipient_id: string;
  type:         NotificationType;
  title:        string;
  body:         string | null;
  action_url:   string | null;   // relative path only, never absolute
  read_at:      string | null;   // null = unread
  created_at:   string;
};

// ─────────────────────────────────────────────
// Campaign analytics — returned by get_campaign_metrics RPC
// ─────────────────────────────────────────────
export type CampaignMetrics = {
  campaign_name:        string;
  domain:               AppDomain;
  total_leads:          number;
  new:                  number;
  touched:              number;
  in_discussion:        number;
  won:                  number;
  nurturing:            number;
  lost:                 number;
  junk:                 number;
  rnr:                  number;
  switched_off:         number;
  converted:            number;
};

export type CampaignFilters = {
  date_from: string | null;
  date_to:   string | null;
  domain:    AppDomain | null; // only populated for admin / founder
};

// Extends CampaignMetrics with avg_hours_to_first_touch — returned by get_campaign_detail_metrics RPC
export type CampaignDetailMetrics = CampaignMetrics & {
  avg_hours_to_first_touch: number | null;
};

export type AgentDistributionRow = {
  agent_id:   string;
  full_name:  string;
  lead_count: number;
};

// ─────────────────────────────────────────────
// Lead filter params — used by getLeadsByRole + LeadsTableAsync + LeadsFilters
// ─────────────────────────────────────────────
export type LeadFilters = {
  status:            LeadStatus[] | null;
  last_call_outcome: CallOutcome[] | null;
  agent_id:          string | null;
  source:            string | null;
  campaign:          string | null;
  date_from:         string | null;
  date_to:           string | null;
  search:            string | null;
  page:              number;
  pageSize:          number;
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
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_activities: {
        Row: LeadActivity;
        Insert: Omit<LeadActivity, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<LeadActivity>;
        Relationships: [
          {
            foreignKeyName: "lead_activities_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_notes: {
        Row: LeadNote;
        Insert: Omit<LeadNote, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<LeadNote>;
        Relationships: [
          {
            foreignKeyName: "lead_notes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'title' | 'description' | 'priority' | 'task_category' | 'group_id'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          title?: string;
          description?: string | null;
          priority?: TaskPriority;
          task_category?: TaskCategory;
          group_id?: string | null;
        };
        Update: Partial<Omit<Task, 'id' | 'created_by' | 'module'>>;
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_gia_meta: {
        Row: TaskGiaMeta;
        Insert: TaskGiaMeta;
        Update: Partial<Pick<TaskGiaMeta, 'call_outcome'>>;
        Relationships: [
          {
            foreignKeyName: "task_gia_meta_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_gia_meta_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: true;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_raw_payloads: {
        Row: LeadRawPayload;
        Insert: Omit<LeadRawPayload, 'id' | 'received_at'> & {
          id?: string;
          received_at?: string;
        };
        Update: Partial<Pick<LeadRawPayload, 'lead_id' | 'ingestion_error'>>;
        Relationships: [];
      };
      ad_creatives: {
        Row: AdCreative;
        Insert: Omit<AdCreative, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<AdCreative, 'id' | 'created_at'>>;
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at' | 'read_at'> & {
          id?: string;
          created_at?: string;
          read_at?: string | null;
        };
        Update: Partial<Pick<Notification, 'read_at'>>;
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_groups: {
        Row: TaskGroup;
        Insert: Omit<TaskGroup, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<TaskGroup, 'id' | 'created_by' | 'domain'>>;
        Relationships: [
          {
            foreignKeyName: "task_groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_audit_log: {
        Row: TaskAuditLog;
        Insert: never;  // written by trigger only — no app-layer inserts
        Update: never;  // append-only — no updates ever
        Relationships: [
          {
            foreignKeyName: "task_audit_log_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_audit_log_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      task_messages: {
        Row: TaskMessage;
        Insert: Omit<TaskMessage, 'id' | 'created_at' | 'is_suppressed' | 'suppressed_by' | 'suppressed_at'> & {
          id?: string;
          created_at?: string;
          is_suppressed?: boolean;
          suppressed_by?: string | null;
          suppressed_at?: string | null;
        };
        Update: Pick<TaskMessage, 'is_suppressed' | 'suppressed_by' | 'suppressed_at'>;  // only suppression columns — enforced at action layer
        Relationships: [
          {
            foreignKeyName: "task_messages_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_messages_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
