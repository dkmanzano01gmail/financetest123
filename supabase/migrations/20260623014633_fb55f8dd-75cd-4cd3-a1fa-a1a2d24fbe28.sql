
-- Importance level enum + column on categories
CREATE TYPE public.importance_level AS ENUM ('essential','important','flexible','superfluous');

ALTER TABLE public.categories
  ADD COLUMN importance_level public.importance_level NOT NULL DEFAULT 'flexible';

-- Auto-classify existing categories by name
UPDATE public.categories SET importance_level = 'essential'
  WHERE lower(name) IN ('moradia','saúde','saude','mercado','impostos','aluguel/estrutura','aluguel','matéria-prima','materia-prima','fornecedores','equipe');
UPDATE public.categories SET importance_level = 'important'
  WHERE lower(name) IN ('transporte','educação','educacao','seguros','taxas bancárias','taxas bancarias','frete','manutenção','manutencao','marketing');
UPDATE public.categories SET importance_level = 'flexible'
  WHERE lower(name) IN ('restaurantes','lazer','viagens','assinaturas','presentes','alimentação','alimentacao','aulas','consultoria');
UPDATE public.categories SET importance_level = 'superfluous'
  WHERE lower(name) IN ('compras','outros');

-- Update workspace seed function to set importance automatically
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  personal_income TEXT[] := ARRAY['Salário','Freelance','Reembolso','Investimentos','Presente','Outros'];
  personal_expense_essential TEXT[] := ARRAY['Moradia','Mercado','Saúde','Impostos'];
  personal_expense_important TEXT[] := ARRAY['Transporte','Educação','Taxas bancárias'];
  personal_expense_flexible  TEXT[] := ARRAY['Restaurantes','Lazer','Viagens','Assinaturas','Presentes'];
  personal_expense_superfluous TEXT[] := ARRAY['Compras','Outros'];
  business_income TEXT[] := ARRAY['Vendas','Serviços','Aulas','Consultoria','Reembolso','Aporte','Outros'];
  business_expense_essential TEXT[] := ARRAY['Fornecedores','Matéria-prima','Aluguel/estrutura','Equipe','Impostos'];
  business_expense_important TEXT[] := ARRAY['Marketing','Frete','Manutenção','Taxas bancárias'];
  business_expense_flexible  TEXT[] := ARRAY['Assinaturas','Alimentação','Cartão de crédito'];
  business_expense_superfluous TEXT[] := ARRAY['Outros'];
  n TEXT;
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;

  IF NEW.type = 'personal' THEN
    FOREACH n IN ARRAY personal_income LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'income', '#16a34a', 'flexible');
    END LOOP;
    FOREACH n IN ARRAY personal_expense_essential LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'expense', '#c2410c', 'essential'); END LOOP;
    FOREACH n IN ARRAY personal_expense_important LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'expense', '#c2410c', 'important'); END LOOP;
    FOREACH n IN ARRAY personal_expense_flexible LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'expense', '#c2410c', 'flexible'); END LOOP;
    FOREACH n IN ARRAY personal_expense_superfluous LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'expense', '#c2410c', 'superfluous'); END LOOP;
  ELSE
    FOREACH n IN ARRAY business_income LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'income', '#16a34a', 'flexible'); END LOOP;
    FOREACH n IN ARRAY business_expense_essential LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'expense', '#c2410c', 'essential'); END LOOP;
    FOREACH n IN ARRAY business_expense_important LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'expense', '#c2410c', 'important'); END LOOP;
    FOREACH n IN ARRAY business_expense_flexible LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'expense', '#c2410c', 'flexible'); END LOOP;
    FOREACH n IN ARRAY business_expense_superfluous LOOP
      INSERT INTO public.categories (workspace_id, name, type, color, importance_level)
      VALUES (NEW.id, n, 'expense', '#c2410c', 'superfluous'); END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- Accounts: add manual balance fields
ALTER TABLE public.accounts
  ADD COLUMN current_manual_balance numeric(14,2),
  ADD COLUMN current_manual_balance_date date;

-- Budgets
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year int NOT NULL,
  planned_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, category_id, month, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budgets_select" ON public.budgets FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "budgets_write" ON public.budgets FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER trg_budgets_updated BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Account balance snapshots
CREATE TYPE public.balance_snapshot_type AS ENUM ('initial','manual_current','reconciliation_check','adjustment');

CREATE TABLE public.account_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  balance_type public.balance_snapshot_type NOT NULL,
  balance_amount numeric(14,2) NOT NULL,
  balance_date date NOT NULL,
  source text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_balance_snapshots TO authenticated;
GRANT ALL ON public.account_balance_snapshots TO service_role;
ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abs_select" ON public.account_balance_snapshots FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "abs_write" ON public.account_balance_snapshots FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Account reconciliations
CREATE TYPE public.reconciliation_status AS ENUM ('reconciled','small_diff','relevant_diff','no_balance','needs_review');

CREATE TABLE public.account_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  calculated_balance numeric(14,2) NOT NULL,
  reported_balance numeric(14,2) NOT NULL,
  difference_amount numeric(14,2) NOT NULL,
  tolerance_amount numeric(14,2) NOT NULL DEFAULT 1,
  status public.reconciliation_status NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_reconciliations TO authenticated;
GRANT ALL ON public.account_reconciliations TO service_role;
ALTER TABLE public.account_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recon_select" ON public.account_reconciliations FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "recon_write" ON public.account_reconciliations FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER trg_recon_updated BEFORE UPDATE ON public.account_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
