-- =========================================================
-- Selá Cerâmica — Ateliê modules
-- =========================================================

-- Helper trigger already exists: public.update_updated_at_column()

-- ---------- Cash flow ----------
CREATE TABLE IF NOT EXISTS public.cash_flow_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('income','expense')),
  description text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','weekly','monthly','yearly')),
  status text NOT NULL DEFAULT 'projected' CHECK (status IN ('projected','realized')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_flow_entries TO authenticated;
GRANT ALL ON public.cash_flow_entries TO service_role;
ALTER TABLE public.cash_flow_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfe_select" ON public.cash_flow_entries FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "cfe_write" ON public.cash_flow_entries FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX IF NOT EXISTS cfe_ws_date_idx ON public.cash_flow_entries(workspace_id, entry_date DESC);
CREATE TRIGGER cfe_uat BEFORE UPDATE ON public.cash_flow_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.cash_flow_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  starting_balance numeric(14,2) NOT NULL DEFAULT 0,
  starting_balance_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_flow_settings TO authenticated;
GRANT ALL ON public.cash_flow_settings TO service_role;
ALTER TABLE public.cash_flow_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfs_all" ON public.cash_flow_settings FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER cfs_uat BEFORE UPDATE ON public.cash_flow_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Raw materials ----------
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  material_type text,
  supplier text,
  unit text NOT NULL DEFAULT 'kg',
  quantity_purchased numeric(14,3) NOT NULL DEFAULT 0,
  quantity_available numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  purchase_date date,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_materials TO authenticated;
GRANT ALL ON public.raw_materials TO service_role;
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rm_all" ON public.raw_materials FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX IF NOT EXISTS rm_ws_idx ON public.raw_materials(workspace_id);
CREATE TRIGGER rm_uat BEFORE UPDATE ON public.raw_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Class materials usage ----------
CREATE TABLE IF NOT EXISTS public.class_materials_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  student_name text NOT NULL,
  material text NOT NULL,
  grams numeric(14,2) NOT NULL DEFAULT 0,
  amount_charged numeric(14,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','waived')),
  payment_date date,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_materials_usage TO authenticated;
GRANT ALL ON public.class_materials_usage TO service_role;
ALTER TABLE public.class_materials_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmu_all" ON public.class_materials_usage FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX IF NOT EXISTS cmu_ws_idx ON public.class_materials_usage(workspace_id, usage_date DESC);
CREATE TRIGGER cmu_uat BEFORE UPDATE ON public.class_materials_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Attendance ----------
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  weekday smallint,
  session_time text,
  student_name text NOT NULL,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','justified')),
  confirmed_at timestamptz,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att_all" ON public.attendance_records FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX IF NOT EXISTS att_ws_idx ON public.attendance_records(workspace_id, session_date DESC);
CREATE TRIGGER att_uat BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Renovation ----------
CREATE TABLE IF NOT EXISTS public.renovation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  supplier text,
  budget_amount numeric(14,2) NOT NULL DEFAULT 0,
  actual_amount numeric(14,2) NOT NULL DEFAULT 0,
  due_date date,
  payment_date date,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.renovation_items TO authenticated;
GRANT ALL ON public.renovation_items TO service_role;
ALTER TABLE public.renovation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reno_all" ON public.renovation_items FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX IF NOT EXISTS reno_ws_idx ON public.renovation_items(workspace_id);
CREATE TRIGGER reno_uat BEFORE UPDATE ON public.renovation_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Piece pricing ----------
CREATE TABLE IF NOT EXISTS public.piece_pricing_defaults (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  clay_kg_price numeric(14,4) NOT NULL DEFAULT 7.7,
  glaze_gram_price numeric(14,4) NOT NULL DEFAULT 1,
  biscuit_coeff numeric(14,6) NOT NULL DEFAULT 0.0045,
  glaze_firing_coeff numeric(14,6) NOT NULL DEFAULT 0.007,
  default_labor numeric(14,2) NOT NULL DEFAULT 0,
  default_packaging numeric(14,2) NOT NULL DEFAULT 0,
  default_margin_percent numeric(6,2) NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piece_pricing_defaults TO authenticated;
GRANT ALL ON public.piece_pricing_defaults TO service_role;
ALTER TABLE public.piece_pricing_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppd_all" ON public.piece_pricing_defaults FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER ppd_uat BEFORE UPDATE ON public.piece_pricing_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.piece_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  height_cm numeric(10,2) NOT NULL DEFAULT 0,
  length_cm numeric(10,2) NOT NULL DEFAULT 0,
  depth_cm numeric(10,2) NOT NULL DEFAULT 0,
  clay_grams numeric(14,2) NOT NULL DEFAULT 0,
  clay_cost numeric(14,2) NOT NULL DEFAULT 0,
  glaze_grams numeric(14,2) NOT NULL DEFAULT 0,
  glaze_cost numeric(14,2) NOT NULL DEFAULT 0,
  biscuit_cost numeric(14,2) NOT NULL DEFAULT 0,
  glaze_firing_cost numeric(14,2) NOT NULL DEFAULT 0,
  labor_cost numeric(14,2) NOT NULL DEFAULT 0,
  packaging_cost numeric(14,2) NOT NULL DEFAULT 0,
  other_cost numeric(14,2) NOT NULL DEFAULT 0,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  margin_percent numeric(6,2) NOT NULL DEFAULT 100,
  suggested_price numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.piece_pricing TO authenticated;
GRANT ALL ON public.piece_pricing TO service_role;
ALTER TABLE public.piece_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp_all" ON public.piece_pricing FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX IF NOT EXISTS pp_ws_idx ON public.piece_pricing(workspace_id, created_at DESC);
CREATE TRIGGER pp_uat BEFORE UPDATE ON public.piece_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Workshop pricing ----------
CREATE TABLE IF NOT EXISTS public.workshop_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_date date,
  attendees integer NOT NULL DEFAULT 0,
  price_per_person numeric(14,2) NOT NULL DEFAULT 290,
  clay_cost numeric(14,2) NOT NULL DEFAULT 0,
  glaze_cost numeric(14,2) NOT NULL DEFAULT 0,
  firing_cost numeric(14,2) NOT NULL DEFAULT 0,
  food_cost numeric(14,2) NOT NULL DEFAULT 0,
  labor_cost numeric(14,2) NOT NULL DEFAULT 0,
  other_cost numeric(14,2) NOT NULL DEFAULT 0,
  total_revenue numeric(14,2) NOT NULL DEFAULT 0,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  profit numeric(14,2) NOT NULL DEFAULT 0,
  margin_percent numeric(8,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshop_pricing TO authenticated;
GRANT ALL ON public.workshop_pricing TO service_role;
ALTER TABLE public.workshop_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wp_all" ON public.workshop_pricing FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER wp_uat BEFORE UPDATE ON public.workshop_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Firings ----------
CREATE TABLE IF NOT EXISTS public.firing_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  reference text NOT NULL DEFAULT 'Yby 10Z2',
  firing_date date,
  firing_type text NOT NULL DEFAULT 'biscuit' CHECK (firing_type IN ('biscuit','glaze','other')),
  total_internal_cost numeric(14,2) NOT NULL DEFAULT 0,
  total_charges numeric(14,2) NOT NULL DEFAULT 0,
  profit numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firing_pricing TO authenticated;
GRANT ALL ON public.firing_pricing TO service_role;
ALTER TABLE public.firing_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_all" ON public.firing_pricing FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER fp_uat BEFORE UPDATE ON public.firing_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.firing_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  firing_id uuid NOT NULL REFERENCES public.firing_pricing(id) ON DELETE CASCADE,
  customer_name text,
  piece_name text NOT NULL,
  height_cm numeric(10,2) NOT NULL DEFAULT 0,
  length_cm numeric(10,2) NOT NULL DEFAULT 0,
  depth_cm numeric(10,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  internal_cost numeric(14,2) NOT NULL DEFAULT 0,
  charge_customer boolean NOT NULL DEFAULT false,
  charge_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firing_pieces TO authenticated;
GRANT ALL ON public.firing_pieces TO service_role;
ALTER TABLE public.firing_pieces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fpc_all" ON public.firing_pieces FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX IF NOT EXISTS fpc_firing_idx ON public.firing_pieces(firing_id);
CREATE TRIGGER fpc_uat BEFORE UPDATE ON public.firing_pieces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Seed Selá defaults RPC (idempotent, business workspaces) ----------
CREATE OR REPLACE FUNCTION public.seed_sela_defaults(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cats_added int := 0;
  _accts_added int := 0;
  income_cats text[] := ARRAY['Vendas','Workshops','Aulas regulares','Serviços','Outros'];
  expense_cats text[] := ARRAY[
    'Argila e matéria-prima','Esmaltes','Queimas','Embalagens','Marketing',
    'Frete e entregas','Assinaturas','Impostos e taxas','Taxas bancárias',
    'Manutenção do ateliê','Café e alimentação','Outros'
  ];
  n text;
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOREACH n IN ARRAY income_cats LOOP
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE workspace_id = _workspace_id AND name = n AND type = 'income') THEN
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (_workspace_id, n, 'income', '#6E7A57', 'flexible');
      _cats_added := _cats_added + 1;
    END IF;
  END LOOP;

  FOREACH n IN ARRAY expense_cats LOOP
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE workspace_id = _workspace_id AND name = n AND type = 'expense') THEN
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (_workspace_id, n, 'expense', '#A03A2A', 'important');
      _cats_added := _cats_added + 1;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE workspace_id = _workspace_id AND name = 'Conta Nubank Selá') THEN
    INSERT INTO public.accounts (workspace_id, name, type, institution, initial_balance, initial_balance_date, is_active)
    VALUES (_workspace_id, 'Conta Nubank Selá', 'checking', 'Nubank', 0, CURRENT_DATE, true);
    _accts_added := _accts_added + 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE workspace_id = _workspace_id AND name = 'Lançamento manual') THEN
    INSERT INTO public.accounts (workspace_id, name, type, institution, initial_balance, initial_balance_date, is_active)
    VALUES (_workspace_id, 'Lançamento manual', 'cash', NULL, 0, CURRENT_DATE, true);
    _accts_added := _accts_added + 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.credit_cards WHERE workspace_id = _workspace_id AND name = 'Cartão Nubank Selá') THEN
    INSERT INTO public.credit_cards (workspace_id, name, institution, brand, limit_amount, closing_day, due_day, is_active)
    VALUES (_workspace_id, 'Cartão Nubank Selá', 'Nubank', 'Mastercard', 0, 3, 10, true);
  END IF;

  RETURN jsonb_build_object('categories_added', _cats_added, 'accounts_added', _accts_added);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_sela_defaults(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_sela_defaults(uuid) TO authenticated;