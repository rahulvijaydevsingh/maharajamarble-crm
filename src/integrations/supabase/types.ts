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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          activity_category: string
          activity_timestamp: string
          activity_type: string
          attachments: Json | null
          color: string | null
          created_at: string
          customer_id: string | null
          description: string | null
          icon: string | null
          id: string
          is_editable: boolean
          is_manual: boolean
          lead_id: string | null
          metadata: Json | null
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          updated_at: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          activity_category?: string
          activity_timestamp?: string
          activity_type: string
          attachments?: Json | null
          color?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_editable?: boolean
          is_manual?: boolean
          lead_id?: string | null
          metadata?: Json | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
          user_name?: string
        }
        Update: {
          activity_category?: string
          activity_timestamp?: string
          activity_type?: string
          attachments?: Json | null
          color?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_editable?: boolean
          is_manual?: boolean
          lead_id?: string | null
          metadata?: Json | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          is_pinned: boolean
          priority: string
          published_at: string | null
          scheduled_at: string | null
          target_audience: string
          target_roles: string[] | null
          target_user_ids: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          is_pinned?: boolean
          priority?: string
          published_at?: string | null
          scheduled_at?: string | null
          target_audience?: string
          target_roles?: string[] | null
          target_user_ids?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          is_pinned?: boolean
          priority?: string
          published_at?: string | null
          scheduled_at?: string | null
          target_audience?: string
          target_roles?: string[] | null
          target_user_ids?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_executions: {
        Row: {
          actions_attempted: number | null
          actions_failed: number | null
          actions_succeeded: number | null
          created_by: string
          entity_id: string
          entity_type: string
          error_details: string | null
          execution_duration_ms: number | null
          execution_log: Json | null
          id: string
          rule_id: string
          status: string
          trigger_timestamp: string
        }
        Insert: {
          actions_attempted?: number | null
          actions_failed?: number | null
          actions_succeeded?: number | null
          created_by?: string
          entity_id: string
          entity_type: string
          error_details?: string | null
          execution_duration_ms?: number | null
          execution_log?: Json | null
          id?: string
          rule_id: string
          status?: string
          trigger_timestamp?: string
        }
        Update: {
          actions_attempted?: number | null
          actions_failed?: number | null
          actions_succeeded?: number | null
          created_by?: string
          entity_id?: string
          entity_type?: string
          error_details?: string | null
          execution_duration_ms?: number | null
          execution_log?: Json | null
          id?: string
          rule_id?: string
          status?: string
          trigger_timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rule_executions_tracking: {
        Row: {
          entity_id: string
          execution_count: number | null
          id: string
          last_executed: string
          rule_id: string
        }
        Insert: {
          entity_id: string
          execution_count?: number | null
          id?: string
          last_executed?: string
          rule_id: string
        }
        Update: {
          entity_id?: string
          execution_count?: number | null
          id?: string
          last_executed?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rule_executions_tracking_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          active_days: string[] | null
          active_time_end: string | null
          active_time_start: string | null
          created_at: string
          created_by: string
          description: string | null
          entity_type: string
          exclude_conditions: Json | null
          execution_limit: string | null
          execution_order: number | null
          id: string
          is_active: boolean
          last_triggered: string | null
          max_executions: number | null
          rule_name: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          active_days?: string[] | null
          active_time_end?: string | null
          active_time_start?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          entity_type: string
          exclude_conditions?: Json | null
          execution_limit?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean
          last_triggered?: string | null
          max_executions?: number | null
          rule_name: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          active_days?: string[] | null
          active_time_end?: string | null
          active_time_start?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          entity_type?: string
          exclude_conditions?: Json | null
          execution_limit?: string | null
          execution_order?: number | null
          id?: string
          is_active?: boolean
          last_triggered?: string | null
          max_executions?: number | null
          rule_name?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      automation_templates: {
        Row: {
          actions: Json
          created_at: string
          description: string | null
          entity_type: string
          id: string
          is_system: boolean | null
          template_name: string
          trigger_config: Json
          trigger_type: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          description?: string | null
          entity_type: string
          id?: string
          is_system?: boolean | null
          template_name: string
          trigger_config?: Json
          trigger_type: string
        }
        Update: {
          actions?: Json
          created_at?: string
          description?: string | null
          entity_type?: string
          id?: string
          is_system?: boolean | null
          template_name?: string
          trigger_config?: Json
          trigger_type?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          pincode: string | null
          state: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      control_panel_option_values: {
        Row: {
          color: string | null
          created_at: string
          field_id: string
          id: string
          is_active: boolean
          is_default: boolean
          is_system_reserved: boolean
          label: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          field_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_system_reserved?: boolean
          label: string
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          color?: string | null
          created_at?: string
          field_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_system_reserved?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "control_panel_option_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "control_panel_options"
            referencedColumns: ["id"]
          },
        ]
      }
      control_panel_options: {
        Row: {
          allow_colors: boolean
          created_at: string
          display_name: string
          field_name: string
          id: string
          module_name: string
          updated_at: string
        }
        Insert: {
          allow_colors?: boolean
          created_at?: string
          display_name: string
          field_name: string
          id?: string
          module_name: string
          updated_at?: string
        }
        Update: {
          allow_colors?: boolean
          created_at?: string
          display_name?: string
          field_name?: string
          id?: string
          module_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          participant_1: string
          participant_2: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_1: string
          participant_2: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_1?: string
          participant_2?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_role_permissions: {
        Row: {
          created_at: string
          id: string
          permissions: string[]
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: string[]
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: string[]
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          alternate_phone: string | null
          assigned_to: string
          city: string | null
          company_name: string | null
          created_at: string
          created_by: string
          created_from_lead_id: string | null
          customer_type: string
          email: string | null
          id: string
          industry: string | null
          is_repeat_customer: boolean | null
          last_follow_up: string | null
          last_purchase: string | null
          lead_id: string | null
          name: string
          next_follow_up: string | null
          notes: string | null
          original_lead_id: string | null
          phone: string
          priority: number
          site_plus_code: string | null
          source: string | null
          status: string
          total_orders: number | null
          total_spent: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          assigned_to: string
          city?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string
          created_from_lead_id?: string | null
          customer_type?: string
          email?: string | null
          id?: string
          industry?: string | null
          is_repeat_customer?: boolean | null
          last_follow_up?: string | null
          last_purchase?: string | null
          lead_id?: string | null
          name: string
          next_follow_up?: string | null
          notes?: string | null
          original_lead_id?: string | null
          phone: string
          priority?: number
          site_plus_code?: string | null
          source?: string | null
          status?: string
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          assigned_to?: string
          city?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string
          created_from_lead_id?: string | null
          customer_type?: string
          email?: string | null
          id?: string
          industry?: string | null
          is_repeat_customer?: boolean | null
          last_follow_up?: string | null
          last_purchase?: string | null
          lead_id?: string | null
          name?: string
          next_follow_up?: string | null
          notes?: string | null
          original_lead_id?: string | null
          phone?: string
          priority?: number
          site_plus_code?: string | null
          source?: string | null
          status?: string
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_from_lead_id_fkey"
            columns: ["created_from_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_attachments: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          uploaded_by?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          uploaded_by?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          additional_contacts: Json | null
          address: string | null
          alternate_phone: string | null
          assigned_to: string
          construction_stage: string | null
          converted_at: string | null
          converted_to_customer_id: string | null
          created_at: string
          created_by: string
          created_from_customer_id: string | null
          designation: string
          email: string | null
          estimated_quantity: number | null
          firm_name: string | null
          id: string
          is_converted: boolean | null
          last_follow_up: string | null
          material_interests: string[] | null
          name: string
          next_follow_up: string | null
          notes: string | null
          phone: string
          priority: number
          referred_by: Json | null
          site_location: string | null
          site_photo_url: string | null
          site_plus_code: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          additional_contacts?: Json | null
          address?: string | null
          alternate_phone?: string | null
          assigned_to: string
          construction_stage?: string | null
          converted_at?: string | null
          converted_to_customer_id?: string | null
          created_at?: string
          created_by?: string
          created_from_customer_id?: string | null
          designation?: string
          email?: string | null
          estimated_quantity?: number | null
          firm_name?: string | null
          id?: string
          is_converted?: boolean | null
          last_follow_up?: string | null
          material_interests?: string[] | null
          name: string
          next_follow_up?: string | null
          notes?: string | null
          phone: string
          priority?: number
          referred_by?: Json | null
          site_location?: string | null
          site_photo_url?: string | null
          site_plus_code?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          additional_contacts?: Json | null
          address?: string | null
          alternate_phone?: string | null
          assigned_to?: string
          construction_stage?: string | null
          converted_at?: string | null
          converted_to_customer_id?: string | null
          created_at?: string
          created_by?: string
          created_from_customer_id?: string | null
          designation?: string
          email?: string | null
          estimated_quantity?: number | null
          firm_name?: string | null
          id?: string
          is_converted?: boolean | null
          last_follow_up?: string | null
          material_interests?: string[] | null
          name?: string
          next_follow_up?: string | null
          notes?: string | null
          phone?: string
          priority?: number
          referred_by?: Json | null
          site_location?: string | null
          site_photo_url?: string | null
          site_plus_code?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_to_customer_id_fkey"
            columns: ["converted_to_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_from_customer_id_fkey"
            columns: ["created_from_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_deleted: boolean
          is_edited: boolean
          message_type: string
          read_at: string | null
          read_by: string[] | null
          reply_to_id: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          message_type?: string
          read_at?: string | null
          read_by?: string[] | null
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_deleted?: boolean
          is_edited?: boolean
          message_type?: string
          read_at?: string | null
          read_by?: string[] | null
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          message: string | null
          priority: string | null
          related_automation_rule_id: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message?: string | null
          priority?: string | null
          related_automation_rule_id?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message?: string | null
          priority?: string | null
          related_automation_rule_id?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_automation_rule_id_fkey"
            columns: ["related_automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          address: string | null
          alternate_phone: string | null
          assigned_to: string
          city: string | null
          created_at: string
          created_by: string
          email: string | null
          firm_name: string | null
          id: string
          last_follow_up: string | null
          name: string
          next_follow_up: string | null
          notes: string | null
          phone: string
          priority: number
          professional_type: string
          rating: number | null
          referred_by: Json | null
          service_category: string | null
          site_plus_code: string | null
          status: string
          total_projects: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          assigned_to: string
          city?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          firm_name?: string | null
          id?: string
          last_follow_up?: string | null
          name: string
          next_follow_up?: string | null
          notes?: string | null
          phone: string
          priority?: number
          professional_type?: string
          rating?: number | null
          referred_by?: Json | null
          service_category?: string | null
          site_plus_code?: string | null
          status?: string
          total_projects?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          assigned_to?: string
          city?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          firm_name?: string | null
          id?: string
          last_follow_up?: string | null
          name?: string
          next_follow_up?: string | null
          notes?: string | null
          phone?: string
          priority?: number
          professional_type?: string
          rating?: number | null
          referred_by?: Json | null
          service_category?: string | null
          site_plus_code?: string | null
          status?: string
          total_projects?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quotation_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          quotation_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          quotation_id: string
          uploaded_by?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          quotation_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_attachments_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          item_name: string
          quantity: number
          quotation_id: string
          rate: number
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          item_name: string
          quantity?: number
          quotation_id: string
          rate?: number
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          item_name?: string
          quantity?: number
          quotation_id?: string
          rate?: number
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          assigned_to: string
          client_address: string | null
          client_email: string | null
          client_id: string | null
          client_name: string
          client_phone: string | null
          client_type: string
          created_at: string
          created_by: string
          gst_amount: number
          gst_percentage: number
          id: string
          notes: string | null
          quotation_date: string
          quotation_number: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          assigned_to: string
          client_address?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name: string
          client_phone?: string | null
          client_type?: string
          created_at?: string
          created_by?: string
          gst_amount?: number
          gst_percentage?: number
          id?: string
          notes?: string | null
          quotation_date?: string
          quotation_number: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          assigned_to?: string
          client_address?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          client_phone?: string | null
          client_type?: string
          created_at?: string
          created_by?: string
          gst_amount?: number
          gst_percentage?: number
          id?: string
          notes?: string | null
          quotation_date?: string
          quotation_number?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          assigned_to: string
          created_at: string
          created_by: string
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          is_dismissed: boolean
          is_recurring: boolean
          is_snoozed: boolean
          recurrence_end_date: string | null
          recurrence_pattern: string | null
          reminder_datetime: string
          snooze_until: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          created_at?: string
          created_by: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          is_dismissed?: boolean
          is_recurring?: boolean
          is_snoozed?: boolean
          recurrence_end_date?: string | null
          recurrence_pattern?: string | null
          reminder_datetime: string
          snooze_until?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          created_at?: string
          created_by?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          is_dismissed?: boolean
          is_recurring?: boolean
          is_snoozed?: boolean
          recurrence_end_date?: string | null
          recurrence_pattern?: string | null
          reminder_datetime?: string
          snooze_until?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_filter_monitoring: {
        Row: {
          count_trend: string | null
          created_at: string
          current_count: number | null
          filter_id: string
          has_active_triggers: boolean | null
          id: string
          last_checked: string | null
          last_count_change: string | null
          previous_count: number | null
          updated_at: string
        }
        Insert: {
          count_trend?: string | null
          created_at?: string
          current_count?: number | null
          filter_id: string
          has_active_triggers?: boolean | null
          id?: string
          last_checked?: string | null
          last_count_change?: string | null
          previous_count?: number | null
          updated_at?: string
        }
        Update: {
          count_trend?: string | null
          created_at?: string
          current_count?: number | null
          filter_id?: string
          has_active_triggers?: boolean | null
          id?: string
          last_checked?: string | null
          last_count_change?: string | null
          previous_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_filter_monitoring_filter_id_fkey"
            columns: ["filter_id"]
            isOneToOne: false
            referencedRelation: "saved_filters"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_filters: {
        Row: {
          created_at: string
          created_by: string
          entity_type: string
          filter_config: Json
          id: string
          is_default: boolean
          is_shared: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          entity_type?: string
          filter_config?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_type?: string
          filter_config?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_activity_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          notes: string | null
          task_id: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          notes?: string | null
          task_id: string
          user_id?: string | null
          user_name?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          notes?: string | null
          task_id?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_completion_templates: {
        Row: {
          created_at: string
          default_completion_status: string | null
          default_next_action_payload: Json | null
          default_next_action_type: string | null
          default_outcome: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          task_type: string
          template_notes: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_completion_status?: string | null
          default_next_action_payload?: Json | null
          default_next_action_type?: string | null
          default_outcome?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          task_type: string
          template_notes: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_completion_status?: string | null
          default_next_action_payload?: Json | null
          default_next_action_type?: string | null
          default_outcome?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          task_type?: string
          template_notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_snooze_history: {
        Row: {
          created_at: string
          created_by: string
          id: string
          original_due_date: string
          original_due_time: string | null
          snooze_reason: string | null
          snoozed_until: string
          task_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          original_due_date: string
          original_due_time?: string | null
          snooze_reason?: string | null
          snoozed_until: string
          task_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          original_due_date?: string
          original_due_time?: string | null
          snooze_reason?: string | null
          snoozed_until?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_snooze_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_subtasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          id: string
          is_completed: boolean | null
          sort_order: number | null
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          sort_order?: number | null
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          sort_order?: number | null
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_time_spent_minutes: number | null
          assigned_to: string
          attempt_count: number
          completed_at: string | null
          completion_key_points: Json | null
          completion_notes: string | null
          completion_outcome: string | null
          completion_status: string | null
          created_at: string
          created_by: string
          deal_ready: boolean
          deal_ready_at: string | null
          description: string | null
          due_date: string
          due_time: string | null
          id: string
          is_recurring: boolean | null
          is_starred: boolean | null
          last_attempt_at: string | null
          lead_id: string | null
          max_attempts: number | null
          next_action_payload: Json | null
          next_action_type: string | null
          original_due_date: string | null
          parent_task_id: string | null
          priority: string
          recurrence_day_of_month: number | null
          recurrence_days_of_week: string[] | null
          recurrence_end_date: string | null
          recurrence_end_type: string | null
          recurrence_frequency: string | null
          recurrence_interval: number | null
          recurrence_month: number | null
          recurrence_occurrences_count: number | null
          recurrence_occurrences_limit: number | null
          recurrence_reset_from_completion: boolean | null
          related_entity_id: string | null
          related_entity_type: string | null
          reminder: boolean | null
          reminder_time: string | null
          snoozed_until: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          actual_time_spent_minutes?: number | null
          assigned_to: string
          attempt_count?: number
          completed_at?: string | null
          completion_key_points?: Json | null
          completion_notes?: string | null
          completion_outcome?: string | null
          completion_status?: string | null
          created_at?: string
          created_by?: string
          deal_ready?: boolean
          deal_ready_at?: string | null
          description?: string | null
          due_date: string
          due_time?: string | null
          id?: string
          is_recurring?: boolean | null
          is_starred?: boolean | null
          last_attempt_at?: string | null
          lead_id?: string | null
          max_attempts?: number | null
          next_action_payload?: Json | null
          next_action_type?: string | null
          original_due_date?: string | null
          parent_task_id?: string | null
          priority?: string
          recurrence_day_of_month?: number | null
          recurrence_days_of_week?: string[] | null
          recurrence_end_date?: string | null
          recurrence_end_type?: string | null
          recurrence_frequency?: string | null
          recurrence_interval?: number | null
          recurrence_month?: number | null
          recurrence_occurrences_count?: number | null
          recurrence_occurrences_limit?: number | null
          recurrence_reset_from_completion?: boolean | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          reminder?: boolean | null
          reminder_time?: string | null
          snoozed_until?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          actual_time_spent_minutes?: number | null
          assigned_to?: string
          attempt_count?: number
          completed_at?: string | null
          completion_key_points?: Json | null
          completion_notes?: string | null
          completion_outcome?: string | null
          completion_status?: string | null
          created_at?: string
          created_by?: string
          deal_ready?: boolean
          deal_ready_at?: string | null
          description?: string | null
          due_date?: string
          due_time?: string | null
          id?: string
          is_recurring?: boolean | null
          is_starred?: boolean | null
          last_attempt_at?: string | null
          lead_id?: string | null
          max_attempts?: number | null
          next_action_payload?: Json | null
          next_action_type?: string | null
          original_due_date?: string | null
          parent_task_id?: string | null
          priority?: string
          recurrence_day_of_month?: number | null
          recurrence_days_of_week?: string[] | null
          recurrence_end_date?: string | null
          recurrence_end_type?: string | null
          recurrence_frequency?: string | null
          recurrence_interval?: number | null
          recurrence_month?: number | null
          recurrence_occurrences_count?: number | null
          recurrence_occurrences_limit?: number | null
          recurrence_reset_from_completion?: boolean | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          reminder?: boolean | null
          reminder_time?: string | null
          snoozed_until?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_items: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          converted_to_task_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          is_completed: boolean | null
          is_starred: boolean | null
          list_id: string
          notes: string | null
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          converted_to_task_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          is_starred?: boolean | null
          list_id: string
          notes?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          converted_to_task_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          is_starred?: boolean | null
          list_id?: string
          notes?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_items_converted_to_task_id_fkey"
            columns: ["converted_to_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "todo_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_lists: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          icon: string | null
          id: string
          is_archived: boolean | null
          is_pinned: boolean | null
          is_shared: boolean | null
          name: string
          shared_with: string[] | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean | null
          is_pinned?: boolean | null
          is_shared?: boolean | null
          name: string
          shared_with?: string[] | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean | null
          is_pinned?: boolean | null
          is_shared?: boolean | null
          name?: string
          shared_with?: string[] | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_status: {
        Row: {
          is_online: boolean
          last_seen: string
          user_id: string
        }
        Insert: {
          is_online?: boolean
          last_seen?: string
          user_id: string
        }
        Update: {
          is_online?: boolean
          last_seen?: string
          user_id?: string
        }
        Relationships: []
      }
      user_table_preferences: {
        Row: {
          column_config: Json
          created_at: string
          id: string
          table_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          column_config?: Json
          created_at?: string
          id?: string
          table_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          column_config?: Json
          created_at?: string
          id?: string
          table_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_user_email: { Args: never; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "manager"
        | "sales_user"
        | "sales_viewer"
        | "field_agent"
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
      app_role: [
        "super_admin",
        "admin",
        "manager",
        "sales_user",
        "sales_viewer",
        "field_agent",
      ],
    },
  },
} as const
