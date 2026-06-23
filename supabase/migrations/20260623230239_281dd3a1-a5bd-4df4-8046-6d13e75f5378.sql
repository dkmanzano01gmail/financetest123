
-- 1. Categories: extra fields
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS importance_comment TEXT,
  ADD COLUMN IF NOT EXISTS is_cuttable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cut_priority INT NOT NULL DEFAULT 0;

-- Mark non-essential as cuttable by default
UPDATE public.categories SET is_cuttable = TRUE WHERE importance_level IN ('flexible','superfluous') AND is_cuttable = FALSE;

-- 2. Transactions: importance fields
DO $$ BEGIN
  CREATE TYPE public.importance_status AS ENUM ('suggested','confirmed','manually_changed','needs_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS importance_level public.importance_level,
  ADD COLUMN IF NOT EXISTS suggested_importance_level public.importance_level,
  ADD COLUMN IF NOT EXISTS suggested_category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS importance_confidence NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS importance_suggestion_reason TEXT,
  ADD COLUMN IF NOT EXISTS importance_confirmed_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS importance_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS importance_status public.importance_status;

CREATE INDEX IF NOT EXISTS idx_transactions_importance ON public.transactions(workspace_id, importance_level);

-- 3. Importance rules table
CREATE TABLE IF NOT EXISTS public.importance_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  match_text TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'contains' CHECK (match_mode IN ('contains','equals','starts_with','regex')),
  category_hint TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  importance_level public.importance_level NOT NULL,
  transaction_type public.transaction_type,
  source_type TEXT NOT NULL DEFAULT 'system' CHECK (source_type IN ('system','user','learned')),
  workspace_type TEXT CHECK (workspace_type IN ('personal','business')),
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.700,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.importance_rules TO authenticated;
GRANT ALL ON public.importance_rules TO service_role;

ALTER TABLE public.importance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read rules: global or workspace member" ON public.importance_rules
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR app_private.is_workspace_member(workspace_id, auth.uid())
  );

CREATE POLICY "Write workspace rules" ON public.importance_rules
  FOR ALL TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member')
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member')
  );

CREATE TRIGGER update_importance_rules_updated_at BEFORE UPDATE ON public.importance_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_importance_rules_lookup ON public.importance_rules(workspace_id, is_active);

-- 4. Seed global system rules
INSERT INTO public.importance_rules (workspace_id, match_text, match_mode, category_hint, importance_level, transaction_type, source_type, workspace_type, confidence)
VALUES
  -- Personal essentials
  (NULL, 'aluguel',     'contains', 'Moradia',    'essential',   'expense', 'system', 'personal', 0.95),
  (NULL, 'condominio',  'contains', 'Moradia',    'essential',   'expense', 'system', 'personal', 0.9),
  (NULL, 'condomínio',  'contains', 'Moradia',    'essential',   'expense', 'system', 'personal', 0.9),
  (NULL, 'luz',         'contains', 'Moradia',    'essential',   'expense', 'system', 'personal', 0.7),
  (NULL, 'energia',     'contains', 'Moradia',    'essential',   'expense', 'system', 'personal', 0.85),
  (NULL, 'agua',        'contains', 'Moradia',    'essential',   'expense', 'system', 'personal', 0.85),
  (NULL, 'água',        'contains', 'Moradia',    'essential',   'expense', 'system', 'personal', 0.85),
  (NULL, 'internet',    'contains', 'Moradia',    'essential',   'expense', 'system', 'personal', 0.8),
  (NULL, 'mercado',     'contains', 'Mercado',    'essential',   'expense', 'system', 'personal', 0.9),
  (NULL, 'supermercado','contains', 'Mercado',    'essential',   'expense', 'system', 'personal', 0.95),
  (NULL, 'pao de acucar','contains','Mercado',    'essential',   'expense', 'system', 'personal', 0.95),
  (NULL, 'carrefour',   'contains', 'Mercado',    'essential',   'expense', 'system', 'personal', 0.9),
  (NULL, 'farmacia',    'contains', 'Saúde',      'essential',   'expense', 'system', 'personal', 0.9),
  (NULL, 'farmácia',    'contains', 'Saúde',      'essential',   'expense', 'system', 'personal', 0.9),
  (NULL, 'drogaria',    'contains', 'Saúde',      'essential',   'expense', 'system', 'personal', 0.9),
  (NULL, 'hospital',    'contains', 'Saúde',      'essential',   'expense', 'system', 'personal', 0.9),
  -- Important
  (NULL, 'uber',        'contains', 'Transporte', 'important',   'expense', 'system', 'personal', 0.9),
  (NULL, '99 ',         'contains', 'Transporte', 'important',   'expense', 'system', 'personal', 0.7),
  (NULL, '99app',       'contains', 'Transporte', 'important',   'expense', 'system', 'personal', 0.9),
  (NULL, 'posto',       'contains', 'Transporte', 'important',   'expense', 'system', 'personal', 0.75),
  (NULL, 'combustivel', 'contains', 'Transporte', 'important',   'expense', 'system', 'personal', 0.85),
  (NULL, 'gasolina',    'contains', 'Transporte', 'important',   'expense', 'system', 'personal', 0.9),
  (NULL, 'escola',      'contains', 'Educação',   'important',   'expense', 'system', 'personal', 0.85),
  (NULL, 'faculdade',   'contains', 'Educação',   'important',   'expense', 'system', 'personal', 0.9),
  (NULL, 'curso',       'contains', 'Educação',   'important',   'expense', 'system', 'personal', 0.7),
  -- Flexible
  (NULL, 'netflix',     'contains', 'Assinaturas','flexible',    'expense', 'system', 'personal', 0.98),
  (NULL, 'spotify',     'contains', 'Assinaturas','flexible',    'expense', 'system', 'personal', 0.98),
  (NULL, 'disney',      'contains', 'Assinaturas','flexible',    'expense', 'system', 'personal', 0.9),
  (NULL, 'prime video', 'contains', 'Assinaturas','flexible',    'expense', 'system', 'personal', 0.95),
  (NULL, 'hbo',         'contains', 'Assinaturas','flexible',    'expense', 'system', 'personal', 0.85),
  (NULL, 'restaurante', 'contains', 'Restaurantes','flexible',   'expense', 'system', 'personal', 0.9),
  (NULL, 'lanchonete',  'contains', 'Restaurantes','flexible',   'expense', 'system', 'personal', 0.9),
  (NULL, 'padaria',     'contains', 'Restaurantes','flexible',   'expense', 'system', 'personal', 0.85),
  -- Superfluous
  (NULL, 'ifood',       'contains', 'Restaurantes','superfluous','expense', 'system', 'personal', 0.95),
  (NULL, 'rappi',       'contains', 'Restaurantes','superfluous','expense', 'system', 'personal', 0.95),
  (NULL, 'uber eats',   'contains', 'Restaurantes','superfluous','expense', 'system', 'personal', 0.95),
  -- Income
  (NULL, 'salario',     'contains', 'Salário',    'essential',   'income',  'system', 'personal', 0.95),
  (NULL, 'salário',     'contains', 'Salário',    'essential',   'income',  'system', 'personal', 0.95),
  -- Business
  (NULL, 'imposto',     'contains', 'Impostos',   'essential',   'expense', 'system', 'business', 0.95),
  (NULL, 'das ',        'contains', 'Impostos',   'essential',   'expense', 'system', 'business', 0.7),
  (NULL, 'darf',        'contains', 'Impostos',   'essential',   'expense', 'system', 'business', 0.85),
  (NULL, 'fornecedor',  'contains', 'Fornecedores','essential',  'expense', 'system', 'business', 0.85),
  (NULL, 'aluguel',     'contains', 'Aluguel/estrutura','essential','expense','system','business', 0.95),
  (NULL, 'salario',     'contains', 'Equipe',     'essential',   'expense', 'system', 'business', 0.9),
  (NULL, 'folha',       'contains', 'Equipe',     'essential',   'expense', 'system', 'business', 0.85),
  (NULL, 'meta ads',    'contains', 'Marketing',  'important',   'expense', 'system', 'business', 0.95),
  (NULL, 'google ads',  'contains', 'Marketing',  'important',   'expense', 'system', 'business', 0.95),
  (NULL, 'facebook',    'contains', 'Marketing',  'important',   'expense', 'system', 'business', 0.7),
  (NULL, 'correios',    'contains', 'Frete',      'important',   'expense', 'system', 'business', 0.9),
  (NULL, 'frete',       'contains', 'Frete',      'important',   'expense', 'system', 'business', 0.9)
ON CONFLICT DO NOTHING;

-- 5. Backfill transactions: inherit importance from category, mark as suggested
UPDATE public.transactions t
   SET importance_level = c.importance_level,
       importance_status = 'suggested',
       importance_confidence = 0.6,
       importance_suggestion_reason = 'Importância padrão da categoria'
  FROM public.categories c
 WHERE t.category_id = c.id
   AND t.importance_level IS NULL;
