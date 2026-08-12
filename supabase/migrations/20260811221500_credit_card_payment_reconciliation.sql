-- Explicitly identify account transactions that settle a credit-card invoice.
-- The original transaction remains in the account cash flow, while analytical
-- expense reports can exclude it in favour of the detailed card purchases.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS financial_role text NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS linked_credit_card_id uuid REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_month date,
  ADD COLUMN IF NOT EXISTS reconciliation_method text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_financial_role_check,
  ADD CONSTRAINT transactions_financial_role_check
    CHECK (financial_role IN ('regular', 'credit_card_payment')),
  DROP CONSTRAINT IF EXISTS transactions_reconciliation_method_check,
  ADD CONSTRAINT transactions_reconciliation_method_check
    CHECK (reconciliation_method IS NULL OR reconciliation_method IN ('manual', 'exact_match')),
  DROP CONSTRAINT IF EXISTS transactions_invoice_month_first_day_check,
  ADD CONSTRAINT transactions_invoice_month_first_day_check
    CHECK (invoice_month IS NULL OR invoice_month = date_trunc('month', invoice_month)::date),
  DROP CONSTRAINT IF EXISTS transactions_card_payment_shape_check,
  ADD CONSTRAINT transactions_card_payment_shape_check
    CHECK (
      financial_role = 'regular'
      OR (
        financial_role = 'credit_card_payment'
        AND type = 'expense'
        AND account_id IS NOT NULL
        AND credit_card_id IS NULL
        AND linked_credit_card_id IS NOT NULL
        AND invoice_month IS NOT NULL
      )
    );

CREATE INDEX IF NOT EXISTS idx_transactions_card_invoice_payment
  ON public.transactions(workspace_id, linked_credit_card_id, invoice_month)
  WHERE financial_role = 'credit_card_payment';

NOTIFY pgrst, 'reload schema';
