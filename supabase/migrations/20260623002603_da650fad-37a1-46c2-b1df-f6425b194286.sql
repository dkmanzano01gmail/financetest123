
-- Enums
CREATE TYPE public.workspace_type AS ENUM ('personal', 'business');
CREATE TYPE public.workspace_role AS ENUM ('owner', 'member', 'viewer');
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
CREATE TYPE public.transaction_status AS ENUM ('confirmed', 'pending', 'ignored');
CREATE TYPE public.account_type AS ENUM ('checking', 'savings', 'cash', 'investment', 'other');

-- Utility function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Workspaces
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.workspace_type NOT NULL DEFAULT 'personal',
  currency TEXT NOT NULL DEFAULT 'BRL',
  country TEXT NOT NULL DEFAULT 'BR',
  privacy_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Workspace members
CREATE TABLE public.workspace_members (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.workspace_role_of(_workspace_id UUID, _user_id UUID)
RETURNS public.workspace_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id;
$$;

-- Policies for workspaces
CREATE POLICY "Members read workspace" ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "Anyone authed can create own workspace" ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update workspace" ON public.workspaces FOR UPDATE TO authenticated
  USING (public.workspace_role_of(id, auth.uid()) = 'owner');
CREATE POLICY "Owners delete workspace" ON public.workspaces FOR DELETE TO authenticated
  USING (public.workspace_role_of(id, auth.uid()) = 'owner');

-- Policies for workspace_members
CREATE POLICY "Members read members" ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Owners manage members" ON public.workspace_members FOR ALL TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) = 'owner' OR user_id = auth.uid())
  WITH CHECK (public.workspace_role_of(workspace_id, auth.uid()) = 'owner' OR user_id = auth.uid());

-- Helper: standard policies for workspace-scoped operational tables
-- (we inline them per table for clarity)

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.transaction_type NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_workspace ON public.categories(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read categories" ON public.categories FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Editors write categories" ON public.categories FOR ALL TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'))
  WITH CHECK (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'));

-- Accounts
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution TEXT,
  type public.account_type NOT NULL DEFAULT 'checking',
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  initial_balance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounts_workspace ON public.accounts(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read accounts" ON public.accounts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Editors write accounts" ON public.accounts FOR ALL TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'))
  WITH CHECK (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'));

-- Credit cards
CREATE TABLE public.credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  institution TEXT,
  brand TEXT,
  limit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_day INTEGER NOT NULL DEFAULT 1 CHECK (closing_day BETWEEN 1 AND 31),
  due_day INTEGER NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 31),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_cards_workspace ON public.credit_cards(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_cards TO authenticated;
GRANT ALL ON public.credit_cards TO service_role;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read cards" ON public.credit_cards FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Editors write cards" ON public.credit_cards FOR ALL TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'))
  WITH CHECK (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'));

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  type public.transaction_type NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  counterparty TEXT,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  credit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  method TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status public.transaction_status NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  import_hash TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_workspace_date ON public.transactions(workspace_id, date DESC);
CREATE INDEX idx_transactions_workspace_month ON public.transactions(workspace_id, year, month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read transactions" ON public.transactions FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Editors write transactions" ON public.transactions FOR ALL TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'))
  WITH CHECK (public.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'));
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto fill month/year
CREATE OR REPLACE FUNCTION public.set_transaction_period()
RETURNS TRIGGER AS $$
BEGIN
  NEW.month = EXTRACT(MONTH FROM NEW.date)::INT;
  NEW.year = EXTRACT(YEAR FROM NEW.date)::INT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_transaction_period_trg BEFORE INSERT OR UPDATE OF date ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_transaction_period();

-- On workspace create: add owner membership + seed categories
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS TRIGGER AS $$
DECLARE
  cat RECORD;
  personal_income TEXT[] := ARRAY['Salário','Freelance','Reembolso','Investimentos','Presente','Outros'];
  personal_expense TEXT[] := ARRAY['Moradia','Mercado','Restaurantes','Transporte','Saúde','Educação','Lazer','Viagens','Assinaturas','Compras','Impostos','Taxas bancárias','Presentes','Outros'];
  business_income TEXT[] := ARRAY['Vendas','Serviços','Aulas','Consultoria','Reembolso','Aporte','Outros'];
  business_expense TEXT[] := ARRAY['Fornecedores','Matéria-prima','Marketing','Aluguel/estrutura','Equipe','Impostos','Taxas bancárias','Assinaturas','Frete','Manutenção','Alimentação','Cartão de crédito','Outros'];
  income_names TEXT[];
  expense_names TEXT[];
  n TEXT;
BEGIN
  -- owner membership
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;

  IF NEW.type = 'personal' THEN
    income_names := personal_income; expense_names := personal_expense;
  ELSE
    income_names := business_income; expense_names := business_expense;
  END IF;

  FOREACH n IN ARRAY income_names LOOP
    INSERT INTO public.categories (workspace_id, name, type, color)
    VALUES (NEW.id, n, 'income', '#16a34a');
  END LOOP;
  FOREACH n IN ARRAY expense_names LOOP
    INSERT INTO public.categories (workspace_id, name, type, color)
    VALUES (NEW.id, n, 'expense', '#c2410c');
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_workspace_created
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace();
