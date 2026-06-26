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
      accounts: {
        Row: {
          billing_currency: string
          can_create_workspaces: boolean
          created_at: string
          id: string
          intent: string | null
          owner_id: string
          plan: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          billing_currency?: string
          can_create_workspaces?: boolean
          created_at?: string
          id?: string
          intent?: string | null
          owner_id: string
          plan?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_currency?: string
          can_create_workspaces?: boolean
          created_at?: string
          id?: string
          intent?: string | null
          owner_id?: string
          plan?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          agency_id: string | null
          created_at: string
          data: Json | null
          id: string
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          agency_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          agency_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          agency_id: string
          budget_cents: number | null
          client_id: string | null
          created_at: string
          data: Json | null
          id: string
          name: string
          platform: string
          spend_cents: number | null
          status: Database["public"]["Enums"]["campaign_status"]
        }
        Insert: {
          agency_id: string
          budget_cents?: number | null
          client_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          name: string
          platform: string
          spend_cents?: number | null
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Update: {
          agency_id?: string
          budget_cents?: number | null
          client_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          name?: string
          platform?: string
          spend_cents?: number | null
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agencies: {
        Row: {
          account_id: string | null
          brand_color: string | null
          brand_logo_url: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string | null
          updated_at: string
          workspace_type: string
        }
        Insert: {
          account_id?: string | null
          brand_color?: string | null
          brand_logo_url?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug?: string | null
          updated_at?: string
          workspace_type?: string
        }
        Update: {
          account_id?: string | null
          brand_color?: string | null
          brand_logo_url?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string | null
          updated_at?: string
          workspace_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agencies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agencies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_members: {
        Row: {
          agency_id: string
          ai_access_override: boolean | null
          created_at: string
          custom_role_id: string | null
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Insert: {
          agency_id: string
          ai_access_override?: boolean | null
          created_at?: string
          custom_role_id?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Update: {
          agency_id?: string
          ai_access_override?: boolean | null
          created_at?: string
          custom_role_id?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_members_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_members_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_settings: {
        Row: {
          agency_id: string
          data: Json
          updated_at: string
        }
        Insert: {
          agency_id: string
          data?: Json
          updated_at?: string
        }
        Update: {
          agency_id?: string
          data?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_settings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_role_defaults: {
        Row: {
          allowed_models: string[] | null
          can_access_knowledge: boolean
          can_use_actions: boolean
          created_at: string
          daily_message_limit: number | null
          description: string | null
          id: string
          monthly_token_limit: number | null
          role: string
          updated_at: string
        }
        Insert: {
          allowed_models?: string[] | null
          can_access_knowledge?: boolean
          can_use_actions?: boolean
          created_at?: string
          daily_message_limit?: number | null
          description?: string | null
          id?: string
          monthly_token_limit?: number | null
          role: string
          updated_at?: string
        }
        Update: {
          allowed_models?: string[] | null
          can_access_knowledge?: boolean
          can_use_actions?: boolean
          created_at?: string
          daily_message_limit?: number | null
          description?: string | null
          id?: string
          monthly_token_limit?: number | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_daily: {
        Row: {
          agency_id: string
          day: string
          id: string
          messages_sent: number
          tokens_input: number
          tokens_output: number
          user_id: string | null
        }
        Insert: {
          agency_id: string
          day?: string
          id?: string
          messages_sent?: number
          tokens_input?: number
          tokens_output?: number
          user_id?: string | null
        }
        Update: {
          agency_id?: string
          day?: string
          id?: string
          messages_sent?: number
          tokens_input?: number
          tokens_output?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_daily_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_hourly: {
        Row: {
          agency_id: string
          hour: string
          id: string
          messages_sent: number
          user_id: string | null
        }
        Insert: {
          agency_id: string
          hour: string
          id?: string
          messages_sent?: number
          user_id?: string | null
        }
        Update: {
          agency_id?: string
          hour?: string
          id?: string
          messages_sent?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_hourly_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_hourly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_recordings: {
        Row: {
          call_id: string
          created_at: string
          id: string
          summary: string | null
          transcript: string | null
          url: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          summary?: string | null
          transcript?: string | null
          url: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          summary?: string | null
          transcript?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_recordings_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agency_id: string
          client_id: string | null
          data: Json | null
          duration_sec: number | null
          external_id: string | null
          id: string
          member_id: string | null
          notes: string | null
          occurred_at: string
          outcome: string | null
        }
        Insert: {
          agency_id: string
          client_id?: string | null
          data?: Json | null
          duration_sec?: number | null
          external_id?: string | null
          id?: string
          member_id?: string | null
          notes?: string | null
          occurred_at?: string
          outcome?: string | null
        }
        Update: {
          agency_id?: string
          client_id?: string | null
          data?: Json | null
          duration_sec?: number | null
          external_id?: string | null
          id?: string
          member_id?: string | null
          notes?: string | null
          occurred_at?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          agency_id: string
          budget: number | null
          client_id: string | null
          created_at: string
          data: Json | null
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          agency_id: string
          budget?: number | null
          client_id?: string | null
          created_at?: string
          data?: Json | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          agency_id?: string
          budget?: number | null
          client_id?: string | null
          created_at?: string
          data?: Json | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_dashboard_configs: {
        Row: {
          client_id: string
          layout: Json
          updated_at: string
          visible_widgets: string[] | null
        }
        Insert: {
          client_id: string
          layout?: Json
          updated_at?: string
          visible_widgets?: string[] | null
        }
        Update: {
          client_id?: string
          layout?: Json
          updated_at?: string
          visible_widgets?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "client_dashboard_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_hub_links: {
        Row: {
          client_id: string
          icon: string | null
          id: string
          label: string
          sort_order: number
          url: string
        }
        Insert: {
          client_id: string
          icon?: string | null
          id?: string
          label: string
          sort_order?: number
          url: string
        }
        Update: {
          client_id?: string
          icon?: string | null
          id?: string
          label?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_hub_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_integrations: {
        Row: {
          client_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          provider: string
        }
        Insert: {
          client_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider: string
        }
        Update: {
          client_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_transactions: {
        Row: {
          agency_id: string
          amount: number
          client_id: string
          currency: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["transaction_kind"]
          metadata: Json | null
          occurred_at: string
        }
        Insert: {
          agency_id: string
          amount: number
          client_id: string
          currency?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["transaction_kind"]
          metadata?: Json | null
          occurred_at?: string
        }
        Update: {
          agency_id?: string
          amount?: number
          client_id?: string
          currency?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["transaction_kind"]
          metadata?: Json | null
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_transactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          client_id: string
          created_at: string
          id: string
          role: string
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          role?: string
          status?: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          role?: string
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agency_id: string
          created_at: string
          data: Json
          email: string | null
          id: string
          mrr: number | null
          name: string
          notes: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["client_status"]
          total_pending: number | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          data?: Json
          email?: string | null
          id?: string
          mrr?: number | null
          name: string
          notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          total_pending?: number | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          data?: Json
          email?: string | null
          id?: string
          mrr?: number | null
          name?: string
          notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          total_pending?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_assignments: {
        Row: {
          agency_id: string
          applies_to: string
          data: Json | null
          effective_date: string
          id: string
          member_id: string
          rate_pct: number
        }
        Insert: {
          agency_id: string
          applies_to?: string
          data?: Json | null
          effective_date?: string
          id?: string
          member_id: string
          rate_pct?: number
        }
        Update: {
          agency_id?: string
          applies_to?: string
          data?: Json | null
          effective_date?: string
          id?: string
          member_id?: string
          rate_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_assignments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          agency_id: string
          body: string | null
          client_id: string | null
          content_type: string | null
          created_at: string
          data: Json | null
          id: string
          scheduled_for: string | null
          status: string | null
          title: string
        }
        Insert: {
          agency_id: string
          body?: string | null
          client_id?: string | null
          content_type?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          scheduled_for?: string | null
          status?: string | null
          title: string
        }
        Update: {
          agency_id?: string
          body?: string | null
          client_id?: string | null
          content_type?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          scheduled_for?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          agency_id: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          agency_id: string
          amount: number | null
          client_id: string | null
          closed_at: string | null
          created_at: string
          currency: string
          data: Json | null
          expected_close_date: string | null
          id: string
          name: string
          owner_id: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          amount?: number | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          data?: Json | null
          expected_close_date?: string | null
          id?: string
          name: string
          owner_id?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          amount?: number | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          data?: Json | null
          expected_close_date?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      department_costs: {
        Row: {
          amount: number
          currency: string
          department_id: string
          id: string
          month: string
        }
        Insert: {
          amount?: number
          currency?: string
          department_id: string
          id?: string
          month: string
        }
        Update: {
          amount?: number
          currency?: string
          department_id?: string
          id?: string
          month?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_costs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_rhythm: {
        Row: {
          cadence: string
          data: Json | null
          department_id: string
          description: string | null
          id: string
          meeting_name: string | null
        }
        Insert: {
          cadence: string
          data?: Json | null
          department_id: string
          description?: string | null
          id?: string
          meeting_name?: string | null
        }
        Update: {
          cadence?: string
          data?: Json | null
          department_id?: string
          description?: string | null
          id?: string
          meeting_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_rhythm_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_sops: {
        Row: {
          body_md: string | null
          department_id: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string | null
          department_id: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string | null
          department_id?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_sops_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          agency_id: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          agency_id: string
          body_md: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          doc_type: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          body_md?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          body_md?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eoc_reports: {
        Row: {
          agency_id: string
          campaign_id: string | null
          client_id: string | null
          data: Json | null
          id: string
          submitted_at: string
          summary: string | null
        }
        Insert: {
          agency_id: string
          campaign_id?: string | null
          client_id?: string | null
          data?: Json | null
          id?: string
          submitted_at?: string
          summary?: string | null
        }
        Update: {
          agency_id?: string
          campaign_id?: string | null
          client_id?: string | null
          data?: Json | null
          id?: string
          submitted_at?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eoc_reports_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eoc_reports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eoc_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_form_templates: {
        Row: {
          agency_id: string
          created_at: string
          description: string | null
          fields: Json
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          description?: string | null
          fields?: Json
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          description?: string | null
          fields?: Json
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "eod_form_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_reports: {
        Row: {
          agency_id: string
          id: string
          member_id: string
          report_date: string
          responses: Json
          submitted_at: string
          template_id: string | null
        }
        Insert: {
          agency_id: string
          id?: string
          member_id: string
          report_date?: string
          responses?: Json
          submitted_at?: string
          template_id?: string | null
        }
        Update: {
          agency_id?: string
          id?: string
          member_id?: string
          report_date?: string
          responses?: Json
          submitted_at?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eod_reports_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_reports_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "eod_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          agency_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number | null
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          agency_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          agency_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          agency_id: string
          created_at: string
          current_value: number
          data: Json | null
          id: string
          name: string
          owner_id: string | null
          period_end: string | null
          period_start: string | null
          target_value: number
          unit: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string
          current_value?: number
          data?: Json | null
          id?: string
          name: string
          owner_id?: string | null
          period_end?: string | null
          period_start?: string | null
          target_value?: number
          unit?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string
          current_value?: number
          data?: Json | null
          id?: string
          name?: string
          owner_id?: string | null
          period_end?: string | null
          period_start?: string | null
          target_value?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      improvements: {
        Row: {
          agency_id: string
          attempt_count: number
          attempted_at: string | null
          created_at: string
          created_by: string | null
          data: Json | null
          description: string | null
          evidence: string | null
          files_touched: string[] | null
          id: string
          kind: Database["public"]["Enums"]["improvement_kind"]
          last_attempt_log: string | null
          priority: number
          proposed_fix: string | null
          resolved_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["improvement_status"]
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          attempt_count?: number
          attempted_at?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json | null
          description?: string | null
          evidence?: string | null
          files_touched?: string[] | null
          id?: string
          kind?: Database["public"]["Enums"]["improvement_kind"]
          last_attempt_log?: string | null
          priority?: number
          proposed_fix?: string | null
          resolved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["improvement_status"]
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          attempt_count?: number
          attempted_at?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json | null
          description?: string | null
          evidence?: string | null
          files_touched?: string[] | null
          id?: string
          kind?: Database["public"]["Enums"]["improvement_kind"]
          last_attempt_log?: string | null
          priority?: number
          proposed_fix?: string | null
          resolved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["improvement_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "improvements_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "improvements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          agency_id: string
          body: string | null
          created_at: string
          data: Json | null
          id: string
          kind: string
          resolved_at: string | null
          title: string
        }
        Insert: {
          agency_id: string
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          kind: string
          resolved_at?: string | null
          title: string
        }
        Update: {
          agency_id?: string
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          kind?: string
          resolved_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          agency_id: string
          created_at: string
          custom_role_id: string | null
          expires_at: string
          id: string
          invited_by: string | null
          invited_email: string
          role: Database["public"]["Enums"]["member_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id: string
          created_at?: string
          custom_role_id?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_email: string
          role?: Database["public"]["Enums"]["member_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string
          created_at?: string
          custom_role_id?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_email?: string
          role?: Database["public"]["Enums"]["member_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          doc_id: string
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_index: number
          content: string
          doc_id: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_index?: number
          content?: string
          doc_id?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "knowledge_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_docs: {
        Row: {
          agency_id: string
          content_text: string | null
          created_at: string
          id: string
          metadata: Json | null
          source_type: string | null
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          content_text?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          source_type?: string | null
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          content_text?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          source_type?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_docs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          agency_id: string
          created_at: string
          data: Json | null
          id: string
          link: string | null
          message: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          message?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          message?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          agency_id: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
        }
        Insert: {
          agency_id: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price: number
        }
        Update: {
          agency_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_reports: {
        Row: {
          agency_id: string
          created_at: string
          data: Json | null
          id: string
          member_id: string | null
          report_date: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          data?: Json | null
          id?: string
          member_id?: string | null
          report_date?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          data?: Json | null
          id?: string
          member_id?: string | null
          report_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_reports_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_reports_member_id_fkey"
            columns: ["member_id"]
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
          email: string
          full_name: string | null
          id: string
          is_super_admin: boolean
          notification_preferences: Json
          role: string | null
          theme_preference: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_super_admin?: boolean
          notification_preferences?: Json
          role?: string | null
          theme_preference?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          notification_preferences?: Json
          role?: string | null
          theme_preference?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          agency_id: string
          client_id: string | null
          created_at: string
          data: Json | null
          description: string | null
          due_date: string | null
          id: string
          name: string
          owner_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          client_id?: string | null
          created_at?: string
          data?: Json | null
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          owner_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          client_id?: string | null
          created_at?: string
          data?: Json | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotas: {
        Row: {
          agency_id: string
          currency: string
          effective_date: string
          id: string
          member_id: string
          period: string
          target_amount: number
        }
        Insert: {
          agency_id: string
          currency?: string
          effective_date?: string
          id?: string
          member_id: string
          period?: string
          target_amount: number
        }
        Update: {
          agency_id?: string
          currency?: string
          effective_date?: string
          id?: string
          member_id?: string
          period?: string
          target_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotas_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          name: string
          owner_id: string | null
          query: Json
          visualization: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          query?: Json
          visualization?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          query?: Json
          visualization?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_element_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          custom_role_id: string
          element_key: string
          id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          custom_role_id: string
          element_key: string
          id?: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          custom_role_id?: string
          element_key?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_element_permissions_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_page_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          custom_role_id: string
          id: string
          page_key: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          custom_role_id: string
          id?: string
          page_key: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          custom_role_id?: string
          id?: string
          page_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_page_permissions_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_workspace_access: {
        Row: {
          agency_ids: string[] | null
          custom_role_id: string
          id: string
          workspace_scope: string
        }
        Insert: {
          agency_ids?: string[] | null
          custom_role_id: string
          id?: string
          workspace_scope: string
        }
        Update: {
          agency_ids?: string[] | null
          custom_role_id?: string
          id?: string
          workspace_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_workspace_access_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: true
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      settoku_conversations: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settoku_conversations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settoku_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settoku_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          data: Json | null
          id: string
          role: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          data?: Json | null
          id?: string
          role: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          data?: Json | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "settoku_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "settoku_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      suggested_actions: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          kind: string
          payload: Json
          status: string
          user_id: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          status?: string
          user_id?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggested_actions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agency_id: string
          assignee_id: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          data: Json | null
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          agency_id: string
          amount: number
          client_id: string | null
          created_at: string
          currency: string
          description: string | null
          external_id: string | null
          id: string
          kind: Database["public"]["Enums"]["transaction_kind"]
          member_id: string | null
          metadata: Json | null
          occurred_at: string
        }
        Insert: {
          agency_id: string
          amount: number
          client_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["transaction_kind"]
          member_id?: string | null
          metadata?: Json | null
          occurred_at?: string
        }
        Update: {
          agency_id?: string
          amount?: number
          client_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["transaction_kind"]
          member_id?: string | null
          metadata?: Json | null
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_registrations: {
        Row: {
          client_id: string | null
          created_at: string
          data: Json
          email: string | null
          id: string
          last_send_error: string | null
          name: string | null
          phone: string | null
          registered_at: string
          sent_15m_at: string | null
          sent_1h_at: string | null
          sent_24h_at: string | null
          sent_live_at: string | null
          source: string | null
          webinar_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          data?: Json
          email?: string | null
          id?: string
          last_send_error?: string | null
          name?: string | null
          phone?: string | null
          registered_at?: string
          sent_15m_at?: string | null
          sent_1h_at?: string | null
          sent_24h_at?: string | null
          sent_live_at?: string | null
          source?: string | null
          webinar_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          data?: Json
          email?: string | null
          id?: string
          last_send_error?: string | null
          name?: string | null
          phone?: string | null
          registered_at?: string
          sent_15m_at?: string | null
          sent_1h_at?: string | null
          sent_24h_at?: string | null
          sent_live_at?: string | null
          source?: string | null
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_registrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_registrations_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinars: {
        Row: {
          agency_id: string
          created_at: string
          data: Json
          ends_at: string | null
          id: string
          join_url: string | null
          starts_at: string
          template_15m: string | null
          template_1h: string | null
          template_24h: string | null
          template_live: string | null
          title: string
          updated_at: string
          webinarjam_event_id: string | null
          zoom_meeting_id: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string
          data?: Json
          ends_at?: string | null
          id?: string
          join_url?: string | null
          starts_at: string
          template_15m?: string | null
          template_1h?: string | null
          template_24h?: string | null
          template_live?: string | null
          title: string
          updated_at?: string
          webinarjam_event_id?: string | null
          zoom_meeting_id?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string
          data?: Json
          ends_at?: string | null
          id?: string
          join_url?: string | null
          starts_at?: string
          template_15m?: string | null
          template_1h?: string | null
          template_24h?: string | null
          template_live?: string | null
          title?: string
          updated_at?: string
          webinarjam_event_id?: string | null
          zoom_meeting_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webinars_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ai_settings: {
        Row: {
          agency_id: string
          brand_voice_doc: string | null
          data: Json
          default_model: string
          knowledge_indexing_enabled: boolean
          updated_at: string
        }
        Insert: {
          agency_id: string
          brand_voice_doc?: string | null
          data?: Json
          default_model?: string
          knowledge_indexing_enabled?: boolean
          updated_at?: string
        }
        Update: {
          agency_id?: string
          brand_voice_doc?: string | null
          data?: Json
          default_model?: string
          knowledge_indexing_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ai_settings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_agency_admin: { Args: { target_agency: string }; Returns: boolean }
      is_agency_member: { Args: { target_agency: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      campaign_status: "draft" | "active" | "paused" | "completed" | "archived"
      client_status: "lead" | "active" | "paused" | "churned"
      improvement_kind:
        | "bug"
        | "tech_debt"
        | "feature"
        | "audit"
        | "security"
        | "perf"
        | "data_quality"
      improvement_status:
        | "open"
        | "in_progress"
        | "done"
        | "blocked"
        | "cancelled"
      member_role: "owner" | "admin" | "member" | "viewer"
      membership_status: "pending" | "active" | "suspended" | "removed"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "blocked" | "done" | "cancelled"
      transaction_kind: "payment" | "refund" | "chargeback" | "adjustment"
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
      campaign_status: ["draft", "active", "paused", "completed", "archived"],
      client_status: ["lead", "active", "paused", "churned"],
      improvement_kind: [
        "bug",
        "tech_debt",
        "feature",
        "audit",
        "security",
        "perf",
        "data_quality",
      ],
      improvement_status: [
        "open",
        "in_progress",
        "done",
        "blocked",
        "cancelled",
      ],
      member_role: ["owner", "admin", "member", "viewer"],
      membership_status: ["pending", "active", "suspended", "removed"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "blocked", "done", "cancelled"],
      transaction_kind: ["payment", "refund", "chargeback", "adjustment"],
    },
  },
} as const
