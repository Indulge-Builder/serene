export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ad_creatives: {
        Row: {
          ad_name: string | null
          campaign_key: string
          created_at: string
          id: string
          notes: string | null
          thumbnail_url: string | null
          updated_at: string
          video_url: string
        }
        Insert: {
          ad_name?: string | null
          campaign_key: string
          created_at?: string
          id?: string
          notes?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          video_url: string
        }
        Update: {
          ad_name?: string | null
          campaign_key?: string
          created_at?: string
          id?: string
          notes?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          video_url?: string
        }
        Relationships: []
      }
      agent_routing_config: {
        Row: {
          agent_id: string
          id: string
          is_active: boolean
          shift_end: string | null
          shift_start: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          id?: string
          is_active?: boolean
          shift_end?: string | null
          shift_start?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          id?: string
          is_active?: boolean
          shift_end?: string | null
          shift_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_routing_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          action_type: string
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          lead_id: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null | Record<string, unknown>
          id?: string
          lead_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string
          call_outcome: string | null
          content: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          author_id: string
          call_outcome?: string | null
          content: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          author_id?: string
          call_outcome?: string | null
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_raw_payloads: {
        Row: {
          id: string
          ingestion_error: string | null
          lead_id: string | null
          payload: Json
          received_at: string
          source: string
        }
        Insert: {
          id?: string
          ingestion_error?: string | null
          lead_id?: string | null
          payload: Json | Record<string, unknown>
          received_at?: string
          source: string
        }
        Update: {
          id?: string
          ingestion_error?: string | null
          lead_id?: string | null
          payload?: Json | Record<string, unknown>
          received_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_raw_payloads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sla_timers: {
        Row: {
          cancelled_at: string | null
          created_at: string
          fired_at: string | null
          id: string
          lead_id: string
          rule_code: string
          scheduled_fire_at: string
          status: string
          trigger_run_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          fired_at?: string | null
          id?: string
          lead_id: string
          rule_code: string
          scheduled_fire_at: string
          status?: string
          trigger_run_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          fired_at?: string | null
          id?: string
          lead_id?: string
          rule_code?: string
          scheduled_fire_at?: string
          status?: string
          trigger_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_sla_timers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_name: string | null
          archived_at: string | null
          assigned_at: string | null
          assigned_to: string | null
          call_count: number
          campaign_id: string | null
          created_at: string
          deal_amount: number | null
          deal_type: string | null
          domain: string
          email: string | null
          first_name: string
          form_data: Json | null
          id: string
          last_activity_at: string | null
          last_call_outcome: string | null
          last_name: string | null
          lead_intent: string | null
          personal_details: Json | null
          phone: string | null
          platform: string | null
          previous_lead_id: string | null
          private_scratchpad: string | null
          status: string
          status_changed_at: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          ad_name?: string | null
          archived_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          call_count?: number
          campaign_id?: string | null
          created_at?: string
          deal_amount?: number | null
          deal_type?: string | null
          domain: string
          email?: string | null
          first_name: string
          form_data?: Json | null | Record<string, unknown>
          id?: string
          last_activity_at?: string | null
          last_call_outcome?: string | null
          last_name?: string | null
          lead_intent?: string | null
          personal_details?: Json | null | Record<string, string>
          phone?: string | null
          platform?: string | null
          previous_lead_id?: string | null
          private_scratchpad?: string | null
          status?: string
          status_changed_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          ad_name?: string | null
          archived_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          call_count?: number
          campaign_id?: string | null
          created_at?: string
          deal_amount?: number | null
          deal_type?: string | null
          domain?: string
          email?: string | null
          first_name?: string
          form_data?: Json | null
          id?: string
          last_activity_at?: string | null
          last_call_outcome?: string | null
          last_name?: string | null
          lead_intent?: string | null
          personal_details?: Json | null
          phone?: string | null
          platform?: string | null
          previous_lead_id?: string | null
          private_scratchpad?: string | null
          status?: string
          status_changed_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_previous_lead_id_fkey"
            columns: ["previous_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          title: string
          type: NotificationType
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          title: string
          type: NotificationType
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: NotificationType
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_audit_log: {
        Row: {
          changed_at: string
          changed_by: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          profile_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_audit_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          domain: Database["public"]["Enums"]["app_domain"]
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_on_leave: boolean
          job_title: string | null
          last_seen_at: string | null
          phone: string | null
          reports_to: string | null
          role: Database["public"]["Enums"]["user_role"]
          theme: string
          timezone: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          email: string
          full_name: string
          id: string
          is_active?: boolean
          is_on_leave?: boolean
          job_title?: string | null
          last_seen_at?: string | null
          phone?: string | null
          reports_to?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          theme?: string
          timezone?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_on_leave?: boolean
          job_title?: string | null
          last_seen_at?: string | null
          phone?: string | null
          reports_to?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          theme?: string
          timezone?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_audit_log: {
        Row: {
          changed_at: string
          changed_by: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          task_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_audit_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_gia_meta: {
        Row: {
          call_outcome: string | null
          lead_id: string
          task_id: string
        }
        Insert: {
          call_outcome?: string | null
          lead_id: string
          task_id: string
        }
        Update: {
          call_outcome?: string | null
          lead_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_gia_meta_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_gia_meta_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          domain: string
          due_at: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          domain: string
          due_at?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          domain?: string
          due_at?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_remarks: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_suppressed: boolean
          status_change: string | null
          suppressed_at: string | null
          suppressed_by: string | null
          task_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_suppressed?: boolean
          status_change?: string | null
          suppressed_at?: string | null
          suppressed_by?: string | null
          task_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_suppressed?: boolean
          status_change?: string | null
          suppressed_at?: string | null
          suppressed_by?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_remarks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_remarks_suppressed_by_fkey"
            columns: ["suppressed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_remarks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string
          attachments: Json | ChecklistItem[]
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          group_id: string | null
          id: string
          module: string
          priority: string
          status: string
          tags: string[]
          task_category: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          attachments?: Json
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          group_id?: string | null
          id?: string
          module: string
          priority?: string
          status?: string
          tags?: string[]
          task_category?: string
          task_type: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          attachments?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          group_id?: string | null
          id?: string
          module?: string
          priority?: string
          status?: string
          tags?: string[]
          task_category?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversation_reads: {
        Row: {
          agent_id: string
          conversation_id: string
          id: string
          last_read_at: string
        }
        Insert: {
          agent_id: string
          conversation_id: string
          id?: string
          last_read_at?: string
        }
        Update: {
          agent_id?: string
          conversation_id?: string
          id?: string
          last_read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversation_reads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          bot_active: boolean
          bot_paused_at: string | null
          bot_paused_by: string | null
          created_at: string
          id: string
          last_message_at: string | null
          lead_id: string
          phone: string
          status: string
          updated_at: string
          wa_id: string
        }
        Insert: {
          bot_active?: boolean
          bot_paused_at?: string | null
          bot_paused_by?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id: string
          phone: string
          status?: string
          updated_at?: string
          wa_id: string
        }
        Update: {
          bot_active?: boolean
          bot_paused_at?: string | null
          bot_paused_by?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string
          phone?: string
          status?: string
          updated_at?: string
          wa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_bot_paused_by_fkey"
            columns: ["bot_paused_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          is_bot: boolean
          lead_id: string
          media_mime_type: string | null
          media_url: string | null
          message_type: string
          sender_id: string | null
          sender_type: string
          status: string | null
          status_at: string | null
          wa_message_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          is_bot?: boolean
          lead_id: string
          media_mime_type?: string | null
          media_url?: string | null
          message_type: string
          sender_id?: string | null
          sender_type: string
          status?: string | null
          status_at?: string | null
          wa_message_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          is_bot?: boolean
          lead_id?: string
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          sender_id?: string | null
          sender_type?: string
          status?: string | null
          status_at?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_notification_logs: {
        Row: {
          id:              string
          type:            'agent_assignment' | 'founder_alert'
          lead_id:         string | null
          recipient_id:    string | null
          recipient_phone: string
          agent_name:      string | null
          lead_name:       string | null
          lead_phone:      string | null
          domain:          string | null
          gupshup_status:  number | null
          gupshup_body:    string | null
          delivered:       boolean
          created_at:      string
        }
        Insert: {
          id?:             string
          type:            'agent_assignment' | 'founder_alert'
          lead_id?:        string | null
          recipient_id?:   string | null
          recipient_phone: string
          agent_name?:     string | null
          lead_name?:      string | null
          lead_phone?:     string | null
          domain?:         string | null
          gupshup_status?: number | null
          gupshup_body?:   string | null
          delivered?:      boolean
          created_at?:     string
        }
        Update: {
          id?:             string
          type?:           'agent_assignment' | 'founder_alert'
          lead_id?:        string | null
          recipient_id?:   string | null
          recipient_phone?: string
          agent_name?:     string | null
          lead_name?:      string | null
          lead_phone?:     string | null
          domain?:         string | null
          gupshup_status?: number | null
          gupshup_body?:   string | null
          delivered?:      boolean
          created_at?:     string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_lead_call_note: {
        Args: {
          p_author_id: string
          p_call_outcome: string
          p_content: string
          p_lead_id: string
          p_now?: string
        }
        Returns: Json
      }
      can_access_wa_conversation: {
        Args: { p_lead_id: string }
        Returns: boolean
      }
      get_active_lead_by_phone: {
        Args: { p_phone: string }
        Returns: {
          ad_name: string | null
          archived_at: string | null
          assigned_at: string | null
          assigned_to: string | null
          call_count: number
          campaign_id: string | null
          created_at: string
          deal_amount: number | null
          deal_type: string | null
          domain: string
          email: string | null
          first_name: string
          form_data: Json | null
          id: string
          last_activity_at: string | null
          last_call_outcome: string | null
          last_name: string | null
          lead_intent: string | null
          personal_details: Json | null
          phone: string | null
          platform: string | null
          previous_lead_id: string | null
          private_scratchpad: string | null
          status: string
          status_changed_at: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_campaign_agent_distribution: {
        Args: { p_campaign: string; p_date_from?: string; p_date_to?: string }
        Returns: {
          agent_id: string
          full_name: string
          lead_count: number
        }[]
      }
      get_campaign_detail_metrics: {
        Args: { p_campaign: string; p_date_from?: string; p_date_to?: string }
        Returns: {
          avg_hours_to_first_touch: number
          campaign_name: string
          outcome_converted: number
          outcome_rnr: number
          outcome_switched_off: number
          status_in_discussion: number
          status_junk: number
          status_lost: number
          status_new: number
          status_nurturing: number
          status_touched: number
          status_won: number
          total_leads: number
        }[]
      }
      get_campaign_metrics: {
        Args: { p_date_from?: string; p_date_to?: string; p_domain?: string }
        Returns: {
          campaign_name: string
          domain: string
          outcome_converted: number
          outcome_rnr: number
          outcome_switched_off: number
          status_in_discussion: number
          status_junk: number
          status_lost: number
          status_new: number
          status_nurturing: number
          status_touched: number
          status_won: number
          total_leads: number
        }[]
      }
      get_dashboard_summary: {
        Args: { p_domain: string; p_role: string; p_user_id: string }
        Returns: Json
      }
      get_group_task_summaries: {
        Args: { p_priority?: string[]; p_status?: string[] }
        Returns: {
          assignee_ids: string[]
          created_at: string
          created_by: string
          description: string
          domain: string
          due_at: string
          id: string
          priority: string
          status: string
          subtask_completed: number
          subtask_total: number
          title: string
          updated_at: string
        }[]
      }
      get_lead_scratchpad: { Args: { p_lead_id: string }; Returns: string }
      get_next_round_robin_agent: {
        Args: { p_domain: string }
        Returns: string
      }
      get_personal_tasks: {
        Args: {
          p_cursor_due_at?: string
          p_cursor_has_due_at?: boolean
          p_cursor_id?: string
          p_due_before?: string
          p_limit?: number
          p_priority?: string[]
          p_status?: string[]
          p_tags?: string[]
          p_user_id: string
        }
        Returns: {
          assigned_to: string
          attachments: Json
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          group_id: string | null
          id: string
          module: string
          priority: string
          status: string
          tags: string[]
          task_category: string
          task_type: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_domain: {
        Args: never
        Returns: Database["public"]["Enums"]["app_domain"]
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      update_lead_status: {
        Args: {
          p_actor_id: string
          p_lead_id: string
          p_now?: string
          p_reason?: string
          p_status: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_domain:
        | "concierge"
        | "onboarding"
        | "finance"
        | "marketing"
        | "tech"
        | "shop"
        | "b2b"
        | "house"
        | "legacy"
      user_role: "founder" | "admin" | "manager" | "agent" | "guest"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_domain: [
        "concierge",
        "onboarding",
        "finance",
        "marketing",
        "tech",
        "shop",
        "b2b",
        "house",
        "legacy",
      ],
      user_role: ["founder", "admin", "manager", "agent", "guest"],
    },
  },
} as const

// =============================================================================
// Derived type aliases
// Appended after Supabase CLI regen — do not delete this section.
// Generated content above must remain intact.
// =============================================================================

// JsonValue — a permissive alias used by Insert/action types that accept JSONB columns.
// The generated Json type uses a strict recursive union that rejects Record<string,unknown>.
// Callers that build JSONB objects (form_data, personal_details, attachments) use this type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonValue = any

// ─────────────────────────────────────────────
// Enum types — from Database['public']['Enums']
// ─────────────────────────────────────────────

export type UserRole  = Database['public']['Enums']['user_role']
export type AppDomain = Database['public']['Enums']['app_domain']

// ─────────────────────────────────────────────
// String-union types — reconstructed as hand-written unions
// (not in DB Enums; enforced by CHECK constraints in migrations)
// ─────────────────────────────────────────────

export type LeadStatus =
  | 'new'
  | 'touched'
  | 'in_discussion'
  | 'won'
  | 'nurturing'
  | 'lost'
  | 'junk'

export type CallOutcome =
  | 'rnr'
  | 'switched_off'
  | 'wrong_number'
  | 'conversing'
  | 'other'

export type LeadPlatform = 'meta' | 'google' | 'website' | 'whatsapp'

export type TaskType     = 'call' | 'whatsapp_message' | 'email' | 'general_follow_up'
export type TaskStatus   = 'to_do' | 'in_progress' | 'in_review' | 'completed' | 'error' | 'cancelled'
export type TaskPriority = 'urgent' | 'high' | 'normal'
export type TaskCategory = 'personal' | 'group_subtask' | 'gia_followup'

export type NotificationType =
  | 'lead_assigned'
  | 'lead_won'
  | 'task_due'
  | 'task_assigned'
  | 'mention'
  | 'system'
  | 'sla_breach_agent'
  | 'sla_breach_manager'

// ─────────────────────────────────────────────
// Table row types — extracted from Database namespace
// ─────────────────────────────────────────────

export type Profile = Omit<Database['public']['Tables']['profiles']['Row'], 'theme'> & {
  theme: 'earth' | 'air' | 'water' | 'fire' | 'cosmos'
}
export type AdCreative       = Database['public']['Tables']['ad_creatives']['Row']
export type LeadActivity     = Database['public']['Tables']['lead_activities']['Row']
export type LeadNote         = Omit<Database['public']['Tables']['lead_notes']['Row'], 'call_outcome'> & {
  call_outcome: CallOutcome | null
}
export type LeadRawPayload   = Omit<Database['public']['Tables']['lead_raw_payloads']['Row'], 'payload'> & {
  payload: Record<string, unknown>
}
export type LeadSlaTimer     = Database['public']['Tables']['lead_sla_timers']['Row']

export type Notification = Database['public']['Tables']['notifications']['Row'] & {
  type: string  // narrowed by callers via NotificationType — kept as string for service compatibility
}

export type Task = Omit<
  Database['public']['Tables']['tasks']['Row'],
  'status' | 'priority' | 'task_category' | 'task_type' | 'attachments'
> & {
  status:        TaskStatus
  priority:      TaskPriority
  task_category: TaskCategory
  task_type:     TaskType
  attachments:   ChecklistItem[]
}

export type TaskGroup = Omit<
  Database['public']['Tables']['task_groups']['Row'],
  'status' | 'priority'
> & {
  status:   TaskStatus
  priority: TaskPriority
}

export type TaskRemark = Database['public']['Tables']['task_remarks']['Row']

// Lead — typed-up version with narrower field types than the raw Row
// (the generated Row uses `string` for status/platform/outcome columns)
export type Lead = Omit<
  Database['public']['Tables']['leads']['Row'],
  'status' | 'last_call_outcome' | 'platform' | 'personal_details' | 'form_data' | 'tags'
> & {
  status:             LeadStatus
  last_call_outcome:  CallOutcome | null
  platform:           LeadPlatform | null
  personal_details:   Record<string, string> | null
  form_data:          Record<string, unknown> | null
  tags?:              string[]
}

// ─────────────────────────────────────────────
// Hand-written composite types
// Not raw table rows — shaped by service query contracts
// ─────────────────────────────────────────────

export type ProfileAuditLog = {
  id:         string
  profile_id: string
  changed_by: string
  changed_at: string
  field_name: string
  old_value:  string | null
  new_value:  string | null
}

export type AgentRoutingConfig = {
  id:          string
  agent_id:    string
  is_active:   boolean
  shift_start: string | null
  shift_end:   string | null
  updated_at:  string
}

export type AgentRosterRow = {
  id:                string
  full_name:         string
  avatar_url:        string | null
  job_title:         string | null
  domain:            AppDomain
  is_active:         boolean
  is_on_leave:       boolean
  routing_is_active: boolean
  routing_config_id: string
  shift_start:       string | null
  shift_end:         string | null
}

// Checklist item — stored as JSONB in tasks.attachments
export type ChecklistItem = {
  id:      string
  text:    string
  checked: boolean
}

// TaskMessage — legacy alias kept for any code that still imports it
// (task_messages was replaced by task_remarks in migration 0022)
export type TaskMessage = {
  id:            string
  task_id:       string
  author_id:     string
  content:       string
  created_at:    string
  is_suppressed: boolean
  suppressed_by: string | null
  suppressed_at: string | null
}

export type LeadFilters = {
  status:            LeadStatus[] | null
  last_call_outcome: CallOutcome[] | null
  agent_id:          string | null
  source:            string | null
  campaign:          string | null
  date_from:         string | null
  date_to:           string | null
  search:            string | null
  page:              number
  pageSize:          number
}

export type CampaignFilters = {
  date_from: string | null
  date_to:   string | null
  domain:    AppDomain | null
}

export type CampaignMetrics = {
  campaign_name:  string
  domain:         AppDomain
  total_leads:    number
  new:            number
  touched:        number
  in_discussion:  number
  won:            number
  nurturing:      number
  lost:           number
  junk:           number
  rnr:            number
  switched_off:   number
  converted:      number
}

export type CampaignDetailMetrics = CampaignMetrics & {
  avg_hours_to_first_touch: number | null
}

export type AgentDistributionRow = {
  agent_id:   string
  full_name:  string
  lead_count: number
}
