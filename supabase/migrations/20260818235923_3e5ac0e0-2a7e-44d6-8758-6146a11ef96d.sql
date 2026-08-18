-- ============ PLANS / PACKS ============
CREATE TABLE public.billing_plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  monthly_price numeric(12,2) NOT NULL,
  included_credits integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_plans TO authenticated;
GRANT ALL ON public.billing_plans TO service_role;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans readable by authenticated" ON public.billing_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans managed by super admin" ON public.billing_plans FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER billing_plans_uat BEFORE UPDATE ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.billing_plans (code, name, monthly_price, included_credits) VALUES
  ('personal', 'Selá Pessoal', 49.90, 2),
  ('atelier',  'Selá Atelier', 79.90, 4);

CREATE TABLE public.credit_packs (
  code text PRIMARY KEY,
  name text NOT NULL,
  credits integer NOT NULL,
  price numeric(12,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_packs TO authenticated;
GRANT ALL ON public.credit_packs TO service_role;
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packs readable by authenticated" ON public.credit_packs FOR SELECT TO authenticated USING (true);
CREATE POLICY "packs managed by super admin" ON public.credit_packs FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER credit_packs_uat BEFORE UPDATE ON public.credit_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.credit_packs (code, name, credits, price) VALUES
  ('pack_5',  '5 créditos',  5,  49.00),
  ('pack_15', '15 créditos', 15, 129.00),
  ('pack_30', '30 créditos', 30, 229.00);

-- ============ BILLING SETTINGS ============
CREATE TABLE public.billing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  simulation_enabled boolean NOT NULL DEFAULT true,
  credit_reference_value numeric(12,2) NOT NULL DEFAULT 10,
  default_payment_fee_percent numeric(6,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable" ON public.billing_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings managed by super admin" ON public.billing_settings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER billing_settings_uat BEFORE UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.billing_settings (id) VALUES (true);

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES public.billing_plans(code),
  monthly_price numeric(12,2) NOT NULL,
  included_credits integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing','active','past_due','canceled','suspended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_start date NOT NULL DEFAULT date_trunc('month', now())::date,
  current_period_end date NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  renewal_date date,
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_one_live_per_user
  ON public.subscriptions (user_id) WHERE status IN ('trialing','active','past_due','suspended');
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscription" ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "super admin manages subscriptions" ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER subscriptions_uat BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('subscription','credit_pack','refund','adjustment')),
  description text,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_fee numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  is_simulated boolean NOT NULL DEFAULT false,
  external_payment_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_user_paid_idx ON public.payments (user_id, paid_at);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments" ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "super admin manages payments" ON public.payments FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- ============ CREDIT LEDGER ============
CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  customization_request_id uuid REFERENCES public.customization_requests(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN
    ('monthly_grant','purchase','reservation','release','consumption','refund','adjustment','expiration')),
  credits_delta numeric(12,2) NOT NULL,
  monetary_reference_value numeric(12,2),
  reference_month date,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_ledger_user_idx ON public.credit_ledger (user_id, created_at DESC);
CREATE UNIQUE INDEX credit_ledger_monthly_grant_unique
  ON public.credit_ledger (user_id, reference_month) WHERE type = 'monthly_grant';
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ledger" ON public.credit_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "super admin manages ledger" ON public.credit_ledger FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- ============ WALLET (derived) ============
CREATE VIEW public.credit_wallets WITH (security_invoker = on) AS
SELECT
  l.user_id,
  round(coalesce(sum(l.credits_delta) FILTER (WHERE l.type <> 'consumption'), 0), 2) AS available_balance,
  round(coalesce(sum(CASE l.type
      WHEN 'reservation' THEN -l.credits_delta
      WHEN 'release' THEN -l.credits_delta
      WHEN 'consumption' THEN l.credits_delta
      ELSE 0 END), 0), 2) AS reserved_balance,
  round(coalesce(sum(l.credits_delta) FILTER (WHERE l.type = 'monthly_grant'), 0), 2) AS granted_total,
  round(coalesce(sum(l.credits_delta) FILTER (WHERE l.type = 'purchase'), 0), 2) AS purchased_total,
  round(coalesce(-sum(l.credits_delta) FILTER (WHERE l.type = 'consumption'), 0), 2) AS consumed_total,
  max(l.created_at) AS updated_at
FROM public.credit_ledger l
GROUP BY l.user_id;
GRANT SELECT ON public.credit_wallets TO authenticated;
GRANT SELECT ON public.credit_wallets TO service_role;

-- ============ CUSTOMIZATION REQUESTS EVOLUTION ============
ALTER TABLE public.customization_requests
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS reserved_credits numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumed_credits numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_status text NOT NULL DEFAULT 'pending_estimate',
  ADD COLUMN IF NOT EXISTS execution_status text NOT NULL DEFAULT 'requested',
  ADD COLUMN IF NOT EXISTS is_bug_fix boolean NOT NULL DEFAULT false;

ALTER TABLE public.customization_requests
  ADD CONSTRAINT customization_requests_pricing_status_check
  CHECK (pricing_status IN ('pending_estimate','quoted','approved','rejected'));
ALTER TABLE public.customization_requests
  ADD CONSTRAINT customization_requests_execution_status_check
  CHECK (execution_status IN ('requested','approved','building','testing','awaiting_user_validation','completed','canceled','failed'));

-- ============ CUSTOMIZATION COSTS (super admin only) ============
CREATE TABLE public.customization_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customization_request_id uuid NOT NULL REFERENCES public.customization_requests(id) ON DELETE CASCADE,
  lovable_credits_used numeric(12,2),
  lovable_cost_brl numeric(12,2),
  ai_api_cost_brl numeric(12,2),
  infra_cost_brl numeric(12,2),
  human_cost_brl numeric(12,2),
  other_variable_cost_brl numeric(12,2),
  total_variable_cost_brl numeric(12,2) GENERATED ALWAYS AS (
    coalesce(lovable_cost_brl,0) + coalesce(ai_api_cost_brl,0) + coalesce(infra_cost_brl,0)
    + coalesce(human_cost_brl,0) + coalesce(other_variable_cost_brl,0)
  ) STORED,
  implementation_attempts integer NOT NULL DEFAULT 0,
  corrections integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customization_costs_request_unique ON public.customization_costs (customization_request_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customization_costs TO authenticated;
GRANT ALL ON public.customization_costs TO service_role;
ALTER TABLE public.customization_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "costs super admin only" ON public.customization_costs FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER customization_costs_uat BEFORE UPDATE ON public.customization_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ OPERATING COSTS (super admin only) ============
CREATE TABLE public.operating_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_month date NOT NULL,
  category text NOT NULL CHECK (category IN
    ('lovable_fixed','supabase','domain','email','accounting','software','payroll','marketing','other')),
  description text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  is_fixed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operating_costs_month_idx ON public.operating_costs (reference_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operating_costs TO authenticated;
GRANT ALL ON public.operating_costs TO service_role;
ALTER TABLE public.operating_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operating costs super admin only" ON public.operating_costs FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER operating_costs_uat BEFORE UPDATE ON public.operating_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CREDIT ENGINE ============
CREATE OR REPLACE FUNCTION public.credit_balance_of(_user_id uuid)
RETURNS TABLE(available numeric, reserved numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    round(coalesce(sum(credits_delta) FILTER (WHERE type <> 'consumption'), 0), 2),
    round(coalesce(sum(CASE type
        WHEN 'reservation' THEN -credits_delta
        WHEN 'release' THEN -credits_delta
        WHEN 'consumption' THEN credits_delta
        ELSE 0 END), 0), 2)
  FROM public.credit_ledger WHERE user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.grant_monthly_credits(_user_id uuid, _reference_month date DEFAULT date_trunc('month', now())::date)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sub public.subscriptions; _m date := date_trunc('month', _reference_month)::date;
BEGIN
  IF auth.uid() <> _user_id AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO _sub FROM public.subscriptions
   WHERE user_id = _user_id AND status IN ('active','trialing') LIMIT 1;
  IF _sub IS NULL OR _sub.included_credits <= 0 THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.credit_ledger
      WHERE user_id = _user_id AND type = 'monthly_grant' AND reference_month = _m) THEN
    RETURN 0;
  END IF;
  INSERT INTO public.credit_ledger (user_id, type, credits_delta, reference_month, description,
    monetary_reference_value)
  VALUES (_user_id, 'monthly_grant', _sub.included_credits, _m,
    'Créditos incluídos no plano ' || _sub.plan_code,
    _sub.included_credits * (SELECT credit_reference_value FROM public.billing_settings LIMIT 1));
  RETURN _sub.included_credits;
END; $$;

CREATE OR REPLACE FUNCTION public.purchase_credit_pack(_pack_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pack public.credit_packs; _sim boolean; _uid uuid := auth.uid(); _payment_id uuid; _fee numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT simulation_enabled INTO _sim FROM public.billing_settings LIMIT 1;
  IF NOT coalesce(_sim, false) AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'Compra de créditos indisponível: pagamento real ainda não está conectado.';
  END IF;
  SELECT * INTO _pack FROM public.credit_packs WHERE code = _pack_code AND is_active;
  IF _pack IS NULL THEN RAISE EXCEPTION 'Pacote inválido.'; END IF;
  _fee := round(_pack.price * coalesce((SELECT default_payment_fee_percent FROM public.billing_settings LIMIT 1),0) / 100, 2);
  INSERT INTO public.payments (user_id, type, description, gross_amount, payment_fee, net_amount,
      status, is_simulated, paid_at)
  VALUES (_uid, 'credit_pack', _pack.name, _pack.price, _fee, _pack.price - _fee, 'paid', true, now())
  RETURNING id INTO _payment_id;
  INSERT INTO public.credit_ledger (user_id, payment_id, type, credits_delta, monetary_reference_value, description)
  VALUES (_uid, _payment_id, 'purchase', _pack.credits, _pack.price, 'Compra de pacote ' || _pack.name);
  RETURN _payment_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_customization_credits(_request_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _req public.customization_requests; _need numeric; _avail numeric; _res numeric;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF _req.user_id <> auth.uid() AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _req.is_bug_fix THEN
    UPDATE public.customization_requests
       SET pricing_status = 'approved', execution_status = 'approved', approved_at = coalesce(approved_at, now())
     WHERE id = _request_id;
    RETURN 0;
  END IF;
  IF _req.reserved_credits > 0 OR _req.consumed_credits > 0 THEN RETURN _req.reserved_credits; END IF;
  _need := greatest(coalesce(_req.approved_credits, _req.estimated_credits, 0), 0);
  IF _need = 0 THEN
    UPDATE public.customization_requests
       SET pricing_status = 'approved', execution_status = 'approved', approved_at = coalesce(approved_at, now())
     WHERE id = _request_id;
    RETURN 0;
  END IF;
  SELECT available, reserved INTO _avail, _res FROM public.credit_balance_of(_req.user_id);
  IF _avail < _need THEN
    RAISE EXCEPTION 'Saldo insuficiente: % crédito(s) disponível(is), % necessário(s).', _avail, _need;
  END IF;
  INSERT INTO public.credit_ledger (user_id, workspace_id, customization_request_id, type,
      credits_delta, description)
  VALUES (_req.user_id, _req.workspace_id, _req.id, 'reservation', -_need, 'Reserva de créditos da personalização');
  UPDATE public.customization_requests
     SET reserved_credits = _need, pricing_status = 'approved', execution_status = 'approved',
         approved_at = coalesce(approved_at, now())
   WHERE id = _request_id;
  RETURN _need;
END; $$;

CREATE OR REPLACE FUNCTION public.consume_customization_credits(_request_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _req public.customization_requests; _amount numeric;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF _req.user_id <> auth.uid() AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _req.consumed_credits > 0 THEN RETURN _req.consumed_credits; END IF;
  _amount := coalesce(_req.reserved_credits, 0);
  IF _amount > 0 THEN
    INSERT INTO public.credit_ledger (user_id, workspace_id, customization_request_id, type,
        credits_delta, monetary_reference_value, description)
    VALUES (_req.user_id, _req.workspace_id, _req.id, 'consumption', -_amount,
      _amount * (SELECT credit_reference_value FROM public.billing_settings LIMIT 1),
      'Consumo de créditos da personalização concluída');
  END IF;
  UPDATE public.customization_requests
     SET reserved_credits = 0, consumed_credits = _amount, execution_status = 'completed',
         completed_at = coalesce(completed_at, now())
   WHERE id = _request_id;
  RETURN _amount;
END; $$;

CREATE OR REPLACE FUNCTION public.release_customization_credits(_request_id uuid, _reason text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _req public.customization_requests; _amount numeric;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF _req.user_id <> auth.uid() AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  _amount := coalesce(_req.reserved_credits, 0);
  IF _amount > 0 THEN
    INSERT INTO public.credit_ledger (user_id, workspace_id, customization_request_id, type,
        credits_delta, description)
    VALUES (_req.user_id, _req.workspace_id, _req.id, 'release', _amount,
      coalesce(_reason, 'Liberação de reserva de créditos'));
  END IF;
  UPDATE public.customization_requests
     SET reserved_credits = 0, execution_status = 'canceled'
   WHERE id = _request_id;
  RETURN _amount;
END; $$;

REVOKE EXECUTE ON FUNCTION public.credit_balance_of(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_monthly_credits(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.purchase_credit_pack(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reserve_customization_credits(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_customization_credits(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_customization_credits(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_balance_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_monthly_credits(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_credit_pack(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_customization_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_customization_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_customization_credits(uuid, text) TO authenticated;

-- ============ ADMIN ANALYTICS ============
CREATE OR REPLACE FUNCTION public.admin_unit_economics(_month integer, _year integer)
RETURNS TABLE(
  user_id uuid, customer_name text, customer_email text, plan_code text, subscription_status text,
  subscription_revenue numeric, credit_pack_revenue numeric, total_revenue numeric,
  payment_fees numeric, direct_customization_costs numeric, direct_variable_costs numeric,
  contribution_margin numeric, contribution_margin_pct numeric,
  credits_granted numeric, credits_purchased numeric, credits_consumed numeric,
  current_credit_balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _start date := make_date(_year, _month, 1); _end date := (make_date(_year, _month, 1) + interval '1 month')::date;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden: super admin only'; END IF;
  RETURN QUERY
  WITH people AS (
    SELECT DISTINCT u.id FROM (
      SELECT s.user_id AS id FROM public.subscriptions s
      UNION SELECT p.user_id FROM public.payments p WHERE p.paid_at >= _start AND p.paid_at < _end
      UNION SELECT l.user_id FROM public.credit_ledger l
    ) u
  ),
  pay AS (
    SELECT p.user_id,
      sum(p.gross_amount) FILTER (WHERE p.type = 'subscription') AS sub_rev,
      sum(p.gross_amount) FILTER (WHERE p.type = 'credit_pack') AS pack_rev,
      sum(p.gross_amount) FILTER (WHERE p.type = 'refund') AS refunds,
      sum(p.payment_fee) AS fees
    FROM public.payments p
    WHERE p.status = 'paid' AND p.paid_at >= _start AND p.paid_at < _end
    GROUP BY p.user_id
  ),
  costs AS (
    SELECT r.user_id, sum(c.total_variable_cost_brl) AS direct
    FROM public.customization_costs c
    JOIN public.customization_requests r ON r.id = c.customization_request_id
    WHERE c.created_at >= _start AND c.created_at < _end
    GROUP BY r.user_id
  ),
  led AS (
    SELECT l.user_id,
      sum(l.credits_delta) FILTER (WHERE l.type = 'monthly_grant' AND l.created_at >= _start AND l.created_at < _end) AS granted,
      sum(l.credits_delta) FILTER (WHERE l.type = 'purchase' AND l.created_at >= _start AND l.created_at < _end) AS purchased,
      -sum(l.credits_delta) FILTER (WHERE l.type = 'consumption' AND l.created_at >= _start AND l.created_at < _end) AS consumed,
      sum(l.credits_delta) FILTER (WHERE l.type <> 'consumption') AS balance
    FROM public.credit_ledger l GROUP BY l.user_id
  )
  SELECT
    pe.id,
    coalesce(nullif(pr.display_name, ''), pr.email, 'Usuário'),
    pr.email,
    s.plan_code,
    s.status,
    coalesce(pay.sub_rev, 0),
    coalesce(pay.pack_rev, 0),
    coalesce(pay.sub_rev, 0) + coalesce(pay.pack_rev, 0) - coalesce(pay.refunds, 0),
    coalesce(pay.fees, 0),
    coalesce(costs.direct, 0),
    coalesce(costs.direct, 0),
    (coalesce(pay.sub_rev, 0) + coalesce(pay.pack_rev, 0) - coalesce(pay.refunds, 0))
      - coalesce(pay.fees, 0) - coalesce(costs.direct, 0),
    CASE WHEN coalesce(pay.sub_rev, 0) + coalesce(pay.pack_rev, 0) - coalesce(pay.refunds, 0) > 0
      THEN round(100 * ((coalesce(pay.sub_rev,0) + coalesce(pay.pack_rev,0) - coalesce(pay.refunds,0))
        - coalesce(pay.fees,0) - coalesce(costs.direct,0))
        / (coalesce(pay.sub_rev,0) + coalesce(pay.pack_rev,0) - coalesce(pay.refunds,0)), 2)
      ELSE 0 END,
    coalesce(led.granted, 0), coalesce(led.purchased, 0), coalesce(led.consumed, 0), coalesce(led.balance, 0)
  FROM people pe
  LEFT JOIN public.profiles pr ON pr.id = pe.id
  LEFT JOIN LATERAL (
    SELECT sub.plan_code, sub.status FROM public.subscriptions sub
    WHERE sub.user_id = pe.id ORDER BY sub.created_at DESC LIMIT 1
  ) s ON true
  LEFT JOIN pay ON pay.user_id = pe.id
  LEFT JOIN costs ON costs.user_id = pe.id
  LEFT JOIN led ON led.user_id = pe.id
  ORDER BY 8 DESC NULLS LAST;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_operation_result(_month integer, _year integer)
RETURNS TABLE(
  active_customers integer, mrr numeric, subscription_revenue numeric, credit_pack_revenue numeric,
  total_revenue numeric, payment_fees numeric, customization_variable_costs numeric,
  total_variable_costs numeric, contribution_margin numeric, contribution_margin_pct numeric,
  fixed_operating_costs numeric, operating_profit numeric, operating_margin_pct numeric,
  credits_consumed numeric, economic_value_of_credits_consumed numeric,
  avg_cost_per_consumed_credit numeric, personalization_economic_margin numeric,
  personalization_economic_margin_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _start date := make_date(_year, _month, 1);
  _end date := (make_date(_year, _month, 1) + interval '1 month')::date;
  _ref numeric := coalesce((SELECT credit_reference_value FROM public.billing_settings LIMIT 1), 10);
  _sub numeric; _pack numeric; _refunds numeric; _fees numeric; _cust numeric;
  _fixed numeric; _variable_fixedish numeric; _consumed numeric; _active integer; _mrr numeric;
  _rev numeric; _cm numeric; _op numeric; _econ numeric;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden: super admin only'; END IF;
  SELECT coalesce(sum(p.gross_amount) FILTER (WHERE p.type='subscription'),0),
         coalesce(sum(p.gross_amount) FILTER (WHERE p.type='credit_pack'),0),
         coalesce(sum(p.gross_amount) FILTER (WHERE p.type='refund'),0),
         coalesce(sum(p.payment_fee),0)
    INTO _sub, _pack, _refunds, _fees
    FROM public.payments p
   WHERE p.status='paid' AND p.paid_at >= _start AND p.paid_at < _end;

  SELECT coalesce(sum(c.total_variable_cost_brl),0) INTO _cust
    FROM public.customization_costs c
   WHERE c.created_at >= _start AND c.created_at < _end;

  SELECT coalesce(sum(o.amount) FILTER (WHERE o.is_fixed),0),
         coalesce(sum(o.amount) FILTER (WHERE NOT o.is_fixed),0)
    INTO _fixed, _variable_fixedish
    FROM public.operating_costs o
   WHERE date_trunc('month', o.reference_month)::date = _start;

  SELECT coalesce(-sum(l.credits_delta),0) INTO _consumed
    FROM public.credit_ledger l
   WHERE l.type='consumption' AND l.created_at >= _start AND l.created_at < _end;

  SELECT count(*)::int, coalesce(sum(s.monthly_price),0) INTO _active, _mrr
    FROM public.subscriptions s WHERE s.status IN ('active','trialing');

  _rev := _sub + _pack - _refunds;
  _cm := _rev - _fees - (_cust + _variable_fixedish);
  _op := _cm - _fixed;
  _econ := _consumed * _ref;

  RETURN QUERY SELECT
    _active, _mrr, _sub, _pack, _rev, _fees, _cust, (_cust + _variable_fixedish), _cm,
    CASE WHEN _rev > 0 THEN round(100 * _cm / _rev, 2) ELSE 0 END,
    _fixed, _op,
    CASE WHEN _rev > 0 THEN round(100 * _op / _rev, 2) ELSE 0 END,
    _consumed, _econ,
    CASE WHEN _consumed > 0 THEN round(_cust / _consumed, 2) ELSE 0 END,
    (_econ - _cust),
    CASE WHEN _econ > 0 THEN round(100 * (_econ - _cust) / _econ, 2) ELSE 0 END;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_customization_economics(_month integer, _year integer)
RETURNS TABLE(
  request_id uuid, title text, request_text text, customer_name text, customer_email text,
  workspace_name text, credits_charged numeric, economic_value numeric,
  lovable_cost numeric, ai_cost numeric, infra_cost numeric, human_cost numeric,
  other_cost numeric, total_variable_cost numeric, economic_margin numeric,
  economic_margin_pct numeric, attempts integer, corrections integer,
  is_bug_fix boolean, execution_status text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _start date := make_date(_year, _month, 1);
  _end date := (make_date(_year, _month, 1) + interval '1 month')::date;
  _ref numeric := coalesce((SELECT credit_reference_value FROM public.billing_settings LIMIT 1), 10);
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden: super admin only'; END IF;
  RETURN QUERY
  SELECT r.id,
    coalesce(nullif(r.title,''), left(r.request_text, 60)),
    r.request_text,
    coalesce(nullif(pr.display_name,''), pr.email, 'Usuário'),
    pr.email,
    w.name,
    coalesce(r.consumed_credits, 0),
    coalesce(r.consumed_credits, 0) * _ref,
    coalesce(c.lovable_cost_brl, 0), coalesce(c.ai_api_cost_brl, 0), coalesce(c.infra_cost_brl, 0),
    coalesce(c.human_cost_brl, 0), coalesce(c.other_variable_cost_brl, 0),
    coalesce(c.total_variable_cost_brl, 0),
    (coalesce(r.consumed_credits,0) * _ref) - coalesce(c.total_variable_cost_brl, 0),
    CASE WHEN coalesce(r.consumed_credits,0) * _ref > 0
      THEN round(100 * ((coalesce(r.consumed_credits,0) * _ref) - coalesce(c.total_variable_cost_brl,0))
        / (coalesce(r.consumed_credits,0) * _ref), 2) ELSE 0 END,
    coalesce(c.implementation_attempts, 0), coalesce(c.corrections, 0),
    r.is_bug_fix, r.execution_status, r.created_at
  FROM public.customization_requests r
  LEFT JOIN public.customization_costs c ON c.customization_request_id = r.id
  LEFT JOIN public.profiles pr ON pr.id = r.user_id
  LEFT JOIN public.workspaces w ON w.id = r.workspace_id
  WHERE r.created_at >= _start AND r.created_at < _end
  ORDER BY r.created_at DESC;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_unit_economics(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_operation_result(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_customization_economics(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unit_economics(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_operation_result(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customization_economics(integer, integer) TO authenticated;