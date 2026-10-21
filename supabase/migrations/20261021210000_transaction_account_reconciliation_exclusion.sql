ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS exclude_from_account_reconciliation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transactions.exclude_from_account_reconciliation IS
  'When true, the transaction remains active in financial reports but does not change account reconciliation balances.';

CREATE INDEX IF NOT EXISTS idx_transactions_account_reconciliation_excluded
  ON public.transactions (workspace_id, account_id, date)
  WHERE exclude_from_account_reconciliation = true;
