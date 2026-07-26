-- Apps Script v70/v72 parity: preserve all operational fields used by Orna.

ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS temperature_min_c numeric,
  ADD COLUMN IF NOT EXISTS temperature_max_c numeric,
  ADD COLUMN IF NOT EXISTS recommended_cone text,
  ADD COLUMN IF NOT EXISTS max_cone text,
  ADD COLUMN IF NOT EXISTS use_case text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS finish text,
  ADD COLUMN IF NOT EXISTS compatibility text,
  ADD COLUMN IF NOT EXISTS batch text,
  ADD COLUMN IF NOT EXISTS expiration_date date,
  ADD COLUMN IF NOT EXISTS stock_location text,
  ADD COLUMN IF NOT EXISTS sku text;

ALTER TABLE public.class_materials_usage
  ADD COLUMN IF NOT EXISTS clay_weight_kg numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clay_type text,
  ADD COLUMN IF NOT EXISTS clay_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS length_cm numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depth_cm numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS height_cm numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS glaze_cone text,
  ADD COLUMN IF NOT EXISTS glaze_name text,
  ADD COLUMN IF NOT EXISTS glaze_quantity numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS glaze_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS biscuit_firing_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS glaze_firing_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_notes text,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_pending numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charge_biscuit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS charge_glaze boolean NOT NULL DEFAULT true;

ALTER TABLE public.renovation_items
  ADD COLUMN IF NOT EXISTS expense_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS responsible text;

ALTER TABLE public.workshop_pricing
  ADD COLUMN IF NOT EXISTS space_hours numeric(10,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS space_cost_per_hour numeric(14,2) NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS clay_kg_per_person numeric(10,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS clay_10kg_price numeric(14,2) NOT NULL DEFAULT 77,
  ADD COLUMN IF NOT EXISTS glaze_per_person numeric(14,4) NOT NULL DEFAULT 2.58,
  ADD COLUMN IF NOT EXISTS biscuit_per_person numeric(14,4) NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS glaze_firing_per_person numeric(14,4) NOT NULL DEFAULT 57.232,
  ADD COLUMN IF NOT EXISTS food_per_person numeric(14,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS packaging_per_person numeric(14,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS extra_variable_cost_per_person numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variable_cost_per_person numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_fee_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surprise_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS break_even_attendees integer;

CREATE INDEX IF NOT EXISTS renovation_ws_expense_date_idx
  ON public.renovation_items(workspace_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS class_materials_ws_student_date_idx
  ON public.class_materials_usage(workspace_id, student_name, usage_date DESC);

ALTER TABLE public.firing_pricing
  ADD COLUMN IF NOT EXISTS cone text;

ALTER TABLE public.piece_pricing
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS glaze_cone text NOT NULL DEFAULT '6',
  ADD COLUMN IF NOT EXISTS customization_cost numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_allocation numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loss_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_fee_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_discount_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kiln_firing_profit_percent numeric(8,4) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS net_profit numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_margin_percent numeric(8,4) NOT NULL DEFAULT 0;

ALTER TABLE public.piece_pricing_defaults
  ADD COLUMN IF NOT EXISTS kiln_firing_profit_percent numeric(8,4) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS loss_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_fee_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_discount_percent numeric(8,4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.firing_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  oven_diameter_cm numeric(10,2) NOT NULL DEFAULT 57,
  area_adjustment numeric(10,4) NOT NULL DEFAULT 1.0825,
  resistance_cost numeric(14,2) NOT NULL DEFAULT 2000,
  resistance_burns integer NOT NULL DEFAULT 275,
  power_kw numeric(10,3) NOT NULL DEFAULT 9.85,
  biscuit_hours numeric(10,2) NOT NULL DEFAULT 9,
  glaze_hours numeric(10,2) NOT NULL DEFAULT 10.5,
  utilization numeric(8,4) NOT NULL DEFAULT 0.65,
  kwh_cost numeric(14,4) NOT NULL DEFAULT 1,
  final_buffer numeric(8,4) NOT NULL DEFAULT 0.1,
  customer_margin_percent numeric(8,2) NOT NULL DEFAULT 100,
  biscuit_resistance_burns integer NOT NULL DEFAULT 275,
  biscuit_utilization numeric(8,4) NOT NULL DEFAULT 0.65,
  glaze6_resistance_burns integer NOT NULL DEFAULT 175,
  glaze6_hours numeric(10,2) NOT NULL DEFAULT 10.5,
  glaze6_utilization numeric(8,4) NOT NULL DEFAULT 0.75,
  glaze7_resistance_burns integer NOT NULL DEFAULT 150,
  glaze7_hours numeric(10,2) NOT NULL DEFAULT 11,
  glaze7_utilization numeric(8,4) NOT NULL DEFAULT 0.78,
  glaze10_resistance_burns integer NOT NULL DEFAULT 110,
  glaze10_hours numeric(10,2) NOT NULL DEFAULT 12,
  glaze10_utilization numeric(8,4) NOT NULL DEFAULT 0.90,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.firing_settings
  ADD COLUMN IF NOT EXISTS biscuit_resistance_burns integer NOT NULL DEFAULT 275,
  ADD COLUMN IF NOT EXISTS biscuit_utilization numeric(8,4) NOT NULL DEFAULT 0.65,
  ADD COLUMN IF NOT EXISTS glaze6_resistance_burns integer NOT NULL DEFAULT 175,
  ADD COLUMN IF NOT EXISTS glaze6_hours numeric(10,2) NOT NULL DEFAULT 10.5,
  ADD COLUMN IF NOT EXISTS glaze6_utilization numeric(8,4) NOT NULL DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS glaze7_resistance_burns integer NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS glaze7_hours numeric(10,2) NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS glaze7_utilization numeric(8,4) NOT NULL DEFAULT 0.78,
  ADD COLUMN IF NOT EXISTS glaze10_resistance_burns integer NOT NULL DEFAULT 110,
  ADD COLUMN IF NOT EXISTS glaze10_hours numeric(10,2) NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS glaze10_utilization numeric(8,4) NOT NULL DEFAULT 0.90;

-- Upgrade only untouched legacy defaults; customized ovens remain unchanged.
UPDATE public.firing_settings
SET oven_diameter_cm = 57,
    area_adjustment = 1.0825,
    resistance_cost = 2000,
    resistance_burns = 275,
    power_kw = 9.85,
    biscuit_hours = 9,
    glaze_hours = 10.5,
    utilization = 0.65
WHERE oven_diameter_cm = 45
  AND area_adjustment = 1
  AND resistance_cost = 1200
  AND resistance_burns = 100
  AND power_kw = 7.5
  AND biscuit_hours = 8
  AND glaze_hours = 10
  AND utilization = 0.7;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firing_settings TO authenticated;
GRANT ALL ON public.firing_settings TO service_role;
ALTER TABLE public.firing_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='firing_settings' AND policyname='firing_settings_ws_all') THEN
    CREATE POLICY "firing_settings_ws_all" ON public.firing_settings FOR ALL TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()))
      WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;
END $$;

-- Apps Script regular-class billing parameters and partial-payment parity.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_materials_usage_payment_status_check'
      AND conrelid = 'public.class_materials_usage'::regclass
  ) THEN
    ALTER TABLE public.class_materials_usage
      DROP CONSTRAINT class_materials_usage_payment_status_check;
  END IF;
END $$;
ALTER TABLE public.class_materials_usage
  ADD CONSTRAINT class_materials_usage_payment_status_check
  CHECK (payment_status IN ('pending','partial','paid','waived'));

CREATE TABLE IF NOT EXISTS public.class_material_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  margin_percent numeric(8,4) NOT NULL DEFAULT 0,
  fixed_monthly_fee numeric(14,2) NOT NULL DEFAULT 600,
  kiln_firing_profit_percent numeric(8,4) NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_material_settings TO authenticated;
GRANT ALL ON public.class_material_settings TO service_role;
ALTER TABLE public.class_material_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='class_material_settings'
      AND policyname='class_material_settings_ws_all'
  ) THEN
    CREATE POLICY "class_material_settings_ws_all"
      ON public.class_material_settings FOR ALL TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()))
      WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;
END $$;


-- Apps Script pricing defaults. Existing customized records are preserved.
ALTER TABLE public.piece_pricing_defaults
  ALTER COLUMN default_labor SET DEFAULT 25,
  ALTER COLUMN default_packaging SET DEFAULT 5;
ALTER TABLE public.piece_pricing_defaults
  ALTER COLUMN loss_percent SET DEFAULT 10,
  ALTER COLUMN payment_fee_percent SET DEFAULT 3.5;
UPDATE public.piece_pricing_defaults
SET default_labor = 25,
    default_packaging = 5,
    loss_percent = 10,
    payment_fee_percent = 3.5,
    kiln_firing_profit_percent = 100
WHERE default_labor = 0
  AND default_packaging = 0
  AND loss_percent = 0
  AND payment_fee_percent = 0;

-- Apps Script "Comentários" tab parity: in-app feedback workflow.
CREATE TABLE IF NOT EXISTS public.feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  page text NOT NULL DEFAULT 'Não informado',
  type text NOT NULL DEFAULT 'general',
  comment text NOT NULL CHECK (length(trim(comment)) > 0),
  device text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','resolved','archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_comments_ws_created_idx
  ON public.feedback_comments (workspace_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_comments TO authenticated;
GRANT ALL ON public.feedback_comments TO service_role;
ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='feedback_comments'
      AND policyname='feedback_comments_ws_all'
  ) THEN
    CREATE POLICY "feedback_comments_ws_all"
      ON public.feedback_comments FOR ALL TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()))
      WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;
END $$;
