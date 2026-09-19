export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  freshdesk: {
    Tables: {
      agents: {
        Row: {
          active: boolean
          agent_type: string | null
          available: boolean
          deactivated: boolean
          email: string | null
          fd_created_at: string | null
          fd_updated_at: string | null
          id: number
          job_title: string | null
          last_active_at: string | null
          name: string
          profile_id: string | null
          raw: Json
          synced_at: string
        }
        Insert: {
          active?: boolean
          agent_type?: string | null
          available?: boolean
          deactivated?: boolean
          email?: string | null
          fd_created_at?: string | null
          fd_updated_at?: string | null
          id: number
          job_title?: string | null
          last_active_at?: string | null
          name: string
          profile_id?: string | null
          raw?: Json
          synced_at?: string
        }
        Update: {
          active?: boolean
          agent_type?: string | null
          available?: boolean
          deactivated?: boolean
          email?: string | null
          fd_created_at?: string | null
          fd_updated_at?: string | null
          id?: number
          job_title?: string | null
          last_active_at?: string | null
          name?: string
          profile_id?: string | null
          raw?: Json
          synced_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          active: boolean
          category: string | null
          company_id: number | null
          custom_fields: Json
          description: string | null
          email: string | null
          fd_created_at: string | null
          fd_updated_at: string | null
          id: number
          member_id: string | null
          mobile: string | null
          name: string
          phone: string | null
          phone_e164: string | null
          raw: Json
          synced_at: string
          tags: string[]
        }
        Insert: {
          active?: boolean
          category?: string | null
          company_id?: number | null
          custom_fields?: Json
          description?: string | null
          email?: string | null
          fd_created_at?: string | null
          fd_updated_at?: string | null
          id: number
          member_id?: string | null
          mobile?: string | null
          name: string
          phone?: string | null
          phone_e164?: string | null
          raw?: Json
          synced_at?: string
          tags?: string[]
        }
        Update: {
          active?: boolean
          category?: string | null
          company_id?: number | null
          custom_fields?: Json
          description?: string | null
          email?: string | null
          fd_created_at?: string | null
          fd_updated_at?: string | null
          id?: number
          member_id?: string | null
          mobile?: string | null
          name?: string
          phone?: string | null
          phone_e164?: string | null
          raw?: Json
          synced_at?: string
          tags?: string[]
        }
        Relationships: []
      }
      conversations: {
        Row: {
          attachments: Json
          body_html: string | null
          body_text: string | null
          category: number | null
          fd_created_at: string
          fd_updated_at: string | null
          from_email: string | null
          id: number
          incoming: boolean
          media_synced_at: string | null
          private: boolean
          raw: Json
          source: number | null
          synced_at: string
          ticket_id: number
          to_emails: Json
          user_id: number | null
          vendor_extract_attempts: number
          vendor_extracted_at: string | null
        }
        Insert: {
          attachments?: Json
          body_html?: string | null
          body_text?: string | null
          category?: number | null
          fd_created_at: string
          fd_updated_at?: string | null
          from_email?: string | null
          id: number
          incoming?: boolean
          media_synced_at?: string | null
          private?: boolean
          raw?: Json
          source?: number | null
          synced_at?: string
          ticket_id: number
          to_emails?: Json
          user_id?: number | null
          vendor_extract_attempts?: number
          vendor_extracted_at?: string | null
        }
        Update: {
          attachments?: Json
          body_html?: string | null
          body_text?: string | null
          category?: number | null
          fd_created_at?: string
          fd_updated_at?: string | null
          from_email?: string | null
          id?: number
          incoming?: boolean
          media_synced_at?: string | null
          private?: boolean
          raw?: Json
          source?: number | null
          synced_at?: string
          ticket_id?: number
          to_emails?: Json
          user_id?: number | null
          vendor_extract_attempts?: number
          vendor_extracted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          business_hour_id: number | null
          description: string | null
          fd_created_at: string | null
          fd_updated_at: string | null
          group_type: string | null
          id: number
          name: string
          raw: Json
          synced_at: string
        }
        Insert: {
          business_hour_id?: number | null
          description?: string | null
          fd_created_at?: string | null
          fd_updated_at?: string | null
          group_type?: string | null
          id: number
          name: string
          raw?: Json
          synced_at?: string
        }
        Update: {
          business_hour_id?: number | null
          description?: string | null
          fd_created_at?: string | null
          fd_updated_at?: string | null
          group_type?: string | null
          id?: number
          name?: string
          raw?: Json
          synced_at?: string
        }
        Relationships: []
      }
      sla_policies: {
        Row: {
          active: boolean
          applicable_to: Json
          escalation: Json
          fd_created_at: string | null
          fd_updated_at: string | null
          id: number
          is_default: boolean
          name: string
          position: number | null
          raw: Json
          sla_target: Json
          synced_at: string
        }
        Insert: {
          active?: boolean
          applicable_to?: Json
          escalation?: Json
          fd_created_at?: string | null
          fd_updated_at?: string | null
          id: number
          is_default?: boolean
          name: string
          position?: number | null
          raw?: Json
          sla_target?: Json
          synced_at?: string
        }
        Update: {
          active?: boolean
          applicable_to?: Json
          escalation?: Json
          fd_created_at?: string | null
          fd_updated_at?: string | null
          id?: number
          is_default?: boolean
          name?: string
          position?: number | null
          raw?: Json
          sla_target?: Json
          synced_at?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          api_calls: number
          changes_written: number
          conversations_written: number
          detail: Json
          error: string | null
          finished_at: string | null
          id: number
          kind: string
          ok: boolean | null
          rate_remaining: number | null
          started_at: string
          tickets_seen: number
          tickets_written: number
        }
        Insert: {
          api_calls?: number
          changes_written?: number
          conversations_written?: number
          detail?: Json
          error?: string | null
          finished_at?: string | null
          id?: number
          kind: string
          ok?: boolean | null
          rate_remaining?: number | null
          started_at?: string
          tickets_seen?: number
          tickets_written?: number
        }
        Update: {
          api_calls?: number
          changes_written?: number
          conversations_written?: number
          detail?: Json
          error?: string | null
          finished_at?: string | null
          id?: number
          kind?: string
          ok?: boolean | null
          rate_remaining?: number | null
          started_at?: string
          tickets_seen?: number
          tickets_written?: number
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      ticket_changes: {
        Row: {
          fd_updated_at: string | null
          field: string
          id: number
          new_value: string | null
          observed_at: string
          old_value: string | null
          source: string
          ticket_id: number
        }
        Insert: {
          fd_updated_at?: string | null
          field: string
          id?: number
          new_value?: string | null
          observed_at?: string
          old_value?: string | null
          source?: string
          ticket_id: number
        }
        Update: {
          fd_updated_at?: string | null
          field?: string
          id?: number
          new_value?: string | null
          observed_at?: string
          old_value?: string | null
          source?: string
          ticket_id?: number
        }
        Relationships: []
      }
      ticket_fields: {
        Row: {
          choices: Json | null
          dependent_fields: Json | null
          field_type: string
          id: number
          is_default: boolean
          label: string
          name: string
          raw: Json
          required_for_agents: boolean
          synced_at: string
        }
        Insert: {
          choices?: Json | null
          dependent_fields?: Json | null
          field_type: string
          id: number
          is_default?: boolean
          label: string
          name: string
          raw?: Json
          required_for_agents?: boolean
          synced_at?: string
        }
        Update: {
          choices?: Json | null
          dependent_fields?: Json | null
          field_type?: string
          id?: number
          is_default?: boolean
          label?: string
          name?: string
          raw?: Json
          required_for_agents?: boolean
          synced_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          agent_responded_at: string | null
          attachments: Json
          category: string | null
          classification: string | null
          closed_at: string | null
          company_id: number | null
          conversation_count: number
          conversations_synced_at: string | null
          custom_fields: Json
          deleted: boolean
          description_text: string | null
          due_by: string | null
          fd_created_at: string
          fd_updated_at: string
          first_responded_at: string | null
          first_synced_at: string
          fr_due_by: string | null
          fr_escalated: boolean
          group_id: number | null
          id: number
          internal_agent_id: number | null
          internal_group_id: number | null
          is_escalated: boolean
          member_id: string | null
          pending_since: string | null
          priority: number
          product_id: number | null
          raw: Json
          reopened_at: string | null
          requester_id: number
          requester_name: string | null
          requester_phone_e164: string | null
          requester_responded_at: string | null
          resolved_at: string | null
          responder_id: number | null
          source: number | null
          spam: boolean
          status: number
          status_label: string | null
          status_updated_at: string | null
          sub_category: string | null
          subject: string
          synced_at: string
          tags: string[]
          ticket_type: string | null
        }
        Insert: {
          agent_responded_at?: string | null
          attachments?: Json
          category?: string | null
          classification?: string | null
          closed_at?: string | null
          company_id?: number | null
          conversation_count?: number
          conversations_synced_at?: string | null
          custom_fields?: Json
          deleted?: boolean
          description_text?: string | null
          due_by?: string | null
          fd_created_at: string
          fd_updated_at: string
          first_responded_at?: string | null
          first_synced_at?: string
          fr_due_by?: string | null
          fr_escalated?: boolean
          group_id?: number | null
          id: number
          internal_agent_id?: number | null
          internal_group_id?: number | null
          is_escalated?: boolean
          member_id?: string | null
          pending_since?: string | null
          priority: number
          product_id?: number | null
          raw?: Json
          reopened_at?: string | null
          requester_id: number
          requester_name?: string | null
          requester_phone_e164?: string | null
          requester_responded_at?: string | null
          resolved_at?: string | null
          responder_id?: number | null
          source?: number | null
          spam?: boolean
          status: number
          status_label?: string | null
          status_updated_at?: string | null
          sub_category?: string | null
          subject?: string
          synced_at?: string
          tags?: string[]
          ticket_type?: string | null
        }
        Update: {
          agent_responded_at?: string | null
          attachments?: Json
          category?: string | null
          classification?: string | null
          closed_at?: string | null
          company_id?: number | null
          conversation_count?: number
          conversations_synced_at?: string | null
          custom_fields?: Json
          deleted?: boolean
          description_text?: string | null
          due_by?: string | null
          fd_created_at?: string
          fd_updated_at?: string
          first_responded_at?: string | null
          first_synced_at?: string
          fr_due_by?: string | null
          fr_escalated?: boolean
          group_id?: number | null
          id?: number
          internal_agent_id?: number | null
          internal_group_id?: number | null
          is_escalated?: boolean
          member_id?: string | null
          pending_since?: string | null
          priority?: number
          product_id?: number | null
          raw?: Json
          reopened_at?: string | null
          requester_id?: number
          requester_name?: string | null
          requester_phone_e164?: string | null
          requester_responded_at?: string | null
          resolved_at?: string | null
          responder_id?: number | null
          source?: number | null
          spam?: boolean
          status?: number
          status_label?: string | null
          status_updated_at?: string | null
          sub_category?: string | null
          subject?: string
          synced_at?: string
          tags?: string[]
          ticket_type?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          error: string | null
          event: string
          id: number
          payload: Json
          processed_at: string | null
          received_at: string
          ticket_id: number | null
        }
        Insert: {
          error?: string | null
          event: string
          id?: number
          payload: Json
          processed_at?: string | null
          received_at?: string
          ticket_id?: number | null
        }
        Update: {
          error?: string | null
          event?: string
          id?: number
          payload?: Json
          processed_at?: string | null
          received_at?: string
          ticket_id?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      flag_threads_for_media: { Args: { p_limit?: number }; Returns: number }
      media_backlog: { Args: never; Returns: Json }
      ticket_overview: {
        Args: {
          p_agent?: number
          p_category?: string
          p_from?: string
          p_group?: number
          p_member?: string
          p_priority?: number
          p_search?: string
          p_status?: number[]
          p_to?: string
          p_today_start?: string
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
  gia: {
    Tables: {
      ad_account_recharges: {
        Row: {
          ad_account: string
          amount: number
          created_at: string
          currency: string
          done_by: string
          id: string
          method: string | null
          note: string | null
          platform: string
          recharged_at: string
          updated_at: string
        }
        Insert: {
          ad_account: string
          amount: number
          created_at?: string
          currency?: string
          done_by: string
          id?: string
          method?: string | null
          note?: string | null
          platform?: string
          recharged_at: string
          updated_at?: string
        }
        Update: {
          ad_account?: string
          amount?: number
          created_at?: string
          currency?: string
          done_by?: string
          id?: string
          method?: string | null
          note?: string | null
          platform?: string
          recharged_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_account_recharges_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          member_id: string | null
          source: string | null
          updated_at: string
          won_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
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
          member_id?: string | null
          source?: string | null
          updated_at?: string
          won_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
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
          member_id?: string | null
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
      lead_product_enquiries: {
        Row: {
          admin_member_url: string | null
          brand: string | null
          created_at: string
          currency: string | null
          enquired_at: string
          enquiry_type: string
          external_lead_id: string
          id: string
          lead_id: string
          member_role: string | null
          note: string | null
          price: number | null
          price_on_request: boolean | null
          price_region: string | null
          product_id: string | null
          product_image_url: string | null
          product_name: string
          product_url: string | null
          sold_out: boolean | null
          source: string
        }
        Insert: {
          admin_member_url?: string | null
          brand?: string | null
          created_at?: string
          currency?: string | null
          enquired_at: string
          enquiry_type?: string
          external_lead_id: string
          id?: string
          lead_id: string
          member_role?: string | null
          note?: string | null
          price?: number | null
          price_on_request?: boolean | null
          price_region?: string | null
          product_id?: string | null
          product_image_url?: string | null
          product_name: string
          product_url?: string | null
          sold_out?: boolean | null
          source?: string
        }
        Update: {
          admin_member_url?: string | null
          brand?: string | null
          created_at?: string
          currency?: string | null
          enquired_at?: string
          enquiry_type?: string
          external_lead_id?: string
          id?: string
          lead_id?: string
          member_role?: string | null
          note?: string | null
          price?: number | null
          price_on_request?: boolean | null
          price_region?: string | null
          product_id?: string | null
          product_image_url?: string | null
          product_name?: string
          product_url?: string | null
          sold_out?: boolean | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_product_enquiries_lead_id_fkey"
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
          welcomed_at: string | null
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
          welcomed_at?: string | null
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
          welcomed_at?: string | null
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
      profiles: {
        Row: {
          full_name: string | null
          id: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  member: {
    Tables: {
      member_access_log: {
        Row: {
          actor_id: string
          created_at: string
          id: number
          member_id: string
          surface: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: number
          member_id: string
          surface: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: number
          member_id?: string
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_access_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_anticipations: {
        Row: {
          created_at: string
          due_at: string
          evidence: Json
          id: string
          kind: string
          member_id: string
          resolved_at: string | null
          resolved_by: string | null
          run_id: string | null
          status: string
          suggested_action: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_at: string
          evidence?: Json
          id?: string
          kind: string
          member_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          status?: string
          suggested_action?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_at?: string
          evidence?: Json
          id?: string
          kind?: string
          member_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          status?: string
          suggested_action?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_anticipations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_anticipations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_chunks: {
        Row: {
          chunk_index: number
          created_at: string
          document_id: string
          embedded_at: string | null
          embedding: string | null
          id: string
          kind: string
          masked_text: string
          member_id: string
          model_version: string | null
          observed_at: string | null
          tsv: unknown
        }
        Insert: {
          chunk_index?: number
          created_at?: string
          document_id: string
          embedded_at?: string | null
          embedding?: string | null
          id?: string
          kind: string
          masked_text: string
          member_id: string
          model_version?: string | null
          observed_at?: string | null
          tsv?: unknown
        }
        Update: {
          chunk_index?: number
          created_at?: string
          document_id?: string
          embedded_at?: string | null
          embedding?: string | null
          id?: string
          kind?: string
          masked_text?: string
          member_id?: string
          model_version?: string | null
          observed_at?: string | null
          tsv?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "member_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "member_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_chunks_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_documents: {
        Row: {
          created_at: string
          from_at: string | null
          id: string
          kind: string
          member_id: string
          run_id: string | null
          source: string
          source_ref: Json
          text: string
          title: string | null
          to_at: string | null
        }
        Insert: {
          created_at?: string
          from_at?: string | null
          id?: string
          kind: string
          member_id: string
          run_id?: string | null
          source: string
          source_ref?: Json
          text: string
          title?: string | null
          to_at?: string | null
        }
        Update: {
          created_at?: string
          from_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          run_id?: string | null
          source?: string
          source_ref?: Json
          text?: string
          title?: string | null
          to_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_documents_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_events: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_01: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_02: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_03: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_04: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_05: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_06: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_07: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_08: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_09: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_10: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_11: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2024_12: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_01: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_02: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_03: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_04: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_05: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_06: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_07: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_08: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_09: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_10: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_11: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2025_12: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_01: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_02: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_03: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_04: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_05: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_06: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_07: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_08: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_09: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_10: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_11: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2026_12: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2027_01: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2027_02: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_2027_03: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_events_default: {
        Row: {
          actor: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref: Json
          summary: string
          tone: string | null
          weight: number
        }
        Insert: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          member_id: string
          occurred_at: string
          source: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Update: {
          actor?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          member_id?: string
          occurred_at?: string
          source?: string
          source_ref?: Json
          summary?: string
          tone?: string | null
          weight?: number
        }
        Relationships: []
      }
      member_facts: {
        Row: {
          confidence: number
          created_at: string
          created_by: string | null
          evidence: Json
          facet: string
          id: string
          key: string
          member_id: string
          observed_at: string
          polarity: string
          run_id: string | null
          source: string
          superseded_by: string | null
          valid_until: string | null
          value: string
          value_json: Json | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          evidence?: Json
          facet: string
          id?: string
          key?: string
          member_id: string
          observed_at?: string
          polarity?: string
          run_id?: string | null
          source: string
          superseded_by?: string | null
          valid_until?: string | null
          value: string
          value_json?: Json | null
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          evidence?: Json
          facet?: string
          id?: string
          key?: string
          member_id?: string
          observed_at?: string
          polarity?: string
          run_id?: string | null
          source?: string
          superseded_by?: string | null
          valid_until?: string | null
          value?: string
          value_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "member_facts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_facts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "member_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      member_health_events: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          evidence: Json
          id: string
          member_id: string
          note: string | null
          observed_at: string
          run_id: string | null
          signal: string
          ticket_ref: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          evidence?: Json
          id?: string
          member_id: string
          note?: string | null
          observed_at?: string
          run_id?: string | null
          signal: string
          ticket_ref?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          evidence?: Json
          id?: string
          member_id?: string
          note?: string | null
          observed_at?: string
          run_id?: string | null
          signal?: string
          ticket_ref?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "member_health_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_health_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_health_events_signal_fkey"
            columns: ["signal"]
            isOneToOne: false
            referencedRelation: "member_health_policy"
            referencedColumns: ["signal"]
          },
        ]
      }
      member_health_policy: {
        Row: {
          delta: number
          half_life_days: number
          label: string
          signal: string
          updated_at: string
        }
        Insert: {
          delta: number
          half_life_days: number
          label: string
          signal: string
          updated_at?: string
        }
        Update: {
          delta?: number
          half_life_days?: number
          label?: string
          signal?: string
          updated_at?: string
        }
        Relationships: []
      }
      member_people: {
        Row: {
          can_request: boolean
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          member_id: string
          name: string
          note: string | null
          phone_e164: string | null
          relation: string
          updated_at: string
        }
        Insert: {
          can_request?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          member_id: string
          name: string
          note?: string | null
          phone_e164?: string | null
          relation: string
          updated_at?: string
        }
        Update: {
          can_request?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          member_id?: string
          name?: string
          note?: string | null
          phone_e164?: string | null
          relation?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_people_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_relations: {
        Row: {
          entity_id: string
          entity_kind: string
          entity_label: string
          evidence: Json
          evidence_count: number
          first_seen_at: string
          id: string
          last_seen_at: string
          member_id: string
          relation: string
          strength: number
          updated_at: string
        }
        Insert: {
          entity_id: string
          entity_kind: string
          entity_label: string
          evidence?: Json
          evidence_count?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          member_id: string
          relation: string
          strength?: number
          updated_at?: string
        }
        Update: {
          entity_id?: string
          entity_kind?: string
          entity_label?: string
          evidence?: Json
          evidence_count?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          member_id?: string
          relation?: string
          strength?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_relations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_snapshot: {
        Row: {
          built_at: string
          data: Json
          member_id: string
          run_id: string | null
          version: number
        }
        Insert: {
          built_at?: string
          data?: Json
          member_id: string
          run_id?: string | null
          version?: number
        }
        Update: {
          built_at?: string
          data?: Json
          member_id?: string
          run_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_snapshot_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          alt_phones: string[]
          app_member_id: string | null
          consent: Json
          created_at: string
          freshdesk_contact_id: string | null
          full_name: string
          id: string
          identity_status: string
          import_raw: Json
          membership_amount_inr: number | null
          membership_end: string | null
          membership_start: string | null
          membership_status: string | null
          membership_type: string | null
          primary_phone: string | null
          queendom_id: string | null
          sources: string[]
          tier: string | null
          updated_at: string
          wa_group_jid: string | null
          wa_invite_link: string | null
          zoho_customer_id: string | null
        }
        Insert: {
          alt_phones?: string[]
          app_member_id?: string | null
          consent?: Json
          created_at?: string
          freshdesk_contact_id?: string | null
          full_name: string
          id?: string
          identity_status?: string
          import_raw?: Json
          membership_amount_inr?: number | null
          membership_end?: string | null
          membership_start?: string | null
          membership_status?: string | null
          membership_type?: string | null
          primary_phone?: string | null
          queendom_id?: string | null
          sources?: string[]
          tier?: string | null
          updated_at?: string
          wa_group_jid?: string | null
          wa_invite_link?: string | null
          zoho_customer_id?: string | null
        }
        Update: {
          alt_phones?: string[]
          app_member_id?: string | null
          consent?: Json
          created_at?: string
          freshdesk_contact_id?: string | null
          full_name?: string
          id?: string
          identity_status?: string
          import_raw?: Json
          membership_amount_inr?: number | null
          membership_end?: string | null
          membership_start?: string | null
          membership_status?: string | null
          membership_type?: string | null
          primary_phone?: string | null
          queendom_id?: string | null
          sources?: string[]
          tier?: string | null
          updated_at?: string
          wa_group_jid?: string | null
          wa_invite_link?: string | null
          zoho_customer_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      profiles: {
        Row: {
          full_name: string | null
          id: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
      activity_events: {
        Row: {
          actor_id: string | null
          created_at: string
          domain: Database["public"]["Enums"]["app_domain"]
          event_type: string
          id: string
          meta: Json
          subject_id: string | null
          subject_type: string
          title: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          domain: Database["public"]["Enums"]["app_domain"]
          event_type: string
          id?: string
          meta?: Json
          subject_id?: string | null
          subject_type: string
          title?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          event_type?: string
          id?: string
          meta?: Json
          subject_id?: string | null
          subject_type?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
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
      elaya_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elaya_notes_user_id_fkey"
            columns: ["user_id"]
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
      elaya_training_assets: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          domain: Database["public"]["Enums"]["app_domain"] | null
          id: string
          kind: string
          send_order: number
          storage_path: string | null
          tags: string[]
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          domain?: Database["public"]["Enums"]["app_domain"] | null
          id?: string
          kind: string
          send_order?: number
          storage_path?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          domain?: Database["public"]["Enums"]["app_domain"] | null
          id?: string
          kind?: string
          send_order?: number
          storage_path?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
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
          appearance: string
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
          queendom_id: string | null
          reports_to: string | null
          role: Database["public"]["Enums"]["user_role"]
          sia_role: string | null
          theme: string
          timezone: string
          updated_at: string
          username: string | null
        }
        Insert: {
          app_icon?: string
          appearance?: string
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
          queendom_id?: string | null
          reports_to?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          sia_role?: string | null
          theme?: string
          timezone?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          app_icon?: string
          appearance?: string
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
          queendom_id?: string | null
          reports_to?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          sia_role?: string | null
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
      subscription_password_reveals: {
        Row: {
          id: string
          revealed_at: string
          revealed_by: string | null
          subscription_id: string
        }
        Insert: {
          id?: string
          revealed_at?: string
          revealed_by?: string | null
          subscription_id: string
        }
        Update: {
          id?: string
          revealed_at?: string
          revealed_by?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_password_reveals_revealed_by_fkey"
            columns: ["revealed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_password_reveals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          invoice_path: string | null
          notes: string | null
          paid_amount_inr: number
          paid_at: string
          rate: number
          subscription_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          invoice_path?: string | null
          notes?: string | null
          paid_amount_inr: number
          paid_at: string
          rate: number
          subscription_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          invoice_path?: string | null
          notes?: string | null
          paid_amount_inr?: number
          paid_at?: string
          rate?: number
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_tools: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          name_key: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          name_key?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          name_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_tools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_topups: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_path: string | null
          notes: string | null
          paid_amount_inr: number
          subscription_id: string
          topped_up_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency: string
          id?: string
          invoice_path?: string | null
          notes?: string | null
          paid_amount_inr: number
          subscription_id: string
          topped_up_at: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_path?: string | null
          notes?: string | null
          paid_amount_inr?: number
          subscription_id?: string
          topped_up_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_topups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_topups_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          currency: string
          departments: string[]
          due_date: string | null
          due_day: number | null
          id: string
          is_archived: boolean
          login: string | null
          name: string
          notes: string | null
          password: string | null
          tool_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency: string
          departments?: string[]
          due_date?: string | null
          due_day?: number | null
          id?: string
          is_archived?: boolean
          login?: string | null
          name: string
          notes?: string | null
          password?: string | null
          tool_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          departments?: string[]
          due_date?: string | null
          due_day?: number | null
          id?: string
          is_archived?: boolean
          login?: string | null
          name?: string
          notes?: string | null
          password?: string | null
          tool_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "subscription_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          category: string
          created_at: string
          id: string
          image_paths: string[]
          message: string
          resolved_at: string | null
          resolved_by: string | null
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          image_paths?: string[]
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          image_paths?: string[]
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_sender_id_fkey"
            columns: ["sender_id"]
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
      task_events: {
        Row: {
          actor_id: string | null
          created_at: string
          domain: Database["public"]["Enums"]["app_domain"]
          event_type: Database["public"]["Enums"]["task_event_type"]
          id: string
          meta: Json
          subject_id: string | null
          task_id: string
          task_title: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          domain: Database["public"]["Enums"]["app_domain"]
          event_type: Database["public"]["Enums"]["task_event_type"]
          id?: string
          meta?: Json
          subject_id?: string | null
          task_id: string
          task_title?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          domain?: Database["public"]["Enums"]["app_domain"]
          event_type?: Database["public"]["Enums"]["task_event_type"]
          id?: string
          meta?: Json
          subject_id?: string | null
          task_id?: string
          task_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
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
      task_ticket_meta: {
        Row: {
          task_id: string
          ticket_id: string
        }
        Insert: {
          task_id: string
          ticket_id: string
        }
        Update: {
          task_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_ticket_meta_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
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
      vendor_agent_preferences: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          note: string | null
          stance: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          note?: string | null
          stance: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          note?: string | null
          stance?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_agent_preferences_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_agent_preferences_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_capabilities: {
        Row: {
          category: string
          cities: string[]
          created_at: string
          id: string
          note: string | null
          service: string | null
          set_by: string | null
          stance: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category: string
          cities?: string[]
          created_at?: string
          id?: string
          note?: string | null
          service?: string | null
          set_by?: string | null
          stance: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category?: string
          cities?: string[]
          created_at?: string
          id?: string
          note?: string | null
          service?: string | null
          set_by?: string | null
          stance?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_capabilities_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_capabilities_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_engagements: {
        Row: {
          agent_id: string | null
          agent_name_raw: string | null
          amount_inr: number | null
          category: string
          city: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_paths: string[]
          lead_id: string | null
          member_id: string | null
          note: string | null
          outcome: string
          service: string | null
          source: string
          source_ref: string
          started_at: string
          title: string | null
          vendor_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_name_raw?: string | null
          amount_inr?: number | null
          category: string
          city?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_paths?: string[]
          lead_id?: string | null
          member_id?: string | null
          note?: string | null
          outcome?: string
          service?: string | null
          source: string
          source_ref: string
          started_at: string
          title?: string | null
          vendor_id: string
        }
        Update: {
          agent_id?: string | null
          agent_name_raw?: string | null
          amount_inr?: number | null
          category?: string
          city?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_paths?: string[]
          lead_id?: string | null
          member_id?: string | null
          note?: string | null
          outcome?: string
          service?: string | null
          source?: string
          source_ref?: string
          started_at?: string
          title?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_engagements_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_engagements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_engagements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_merges: {
        Row: {
          created_at: string
          id: string
          kept_vendor_id: string
          merged_by: string | null
          merged_name: string
          merged_row: Json
          merged_vendor_id: string
          moved: Json
        }
        Insert: {
          created_at?: string
          id?: string
          kept_vendor_id: string
          merged_by?: string | null
          merged_name: string
          merged_row: Json
          merged_vendor_id: string
          moved?: Json
        }
        Update: {
          created_at?: string
          id?: string
          kept_vendor_id?: string
          merged_by?: string | null
          merged_name?: string
          merged_row?: Json
          merged_vendor_id?: string
          moved?: Json
        }
        Relationships: [
          {
            foreignKeyName: "vendor_merges_kept_vendor_id_fkey"
            columns: ["kept_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_merges_merged_by_fkey"
            columns: ["merged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          vendor_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          vendor_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_notes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_reviews: {
        Row: {
          comment: string | null
          created_at: string
          engagement_id: string | null
          id: string
          pricing: number | null
          quality: number | null
          reliability: number | null
          reviewer_id: string
          speed: number | null
          vendor_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          engagement_id?: string | null
          id?: string
          pricing?: number | null
          quality?: number | null
          reliability?: number | null
          reviewer_id: string
          speed?: number | null
          vendor_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          engagement_id?: string | null
          id?: string
          pricing?: number | null
          quality?: number | null
          reliability?: number | null
          reviewer_id?: string
          speed?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_reviews_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "vendor_engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          aliases: string[]
          category: string | null
          category_source: string | null
          contacts: Json
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          freshdesk_ref: string | null
          home_city: string | null
          id: string
          identity_status: string
          import_raw: Json
          name: string
          name_key: string | null
          notes: string | null
          primary_phone: string | null
          search_key: string | null
          search_text: string | null
          sources: string[]
          status: string
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          category?: string | null
          category_source?: string | null
          contacts?: Json
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          freshdesk_ref?: string | null
          home_city?: string | null
          id?: string
          identity_status?: string
          import_raw?: Json
          name: string
          name_key?: string | null
          notes?: string | null
          primary_phone?: string | null
          search_key?: string | null
          search_text?: string | null
          sources?: string[]
          status?: string
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          category?: string | null
          category_source?: string | null
          contacts?: Json
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          freshdesk_ref?: string | null
          home_city?: string | null
          id?: string
          identity_status?: string
          import_raw?: Json
          name?: string
          name_key?: string | null
          notes?: string | null
          primary_phone?: string | null
          search_key?: string | null
          search_text?: string | null
          sources?: string[]
          status?: string
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_deleted_by_fkey"
            columns: ["deleted_by"]
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
      business_minutes_between: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      can_access_member_queendom: {
        Args: { p_queendom: string }
        Returns: boolean
      }
      can_access_vendors: { Args: never; Returns: boolean }
      can_access_wa_conversation: {
        Args: { p_lead_id: string }
        Returns: boolean
      }
      cold_lead_cutoff: { Args: never; Returns: string }
      count_vendors: {
        Args: { p_category?: string; p_query?: string; p_status?: string }
        Returns: number
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
      decrypt_subscription_password: {
        Args: { p_ciphertext: string }
        Returns: string
      }
      encrypt_subscription_password: {
        Args: { p_plaintext: string }
        Returns: string
      }
      find_vendors_by_history: {
        Args: {
          p_category?: string
          p_city?: string
          p_limit?: number
          p_query?: string
          p_service?: string
          p_terms?: string[]
        }
        Returns: {
          last_matched: string
          match_count: number
          match_score: number
          sample_titles: string[]
          vendor_id: string
        }[]
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
      get_agent_performance_trend: {
        Args: { p_date_from: string; p_date_to: string }
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
      get_agent_roster_performance_for_elaya: {
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
      get_agent_tasks_oversight: {
        Args: {
          p_agent: string
          p_caller_domain: Database["public"]["Enums"]["app_domain"]
          p_role: string
        }
        Returns: {
          completed_at: string
          created_at: string
          due_at: string
          group_id: string
          group_title: string
          id: string
          lead_first_name: string
          lead_id: string
          lead_last_name: string
          lead_slug: string
          module: string
          overdue_at: string
          priority: string
          status: string
          task_category: string
          title: string
        }[]
      }
      get_agent_today_pulse: {
        Args: { p_date_from: string; p_date_to: string; p_today_start: string }
        Returns: Json
      }
      get_agent_today_pulse_for_user: {
        Args: {
          p_agent: string
          p_date_from: string
          p_date_to: string
          p_today_start: string
        }
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
      get_domain_task_summary: {
        Args: {
          p_domain: Database["public"]["Enums"]["app_domain"]
          p_from: string
          p_to: string
        }
        Returns: {
          agent_id: string
          agent_name: string
          completed_count: number
          created_count: number
          open_count: number
          overdue_count: number
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
      get_group_task_summaries_for_user: {
        Args: { p_priority?: string[]; p_status?: string[]; p_user_id: string }
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
          completed_at: string
          created_at: string
          created_by: string
          description: string
          due_at: string
          group_id: string
          id: string
          lead_first_name: string
          lead_id: string
          lead_last_name: string
          lead_slug: string
          module: Database["public"]["Enums"]["task_module"]
          overdue_at: string
          priority: string
          status: string
          tags: string[]
          task_category: string
          task_type: string
          title: string
          updated_at: string
        }[]
      }
      get_recent_lead_activity: {
        Args: {
          p_domain: Database["public"]["Enums"]["app_domain"]
          p_role: string
          p_scope?: string
          p_user_id: string
        }
        Returns: Json
      }
      get_silent_leads_for_revival: {
        Args: { p_limit: number; p_status: string; p_threshold: string }
        Returns: {
          assigned_to: string
          domain: Database["public"]["Enums"]["app_domain"]
          first_name: string
          id: string
          last_name: string
          slug: string
          status: string
        }[]
      }
      get_team_agent_breakdown: {
        Args: {
          p_caller_domain: Database["public"]["Enums"]["app_domain"]
          p_domain: Database["public"]["Enums"]["app_domain"]
          p_role: string
        }
        Returns: {
          agent_id: string
          avatar_url: string
          completed_count: number
          full_name: string
          in_review_count: number
          open_count: number
          overdue_count: number
          role: string
        }[]
      }
      get_team_task_overview: {
        Args: {
          p_domain: Database["public"]["Enums"]["app_domain"]
          p_role: string
        }
        Returns: {
          agent_count: number
          completed_count: number
          domain: Database["public"]["Enums"]["app_domain"]
          in_review_count: number
          open_count: number
          overdue_count: number
        }[]
      }
      get_user_domain: {
        Args: never
        Returns: Database["public"]["Enums"]["app_domain"]
      }
      get_user_queendom: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_vendor_agent_usage: {
        Args: { p_limit?: number; p_vendor_id: string }
        Returns: {
          agent_id: string
          count: number
          name: string
        }[]
      }
      get_vendor_candidates: {
        Args: { p_category?: string; p_city?: string; p_service?: string }
        Returns: {
          aliases: string[]
          category: string | null
          category_source: string | null
          contacts: Json
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          freshdesk_ref: string | null
          home_city: string | null
          id: string
          identity_status: string
          import_raw: Json
          name: string
          name_key: string | null
          notes: string | null
          primary_phone: string | null
          search_key: string | null
          search_text: string | null
          sources: string[]
          status: string
          subcategory: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "vendors"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_vendor_categories: { Args: never; Returns: string[] }
      get_vendor_category_usage: {
        Args: { p_vendor_id: string }
        Returns: {
          category: string
          count: number
        }[]
      }
      get_vendor_cities: { Args: never; Returns: string[] }
      get_vendor_score_inputs: {
        Args: {
          p_category?: string
          p_city?: string
          p_since: string
          p_vendor_ids: string[]
        }
        Returns: {
          avg_pricing: number
          avg_quality: number
          avg_reliability: number
          avg_speed: number
          avoid_count: number
          cancelled_count: number
          category_count: number
          city_count: number
          completed_count: number
          engagement_count: number
          failed_count: number
          last_started_at: string
          preferred_count: number
          review_count: number
          total_used: number
          vendor_id: string
        }[]
      }
      get_wa_unread_count: { Args: never; Returns: number }
      immutable_contact_search_text: {
        Args: { p_contacts: Json }
        Returns: string
      }
      lead_phone_key: { Args: { p_phone: string }; Returns: string }
      member_visible: { Args: { p_member_id: string }; Returns: boolean }
      merge_vendors: {
        Args: { p_actor?: string; p_keep: string; p_merge: string }
        Returns: Json
      }
      search_vendors: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
        }
        Returns: {
          aliases: string[]
          category: string | null
          category_source: string | null
          contacts: Json
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          freshdesk_ref: string | null
          home_city: string | null
          id: string
          identity_status: string
          import_raw: Json
          name: string
          name_key: string | null
          notes: string | null
          primary_phone: string | null
          search_key: string | null
          search_text: string | null
          sources: string[]
          status: string
          subcategory: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "vendors"
          isOneToOne: false
          isSetofReturn: true
        }
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
        | "business"
        | "house"
        | "legacy"
      task_event_type:
        | "created"
        | "status_changed"
        | "reassigned"
        | "remark_added"
        | "overdue"
      task_module: "gia" | "sia" | "core"
      user_role: "founder" | "admin" | "manager" | "agent" | "guest"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  sia: {
    Tables: {
      codenames: {
        Row: {
          code: string
          created_at: string
          group_jid: string
          sender_jid: string
          side: string
        }
        Insert: {
          code: string
          created_at?: string
          group_jid: string
          sender_jid: string
          side: string
        }
        Update: {
          code?: string
          created_at?: string
          group_jid?: string
          sender_jid?: string
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "codenames_group_jid_fkey"
            columns: ["group_jid"]
            isOneToOne: false
            referencedRelation: "wag_groups"
            referencedColumns: ["group_jid"]
          },
        ]
      }
      extraction_runs: {
        Row: {
          cost_usd: number | null
          error: string | null
          finished_at: string | null
          id: string
          input_ref: Json
          kind: string
          member_id: string | null
          model: string | null
          ok: boolean | null
          output: Json
          prompt_version: string | null
          started_at: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost_usd?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input_ref?: Json
          kind: string
          member_id?: string | null
          model?: string | null
          ok?: boolean | null
          output?: Json
          prompt_version?: string | null
          started_at?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost_usd?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input_ref?: Json
          kind?: string
          member_id?: string | null
          model?: string | null
          ok?: boolean | null
          output?: Json
          prompt_version?: string | null
          started_at?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      genie_roster: {
        Row: {
          capacity: number
          is_on_leave: boolean
          languages: string[]
          leave_until: string | null
          profile_id: string
          queendom_id: string | null
          shifts: Json
          specialities: Json
          updated_at: string
        }
        Insert: {
          capacity?: number
          is_on_leave?: boolean
          languages?: string[]
          leave_until?: string | null
          profile_id: string
          queendom_id?: string | null
          shifts?: Json
          specialities?: Json
          updated_at?: string
        }
        Update: {
          capacity?: number
          is_on_leave?: boolean
          languages?: string[]
          leave_until?: string | null
          profile_id?: string
          queendom_id?: string | null
          shifts?: Json
          specialities?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "genie_roster_queendom_id_fkey"
            columns: ["queendom_id"]
            isOneToOne: false
            referencedRelation: "queendoms"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_group_state: {
        Row: {
          bursts_done: number
          fail_count: number
          group_jid: string
          last_error: string | null
          last_message_at: string | null
          updated_at: string
        }
        Insert: {
          bursts_done?: number
          fail_count?: number
          group_jid: string
          last_error?: string | null
          last_message_at?: string | null
          updated_at?: string
        }
        Update: {
          bursts_done?: number
          fail_count?: number
          group_jid?: string
          last_error?: string | null
          last_message_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      intake_proposals: {
        Row: {
          classify_run_id: string | null
          confidence: number
          created_at: string
          dismiss_reason: string | null
          draft: Json
          draft_run_id: string | null
          fields_changed: string[] | null
          first_message_at: string
          group_jid: string
          id: string
          kind: string
          last_message_at: string
          member_id: string
          messages: Json
          queendom_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          summary: string
          ticket_id: string | null
          tone: string | null
        }
        Insert: {
          classify_run_id?: string | null
          confidence: number
          created_at?: string
          dismiss_reason?: string | null
          draft?: Json
          draft_run_id?: string | null
          fields_changed?: string[] | null
          first_message_at: string
          group_jid: string
          id?: string
          kind: string
          last_message_at: string
          member_id: string
          messages: Json
          queendom_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary: string
          ticket_id?: string | null
          tone?: string | null
        }
        Update: {
          classify_run_id?: string | null
          confidence?: number
          created_at?: string
          dismiss_reason?: string | null
          draft?: Json
          draft_run_id?: string | null
          fields_changed?: string[] | null
          first_message_at?: string
          group_jid?: string
          id?: string
          kind?: string
          last_message_at?: string
          member_id?: string
          messages?: Json
          queendom_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary?: string
          ticket_id?: string | null
          tone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_proposals_queendom_id_fkey"
            columns: ["queendom_id"]
            isOneToOne: false
            referencedRelation: "queendoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_proposals_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiler_group_state: {
        Row: {
          fail_count: number
          group_jid: string
          last_error: string | null
          last_message_at: string | null
          last_run_id: string | null
          updated_at: string
          windows_done: number
        }
        Insert: {
          fail_count?: number
          group_jid: string
          last_error?: string | null
          last_message_at?: string | null
          last_run_id?: string | null
          updated_at?: string
          windows_done?: number
        }
        Update: {
          fail_count?: number
          group_jid?: string
          last_error?: string | null
          last_message_at?: string | null
          last_run_id?: string | null
          updated_at?: string
          windows_done?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiler_group_state_group_jid_fkey"
            columns: ["group_jid"]
            isOneToOne: true
            referencedRelation: "wag_groups"
            referencedColumns: ["group_jid"]
          },
          {
            foreignKeyName: "profiler_group_state_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "extraction_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      queendoms: {
        Row: {
          created_at: string
          freshdesk_group_id: number | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          freshdesk_group_id?: number | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          freshdesk_group_id?: number | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2026_09: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2026_10: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2026_11: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2026_12: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_01: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_02: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_03: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_04: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_05: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_06: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_07: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_08: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_09: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_10: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_11: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_2027_12: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_events_default: {
        Row: {
          actor_id: string | null
          actor_kind: string
          body: string | null
          created_at: string
          event_type: string
          id: string
          member_id: string
          meta: Json
          queendom_id: string | null
          run_id: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          member_id: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          member_id?: string
          meta?: Json
          queendom_id?: string | null
          run_id?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      ticket_message_links: {
        Row: {
          chat_jid: string
          confidence: number
          created_at: string
          created_by: string | null
          freshdesk_id: number | null
          id: string
          link_kind: string
          run_id: string | null
          sender_jid: string
          ticket_id: string | null
          wa_message_id: string
        }
        Insert: {
          chat_jid: string
          confidence?: number
          created_at?: string
          created_by?: string | null
          freshdesk_id?: number | null
          id?: string
          link_kind: string
          run_id?: string | null
          sender_jid: string
          ticket_id?: string | null
          wa_message_id: string
        }
        Update: {
          chat_jid?: string
          confidence?: number
          created_at?: string
          created_by?: string | null
          freshdesk_id?: number | null
          id?: string
          link_kind?: string
          run_id?: string | null
          sender_jid?: string
          ticket_id?: string | null
          wa_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_message_links_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      ticket_sla_policies: {
        Row: {
          business_hours: boolean
          category: string | null
          created_at: string
          escalation: Json
          first_response_min: number
          id: string
          is_active: boolean
          member_silence_min: number
          priority: string | null
          queendom_id: string | null
          resolve_target_min: number
          sub_category: string | null
          tier: string | null
          update_cadence_min: number
          updated_at: string
          vendor_silence_min: number
        }
        Insert: {
          business_hours?: boolean
          category?: string | null
          created_at?: string
          escalation?: Json
          first_response_min: number
          id?: string
          is_active?: boolean
          member_silence_min: number
          priority?: string | null
          queendom_id?: string | null
          resolve_target_min: number
          sub_category?: string | null
          tier?: string | null
          update_cadence_min: number
          updated_at?: string
          vendor_silence_min: number
        }
        Update: {
          business_hours?: boolean
          category?: string | null
          created_at?: string
          escalation?: Json
          first_response_min?: number
          id?: string
          is_active?: boolean
          member_silence_min?: number
          priority?: string | null
          queendom_id?: string | null
          resolve_target_min?: number
          sub_category?: string | null
          tier?: string | null
          update_cadence_min?: number
          updated_at?: string
          vendor_silence_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sla_policies_queendom_id_fkey"
            columns: ["queendom_id"]
            isOneToOne: false
            referencedRelation: "queendoms"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assignee_id: string | null
          bishop_id: string | null
          brief: Json
          category: string
          checklist: Json
          closed_at: string | null
          created_at: string
          created_by: string | null
          created_by_kind: string
          first_responded_at: string | null
          first_response_due_at: string | null
          freshdesk_id: number | null
          group_jid: string | null
          handoff_department: string | null
          id: string
          item: string | null
          last_member_update_at: string | null
          member_id: string
          money: Json
          next_update_due_at: string | null
          next_wake_at: string | null
          origin: string
          origin_ref: Json
          priority: string
          priority_approved_at: string | null
          priority_approved_by: string | null
          proposed_by_run_id: string | null
          queendom_id: string | null
          requested_for: string | null
          resolution: string | null
          resolve_due_at: string | null
          satisfaction: number | null
          sentinel_state: Json
          status: string
          sub_category: string | null
          summary: string | null
          tags: string[]
          ticket_no: string
          title: string
          updated_at: string
          vendor_id: string | null
          wake_reason: string | null
        }
        Insert: {
          assignee_id?: string | null
          bishop_id?: string | null
          brief?: Json
          category: string
          checklist?: Json
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: string
          first_responded_at?: string | null
          first_response_due_at?: string | null
          freshdesk_id?: number | null
          group_jid?: string | null
          handoff_department?: string | null
          id?: string
          item?: string | null
          last_member_update_at?: string | null
          member_id: string
          money?: Json
          next_update_due_at?: string | null
          next_wake_at?: string | null
          origin: string
          origin_ref?: Json
          priority?: string
          priority_approved_at?: string | null
          priority_approved_by?: string | null
          proposed_by_run_id?: string | null
          queendom_id?: string | null
          requested_for?: string | null
          resolution?: string | null
          resolve_due_at?: string | null
          satisfaction?: number | null
          sentinel_state?: Json
          status?: string
          sub_category?: string | null
          summary?: string | null
          tags?: string[]
          ticket_no?: string
          title: string
          updated_at?: string
          vendor_id?: string | null
          wake_reason?: string | null
        }
        Update: {
          assignee_id?: string | null
          bishop_id?: string | null
          brief?: Json
          category?: string
          checklist?: Json
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_kind?: string
          first_responded_at?: string | null
          first_response_due_at?: string | null
          freshdesk_id?: number | null
          group_jid?: string | null
          handoff_department?: string | null
          id?: string
          item?: string | null
          last_member_update_at?: string | null
          member_id?: string
          money?: Json
          next_update_due_at?: string | null
          next_wake_at?: string | null
          origin?: string
          origin_ref?: Json
          priority?: string
          priority_approved_at?: string | null
          priority_approved_by?: string | null
          proposed_by_run_id?: string | null
          queendom_id?: string | null
          requested_for?: string | null
          resolution?: string | null
          resolve_due_at?: string | null
          satisfaction?: number | null
          sentinel_state?: Json
          status?: string
          sub_category?: string | null
          summary?: string | null
          tags?: string[]
          ticket_no?: string
          title?: string
          updated_at?: string
          vendor_id?: string | null
          wake_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_queendom_id_fkey"
            columns: ["queendom_id"]
            isOneToOne: false
            referencedRelation: "queendoms"
            referencedColumns: ["id"]
          },
        ]
      }
      wag_auth_state: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      wag_contacts: {
        Row: {
          business_name: string | null
          created_at: string
          first_seen_at: string
          jid: string
          last_seen_at: string
          lid: string | null
          member_id: string | null
          participant_role: string
          phone: string | null
          push_name: string | null
          staff_profile_id: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          first_seen_at?: string
          jid: string
          last_seen_at?: string
          lid?: string | null
          member_id?: string | null
          participant_role?: string
          phone?: string | null
          push_name?: string | null
          staff_profile_id?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string
          first_seen_at?: string
          jid?: string
          last_seen_at?: string
          lid?: string | null
          member_id?: string | null
          participant_role?: string
          phone?: string | null
          push_name?: string | null
          staff_profile_id?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: []
      }
      wag_group_members: {
        Row: {
          group_jid: string
          joined_at: string
          left_at: string | null
          member_jid: string
          role: string
        }
        Insert: {
          group_jid: string
          joined_at?: string
          left_at?: string | null
          member_jid: string
          role?: string
        }
        Update: {
          group_jid?: string
          joined_at?: string
          left_at?: string | null
          member_jid?: string
          role?: string
        }
        Relationships: []
      }
      wag_groups: {
        Row: {
          created_at: string
          description: string | null
          group_jid: string
          group_kind: string
          is_active: boolean
          member_count: number | null
          member_id: string | null
          owner_jid: string | null
          subject: string | null
          updated_at: string
          vendor_id: string | null
          watcher_joined_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_jid: string
          group_kind?: string
          is_active?: boolean
          member_count?: number | null
          member_id?: string | null
          owner_jid?: string | null
          subject?: string | null
          updated_at?: string
          vendor_id?: string | null
          watcher_joined_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          group_jid?: string
          group_kind?: string
          is_active?: boolean
          member_count?: number | null
          member_id?: string | null
          owner_jid?: string | null
          subject?: string | null
          updated_at?: string
          vendor_id?: string | null
          watcher_joined_at?: string | null
        }
        Relationships: []
      }
      wag_media: {
        Row: {
          attempts: number
          chat_jid: string
          created_at: string
          download_status: string
          duration_seconds: number | null
          id: string
          last_attempt_at: string | null
          media_type: string
          mime: string | null
          sender_jid: string
          size_bytes: number | null
          storage_path: string | null
          thumbnail_path: string | null
          wa_message_id: string
          wa_timestamp: string | null
        }
        Insert: {
          attempts?: number
          chat_jid: string
          created_at?: string
          download_status?: string
          duration_seconds?: number | null
          id?: string
          last_attempt_at?: string | null
          media_type: string
          mime?: string | null
          sender_jid: string
          size_bytes?: number | null
          storage_path?: string | null
          thumbnail_path?: string | null
          wa_message_id: string
          wa_timestamp?: string | null
        }
        Update: {
          attempts?: number
          chat_jid?: string
          created_at?: string
          download_status?: string
          duration_seconds?: number | null
          id?: string
          last_attempt_at?: string | null
          media_type?: string
          mime?: string | null
          sender_jid?: string
          size_bytes?: number | null
          storage_path?: string | null
          thumbnail_path?: string | null
          wa_message_id?: string
          wa_timestamp?: string | null
        }
        Relationships: []
      }
      wag_messages: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_messages_2026_08: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_messages_2026_09: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_messages_2026_10: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_messages_2026_11: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_messages_2026_12: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_messages_2027_01: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_messages_2027_02: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_messages_2027_03: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_messages_default: {
        Row: {
          chat_jid: string
          edit_of_wa_message_id: string | null
          from_me: boolean
          id: string
          is_forwarded: boolean
          is_revoked: boolean
          normalizer_version: number
          quoted_sender_jid: string | null
          quoted_wa_message_id: string | null
          raw: Json | null
          received_at: string
          sender_jid: string
          source: string
          text: string | null
          type: string
          wa_message_id: string
          wa_timestamp: string
        }
        Insert: {
          chat_jid: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id: string
          wa_timestamp: string
        }
        Update: {
          chat_jid?: string
          edit_of_wa_message_id?: string | null
          from_me?: boolean
          id?: string
          is_forwarded?: boolean
          is_revoked?: boolean
          normalizer_version?: number
          quoted_sender_jid?: string | null
          quoted_wa_message_id?: string | null
          raw?: Json | null
          received_at?: string
          sender_jid?: string
          source?: string
          text?: string | null
          type?: string
          wa_message_id?: string
          wa_timestamp?: string
        }
        Relationships: []
      }
      wag_pipeline_cursors: {
        Row: {
          consumer_name: string
          last_event_id: number | null
          last_processed_at: string | null
          updated_at: string
        }
        Insert: {
          consumer_name: string
          last_event_id?: number | null
          last_processed_at?: string | null
          updated_at?: string
        }
        Update: {
          consumer_name?: string
          last_event_id?: number | null
          last_processed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wag_raw_events: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_raw_events_2026_08: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_raw_events_2026_09: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_raw_events_2026_10: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_raw_events_2026_11: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_raw_events_2026_12: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_raw_events_2027_01: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_raw_events_2027_02: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_raw_events_2027_03: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_raw_events_default: {
        Row: {
          account_jid: string | null
          event_type: string
          id: number
          payload: Json
          received_at: string
        }
        Insert: {
          account_jid?: string | null
          event_type: string
          id?: never
          payload: Json
          received_at?: string
        }
        Update: {
          account_jid?: string | null
          event_type?: string
          id?: never
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      wag_reactions: {
        Row: {
          chat_jid: string
          emoji: string
          reacted_at: string
          reactor_jid: string
          target_sender_jid: string
          wa_message_id: string
        }
        Insert: {
          chat_jid: string
          emoji: string
          reacted_at?: string
          reactor_jid: string
          target_sender_jid: string
          wa_message_id: string
        }
        Update: {
          chat_jid?: string
          emoji?: string
          reacted_at?: string
          reactor_jid?: string
          target_sender_jid?: string
          wa_message_id?: string
        }
        Relationships: []
      }
      wag_receipts: {
        Row: {
          chat_jid: string
          delivered_at: string | null
          participant_jid: string
          played_at: string | null
          read_at: string | null
          updated_at: string
          wa_message_id: string
        }
        Insert: {
          chat_jid: string
          delivered_at?: string | null
          participant_jid: string
          played_at?: string | null
          read_at?: string | null
          updated_at?: string
          wa_message_id: string
        }
        Update: {
          chat_jid?: string
          delivered_at?: string | null
          participant_jid?: string
          played_at?: string | null
          read_at?: string | null
          updated_at?: string
          wa_message_id?: string
        }
        Relationships: []
      }
      wag_watcher_status: {
        Row: {
          account_jid: string | null
          beat_at: string
          connected: boolean
          id: number
          qr: string | null
          qr_at: string | null
          restart_requested_at: string | null
          state: string
          state_since: string
        }
        Insert: {
          account_jid?: string | null
          beat_at?: string
          connected?: boolean
          id?: number
          qr?: string | null
          qr_at?: string | null
          restart_requested_at?: string | null
          state?: string
          state_since?: string
        }
        Update: {
          account_jid?: string | null
          beat_at?: string
          connected?: boolean
          id?: number
          qr?: string | null
          qr_at?: string | null
          restart_requested_at?: string | null
          state?: string
          state_since?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_ticket_change: {
        Args: { p_event: Json; p_patch: Json; p_ticket_id: string }
        Returns: {
          assignee_id: string | null
          bishop_id: string | null
          brief: Json
          category: string
          checklist: Json
          closed_at: string | null
          created_at: string
          created_by: string | null
          created_by_kind: string
          first_responded_at: string | null
          first_response_due_at: string | null
          freshdesk_id: number | null
          group_jid: string | null
          handoff_department: string | null
          id: string
          item: string | null
          last_member_update_at: string | null
          member_id: string
          money: Json
          next_update_due_at: string | null
          next_wake_at: string | null
          origin: string
          origin_ref: Json
          priority: string
          priority_approved_at: string | null
          priority_approved_by: string | null
          proposed_by_run_id: string | null
          queendom_id: string | null
          requested_for: string | null
          resolution: string | null
          resolve_due_at: string | null
          satisfaction: number | null
          sentinel_state: Json
          status: string
          sub_category: string | null
          summary: string | null
          tags: string[]
          ticket_no: string
          title: string
          updated_at: string
          vendor_id: string | null
          wake_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_sentinel_wakes: {
        Args: { p_lease_min?: number; p_limit?: number; p_ticket_id?: string }
        Returns: {
          assignee_id: string | null
          bishop_id: string | null
          brief: Json
          category: string
          checklist: Json
          closed_at: string | null
          created_at: string
          created_by: string | null
          created_by_kind: string
          first_responded_at: string | null
          first_response_due_at: string | null
          freshdesk_id: number | null
          group_jid: string | null
          handoff_department: string | null
          id: string
          item: string | null
          last_member_update_at: string | null
          member_id: string
          money: Json
          next_update_due_at: string | null
          next_wake_at: string | null
          origin: string
          origin_ref: Json
          priority: string
          priority_approved_at: string | null
          priority_approved_by: string | null
          proposed_by_run_id: string | null
          queendom_id: string | null
          requested_for: string | null
          resolution: string | null
          resolve_due_at: string | null
          satisfaction: number | null
          sentinel_state: Json
          status: string
          sub_category: string | null
          summary: string | null
          tags: string[]
          ticket_no: string
          title: string
          updated_at: string
          vendor_id: string | null
          wake_reason: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_ticket: {
        Args: { p_event: Json; p_ticket: Json }
        Returns: {
          assignee_id: string | null
          bishop_id: string | null
          brief: Json
          category: string
          checklist: Json
          closed_at: string | null
          created_at: string
          created_by: string | null
          created_by_kind: string
          first_responded_at: string | null
          first_response_due_at: string | null
          freshdesk_id: number | null
          group_jid: string | null
          handoff_department: string | null
          id: string
          item: string | null
          last_member_update_at: string | null
          member_id: string
          money: Json
          next_update_due_at: string | null
          next_wake_at: string | null
          origin: string
          origin_ref: Json
          priority: string
          priority_approved_at: string | null
          priority_approved_by: string | null
          proposed_by_run_id: string | null
          queendom_id: string | null
          requested_for: string | null
          resolution: string | null
          resolve_due_at: string | null
          satisfaction: number | null
          sentinel_state: Json
          status: string
          sub_category: string | null
          summary: string | null
          tags: string[]
          ticket_no: string
          title: string
          updated_at: string
          vendor_id: string | null
          wake_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      intake_due_groups: {
        Args: { p_limit?: number; p_since?: string; p_statuses?: string[] }
        Returns: {
          cursor_at: string
          fail_count: number
          group_jid: string
          member_id: string
          newest_at: string
          queendom_id: string
        }[]
      }
      member_wa_group: { Args: { p_member_id: string }; Returns: string }
      profiler_broad_senders: {
        Args: { p_min_groups?: number }
        Returns: {
          groups: number
          sender_jid: string
        }[]
      }
      profiler_due_groups: {
        Args: { p_limit?: number; p_statuses?: string[] }
        Returns: {
          cursor_at: string
          fail_count: number
          group_jid: string
          member_id: string
          newest_at: string
        }[]
      }
      sentinel_sleep: {
        Args: {
          p_next_wake_at: string
          p_state: Json
          p_ticket_id: string
          p_wake_reason: string
        }
        Returns: undefined
      }
      wag_add_month_partition: {
        Args: { p_month: string; p_parent: string }
        Returns: undefined
      }
      wag_group_activity: {
        Args: never
        Returns: {
          chat_jid: string
          last_from_me: boolean
          last_is_revoked: boolean
          last_message_at: string
          last_sender_name: string
          last_text: string
          last_type: string
          message_count: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  freshdesk: {
    Enums: {},
  },
  gia: {
    Enums: {},
  },
  member: {
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
        "business",
        "house",
        "legacy",
      ],
      task_event_type: [
        "created",
        "status_changed",
        "reassigned",
        "remark_added",
        "overdue",
      ],
      task_module: ["gia", "sia", "core"],
      user_role: ["founder", "admin", "manager", "agent", "guest"],
    },
  },
  sia: {
    Enums: {},
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// HAND-WRITTEN below this line. Everything above is generated by
//   supabase gen types typescript --linked --schema public,sia,freshdesk,gia,member
// Re-generating replaces ONLY the block above; this tail must be carried over.
// ─────────────────────────────────────────────────────────────────────────────

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
  | 'ticket_assigned' | 'ticket_proposed' | 'ticket_sla_warning' | 'ticket_sla_breach' | 'ticket_member_replied' | 'ticket_member_unhappy' // hand-extended (migration 0195)

// sla_policies CHECK-constraint unions (migration 0111)
export type SlaTriggerKind   = 'status' | 'outcome' | 'task_due'
export type SlaRecipientRole = 'agent' | 'manager' | 'founder'
export type SlaHoursMode     = 'agent_shift' | 'business' | 'clock'

// ─────────────────────────────────────────────
// Table row types — extracted from Database namespace
// ─────────────────────────────────────────────

export type Profile = Omit<Database['public']['Tables']['profiles']['Row'], 'theme' | 'app_icon'> & {
  // Mirrors THEME_KEYS (src/lib/constants/themes.ts) + migration 0157
  theme: 'earth' | 'air' | 'water' | 'fire' | 'candy' | 'rose' | 'moss' | 'lilac'
  // Narrowed to the ICON_KEYS union (src/lib/constants/app-icons.ts) — the
  // app_icon column lands in the base Row as `string` until database.ts is
  // regenerated after migration 0121, the same posture as `theme`.
  app_icon: 'icon-1' | 'icon-2' | 'icon-3' | 'icon-4'
  // Mirrors APPEARANCE_KEYS (src/lib/constants/appearance.ts) + migration
  // 0158 — absent from the generated Row until the next regen, the same
  // posture as `theme`/`app_icon`.
  appearance: 'light' | 'dark' | 'system'
}
export type AdCreative       = Database['gia']['Tables']['ad_creatives']['Row']
export type LeadActivity     = Database['gia']['Tables']['lead_activities']['Row']
export type LeadNote         = Omit<Database['gia']['Tables']['lead_notes']['Row'], 'call_outcome'> & {
  call_outcome: CallOutcome | null
}
export type LeadRawPayload   = Omit<Database['gia']['Tables']['lead_raw_payloads']['Row'], 'payload'> & {
  payload: Record<string, unknown>
}
export type LeadSlaTimer     = Database['gia']['Tables']['lead_sla_timers']['Row']

// SlaPolicy — config row behind the Gia follow-up engine (migration 0111).
// Read per job run via sla-service.getSlaPolicies() — never cached at module scope.
export type SlaPolicy = Omit<
  Database['gia']['Tables']['sla_policies']['Row'],
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

// LeadProductEnquiry — one product enquiry from an app channel (migration 0180).
// One lead holds many; append-only, keyed for idempotency on external_lead_id.
export type LeadProductEnquiry = Database['gia']['Tables']['lead_product_enquiries']['Row']

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
  Database['gia']['Tables']['leads']['Row'],
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
  member_id:     string | null        // reserved for members module; always null for now
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
  domain:        AppDomain | null   // admin/founder + agent (additive narrowing) via parseGiaDomainParam()
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
