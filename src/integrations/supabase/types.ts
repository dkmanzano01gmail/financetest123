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
      account_balance_snapshots: {
        Row: {
          account_id: string
          balance_amount: number
          balance_date: string
          balance_type: Database["public"]["Enums"]["balance_snapshot_type"]
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          source: string | null
          workspace_id: string
        }
        Insert: {
          account_id: string
          balance_amount: number
          balance_date: string
          balance_type: Database["public"]["Enums"]["balance_snapshot_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          source?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string
          balance_amount?: number
          balance_date?: string
          balance_type?: Database["public"]["Enums"]["balance_snapshot_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          source?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balance_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_balance_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      account_reconciliations: {
        Row: {
          account_id: string
          calculated_balance: number
          created_at: string
          created_by: string | null
          difference_amount: number
          id: string
          notes: string | null
          period_end: string
          period_start: string
          reported_balance: number
          status: Database["public"]["Enums"]["reconciliation_status"]
          tolerance_amount: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          calculated_balance: number
          created_at?: string
          created_by?: string | null
          difference_amount: number
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          reported_balance: number
          status: Database["public"]["Enums"]["reconciliation_status"]
          tolerance_amount?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          calculated_balance?: number
          created_at?: string
          created_by?: string | null
          difference_amount?: number
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          reported_balance?: number
          status?: Database["public"]["Enums"]["reconciliation_status"]
          tolerance_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_reconciliations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          current_manual_balance: number | null
          current_manual_balance_date: string | null
          id: string
          initial_balance: number
          initial_balance_date: string
          institution: string | null
          is_active: boolean
          name: string
          notes: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          current_manual_balance?: number | null
          current_manual_balance_date?: string | null
          id?: string
          initial_balance?: number
          initial_balance_date?: string
          institution?: string | null
          is_active?: boolean
          name: string
          notes?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          current_manual_balance?: number | null
          current_manual_balance_date?: string | null
          id?: string
          initial_balance?: number
          initial_balance_date?: string
          institution?: string | null
          is_active?: boolean
          name?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          category_id: string
          created_at: string
          id: string
          month: number
          notes: string | null
          planned_amount: number
          updated_at: string
          workspace_id: string
          year: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          month: number
          notes?: string | null
          planned_amount?: number
          updated_at?: string
          workspace_id: string
          year: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          month?: number
          notes?: string | null
          planned_amount?: number
          updated_at?: string
          workspace_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          cut_priority: number
          icon: string | null
          id: string
          importance_comment: string | null
          importance_level: Database["public"]["Enums"]["importance_level"]
          is_active: boolean
          is_cuttable: boolean
          name: string
          type: Database["public"]["Enums"]["transaction_type"]
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          cut_priority?: number
          icon?: string | null
          id?: string
          importance_comment?: string | null
          importance_level?: Database["public"]["Enums"]["importance_level"]
          is_active?: boolean
          is_cuttable?: boolean
          name: string
          type: Database["public"]["Enums"]["transaction_type"]
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          cut_priority?: number
          icon?: string | null
          id?: string
          importance_comment?: string | null
          importance_level?: Database["public"]["Enums"]["importance_level"]
          is_active?: boolean
          is_cuttable?: boolean
          name?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          brand: string | null
          closing_day: number
          created_at: string
          due_day: number
          id: string
          institution: string | null
          is_active: boolean
          limit_amount: number
          name: string
          workspace_id: string
        }
        Insert: {
          brand?: string | null
          closing_day?: number
          created_at?: string
          due_day?: number
          id?: string
          institution?: string | null
          is_active?: boolean
          limit_amount?: number
          name: string
          workspace_id: string
        }
        Update: {
          brand?: string | null
          closing_day?: number
          created_at?: string
          due_day?: number
          id?: string
          institution?: string | null
          is_active?: boolean
          limit_amount?: number
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customization_credits: {
        Row: {
          created_at: string
          credits_included: number
          credits_used: number
          expires_at: string | null
          id: string
          period_month: number
          period_year: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          credits_included?: number
          credits_used?: number
          expires_at?: string | null
          id?: string
          period_month: number
          period_year: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          credits_included?: number
          credits_used?: number
          expires_at?: string | null
          id?: string
          period_month?: number
          period_year?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customization_credits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customization_requests: {
        Row: {
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          created_at: string
          estimated_credits: number
          id: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          rollback_payload: Json | null
          status: string
          tested_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          ai_classification_reason?: string | null
          ai_interpretation?: Json | null
          applied_customization_id?: string | null
          approved_at?: string | null
          approved_credits?: number | null
          auto_applied?: boolean
          completed_at?: string | null
          complexity?: string | null
          created_at?: string
          estimated_credits?: number
          id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          request_text: string
          request_type?: string
          rollback_payload?: Json | null
          status?: string
          tested_at?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          ai_classification_reason?: string | null
          ai_interpretation?: Json | null
          applied_customization_id?: string | null
          approved_at?: string | null
          approved_credits?: number | null
          auto_applied?: boolean
          completed_at?: string | null
          complexity?: string | null
          created_at?: string
          estimated_credits?: number
          id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          request_text?: string
          request_type?: string
          rollback_payload?: Json | null
          status?: string
          tested_at?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customization_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customization_usage: {
        Row: {
          created_at: string
          credits_used: number
          id: string
          request_id: string | null
          usage_reason: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          credits_used: number
          id?: string
          request_id?: string | null
          usage_reason?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          id?: string
          request_id?: string | null
          usage_reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customization_usage_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customization_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customization_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customizations: {
        Row: {
          configuration_json: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          is_testing: boolean
          menu_key: string | null
          name: string
          operation_payload: Json | null
          operation_type: string | null
          request_id: string | null
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          configuration_json?: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_testing?: boolean
          menu_key?: string | null
          name: string
          operation_payload?: Json | null
          operation_type?: string | null
          request_id?: string | null
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          configuration_json?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_testing?: boolean
          menu_key?: string | null
          name?: string
          operation_payload?: Json | null
          operation_type?: string | null
          request_id?: string | null
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customizations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customization_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      importance_rules: {
        Row: {
          amount_operator: string | null
          amount_value: number | null
          amount_value_2: number | null
          category_hint: string | null
          category_id: string | null
          confidence: number
          counterparty_match: string | null
          counterparty_match_mode: string | null
          created_at: string
          id: string
          importance_level: Database["public"]["Enums"]["importance_level"]
          is_active: boolean
          match_mode: string
          match_text: string | null
          notes: string | null
          priority: number
          recurrence_min_count: number | null
          recurrence_window_days: number | null
          rule_kind: string
          source_type: string
          transaction_type:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at: string
          workspace_id: string | null
          workspace_type: string | null
        }
        Insert: {
          amount_operator?: string | null
          amount_value?: number | null
          amount_value_2?: number | null
          category_hint?: string | null
          category_id?: string | null
          confidence?: number
          counterparty_match?: string | null
          counterparty_match_mode?: string | null
          created_at?: string
          id?: string
          importance_level: Database["public"]["Enums"]["importance_level"]
          is_active?: boolean
          match_mode?: string
          match_text?: string | null
          notes?: string | null
          priority?: number
          recurrence_min_count?: number | null
          recurrence_window_days?: number | null
          rule_kind?: string
          source_type?: string
          transaction_type?:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at?: string
          workspace_id?: string | null
          workspace_type?: string | null
        }
        Update: {
          amount_operator?: string | null
          amount_value?: number | null
          amount_value_2?: number | null
          category_hint?: string | null
          category_id?: string | null
          confidence?: number
          counterparty_match?: string | null
          counterparty_match_mode?: string | null
          created_at?: string
          id?: string
          importance_level?: Database["public"]["Enums"]["importance_level"]
          is_active?: boolean
          match_mode?: string
          match_text?: string | null
          notes?: string | null
          priority?: number
          recurrence_min_count?: number | null
          recurrence_window_days?: number | null
          rule_kind?: string
          source_type?: string
          transaction_type?:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          updated_at?: string
          workspace_id?: string | null
          workspace_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importance_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importance_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      super_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          credit_card_id: string | null
          date: string
          description: string
          id: string
          import_hash: string | null
          importance_confidence: number | null
          importance_confirmed_at: string | null
          importance_confirmed_by_user: boolean
          importance_level:
            | Database["public"]["Enums"]["importance_level"]
            | null
          importance_status:
            | Database["public"]["Enums"]["importance_status"]
            | null
          importance_suggestion_reason: string | null
          method: string | null
          month: number
          notes: string | null
          source: string
          status: Database["public"]["Enums"]["transaction_status"]
          suggested_category_id: string | null
          suggested_importance_level:
            | Database["public"]["Enums"]["importance_level"]
            | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          workspace_id: string
          year: number
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          credit_card_id?: string | null
          date: string
          description: string
          id?: string
          import_hash?: string | null
          importance_confidence?: number | null
          importance_confirmed_at?: string | null
          importance_confirmed_by_user?: boolean
          importance_level?:
            | Database["public"]["Enums"]["importance_level"]
            | null
          importance_status?:
            | Database["public"]["Enums"]["importance_status"]
            | null
          importance_suggestion_reason?: string | null
          method?: string | null
          month: number
          notes?: string | null
          source?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          suggested_category_id?: string | null
          suggested_importance_level?:
            | Database["public"]["Enums"]["importance_level"]
            | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          workspace_id: string
          year: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          credit_card_id?: string | null
          date?: string
          description?: string
          id?: string
          import_hash?: string | null
          importance_confidence?: number | null
          importance_confirmed_at?: string | null
          importance_confirmed_by_user?: boolean
          importance_level?:
            | Database["public"]["Enums"]["importance_level"]
            | null
          importance_status?:
            | Database["public"]["Enums"]["importance_status"]
            | null
          importance_suggestion_reason?: string | null
          method?: string | null
          month?: number
          notes?: string | null
          source?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          suggested_category_id?: string | null
          suggested_importance_level?:
            | Database["public"]["Enums"]["importance_level"]
            | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          workspace_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          country: string
          created_at: string
          currency: string
          id: string
          name: string
          owner_id: string
          plan: string
          privacy_mode: boolean
          type: Database["public"]["Enums"]["workspace_type"]
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          currency?: string
          id?: string
          name: string
          owner_id: string
          plan?: string
          privacy_mode?: boolean
          type?: Database["public"]["Enums"]["workspace_type"]
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string
          owner_id?: string
          plan?: string
          privacy_mode?: boolean
          type?: Database["public"]["Enums"]["workspace_type"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_approve_request: {
        Args: { _admin_note?: string; _request_id: string }
        Returns: {
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          created_at: string
          estimated_credits: number
          id: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          rollback_payload: Json | null
          status: string
          tested_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "customization_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_reject_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: {
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          created_at: string
          estimated_credits: number
          id: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          rollback_payload: Json | null
          status: string
          tested_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "customization_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_credits: {
        Args: {
          _credits: number
          _reason: string
          _request_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      ensure_current_credits: {
        Args: { _workspace_id: string }
        Returns: {
          created_at: string
          credits_included: number
          credits_used: number
          expires_at: string | null
          id: string
          period_month: number
          period_year: number
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "customization_credits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      user_approve_test: {
        Args: { _request_id: string }
        Returns: {
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          created_at: string
          estimated_credits: number
          id: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          rollback_payload: Json | null
          status: string
          tested_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "customization_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_reject_test: {
        Args: { _reason?: string; _request_id: string }
        Returns: {
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          created_at: string
          estimated_credits: number
          id: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          rollback_payload: Json | null
          status: string
          tested_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "customization_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      workspace_role_of: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      account_type: "checking" | "savings" | "cash" | "investment" | "other"
      balance_snapshot_type:
        | "initial"
        | "manual_current"
        | "reconciliation_check"
        | "adjustment"
      importance_level: "essential" | "important" | "flexible" | "superfluous"
      importance_status:
        | "suggested"
        | "confirmed"
        | "manually_changed"
        | "needs_review"
      reconciliation_status:
        | "reconciled"
        | "small_diff"
        | "relevant_diff"
        | "no_balance"
        | "needs_review"
      transaction_status: "confirmed" | "pending" | "ignored"
      transaction_type: "income" | "expense"
      workspace_role: "owner" | "member" | "viewer"
      workspace_type: "personal" | "business"
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
      account_type: ["checking", "savings", "cash", "investment", "other"],
      balance_snapshot_type: [
        "initial",
        "manual_current",
        "reconciliation_check",
        "adjustment",
      ],
      importance_level: ["essential", "important", "flexible", "superfluous"],
      importance_status: [
        "suggested",
        "confirmed",
        "manually_changed",
        "needs_review",
      ],
      reconciliation_status: [
        "reconciled",
        "small_diff",
        "relevant_diff",
        "no_balance",
        "needs_review",
      ],
      transaction_status: ["confirmed", "pending", "ignored"],
      transaction_type: ["income", "expense"],
      workspace_role: ["owner", "member", "viewer"],
      workspace_type: ["personal", "business"],
    },
  },
} as const
