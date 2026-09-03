ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS installment text;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_installment_length_check,
  ADD CONSTRAINT transactions_installment_length_check
    CHECK (installment IS NULL OR char_length(installment) <= 30);

COMMENT ON COLUMN public.transactions.installment IS
  'Parcela informada para uma transação de cartão, por exemplo 5/12.';
