CREATE TABLE IF NOT EXISTS public.cash_flow_monthly_balances (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  balance_month date NOT NULL,
  starting_balance numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, balance_month),
  CONSTRAINT cash_flow_monthly_balances_first_day_check
    CHECK (balance_month = date_trunc('month', balance_month)::date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_flow_monthly_balances TO authenticated;
GRANT ALL ON public.cash_flow_monthly_balances TO service_role;

ALTER TABLE public.cash_flow_monthly_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cfmb_all" ON public.cash_flow_monthly_balances;
CREATE POLICY "cfmb_all" ON public.cash_flow_monthly_balances FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

DROP TRIGGER IF EXISTS cfmb_uat ON public.cash_flow_monthly_balances;
CREATE TRIGGER cfmb_uat BEFORE UPDATE ON public.cash_flow_monthly_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
