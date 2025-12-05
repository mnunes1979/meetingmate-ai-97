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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      alert_recipients: {
        Row: {
          alert_id: string
          created_at: string
          email: string
          id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_recipients_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_date: string
          created_at: string
          id: string
          renewal_id: string
          sent_at: string | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["alert_status"]
          updated_at: string
        }
        Insert: {
          alert_date: string
          created_at?: string
          id?: string
          renewal_id: string
          sent_at?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string
        }
        Update: {
          alert_date?: string
          created_at?: string
          id?: string
          renewal_id?: string
          sent_at?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_renewal_id_fkey"
            columns: ["renewal_id"]
            isOneToOne: false
            referencedRelation: "renewals"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key_audit_logs: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          ip_address: unknown
          key_name: string
          result: string | null
          service_name: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          key_name: string
          result?: string | null
          service_name: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          key_name?: string
          result?: string | null
          service_name?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          attendees: Json | null
          created_at: string
          description: string | null
          end_time: string
          error_message: string | null
          external_id: string | null
          id: string
          note_id: string
          start_time: string
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          created_at?: string
          description?: string | null
          end_time: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          note_id: string
          start_time: string
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json | null
          created_at?: string
          description?: string | null
          end_time?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          note_id?: string
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "meeting_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      department_emails: {
        Row: {
          created_at: string
          department_id: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_emails_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          file_size: number | null
          filename: string
          id: string
          mime_type: string
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          file_size?: number | null
          filename: string
          id?: string
          mime_type: string
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          file_size?: number | null
          filename?: string
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_actions: {
        Row: {
          audience: string
          body_md: string
          created_at: string
          error_message: string | null
          external_id: string | null
          id: string
          note_id: string
          recipients: Json | null
          sent_at: string | null
          status: string | null
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audience: string
          body_md: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          note_id: string
          recipients?: Json | null
          sent_at?: string | null
          status?: string | null
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audience?: string
          body_md?: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          note_id?: string
          recipients?: Json | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_actions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "meeting_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          created_at: string
          email_action_id: string | null
          event_data: Json | null
          event_type: string
          external_id: string | null
          id: string
          recipient_email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email_action_id?: string | null
          event_data?: Json | null
          event_type: string
          external_id?: string | null
          id?: string
          recipient_email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email_action_id?: string | null
          event_data?: Json | null
          event_type?: string
          external_id?: string | null
          id?: string
          recipient_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_email_action_id_fkey"
            columns: ["email_action_id"]
            isOneToOne: false
            referencedRelation: "email_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      extractions: {
        Row: {
          confidence: number | null
          created_at: string
          document_id: string
          evidence: string | null
          extracted_data: Json
          id: string
          quality_score: number | null
          service_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          document_id: string
          evidence?: string | null
          extracted_data: Json
          id?: string
          quality_score?: number | null
          service_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          document_id?: string
          evidence?: string | null
          extracted_data?: Json
          id?: string
          quality_score?: number | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extractions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notes: {
        Row: {
          action_items: Json | null
          created_at: string
          customer_company: string | null
          customer_name: string | null
          deleted_at: string | null
          id: string
          intents: Json | null
          language: string
          meeting_datetime: string | null
          meeting_duration_min: number | null
          opportunities: Json | null
          participants: Json | null
          raw_llm_output: Json | null
          risks: Json | null
          sales_rep_name: string | null
          sentiment: string
          sentiment_confidence: number | null
          sentiment_score: number | null
          summary: string
          topics: Json | null
          transcript_text: string
          transcript_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_items?: Json | null
          created_at?: string
          customer_company?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          id?: string
          intents?: Json | null
          language: string
          meeting_datetime?: string | null
          meeting_duration_min?: number | null
          opportunities?: Json | null
          participants?: Json | null
          raw_llm_output?: Json | null
          risks?: Json | null
          sales_rep_name?: string | null
          sentiment: string
          sentiment_confidence?: number | null
          sentiment_score?: number | null
          summary: string
          topics?: Json | null
          transcript_text: string
          transcript_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_items?: Json | null
          created_at?: string
          customer_company?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          id?: string
          intents?: Json | null
          language?: string
          meeting_datetime?: string | null
          meeting_duration_min?: number | null
          opportunities?: Json | null
          participants?: Json | null
          raw_llm_output?: Json | null
          risks?: Json | null
          sales_rep_name?: string | null
          sentiment?: string
          sentiment_confidence?: number | null
          sentiment_score?: number | null
          summary?: string
          topics?: Json | null
          transcript_text?: string
          transcript_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          id: string
          provider: string
          state_token: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          id?: string
          provider?: string
          state_token: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          id?: string
          provider?: string
          state_token?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          access_type: Database["public"]["Enums"]["access_type"]
          active: boolean
          allowed_email_domains: Json | null
          created_at: string
          department_id: string | null
          digest_email: string | null
          digest_hour: number | null
          email: string
          google_access_token: string | null
          google_calendar_id: string | null
          google_calendar_summary: string | null
          google_calendar_timezone: string | null
          google_linked: boolean | null
          google_refresh_token: string | null
          google_token_expires_at: string | null
          id: string
          name: string | null
          resend_webhook_secret: string | null
          retention_days: number | null
          timezone: string | null
          trello_api_key: string | null
          trello_api_token: string | null
          trello_board_id: string | null
          trello_board_name: string | null
          trello_linked: boolean | null
          trello_list_id: string | null
          trello_list_name: string | null
          updated_at: string
        }
        Insert: {
          access_type?: Database["public"]["Enums"]["access_type"]
          active?: boolean
          allowed_email_domains?: Json | null
          created_at?: string
          department_id?: string | null
          digest_email?: string | null
          digest_hour?: number | null
          email: string
          google_access_token?: string | null
          google_calendar_id?: string | null
          google_calendar_summary?: string | null
          google_calendar_timezone?: string | null
          google_linked?: boolean | null
          google_refresh_token?: string | null
          google_token_expires_at?: string | null
          id: string
          name?: string | null
          resend_webhook_secret?: string | null
          retention_days?: number | null
          timezone?: string | null
          trello_api_key?: string | null
          trello_api_token?: string | null
          trello_board_id?: string | null
          trello_board_name?: string | null
          trello_linked?: boolean | null
          trello_list_id?: string | null
          trello_list_name?: string | null
          updated_at?: string
        }
        Update: {
          access_type?: Database["public"]["Enums"]["access_type"]
          active?: boolean
          allowed_email_domains?: Json | null
          created_at?: string
          department_id?: string | null
          digest_email?: string | null
          digest_hour?: number | null
          email?: string
          google_access_token?: string | null
          google_calendar_id?: string | null
          google_calendar_summary?: string | null
          google_calendar_timezone?: string | null
          google_linked?: boolean | null
          google_refresh_token?: string | null
          google_token_expires_at?: string | null
          id?: string
          name?: string | null
          resend_webhook_secret?: string | null
          retention_days?: number | null
          timezone?: string | null
          trello_api_key?: string | null
          trello_api_token?: string | null
          trello_board_id?: string | null
          trello_board_name?: string | null
          trello_linked?: boolean | null
          trello_list_id?: string | null
          trello_list_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      renewal_settings: {
        Row: {
          created_at: string
          default_alert_offset_days: number
          default_recipients: string[] | null
          email_template_body: string | null
          email_template_subject: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_alert_offset_days?: number
          default_recipients?: string[] | null
          email_template_body?: string | null
          email_template_subject?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_alert_offset_days?: number
          default_recipients?: string[] | null
          email_template_body?: string | null
          email_template_subject?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      renewals: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          cycle: Database["public"]["Enums"]["renewal_cycle"]
          id: string
          notes: string | null
          renewal_date: string
          renewed_at: string | null
          service_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          cycle?: Database["public"]["Enums"]["renewal_cycle"]
          id?: string
          notes?: string | null
          renewal_date: string
          renewed_at?: string | null
          service_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          cycle?: Database["public"]["Enums"]["renewal_cycle"]
          id?: string
          notes?: string | null
          renewal_date?: string
          renewed_at?: string | null
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewals_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      security_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          provider_id: string
          service_name: string
          service_type: Database["public"]["Enums"]["service_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          provider_id: string
          service_name: string
          service_type: Database["public"]["Enums"]["service_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          provider_id?: string
          service_name?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          meeting_id: string | null
          priority: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      trello_cards: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          error_message: string | null
          external_id: string | null
          id: string
          labels: Json | null
          note_id: string
          status: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          labels?: Json | null
          note_id: string
          status?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          labels?: Json | null
          note_id?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trello_cards_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "meeting_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trello_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_can_manage_users: { Args: { _user_id: string }; Returns: boolean }
      cleanup_expired_data: { Args: never; Returns: undefined }
      get_google_access_token: {
        Args: { _user_id: string }
        Returns: {
          access_token: string
          expires_at: string
        }[]
      }
      get_google_token_status: {
        Args: { _user_id: string }
        Returns: {
          expires_at: string
          is_connected: boolean
          is_expired: boolean
        }[]
      }
      get_safe_profile: {
        Args: { profile_id: string }
        Returns: {
          active: boolean
          allowed_email_domains: Json
          created_at: string
          digest_email: string
          digest_hour: number
          email: string
          google_calendar_id: string
          google_calendar_summary: string
          google_calendar_timezone: string
          google_linked: boolean
          id: string
          name: string
          retention_days: number
          timezone: string
          trello_linked: boolean
          updated_at: string
        }[]
      }
      get_trello_credentials: {
        Args: { _user_id: string }
        Returns: {
          api_key: string
          api_token: string
          board_id: string
          list_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_google_calendar_connected: {
        Args: { _user_id: string }
        Returns: boolean
      }
      log_audit_event: {
        Args: {
          _action: string
          _metadata?: Json
          _resource_id?: string
          _resource_type: string
        }
        Returns: undefined
      }
      soft_delete_my_meeting_notes: { Args: never; Returns: number }
      update_oauth_tokens: {
        Args: {
          _google_access_token: string
          _google_refresh_token: string
          _google_token_expires_at: string
          _user_id: string
        }
        Returns: undefined
      }
      update_trello_config: {
        Args: {
          _api_key: string
          _api_token: string
          _board_id: string
          _board_name: string
          _list_id: string
          _list_name: string
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      access_type: "full" | "renewals_only"
      alert_status: "pending" | "sent" | "dismissed" | "snoozed"
      app_role: "admin" | "sales_rep"
      renewal_cycle: "annual" | "monthly" | "biennial" | "other"
      service_type:
        | "domain"
        | "hosting"
        | "vps"
        | "cdn"
        | "mx"
        | "ssl"
        | "other"
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
      access_type: ["full", "renewals_only"],
      alert_status: ["pending", "sent", "dismissed", "snoozed"],
      app_role: ["admin", "sales_rep"],
      renewal_cycle: ["annual", "monthly", "biennial", "other"],
      service_type: ["domain", "hosting", "vps", "cdn", "mx", "ssl", "other"],
    },
  },
} as const
