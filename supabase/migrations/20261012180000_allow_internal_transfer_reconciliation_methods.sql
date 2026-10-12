-- Keep the existing reconciliation methods and allow the audit markers used
-- when imported bank rows replace or consolidate generated transfer rows.

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_reconciliation_method_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_reconciliation_method_check
  CHECK (
    reconciliation_method IS NULL
    OR reconciliation_method IN (
      'manual',
      'exact_match',
      'allocation',
      'internal_transfer_import_match',
      'internal_transfer_replaced',
      'internal_transfer_pair_merged'
    )
  );

NOTIFY pgrst, 'reload schema';
