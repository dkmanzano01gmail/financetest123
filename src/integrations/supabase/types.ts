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
          student_id: string | null
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
          student_id?: string | null
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
          student_id?: string | null
          student_name?: string
          updated_at?: string
          weekday?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          code: string
          created_at: string
          included_credits: number
          is_active: boolean
          monthly_price: number
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          included_credits?: number
          is_active?: boolean
          monthly_price: number
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          included_credits?: number
          is_active?: boolean
          monthly_price?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          credit_reference_value: number
          default_payment_fee_percent: number
          id: boolean
          simulation_enabled: boolean
          updated_at: string
        }
        Insert: {
          credit_reference_value?: number
          default_payment_fee_percent?: number
          id?: boolean
          simulation_enabled?: boolean
          updated_at?: string
        }
        Update: {
          credit_reference_value?: number
          default_payment_fee_percent?: number
          id?: boolean
          simulation_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
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
          resistance_base_cost_per_firing: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          fixed_monthly_fee?: number
          kiln_firing_profit_percent?: number
          margin_percent?: number
          resistance_base_cost_per_firing?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          fixed_monthly_fee?: number
          kiln_firing_profit_percent?: number
          margin_percent?: number
          resistance_base_cost_per_firing?: number
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
      class_material_statement_links: {
        Row: {
          bucket_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          object_path: string
          revoked_at: string | null
          student_id: string | null
          token_hash: string
          workspace_id: string
        }
        Insert: {
          bucket_id?: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          object_path: string
          revoked_at?: string | null
          student_id?: string | null
          token_hash: string
          workspace_id: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          object_path?: string
          revoked_at?: string | null
          student_id?: string | null
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_material_statement_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_material_statement_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
          bisque_weight_g: number | null
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
          glazed_weight_g: number | null
          grams: number
          height_cm: number
          id: string
          kiln_id: string | null
          legacy_source_id: string | null
          length_cm: number
          material: string
          modeled_weight_g: number | null
          other_cost: number
          payment_date: string | null
          payment_notes: string | null
          payment_status: string
          photo_path: string | null
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
          bisque_weight_g?: number | null
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
          glazed_weight_g?: number | null
          grams?: number
          height_cm?: number
          id?: string
          kiln_id?: string | null
          legacy_source_id?: string | null
          length_cm?: number
          material: string
          modeled_weight_g?: number | null
          other_cost?: number
          payment_date?: string | null
          payment_notes?: string | null
          payment_status?: string
          photo_path?: string | null
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
          bisque_weight_g?: number | null
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
          glazed_weight_g?: number | null
          grams?: number
          height_cm?: number
          id?: string
          kiln_id?: string | null
          legacy_source_id?: string | null
          length_cm?: number
          material?: string
          modeled_weight_g?: number | null
          other_cost?: number
          payment_date?: string | null
          payment_notes?: string | null
          payment_status?: string
          photo_path?: string | null
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
      credit_card_payment_allocations: {
        Row: {
          allocated_amount: number
          created_at: string
          created_by: string | null
          credit_card_id: string
          id: string
          invoice_month: string
          offset_transaction_id: string
          original_transaction_id: string
          workspace_id: string
        }
        Insert: {
          allocated_amount: number
          created_at?: string
          created_by?: string | null
          credit_card_id: string
          id?: string
          invoice_month: string
          offset_transaction_id: string
          original_transaction_id: string
          workspace_id: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          created_by?: string | null
          credit_card_id?: string
          id?: string
          invoice_month?: string
          offset_transaction_id?: string
          original_transaction_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_payment_allocations_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_payment_allocations_offset_transaction_id_fkey"
            columns: ["offset_transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_payment_allocations_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_payment_allocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_card_payment_removals: {
        Row: {
          account_id: string | null
          credit_card_id: string
          id: string
          invoice_month: string
          original_transaction_id: string
          payment_amount: number
          payment_date: string
          payment_description: string
          payment_source: string | null
          purchase_count: number
          purchase_total: number
          removed_at: string
          removed_by: string | null
          restored_at: string | null
          restored_offset_transaction_id: string | null
          restored_transaction_id: string | null
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          credit_card_id: string
          id?: string
          invoice_month: string
          original_transaction_id: string
          payment_amount: number
          payment_date: string
          payment_description: string
          payment_source?: string | null
          purchase_count: number
          purchase_total: number
          removed_at?: string
          removed_by?: string | null
          restored_at?: string | null
          restored_offset_transaction_id?: string | null
          restored_transaction_id?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          credit_card_id?: string
          id?: string
          invoice_month?: string
          original_transaction_id?: string
          payment_amount?: number
          payment_date?: string
          payment_description?: string
          payment_source?: string | null
          purchase_count?: number
          purchase_total?: number
          removed_at?: string
          removed_by?: string | null
          restored_at?: string | null
          restored_offset_transaction_id?: string | null
          restored_transaction_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_payment_removals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_payment_removals_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_payment_removals_restored_offset_transaction_i_fkey"
            columns: ["restored_offset_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_payment_removals_restored_transaction_id_fkey"
            columns: ["restored_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_payment_removals_workspace_id_fkey"
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
      credit_ledger: {
        Row: {
          created_at: string
          credits_delta: number
          customization_request_id: string | null
          description: string | null
          id: string
          monetary_reference_value: number | null
          payment_id: string | null
          reference_month: string | null
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          credits_delta: number
          customization_request_id?: string | null
          description?: string | null
          id?: string
          monetary_reference_value?: number | null
          payment_id?: string | null
          reference_month?: string | null
          type: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          credits_delta?: number
          customization_request_id?: string | null
          description?: string | null
          id?: string
          monetary_reference_value?: number | null
          payment_id?: string | null
          reference_month?: string | null
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_customization_request_id_fkey"
            columns: ["customization_request_id"]
            isOneToOne: false
            referencedRelation: "customization_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packs: {
        Row: {
          code: string
          created_at: string
          credits: number
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          credits: number
          is_active?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          credits?: number
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      customization_costs: {
        Row: {
          ai_api_cost_brl: number | null
          corrections: number
          created_at: string
          customization_request_id: string
          human_cost_brl: number | null
          id: string
          implementation_attempts: number
          infra_cost_brl: number | null
          lovable_cost_brl: number | null
          lovable_credits_used: number | null
          notes: string | null
          other_variable_cost_brl: number | null
          total_variable_cost_brl: number | null
          updated_at: string
        }
        Insert: {
          ai_api_cost_brl?: number | null
          corrections?: number
          created_at?: string
          customization_request_id: string
          human_cost_brl?: number | null
          id?: string
          implementation_attempts?: number
          infra_cost_brl?: number | null
          lovable_cost_brl?: number | null
          lovable_credits_used?: number | null
          notes?: string | null
          other_variable_cost_brl?: number | null
          total_variable_cost_brl?: number | null
          updated_at?: string
        }
        Update: {
          ai_api_cost_brl?: number | null
          corrections?: number
          created_at?: string
          customization_request_id?: string
          human_cost_brl?: number | null
          id?: string
          implementation_attempts?: number
          infra_cost_brl?: number | null
          lovable_cost_brl?: number | null
          lovable_credits_used?: number | null
          notes?: string | null
          other_variable_cost_brl?: number | null
          total_variable_cost_brl?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customization_costs_customization_request_id_fkey"
            columns: ["customization_request_id"]
            isOneToOne: false
            referencedRelation: "customization_requests"
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
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision: string | null
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          consumed_credits: number
          created_at: string
          development_email_attempts: number
          development_email_error: string | null
          development_email_sent_at: string | null
          estimated_credits: number
          execution_status: string
          id: string
          is_bug_fix: boolean
          pricing_status: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          reserved_credits: number
          rollback_payload: Json | null
          status: string
          target_scope: string
          target_user_id: string | null
          tested_at: string | null
          title: string | null
          updated_at: string
          user_decided_at: string | null
          user_decided_by: string | null
          user_decision: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_decision?: string | null
          ai_classification_reason?: string | null
          ai_interpretation?: Json | null
          applied_customization_id?: string | null
          approved_at?: string | null
          approved_credits?: number | null
          auto_applied?: boolean
          completed_at?: string | null
          complexity?: string | null
          consumed_credits?: number
          created_at?: string
          development_email_attempts?: number
          development_email_error?: string | null
          development_email_sent_at?: string | null
          estimated_credits?: number
          execution_status?: string
          id?: string
          is_bug_fix?: boolean
          pricing_status?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          request_text: string
          request_type?: string
          reserved_credits?: number
          rollback_payload?: Json | null
          status?: string
          target_scope?: string
          target_user_id?: string | null
          tested_at?: string | null
          title?: string | null
          updated_at?: string
          user_decided_at?: string | null
          user_decided_by?: string | null
          user_decision?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_decision?: string | null
          ai_classification_reason?: string | null
          ai_interpretation?: Json | null
          applied_customization_id?: string | null
          approved_at?: string | null
          approved_credits?: number | null
          auto_applied?: boolean
          completed_at?: string | null
          complexity?: string | null
          consumed_credits?: number
          created_at?: string
          development_email_attempts?: number
          development_email_error?: string | null
          development_email_sent_at?: string | null
          estimated_credits?: number
          execution_status?: string
          id?: string
          is_bug_fix?: boolean
          pricing_status?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          request_text?: string
          request_type?: string
          reserved_credits?: number
          rollback_payload?: Json | null
          status?: string
          target_scope?: string
          target_user_id?: string | null
          tested_at?: string | null
          title?: string | null
          updated_at?: string
          user_decided_at?: string | null
          user_decided_by?: string | null
          user_decision?: string | null
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
          email_attempts: number
          email_error: string | null
          email_sent_at: string | null
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
          email_attempts?: number
          email_error?: string | null
          email_sent_at?: string | null
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
          email_attempts?: number
          email_error?: string | null
          email_sent_at?: string | null
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
      operating_costs: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          is_fixed: boolean
          reference_month: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          is_fixed?: boolean
          reference_month: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_fixed?: boolean
          reference_month?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          external_payment_id: string | null
          gross_amount: number
          id: string
          is_simulated: boolean
          net_amount: number
          paid_at: string | null
          payment_fee: number
          status: string
          subscription_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          external_payment_id?: string | null
          gross_amount?: number
          id?: string
          is_simulated?: boolean
          net_amount?: number
          paid_at?: string | null
          payment_fee?: number
          status?: string
          subscription_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          external_payment_id?: string | null
          gross_amount?: number
          id?: string
          is_simulated?: boolean
          net_amount?: number
          paid_at?: string | null
          payment_fee?: number
          status?: string
          subscription_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
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
      student_payments: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          payment_type: string
          reference_month: string | null
          status: string
          student_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_type?: string
          reference_month?: string | null
          status?: string
          student_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_type?: string
          reference_month?: string | null
          status?: string
          student_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      student_portal_access: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          invite_token_hash: string | null
          invited_at: string | null
          invited_email: string
          requires_password: boolean
          revoked_at: string | null
          status: string
          student_id: string
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          invite_token_hash?: string | null
          invited_at?: string | null
          invited_email: string
          requires_password?: boolean
          revoked_at?: string | null
          status?: string
          student_id: string
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          invite_token_hash?: string | null
          invited_at?: string | null
          invited_email?: string
          requires_password?: boolean
          revoked_at?: string | null
          status?: string
          student_id?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_portal_access_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_portal_access_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      student_projects: {
        Row: {
          archived_at: string | null
          clay: string | null
          created_at: string
          description: string | null
          desired_dimensions: string | null
          glazes: string[]
          id: string
          notes: string | null
          piece_type: string | null
          reference_image_url: string | null
          status: string
          student_id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          clay?: string | null
          created_at?: string
          description?: string | null
          desired_dimensions?: string | null
          glazes?: string[]
          id?: string
          notes?: string | null
          piece_type?: string | null
          reference_image_url?: string | null
          status?: string
          student_id: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          clay?: string | null
          created_at?: string
          description?: string | null
          desired_dimensions?: string | null
          glazes?: string[]
          id?: string
          notes?: string | null
          piece_type?: string | null
          reference_image_url?: string | null
          status?: string
          student_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_projects_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_projects_workspace_id_fkey"
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
          email: string | null
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
          email?: string | null
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
          email?: string | null
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
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          external_customer_id: string | null
          external_subscription_id: string | null
          id: string
          included_credits: number
          monthly_price: number
          plan_code: string
          renewal_date: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          included_credits?: number
          monthly_price: number
          plan_code: string
          renewal_date?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          included_credits?: number
          monthly_price?: number
          plan_code?: string
          renewal_date?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["code"]
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
            | Database["public"]["Enums"]["importance_level"]
            | null
          importance_status:
            | Database["public"]["Enums"]["importance_status"]
            | null
          importance_suggestion_reason: string | null
          invoice_month: string | null
          linked_credit_card_id: string | null
          method: string | null
          month: number
          notes: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_method: string | null
          reversal_of_transaction_id: string | null
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
          financial_role?: string
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
          invoice_month?: string | null
          linked_credit_card_id?: string | null
          method?: string | null
          month: number
          notes?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_method?: string | null
          reversal_of_transaction_id?: string | null
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
          financial_role?: string
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
          invoice_month?: string | null
          linked_credit_card_id?: string | null
          method?: string | null
          month?: number
          notes?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_method?: string | null
          reversal_of_transaction_id?: string | null
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
            foreignKeyName: "transactions_linked_credit_card_id_fkey"
            columns: ["linked_credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversal_of_transaction_id_fkey"
            columns: ["reversal_of_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
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
      user_onboarding_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          dismissed_at: string | null
          id: string
          tour_key: string
          tour_version: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          dismissed_at?: string | null
          id?: string
          tour_key?: string
          tour_version?: number
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          dismissed_at?: string | null
          id?: string
          tour_key?: string
          tour_version?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_progress_workspace_id_fkey"
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
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
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
      credit_wallets: {
        Row: {
          available_balance: number | null
          consumed_total: number | null
          granted_total: number | null
          purchased_total: number | null
          reserved_balance: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_approve_request: {
        Args: { _admin_note?: string; _request_id: string }
        Returns: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision: string | null
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          consumed_credits: number
          created_at: string
          development_email_attempts: number
          development_email_error: string | null
          development_email_sent_at: string | null
          estimated_credits: number
          execution_status: string
          id: string
          is_bug_fix: boolean
          pricing_status: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          reserved_credits: number
          rollback_payload: Json | null
          status: string
          target_scope: string
          target_user_id: string | null
          tested_at: string | null
          title: string | null
          updated_at: string
          user_decided_at: string | null
          user_decided_by: string | null
          user_decision: string | null
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
      admin_customization_economics: {
        Args: { _month: number; _year: number }
        Returns: {
          ai_cost: number
          attempts: number
          corrections: number
          created_at: string
          credits_charged: number
          customer_email: string
          customer_name: string
          economic_margin: number
          economic_margin_pct: number
          economic_value: number
          execution_status: string
          human_cost: number
          infra_cost: number
          is_bug_fix: boolean
          lovable_cost: number
          other_cost: number
          request_id: string
          request_text: string
          title: string
          total_variable_cost: number
          workspace_name: string
        }[]
      }
      admin_operation_result: {
        Args: { _month: number; _year: number }
        Returns: {
          active_customers: number
          avg_cost_per_consumed_credit: number
          contribution_margin: number
          contribution_margin_pct: number
          credit_pack_revenue: number
          credits_consumed: number
          customization_variable_costs: number
          economic_value_of_credits_consumed: number
          fixed_operating_costs: number
          mrr: number
          operating_margin_pct: number
          operating_profit: number
          payment_fees: number
          personalization_economic_margin: number
          personalization_economic_margin_pct: number
          subscription_revenue: number
          total_revenue: number
          total_variable_costs: number
        }[]
      }
      admin_reject_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision: string | null
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          consumed_credits: number
          created_at: string
          development_email_attempts: number
          development_email_error: string | null
          development_email_sent_at: string | null
          estimated_credits: number
          execution_status: string
          id: string
          is_bug_fix: boolean
          pricing_status: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          reserved_credits: number
          rollback_payload: Json | null
          status: string
          target_scope: string
          target_user_id: string | null
          tested_at: string | null
          title: string | null
          updated_at: string
          user_decided_at: string | null
          user_decided_by: string | null
          user_decision: string | null
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
      admin_unit_economics: {
        Args: { _month: number; _year: number }
        Returns: {
          contribution_margin: number
          contribution_margin_pct: number
          credit_pack_revenue: number
          credits_consumed: number
          credits_granted: number
          credits_purchased: number
          current_credit_balance: number
          customer_email: string
          customer_name: string
          direct_customization_costs: number
          direct_variable_costs: number
          payment_fees: number
          plan_code: string
          subscription_revenue: number
          subscription_status: string
          total_revenue: number
          user_id: string
        }[]
      }
      allocate_card_payment: {
        Args: {
          allocation_amount: number
          payment_transaction_id: string
          target_credit_card_id: string
          target_invoice_month: string
        }
        Returns: string
      }
      allocate_card_payments: {
        Args: {
          allocation_items: Json
          target_credit_card_id: string
          target_invoice_month: string
        }
        Returns: string[]
      }
      archive_and_delete_card_payment: {
        Args: {
          payment_transaction_id: string
          target_credit_card_id: string
          target_invoice_month: string
        }
        Returns: string
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
      consume_customization_credits: {
        Args: { _request_id: string }
        Returns: number
      }
      credit_balance_of: {
        Args: { _user_id: string }
        Returns: {
          available: number
          reserved: number
        }[]
      }
      current_student_portal_access: {
        Args: never
        Returns: {
          accepted_at: string
          currency: string
          id: string
          invited_email: string
          status: string
          student_id: string
          user_id: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      delete_transaction_with_card_reconciliation: {
        Args: { target_transaction_id: string }
        Returns: number
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
      get_admin_customization_history: {
        Args: never
        Returns: {
          admin_actor_email: string
          admin_actor_name: string
          admin_decided_at: string
          admin_decision: string
          completed_at: string
          complexity: string
          created_at: string
          estimated_credits: number
          id: string
          rejection_reason: string
          request_text: string
          request_type: string
          status: string
          target_scope: string
          tested_at: string
          user_decided_at: string
          user_decision: string
          user_email: string
          user_id: string
          user_name: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      grant_monthly_credits: {
        Args: { _reference_month?: string; _user_id: string }
        Returns: number
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      purchase_credit_pack: { Args: { _pack_code: string }; Returns: string }
      release_customization_credits: {
        Args: { _reason?: string; _request_id: string }
        Returns: number
      }
      reserve_customization_credits: {
        Args: { _request_id: string }
        Returns: number
      }
      seed_sela_defaults: { Args: { _workspace_id: string }; Returns: Json }
      student_portal_pieces: {
        Args: { _student_id?: string }
        Returns: {
          amount_charged: number
          amount_paid: number
          amount_pending: number
          biscuit_firing_cost: number
          bisque_weight_g: number | null
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
          glazed_weight_g: number | null
          grams: number
          height_cm: number
          id: string
          kiln_id: string | null
          legacy_source_id: string | null
          length_cm: number
          material: string
          modeled_weight_g: number | null
          other_cost: number
          payment_date: string | null
          payment_notes: string | null
          payment_status: string
          photo_path: string | null
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
        }[]
        SetofOptions: {
          from: "*"
          to: "class_materials_usage"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      student_portal_student_id: {
        Args: { _user_id?: string; _workspace_id: string }
        Returns: string
      }
      undo_card_payment_allocation: {
        Args: { target_allocation_id: string }
        Returns: string
      }
      user_approve_test: {
        Args: { _request_id: string }
        Returns: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision: string | null
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          consumed_credits: number
          created_at: string
          development_email_attempts: number
          development_email_error: string | null
          development_email_sent_at: string | null
          estimated_credits: number
          execution_status: string
          id: string
          is_bug_fix: boolean
          pricing_status: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          reserved_credits: number
          rollback_payload: Json | null
          status: string
          target_scope: string
          target_user_id: string | null
          tested_at: string | null
          title: string | null
          updated_at: string
          user_decided_at: string | null
          user_decided_by: string | null
          user_decision: string | null
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
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision: string | null
          ai_classification_reason: string | null
          ai_interpretation: Json | null
          applied_customization_id: string | null
          approved_at: string | null
          approved_credits: number | null
          auto_applied: boolean
          completed_at: string | null
          complexity: string | null
          consumed_credits: number
          created_at: string
          development_email_attempts: number
          development_email_error: string | null
          development_email_sent_at: string | null
          estimated_credits: number
          execution_status: string
          id: string
          is_bug_fix: boolean
          pricing_status: string
          rejected_at: string | null
          rejection_reason: string | null
          request_text: string
          request_type: string
          reserved_credits: number
          rollback_payload: Json | null
          status: string
          target_scope: string
          target_user_id: string | null
          tested_at: string | null
          title: string | null
          updated_at: string
          user_decided_at: string | null
          user_decided_by: string | null
          user_decision: string | null
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
