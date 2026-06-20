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
      ad_spend_daily: {
        Row: {
          campaign_key: string
          created_at: string
          currency: string
          id: string
          impressions: number | null
          link_clicks: number | null
          reach: number | null
          results: number | null
          source: string
          spend: number
          spend_date: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          campaign_key: string
          created_at?: string
          currency?: string
          id?: string
          impressions?: number | null
          link_clicks?: number | null
          reach?: number | null
          results?: number | null
          source?: string
          spend: number
          spend_date: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          campaign_key?: string
          created_at?: string
          currency?: string
          id?: string
          impressions?: number | null
          link_clicks?: number | null
          reach?: number | null
          results?: number | null
          source?: string
          spend?: number
          spend_date?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_spend_daily_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_routing_config: {
        Row: {
          agent_id: string
          id: string
          is_active: boolean
          shift_days: number[] | null
          shift_end: string | null
          shift_start: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          id?: string
          is_active?: boolean
          shift_days?: number[] | null
          shift_end?: string | null
          shift_start?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          id?: string
          is_active?: boolean
          shift_days?: number[] | null
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
      conversation_hooks: {
        Row: {
          category: string
          context: string | null
          created_at: string
          domain: Database["public"]["Enums"]["app_domain"]
          hook: string
          id: string
          sort_order: number
        }
        Insert: {
          category: string
          context?: string | null
          created_at?: string
          domain: Database["public"]["Enums"]["app_domain"]
          hook: string
          id?: string
          sort_order?: number
        }
        Update: {
          category?: string
          context?: string | null
          created_at?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          hook?: string
          id?: string
          sort_order?: number
        }
        Relationships: []
      }
      deals: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          client_id: string | null
          contact_email: string | null
          contact_name: string
          contact_phone: string
          created_at: string
          deal_amount: number
          deal_category: string | null
          deal_duration: string | null
          deal_type: string
          domain: Database["public"]["Enums"]["app_domain"]
          id: string
          lead_id: string | null
          source: string | null
          updated_at: string
          won_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          client_id?: string | null
          contact_email?: string | null
          contact_name: string
          contact_phone: string
          created_at?: string
          deal_amount: number
          deal_category?: string | null
          deal_duration?: string | null
          deal_type: string
          domain: Database["public"]["Enums"]["app_domain"]
          id?: string
          lead_id?: string | null
          source?: string | null
          updated_at?: string
          won_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string
          deal_amount?: number
          deal_category?: string | null
          deal_duration?: string | null
          deal_type?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          id?: string
          lead_id?: string | null
          source?: string | null
          updated_at?: string
          won_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_targets: {
        Row: {
          created_at: string
          domain: Database["public"]["Enums"]["app_domain"]
          id: string
          metric: string
          period: string
          set_by: string | null
          target_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: Database["public"]["Enums"]["app_domain"]
          id?: string
          metric: string
          period?: string
          set_by?: string | null
          target_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          id?: string
          metric?: string
          period?: string
          set_by?: string | null
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_targets_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elaya_actions: {
        Row: {
          action_type: string
          conversation_id: string
          created_at: string
          id: string
          message_id: string | null
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          conversation_id: string
          created_at?: string
          id?: string
          message_id?: string | null
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string | null
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elaya_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "elaya_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elaya_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "elaya_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elaya_actions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elaya_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elaya_conversations: {
        Row: {
          archived_at: string | null
          channel: string
          created_at: string
          id: string
          last_message_at: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          channel?: string
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          channel?: string
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elaya_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elaya_messages: {
        Row: {
          channel: string
          content: string
          conversation_id: string
          created_at: string
          id: string
          meta: Json | null
          role: string
          sender_id: string | null
          tool_calls: Json | null
        }
        Insert: {
          channel?: string
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          meta?: Json | null
          role: string
          sender_id?: string | null
          tool_calls?: Json | null
        }
        Update: {
          channel?: string
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          role?: string
          sender_id?: string | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "elaya_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "elaya_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elaya_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elaya_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
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
          details?: Json | null
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
          payload: Json
          received_at?: string
          source: string
        }
        Update: {
          id?: string
          ingestion_error?: string | null
          lead_id?: string | null
          payload?: Json
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
          archived_at: string | null
          assigned_at: string | null
          assigned_to: string | null
          attribution: Json | null
          call_count: number
          city: string | null
          created_at: string
          domain: Database["public"]["Enums"]["app_domain"]
          email: string | null
          first_name: string
          form_data: Json | null
          id: string
          last_activity_at: string | null
          last_call_outcome: string | null
          last_call_outcome_at: string | null
          last_name: string | null
          lead_intent: string | null
          medium: string | null
          personal_details: Json | null
          phone: string | null
          previous_lead_id: string | null
          resolution_reason: string | null
          search_text: string | null
          service_interests: string[]
          slug: string | null
          source: string | null
          status: string
          status_changed_at: string | null
          updated_at: string
          utm_campaign: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attribution?: Json | null
          call_count?: number
          city?: string | null
          created_at?: string
          domain: Database["public"]["Enums"]["app_domain"]
          email?: string | null
          first_name: string
          form_data?: Json | null
          id?: string
          last_activity_at?: string | null
          last_call_outcome?: string | null
          last_call_outcome_at?: string | null
          last_name?: string | null
          lead_intent?: string | null
          medium?: string | null
          personal_details?: Json | null
          phone?: string | null
          previous_lead_id?: string | null
          resolution_reason?: string | null
          search_text?: string | null
          service_interests?: string[]
          slug?: string | null
          source?: string | null
          status?: string
          status_changed_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          attribution?: Json | null
          call_count?: number
          city?: string | null
          created_at?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          email?: string | null
          first_name?: string
          form_data?: Json | null
          id?: string
          last_activity_at?: string | null
          last_call_outcome?: string | null
          last_call_outcome_at?: string | null
          last_name?: string | null
          lead_intent?: string | null
          medium?: string | null
          personal_details?: Json | null
          phone?: string | null
          previous_lead_id?: string | null
          resolution_reason?: string | null
          search_text?: string | null
          service_interests?: string[]
          slug?: string | null
          source?: string | null
          status?: string
          status_changed_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
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
      llm_providers: {
        Row: {
          active: boolean
          created_at: string
          job_type: string
          max_tokens: number
          model: string
          provider: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          job_type: string
          max_tokens?: number
          model: string
          provider: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          job_type?: string
          max_tokens?: number
          model?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
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
          type: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          title: string
          type: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: string
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
          app_icon: string
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
          app_icon?: string
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
          app_icon?: string
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // Interim hand-added block (migration 0133) — drop on the next
      // `supabase gen types` regen. Mirrors the migration exactly.
      notification_preferences: {
        Row: {
          in_app: boolean
          notification_key: string
          updated_at: string
          user_id: string
          whatsapp: boolean
        }
        Insert: {
          in_app?: boolean
          notification_key: string
          updated_at?: string
          user_id: string
          whatsapp?: boolean
        }
        Update: {
          in_app?: boolean
          notification_key?: string
          updated_at?: string
          user_id?: string
          whatsapp?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revival_candidates: {
        Row: {
          ai_reasoning: string
          assigned_to: string | null
          created_at: string
          id: string
          lead_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          suggested_revive_at: string | null
          trigger_status: string
          verdict: string
        }
        Insert: {
          ai_reasoning: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          lead_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_revive_at?: string | null
          trigger_status: string
          verdict: string
        }
        Update: {
          ai_reasoning?: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_revive_at?: string | null
          trigger_status?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "revival_candidates_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revival_candidates_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revival_candidates_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revival_policies: {
        Row: {
          active: boolean
          created_at: string
          daily_cap_per_agent: number
          silence_days: number
          trigger_status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_cap_per_agent?: number
          silence_days: number
          trigger_status: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_cap_per_agent?: number
          silence_days?: number
          trigger_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_cases: {
        Row: {
          category: string
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          domain: Database["public"]["Enums"]["app_domain"]
          embedding: string | null
          id: string
          is_featured: boolean
          outcome_note: string | null
          search_vector: unknown
          sort_order: number
          summary: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          domain: Database["public"]["Enums"]["app_domain"]
          embedding?: string | null
          id?: string
          is_featured?: boolean
          outcome_note?: string | null
          search_vector?: unknown
          sort_order?: number
          summary: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          domain?: Database["public"]["Enums"]["app_domain"]
          embedding?: string | null
          id?: string
          is_featured?: boolean
          outcome_note?: string | null
          search_vector?: unknown
          sort_order?: number
          summary?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          active: boolean
          auto_task: boolean
          channels: string[]
          code: string
          created_at: string
          hours_mode: string
          recipient_role: string
          threshold_minutes: number
          trigger_kind: string
          trigger_value: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_task?: boolean
          channels?: string[]
          code: string
          created_at?: string
          hours_mode: string
          recipient_role: string
          threshold_minutes?: number
          trigger_kind: string
          trigger_value: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_task?: boolean
          channels?: string[]
          code?: string
          created_at?: string
          hours_mode?: string
          recipient_role?: string
          threshold_minutes?: number
          trigger_kind?: string
          trigger_value?: string
          updated_at?: string
        }
        Relationships: []
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
          domain: Database["public"]["Enums"]["app_domain"]
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
          domain: Database["public"]["Enums"]["app_domain"]
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
          domain?: Database["public"]["Enums"]["app_domain"]
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
          attachments: Json
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          group_id: string | null
          id: string
          module: Database["public"]["Enums"]["task_module"]
          overdue_at: string | null
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
          module?: Database["public"]["Enums"]["task_module"]
          overdue_at?: string | null
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
          module?: Database["public"]["Enums"]["task_module"]
          overdue_at?: string | null
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
      usage_daily: {
        Row: {
          active_minutes: number
          day: string
          domain: Database["public"]["Enums"]["app_domain"]
          user_id: string
        }
        Insert: {
          active_minutes?: number
          day: string
          domain: Database["public"]["Enums"]["app_domain"]
          user_id: string
        }
        Update: {
          active_minutes?: number
          day?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_heartbeats: {
        Row: {
          captured_at: string
          domain: Database["public"]["Enums"]["app_domain"]
          id: number
          user_id: string
        }
        Insert: {
          captured_at?: string
          domain: Database["public"]["Enums"]["app_domain"]
          id?: never
          user_id: string
        }
        Update: {
          captured_at?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_heartbeats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_context: {
        Row: {
          context: Json
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_context_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
          agent_name: string | null
          created_at: string
          delivered: boolean
          domain: Database["public"]["Enums"]["app_domain"] | null
          gupshup_body: string | null
          gupshup_status: number | null
          id: string
          lead_id: string | null
          lead_name: string | null
          lead_phone: string | null
          recipient_id: string | null
          recipient_phone: string
          type: string
        }
        Insert: {
          agent_name?: string | null
          created_at?: string
          delivered?: boolean
          domain?: Database["public"]["Enums"]["app_domain"] | null
          gupshup_body?: string | null
          gupshup_status?: number | null
          id?: string
          lead_id?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          recipient_id?: string | null
          recipient_phone: string
          type: string
        }
        Update: {
          agent_name?: string | null
          created_at?: string
          delivered?: boolean
          domain?: Database["public"]["Enums"]["app_domain"] | null
          gupshup_body?: string | null
          gupshup_status?: number | null
          id?: string
          lead_id?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          recipient_id?: string | null
          recipient_phone?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notification_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_notification_logs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _agent_core_metrics: {
        Args: { p_agent: string; p_from: string; p_to: string }
        Returns: Json
      }
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
      add_lead_plain_note: {
        Args: {
          p_author_id: string
          p_content: string
          p_lead_id: string
          p_now?: string
        }
        Returns: Json
      }
      add_task_remark_with_status: {
        Args: {
          p_author_id: string
          p_content: string
          p_status_change?: string
          p_task_id: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "task_remarks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_access_wa_conversation: {
        Args: { p_lead_id: string }
        Returns: boolean
      }
      create_lead_gia_task: {
        Args: {
          p_assigned_to: string
          p_created_by: string
          p_description?: string
          p_due_at?: string
          p_lead_id: string
          p_priority?: string
          p_task_type: string
          p_title: string
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
          module: Database["public"]["Enums"]["task_module"]
          overdue_at: string | null
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
      generate_lead_slug: {
        Args: { p_first_name: string; p_last_name: string; p_phone: string }
        Returns: string
      }
      get_active_lead_by_phone: {
        Args: { p_phone: string }
        Returns: {
          archived_at: string
          assigned_to: string
          domain: Database["public"]["Enums"]["app_domain"]
          first_name: string
          id: string
          last_name: string
          phone: string
          slug: string
          status: string
        }[]
      }
      get_agent_first_touch_pairs: {
        Args: { p_agent: string; p_from: string; p_to: string }
        Returns: {
          created_at: string
          first_call_at: string
          lead_id: string
        }[]
      }
      get_agent_performance: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_prev_from?: string
          p_prev_to?: string
        }
        Returns: Json
      }
      get_agent_recent_activity: {
        Args: {
          p_domain: Database["public"]["Enums"]["app_domain"]
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      get_agent_roster_performance: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_domain?: Database["public"]["Enums"]["app_domain"]
        }
        Returns: {
          agent_avatar_url: string
          agent_domain: Database["public"]["Enums"]["app_domain"]
          agent_id: string
          agent_name: string
          avg_response_minutes: number
          lost_count: number
          total_deal_amount: number
          total_leads: number
          won_count: number
        }[]
      }
      get_agent_today_pulse: {
        Args: { p_date_from: string; p_date_to: string; p_today_start: string }
        Returns: Json
      }
      get_agent_usage: {
        Args: { p_history_from: string; p_today_start: string }
        Returns: Json
      }
      get_budget_summary: {
        Args: { p_date_from: string; p_date_to: string }
        Returns: {
          campaign_key: string
          deal_count: number
          deal_revenue: number
          lead_count: number
          total_impressions: number
          total_link_clicks: number
          total_reach: number
          total_results: number
          total_spend: number
        }[]
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
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_domain?: Database["public"]["Enums"]["app_domain"]
        }
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
      get_campaign_pipeline_refresh: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_domain: Database["public"]["Enums"]["app_domain"]
          p_role: string
        }
        Returns: Json
      }
      get_dashboard_summary: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_domain: Database["public"]["Enums"]["app_domain"]
          p_initial_domain?: Database["public"]["Enums"]["app_domain"]
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      get_deals_summary: {
        Args: {
          p_agent_id?: string
          p_caller_domain: string
          p_date_from?: string
          p_date_to?: string
          p_deal_type?: string
          p_filter_domain?: string
          p_role: string
        }
        Returns: {
          membership_count: number
          retail_count: number
          total_deals: number
          total_revenue: number
        }[]
      }
      get_domain_health_metrics: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_domains: Database["public"]["Enums"]["app_domain"][]
        }
        Returns: {
          calls_logged: number
          domain: Database["public"]["Enums"]["app_domain"]
          in_discussion: number
          leads_lost: number
          leads_won: number
          nurturing: number
          total_calls_made: number
          total_deals: number
          total_leads: number
          total_revenue: number
        }[]
      }
      get_gia_tasks: {
        Args: {
          p_domain: Database["public"]["Enums"]["app_domain"]
          p_role: string
          p_user_id: string
        }
        Returns: {
          assigned_to: string
          attachments: Json
          completed_at: string
          created_at: string
          created_by: string
          description: string
          due_at: string
          group_id: string
          id: string
          lead_domain: Database["public"]["Enums"]["app_domain"]
          lead_first_name: string
          lead_id: string
          lead_last_name: string
          lead_phone: string
          lead_slug: string
          module: string
          priority: string
          status: string
          tags: string[]
          task_category: string
          task_type: string
          title: string
          updated_at: string
        }[]
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
      get_lead_pipeline_refresh:
        | {
            Args: {
              p_domain: Database["public"]["Enums"]["app_domain"]
              p_role: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_date_from?: string
              p_date_to?: string
              p_domain: Database["public"]["Enums"]["app_domain"]
              p_role: string
            }
            Returns: Json
          }
      get_leads_status_counts: {
        Args: {
          p_agent_id?: string
          p_campaign?: string
          p_date_from?: string
          p_date_to?: string
          p_domain?: Database["public"]["Enums"]["app_domain"]
          p_going_cold?: string
          p_outcomes?: string[]
          p_search?: string
          p_source?: string
          p_statuses?: string[]
        }
        Returns: {
          cnt: number
          status: string
        }[]
      }
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
          module: Database["public"]["Enums"]["task_module"]
          overdue_at: string | null
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
      get_wa_unread_count: { Args: never; Returns: number }
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
      task_module: "gia" | "sia" | "core"
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
      task_module: ["gia", "sia", "core"],
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

/** @deprecated platform is now in lead.attribution.platform — kept for any legacy references */
export type LeadPlatform = 'meta' | 'google' | 'website' | 'whatsapp'

export type TaskType     = 'call' | 'whatsapp_message' | 'other'
export type TaskStatus   = 'to_do' | 'in_progress' | 'in_review' | 'completed' | 'error' | 'cancelled'
export type TaskPriority = 'urgent' | 'high' | 'normal'
export type TaskCategory = 'personal' | 'group_subtask'

export type NotificationType =
  | 'lead_assigned'
  | 'lead_won'
  | 'task_due'
  | 'task_assigned'
  | 'mention'
  | 'system'
  | 'sla_breach_agent'
  | 'sla_breach_manager'
  | 'sla_breach_founder'
  | 'task_overdue_manager'
  | 'suggestion_resolved' // hand-extended (migration 0136); regen after apply

// sla_policies CHECK-constraint unions (migration 0111)
export type SlaTriggerKind   = 'status' | 'outcome' | 'task_due'
export type SlaRecipientRole = 'agent' | 'manager' | 'founder'
export type SlaHoursMode     = 'agent_shift' | 'business' | 'clock'

// ─────────────────────────────────────────────
// Table row types — extracted from Database namespace
// ─────────────────────────────────────────────

export type Profile = Omit<Database['public']['Tables']['profiles']['Row'], 'theme' | 'app_icon'> & {
  theme: 'earth' | 'air' | 'water' | 'fire' | 'cosmos'
  // Narrowed to the ICON_KEYS union (src/lib/constants/app-icons.ts) — the
  // app_icon column lands in the base Row as `string` until database.ts is
  // regenerated after migration 0121, the same posture as `theme`.
  app_icon: 'icon-1' | 'icon-2' | 'icon-3' | 'icon-4'
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

// SlaPolicy — config row behind the Gia follow-up engine (migration 0111).
// Read per job run via sla-service.getSlaPolicies() — never cached at module scope.
export type SlaPolicy = Omit<
  Database['public']['Tables']['sla_policies']['Row'],
  'trigger_kind' | 'recipient_role' | 'hours_mode'
> & {
  trigger_kind:   SlaTriggerKind
  recipient_role: SlaRecipientRole
  hours_mode:     SlaHoursMode
}

export type Notification = Database['public']['Tables']['notifications']['Row'] & {
  type: string  // narrowed by callers via NotificationType — kept as string for service compatibility
}

// PushSubscriptionRow — one Web Push endpoint per device (migration 0120).
// One user holds many rows (phone + desktop + …); UNIQUE key is `endpoint`.
export type PushSubscriptionRow = Database['public']['Tables']['push_subscriptions']['Row']

// NotificationPreferenceRow — one per-user channel-mute row (migration 0133).
// Absence of a row for a (user_id, notification_key) pair means both channels ON.
export type NotificationPreferenceRow = Database['public']['Tables']['notification_preferences']['Row']

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
// (the generated Row uses `string` for status/outcome columns)
export type Lead = Omit<
  Database['public']['Tables']['leads']['Row'],
  'status' | 'last_call_outcome' | 'personal_details' | 'form_data' | 'tags' | 'domain' | 'attribution'
> & {
  status:             LeadStatus
  last_call_outcome:  CallOutcome | null
  personal_details:   Record<string, string> | null
  form_data:          Record<string, unknown> | null
  attribution:        Record<string, unknown> | null
  tags?:              string[]
  domain:             AppDomain
}

// Deal — first-class deals table row (migration 0072)
// deal_type and deal_duration are narrowed from raw text to typed unions
export type Deal = {
  id:            string
  lead_id:       string | null        // null for walk-in deals (no lead lifecycle)
  client_id:     string | null        // reserved for clients module; always null for now
  contact_name:  string
  contact_phone: string               // E.164
  contact_email: string | null
  domain:        AppDomain
  deal_amount:   number
  deal_type:     import('@/lib/constants/deal-types').DealType
  deal_duration: import('@/lib/constants/deal-types').DealDuration | null
  // deal_category — required for retail (shop) deals, null for membership/sale
  // (migration 0122, deals_retail_category_check). Domain-derived type drives it.
  deal_category: import('@/lib/constants/deal-types').DealCategory | null
  assigned_to:   string | null
  source:        string | null
  won_at:        string               // immutable after insert
  archived_at:   string | null
  created_at:    string
  updated_at:    string
}

// DealWithRelations — Deal + optional joined lead slug and assignee name
// lead is null for walk-in deals; assignee may be null if unassigned
export type DealWithRelations = Deal & {
  lead:     { slug: string | null } | null
  assignee: { full_name: string } | null
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
  shift_days:  number[] | null
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
  shift_days:        number[] | null
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

export type LeadStatusCount = { status: LeadStatus; count: number }

export type LeadFilters = {
  status:            LeadStatus[] | null
  last_call_outcome: CallOutcome[] | null
  domain:            AppDomain | null
  agent_id:          string | null
  source:            string | null
  campaign:          string | null
  date_from:         string | null
  date_to:           string | null
  search:            string | null
  going_cold?:       boolean
  revival?:          boolean
  // Manager "My Leads" vs "All Leads" toggle. 'mine' force-scopes a manager to
  // their own assigned leads; 'all' = the whole domain. Managers default to
  // 'mine' (resolved in leads/page.tsx — an absent param means My Leads for a
  // manager). Ignored for agent (always own) and admin/founder (no toggle).
  view?:             'mine' | 'all' | null
  sort_order?:       'asc' | 'desc'
  page:              number
  pageSize:          number
}

export type CampaignFilters = {
  date_from: string | null
  date_to:   string | null
  domain:    AppDomain | null
  search:    string | null
}

// DealFilters — no `status` field. status='won' is a structural constraint in the service,
// never a URL param. agent role constraint is applied before agent_id filter.
export type DealFilters = {
  search:        string | null
  domain:        AppDomain | null   // admin/founder only via parseGiaDomainParam()
  deal_type:     string | null      // 'membership' | 'retail' | 'sale'
  deal_category: string | null      // retail product category; surfaced when domain=shop
  agent_id:      string | null
  date_from:     string | null
  date_to:       string | null
  page:          number
  pageSize:      number
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
