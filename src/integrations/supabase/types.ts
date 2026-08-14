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
      attendance_records: {
        Row: {
          class_name: string | null
          comments: string | null
          confirmed_at: string | null
          created_at: string
          generates_makeup: boolean | null
          id: string
          legacy_source_id: string | null
          makeup_completed: boolean | null
          makeup_reference: string | null
          makeups_available_in_month: number | null
          makeups_used_in_month: number | null
          record_type: string | null
          session_date: string
          session_time: string | null
          status: string
          student_name: string
          updated_at: string
          weekday: number | null
          workspace_id: string
        }
        Insert: {
          class_name?: string | null
          comments?: string | null
          confirmed_at?: string | null
          created_at?: string
          generates_makeup?: boolean | null
          id?: string
          legacy_source_id?: string | null
          makeup_completed?: boolean | null
          makeup_reference?: string | null
          makeups_available_in_month?: number | null
          makeups_used_in_month?: number | null
          record_type?: string | null
          session_date: string
          session_time?: string | null
          status?: string
          student_name: string
          updated_at?: string
          weekday?: number | null
          workspace_id: string
        }
        Update: {
          class_name?: string | null
          comments?: string | null
          confirmed_at?: string | null
          created_at?: string
          generates_makeup?: boolean | null
          id?: string
          legacy_source_id?: string | null
          makeup_completed?: boolean | null
          makeup_reference?: string | null
          makeups_available_in_month?: number | null
          makeups_used_in_month?: number | null
          record_type?: string | null
          session_date?: string
          session_time?: string | null
          status?: string
          student_name?: string
          updated_at?: string
          weekday?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_workspace_id_fkey"
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
      cash_flow_entries: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          day_of_month: number | null
          description: string
          entry_date: string
          id: string
          is_active: boolean
          legacy_source_id: string | null
          notes: string | null
          recurrence: string
          specific_date: string | null
          status: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          description: string
          entry_date: string
          id?: string
          is_active?: boolean
          legacy_source_id?: string | null
          notes?: string | null
          recurrence?: string
          specific_date?: string | null
          status?: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          description?: string
          entry_date?: string
          id?: string
          is_active?: boolean
          legacy_source_id?: string | null
          notes?: string | null
          recurrence?: string
          specific_date?: string | null
          status?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_monthly_balances: {
        Row: {
          balance_month: string
          starting_balance: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance_month: string
          starting_balance?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance_month?: string
          starting_balance?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_monthly_balances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_settings: {
        Row: {
          notes: string | null
          starting_balance: number
          starting_balance_date: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          notes?: string | null
          starting_balance?: number
          starting_balance_date?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          notes?: string | null
          starting_balance?: number
          starting_balance_date?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
      class_material_settings: {
        Row: {
          fixed_monthly_fee: number
          kiln_firing_profit_percent: number
          margin_percent: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          fixed_monthly_fee?: number
          kiln_firing_profit_percent?: number
          margin_percent?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          fixed_monthly_fee?: number
          kiln_firing_profit_percent?: number
          margin_percent?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_material_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      class_materials_usage: {
        Row: {
          amount_charged: number
          amount_paid: number
          amount_pending: number
          biscuit_firing_cost: number
          charge_biscuit: boolean
          charge_glaze: boolean
          clay_cost: number
          clay_type: string | null
          clay_weight_kg: number
          comments: string | null
          completed_at: string | null
          created_at: string
          depth_cm: number
          freight_cost: number
          freight_rate: number
          glaze_cone: string | null
          glaze_cost: number
          glaze_firing_cost: number
          glaze_name: string | null
          glaze_quantity: number
          grams: number
          height_cm: number
          id: string
          kiln_id: string | null
          legacy_source_id: string | null
          length_cm: number
          material: string
          other_cost: number
          payment_date: string | null
          payment_notes: string | null
          payment_status: string
          piece_name: string | null
          production_status: string
          quantity: number
          resistance_only: boolean
          student_id: string | null
          student_name: string
          total_cost: number
          updated_at: string
          usage_date: string
          workspace_id: string
        }
        Insert: {
          amount_charged?: number
          amount_paid?: number
          amount_pending?: number
          biscuit_firing_cost?: number
          charge_biscuit?: boolean
          charge_glaze?: boolean
          clay_cost?: number
          clay_type?: string | null
          clay_weight_kg?: number
          comments?: string | null
          completed_at?: string | null
          created_at?: string
          depth_cm?: number
          freight_cost?: number
          freight_rate?: number
          glaze_cone?: string | null
          glaze_cost?: number
          glaze_firing_cost?: number
          glaze_name?: string | null
          glaze_quantity?: number
          grams?: number
          height_cm?: number
          id?: string
          kiln_id?: string | null
          legacy_source_id?: string | null
          length_cm?: number
          material: string
          other_cost?: number
          payment_date?: string | null
          payment_notes?: string | null
          payment_status?: string
          piece_name?: string | null
          production_status?: string
          quantity?: number
          resistance_only?: boolean
          student_id?: string | null
          student_name: string
          total_cost?: number
          updated_at?: string
          usage_date?: string
          workspace_id: string
        }
        Update: {
          amount_charged?: number
          amount_paid?: number
          amount_pending?: number
          biscuit_firing_cost?: number
          charge_biscuit?: boolean
          charge_glaze?: boolean
          clay_cost?: number
          clay_type?: string | null
          clay_weight_kg?: number
          comments?: string | null
          completed_at?: string | null
          created_at?: string
          depth_cm?: number
          freight_cost?: number
          freight_rate?: number
          glaze_cone?: string | null
          glaze_cost?: number
          glaze_firing_cost?: number
          glaze_name?: string | null
          glaze_quantity?: number
          grams?: number
          height_cm?: number
          id?: string
          kiln_id?: string | null
          legacy_source_id?: string | null
          length_cm?: number
          material?: string
          other_cost?: number
          payment_date?: string | null
          payment_notes?: string | null
          payment_status?: string
          piece_name?: string | null
          production_status?: string
          quantity?: number
          resistance_only?: boolean
          student_id?: string | null
          student_name?: string
          total_cost?: number
          updated_at?: string
          usage_date?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_materials_usage_kiln_id_fkey"
            columns: ["kiln_id"]
            isOneToOne: false
            referencedRelation: "kilns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_materials_usage_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_materials_usage_workspace_id_fkey"
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
          target_scope: string
          target_user_id: string | null
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
          target_scope?: string
          target_user_id?: string | null
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
          target_scope?: string
          target_user_id?: string | null
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
          target_scope: string
          target_user_id: string | null
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
          target_scope?: string
          target_user_id?: string | null
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
          target_scope?: string
          target_user_id?: string | null
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
      feedback_comments: {
        Row: {
          comment: string
          created_at: string
          created_by: string | null
          device: string | null
          id: string
          page: string
          status: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          created_by?: string | null
          device?: string | null
          id?: string
          page?: string
          status?: string
          type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          created_by?: string | null
          device?: string | null
          id?: string
          page?: string
          status?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      firing_pieces: {
        Row: {
          charge_amount: number
          charge_customer: boolean
          created_at: string
          customer_name: string | null
          depth_cm: number
          firing_id: string
          height_cm: number
          id: string
          internal_cost: number
          length_cm: number
          notes: string | null
          piece_name: string
          quantity: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          charge_amount?: number
          charge_customer?: boolean
          created_at?: string
          customer_name?: string | null
          depth_cm?: number
          firing_id: string
          height_cm?: number
          id?: string
          internal_cost?: number
          length_cm?: number
          notes?: string | null
          piece_name: string
          quantity?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          charge_amount?: number
          charge_customer?: boolean
          created_at?: string
          customer_name?: string | null
          depth_cm?: number
          firing_id?: string
          height_cm?: number
          id?: string
          internal_cost?: number
          length_cm?: number
          notes?: string | null
          piece_name?: string
          quantity?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firing_pieces_firing_id_fkey"
            columns: ["firing_id"]
            isOneToOne: false
            referencedRelation: "firing_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firing_pieces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      firing_pricing: {
        Row: {
          cone: string | null
          created_at: string
          firing_date: string | null
          firing_type: string
          id: string
          kiln_id: string | null
          notes: string | null
          profit: number
          reference: string
          total_charges: number
          total_internal_cost: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cone?: string | null
          created_at?: string
          firing_date?: string | null
          firing_type?: string
          id?: string
          kiln_id?: string | null
          notes?: string | null
          profit?: number
          reference?: string
          total_charges?: number
          total_internal_cost?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cone?: string | null
          created_at?: string
          firing_date?: string | null
          firing_type?: string
          id?: string
          kiln_id?: string | null
          notes?: string | null
          profit?: number
          reference?: string
          total_charges?: number
          total_internal_cost?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firing_pricing_kiln_id_fkey"
            columns: ["kiln_id"]
            isOneToOne: false
            referencedRelation: "kilns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firing_pricing_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      firing_settings: {
        Row: {
          area_adjustment: number
          biscuit_hours: number
          biscuit_resistance_burns: number
          biscuit_utilization: number
          customer_margin_percent: number
          final_buffer: number
          glaze_hours: number
          glaze10_hours: number
          glaze10_resistance_burns: number
          glaze10_utilization: number
          glaze6_hours: number
          glaze6_resistance_burns: number
          glaze6_utilization: number
          glaze7_hours: number
          glaze7_resistance_burns: number
          glaze7_utilization: number
          kwh_cost: number
          oven_diameter_cm: number
          power_kw: number
          resistance_burns: number
          resistance_cost: number
          updated_at: string
          utilization: number
          workspace_id: string
        }
        Insert: {
          area_adjustment?: number
          biscuit_hours?: number
          biscuit_resistance_burns?: number
          biscuit_utilization?: number
          customer_margin_percent?: number
          final_buffer?: number
          glaze_hours?: number
          glaze10_hours?: number
          glaze10_resistance_burns?: number
          glaze10_utilization?: number
          glaze6_hours?: number
          glaze6_resistance_burns?: number
          glaze6_utilization?: number
          glaze7_hours?: number
          glaze7_resistance_burns?: number
          glaze7_utilization?: number
          kwh_cost?: number
          oven_diameter_cm?: number
          power_kw?: number
          resistance_burns?: number
          resistance_cost?: number
          updated_at?: string
          utilization?: number
          workspace_id: string
        }
        Update: {
          area_adjustment?: number
          biscuit_hours?: number
          biscuit_resistance_burns?: number
          biscuit_utilization?: number
          customer_margin_percent?: number
          final_buffer?: number
          glaze_hours?: number
          glaze10_hours?: number
          glaze10_resistance_burns?: number
          glaze10_utilization?: number
          glaze6_hours?: number
          glaze6_resistance_burns?: number
          glaze6_utilization?: number
          glaze7_hours?: number
          glaze7_resistance_burns?: number
          glaze7_utilization?: number
          kwh_cost?: number
          oven_diameter_cm?: number
          power_kw?: number
          resistance_burns?: number
          resistance_cost?: number
          updated_at?: string
          utilization?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firing_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
            Database["public"]["Enums"]["transaction_type"] | null
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
            Database["public"]["Enums"]["transaction_type"] | null
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
            Database["public"]["Enums"]["transaction_type"] | null
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
      kilns: {
        Row: {
          area_adjustment: number
          biscuit_hours: number
          biscuit_resistance_burns: number
          biscuit_utilization: number
          brand: string | null
          created_at: string
          customer_margin_percent: number
          final_buffer: number
          glaze_hours: number
          glaze10_hours: number
          glaze10_resistance_burns: number
          glaze10_utilization: number
          glaze6_hours: number
          glaze6_resistance_burns: number
          glaze6_utilization: number
          glaze7_hours: number
          glaze7_resistance_burns: number
          glaze7_utilization: number
          id: string
          is_active: boolean
          is_default: boolean
          kwh_cost: number
          model: string | null
          name: string
          notes: string | null
          oven_diameter_cm: number
          power_kw: number
          resistance_burns: number
          resistance_cost: number
          serial_number: string | null
          updated_at: string
          utilization: number
          workspace_id: string
        }
        Insert: {
          area_adjustment?: number
          biscuit_hours?: number
          biscuit_resistance_burns?: number
          biscuit_utilization?: number
          brand?: string | null
          created_at?: string
          customer_margin_percent?: number
          final_buffer?: number
          glaze_hours?: number
          glaze10_hours?: number
          glaze10_resistance_burns?: number
          glaze10_utilization?: number
          glaze6_hours?: number
          glaze6_resistance_burns?: number
          glaze6_utilization?: number
          glaze7_hours?: number
          glaze7_resistance_burns?: number
          glaze7_utilization?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          kwh_cost?: number
          model?: string | null
          name: string
          notes?: string | null
          oven_diameter_cm?: number
          power_kw?: number
          resistance_burns?: number
          resistance_cost?: number
          serial_number?: string | null
          updated_at?: string
          utilization?: number
          workspace_id: string
        }
        Update: {
          area_adjustment?: number
          biscuit_hours?: number
          biscuit_resistance_burns?: number
          biscuit_utilization?: number
          brand?: string | null
          created_at?: string
          customer_margin_percent?: number
          final_buffer?: number
          glaze_hours?: number
          glaze10_hours?: number
          glaze10_resistance_burns?: number
          glaze10_utilization?: number
          glaze6_hours?: number
          glaze6_resistance_burns?: number
          glaze6_utilization?: number
          glaze7_hours?: number
          glaze7_resistance_burns?: number
          glaze7_utilization?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          kwh_cost?: number
          model?: string | null
          name?: string
          notes?: string | null
          oven_diameter_cm?: number
          power_kw?: number
          resistance_burns?: number
          resistance_cost?: number
          serial_number?: string | null
          updated_at?: string
          utilization?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kilns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_import_archive: {
        Row: {
          id: string
          imported_at: string
          payload: Json
          sheet_name: string
          source_key: string
          workspace_id: string
        }
        Insert: {
          id?: string
          imported_at?: string
          payload?: Json
          sheet_name: string
          source_key: string
          workspace_id: string
        }
        Update: {
          id?: string
          imported_at?: string
          payload?: Json
          sheet_name?: string
          source_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_import_archive_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_pricing: {
        Row: {
          biscuit_cost: number
          clay_cost: number
          clay_grams: number
          created_at: string
          customization_cost: number
          depth_cm: number
          expected_discount_percent: number
          fixed_allocation: number
          glaze_cone: string
          glaze_cost: number
          glaze_firing_cost: number
          glaze_grams: number
          height_cm: number
          id: string
          kiln_firing_profit_percent: number
          labor_cost: number
          length_cm: number
          loss_percent: number
          margin_percent: number
          name: string
          net_margin_percent: number
          net_profit: number
          notes: string | null
          other_cost: number
          packaging_cost: number
          payment_fee_percent: number
          quantity: number
          suggested_price: number
          tax_percent: number
          total_cost: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          biscuit_cost?: number
          clay_cost?: number
          clay_grams?: number
          created_at?: string
          customization_cost?: number
          depth_cm?: number
          expected_discount_percent?: number
          fixed_allocation?: number
          glaze_cone?: string
          glaze_cost?: number
          glaze_firing_cost?: number
          glaze_grams?: number
          height_cm?: number
          id?: string
          kiln_firing_profit_percent?: number
          labor_cost?: number
          length_cm?: number
          loss_percent?: number
          margin_percent?: number
          name: string
          net_margin_percent?: number
          net_profit?: number
          notes?: string | null
          other_cost?: number
          packaging_cost?: number
          payment_fee_percent?: number
          quantity?: number
          suggested_price?: number
          tax_percent?: number
          total_cost?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          biscuit_cost?: number
          clay_cost?: number
          clay_grams?: number
          created_at?: string
          customization_cost?: number
          depth_cm?: number
          expected_discount_percent?: number
          fixed_allocation?: number
          glaze_cone?: string
          glaze_cost?: number
          glaze_firing_cost?: number
          glaze_grams?: number
          height_cm?: number
          id?: string
          kiln_firing_profit_percent?: number
          labor_cost?: number
          length_cm?: number
          loss_percent?: number
          margin_percent?: number
          name?: string
          net_margin_percent?: number
          net_profit?: number
          notes?: string | null
          other_cost?: number
          packaging_cost?: number
          payment_fee_percent?: number
          quantity?: number
          suggested_price?: number
          tax_percent?: number
          total_cost?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_pricing_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      piece_pricing_defaults: {
        Row: {
          biscuit_coeff: number
          clay_kg_price: number
          default_labor: number
          default_margin_percent: number
          default_packaging: number
          expected_discount_percent: number
          glaze_firing_coeff: number
          glaze_gram_price: number
          kiln_firing_profit_percent: number
          loss_percent: number
          payment_fee_percent: number
          tax_percent: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          biscuit_coeff?: number
          clay_kg_price?: number
          default_labor?: number
          default_margin_percent?: number
          default_packaging?: number
          expected_discount_percent?: number
          glaze_firing_coeff?: number
          glaze_gram_price?: number
          kiln_firing_profit_percent?: number
          loss_percent?: number
          payment_fee_percent?: number
          tax_percent?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          biscuit_coeff?: number
          clay_kg_price?: number
          default_labor?: number
          default_margin_percent?: number
          default_packaging?: number
          expected_discount_percent?: number
          glaze_firing_coeff?: number
          glaze_gram_price?: number
          kiln_firing_profit_percent?: number
          loss_percent?: number
          payment_fee_percent?: number
          tax_percent?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_pricing_defaults_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
      raw_materials: {
        Row: {
          batch: string | null
          color: string | null
          compatibility: string | null
          created_at: string
          expiration_date: string | null
          finish: string | null
          id: string
          is_active: boolean
          legacy_source_id: string | null
          material_type: string | null
          max_cone: string | null
          min_stock: number
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_link: string | null
          quantity_available: number
          quantity_purchased: number
          recommended_cone: string | null
          sku: string | null
          stock_location: string | null
          supplier: string | null
          supplier_url: string | null
          temperature_max_c: number | null
          temperature_min_c: number | null
          unit: string
          unit_cost: number
          updated_at: string
          use_case: string | null
          workspace_id: string
        }
        Insert: {
          batch?: string | null
          color?: string | null
          compatibility?: string | null
          created_at?: string
          expiration_date?: string | null
          finish?: string | null
          id?: string
          is_active?: boolean
          legacy_source_id?: string | null
          material_type?: string | null
          max_cone?: string | null
          min_stock?: number
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_link?: string | null
          quantity_available?: number
          quantity_purchased?: number
          recommended_cone?: string | null
          sku?: string | null
          stock_location?: string | null
          supplier?: string | null
          supplier_url?: string | null
          temperature_max_c?: number | null
          temperature_min_c?: number | null
          unit?: string
          unit_cost?: number
          updated_at?: string
          use_case?: string | null
          workspace_id: string
        }
        Update: {
          batch?: string | null
          color?: string | null
          compatibility?: string | null
          created_at?: string
          expiration_date?: string | null
          finish?: string | null
          id?: string
          is_active?: boolean
          legacy_source_id?: string | null
          material_type?: string | null
          max_cone?: string | null
          min_stock?: number
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_link?: string | null
          quantity_available?: number
          quantity_purchased?: number
          recommended_cone?: string | null
          sku?: string | null
          stock_location?: string | null
          supplier?: string | null
          supplier_url?: string | null
          temperature_max_c?: number | null
          temperature_min_c?: number | null
          unit?: string
          unit_cost?: number
          updated_at?: string
          use_case?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_materials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      renovation_items: {
        Row: {
          actual_amount: number
          area: string | null
          budget_amount: number
          category: string | null
          created_at: string
          due_date: string | null
          expense_date: string
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string
          priority: string
          responsible: string | null
          status: string
          supplier: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_amount?: number
          area?: string | null
          budget_amount?: number
          category?: string | null
          created_at?: string
          due_date?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string
          priority?: string
          responsible?: string | null
          status?: string
          supplier?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual_amount?: number
          area?: string | null
          budget_amount?: number
          category?: string | null
          created_at?: string
          due_date?: string | null
          expense_date?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string
          priority?: string
          responsible?: string | null
          status?: string
          supplier?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renovation_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          class_name: string | null
          created_at: string
          enrollment_date: string | null
          id: string
          instagram: string | null
          is_active: boolean
          legacy_source_id: string | null
          monthly_fee: number
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          social_link: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          class_name?: string | null
          created_at?: string
          enrollment_date?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean
          legacy_source_id?: string | null
          monthly_fee?: number
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          social_link?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          class_name?: string | null
          created_at?: string
          enrollment_date?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean
          legacy_source_id?: string | null
          monthly_fee?: number
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          social_link?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          financial_role: string
          id: string
          import_hash: string | null
          importance_confidence: number | null
          importance_confirmed_at: string | null
          importance_confirmed_by_user: boolean
          importance_level:
            Database["public"]["Enums"]["importance_level"] | null
          importance_status:
            Database["public"]["Enums"]["importance_status"] | null
          importance_suggestion_reason: string | null
          invoice_month: string | null
          linked_credit_card_id: string | null
          method: string | null
          month: number
          notes: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_method: string | null
          source: string
          status: Database["public"]["Enums"]["transaction_status"]
          suggested_category_id: string | null
          suggested_importance_level:
            Database["public"]["Enums"]["importance_level"] | null
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
          financial_role?: string
          id?: string
          import_hash?: string | null
          importance_confidence?: number | null
          importance_confirmed_at?: string | null
          importance_confirmed_by_user?: boolean
          importance_level?:
            Database["public"]["Enums"]["importance_level"] | null
          importance_status?:
            Database["public"]["Enums"]["importance_status"] | null
          importance_suggestion_reason?: string | null
          invoice_month?: string | null
          linked_credit_card_id?: string | null
          method?: string | null
          month: number
          notes?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_method?: string | null
          source?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          suggested_category_id?: string | null
          suggested_importance_level?:
            Database["public"]["Enums"]["importance_level"] | null
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
          financial_role?: string
          id?: string
          import_hash?: string | null
          importance_confidence?: number | null
          importance_confirmed_at?: string | null
          importance_confirmed_by_user?: boolean
          importance_level?:
            Database["public"]["Enums"]["importance_level"] | null
          importance_status?:
            Database["public"]["Enums"]["importance_status"] | null
          importance_suggestion_reason?: string | null
          invoice_month?: string | null
          linked_credit_card_id?: string | null
          method?: string | null
          month?: number
          notes?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_method?: string | null
          source?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          suggested_category_id?: string | null
          suggested_importance_level?:
            Database["public"]["Enums"]["importance_level"] | null
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
            foreignKeyName: "transactions_linked_credit_card_id_fkey"
            columns: ["linked_credit_card_id"]
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
      workshop_pricing: {
        Row: {
          attendees: number
          biscuit_per_person: number
          break_even_attendees: number | null
          clay_10kg_price: number
          clay_cost: number
          clay_kg_per_person: number
          created_at: string
          event_date: string | null
          extra_variable_cost_per_person: number
          firing_cost: number
          fixed_cost: number
          food_cost: number
          food_per_person: number
          glaze_cost: number
          glaze_firing_per_person: number
          glaze_per_person: number
          id: string
          labor_cost: number
          margin_percent: number
          name: string
          notes: string | null
          other_cost: number
          packaging_per_person: number
          payment_fee_percent: number
          price_per_person: number
          profit: number
          space_cost_per_hour: number
          space_hours: number
          surprise_percent: number
          tax_percent: number
          total_cost: number
          total_revenue: number
          updated_at: string
          variable_cost_per_person: number
          workspace_id: string
        }
        Insert: {
          attendees?: number
          biscuit_per_person?: number
          break_even_attendees?: number | null
          clay_10kg_price?: number
          clay_cost?: number
          clay_kg_per_person?: number
          created_at?: string
          event_date?: string | null
          extra_variable_cost_per_person?: number
          firing_cost?: number
          fixed_cost?: number
          food_cost?: number
          food_per_person?: number
          glaze_cost?: number
          glaze_firing_per_person?: number
          glaze_per_person?: number
          id?: string
          labor_cost?: number
          margin_percent?: number
          name: string
          notes?: string | null
          other_cost?: number
          packaging_per_person?: number
          payment_fee_percent?: number
          price_per_person?: number
          profit?: number
          space_cost_per_hour?: number
          space_hours?: number
          surprise_percent?: number
          tax_percent?: number
          total_cost?: number
          total_revenue?: number
          updated_at?: string
          variable_cost_per_person?: number
          workspace_id: string
        }
        Update: {
          attendees?: number
          biscuit_per_person?: number
          break_even_attendees?: number | null
          clay_10kg_price?: number
          clay_cost?: number
          clay_kg_per_person?: number
          created_at?: string
          event_date?: string | null
          extra_variable_cost_per_person?: number
          firing_cost?: number
          fixed_cost?: number
          food_cost?: number
          food_per_person?: number
          glaze_cost?: number
          glaze_firing_per_person?: number
          glaze_per_person?: number
          id?: string
          labor_cost?: number
          margin_percent?: number
          name?: string
          notes?: string | null
          other_cost?: number
          packaging_per_person?: number
          payment_fee_percent?: number
          price_per_person?: number
          profit?: number
          space_cost_per_hour?: number
          space_hours?: number
          surprise_percent?: number
          tax_percent?: number
          total_cost?: number
          total_revenue?: number
          updated_at?: string
          variable_cost_per_person?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_pricing_workspace_id_fkey"
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
          is_atelier: boolean
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
          is_atelier?: boolean
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
          is_atelier?: boolean
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
          target_scope: string
          target_user_id: string | null
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
          target_scope: string
          target_user_id: string | null
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
      charge_request_credits: {
        Args: { _request_id: string }
        Returns: boolean
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
      seed_sela_defaults: { Args: { _workspace_id: string }; Returns: Json }
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
          target_scope: string
          target_user_id: string | null
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
          target_scope: string
          target_user_id: string | null
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
        "initial" | "manual_current" | "reconciliation_check" | "adjustment"
      importance_level: "essential" | "important" | "flexible" | "superfluous"
      importance_status:
        "suggested" | "confirmed" | "manually_changed" | "needs_review"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
