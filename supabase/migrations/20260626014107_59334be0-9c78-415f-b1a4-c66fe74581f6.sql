
-- Phase 1+3: Extend importance_rules with rich operators for the categorization engine.
-- Backwards-compatible: existing rows keep match_text/match_mode semantics.

ALTER TABLE public.importance_rules
  ADD COLUMN IF NOT EXISTS rule_kind text NOT NULL DEFAULT 'descriptor',
  ADD COLUMN IF NOT EXISTS amount_operator text,
  ADD COLUMN IF NOT EXISTS amount_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS amount_value_2 numeric(14,2),
  ADD COLUMN IF NOT EXISTS counterparty_match text,
  ADD COLUMN IF NOT EXISTS counterparty_match_mode text DEFAULT 'contains',
  ADD COLUMN IF NOT EXISTS recurrence_min_count integer,
  ADD COLUMN IF NOT EXISTS recurrence_window_days integer,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS notes text;

-- Allow match_text to be optional now that rules can be amount-only or recurrence-only.
ALTER TABLE public.importance_rules ALTER COLUMN match_text DROP NOT NULL;

-- Drop old constraints if present, then re-add with the new vocabulary.
ALTER TABLE public.importance_rules DROP CONSTRAINT IF EXISTS importance_rules_rule_kind_check;
ALTER TABLE public.importance_rules ADD CONSTRAINT importance_rules_rule_kind_check
  CHECK (rule_kind IN ('descriptor','amount','counterparty','recurrence','composite'));

ALTER TABLE public.importance_rules DROP CONSTRAINT IF EXISTS importance_rules_amount_operator_check;
ALTER TABLE public.importance_rules ADD CONSTRAINT importance_rules_amount_operator_check
  CHECK (amount_operator IS NULL OR amount_operator IN ('equals','multiple_of','between','greater_than','less_than'));

ALTER TABLE public.importance_rules DROP CONSTRAINT IF EXISTS importance_rules_counterparty_match_mode_check;
ALTER TABLE public.importance_rules ADD CONSTRAINT importance_rules_counterparty_match_mode_check
  CHECK (counterparty_match_mode IS NULL OR counterparty_match_mode IN ('contains','equals','starts_with'));

CREATE INDEX IF NOT EXISTS idx_importance_rules_priority
  ON public.importance_rules (workspace_id, is_active, priority);

-- Extend customizations to carry the new structured operation payload.
ALTER TABLE public.customizations
  ADD COLUMN IF NOT EXISTS operation_type text,
  ADD COLUMN IF NOT EXISTS operation_payload jsonb DEFAULT '{}'::jsonb;
