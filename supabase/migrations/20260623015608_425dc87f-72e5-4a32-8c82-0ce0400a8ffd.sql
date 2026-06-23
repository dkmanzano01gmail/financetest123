
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_accounts_updated_at ON public.accounts;
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger: current_manual_balance requires current_manual_balance_date
CREATE OR REPLACE FUNCTION public.validate_account_balances()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.initial_balance_date IS NULL THEN
    RAISE EXCEPTION 'Informe a data de referência do saldo inicial.';
  END IF;
  IF NEW.current_manual_balance IS NOT NULL AND NEW.current_manual_balance_date IS NULL THEN
    RAISE EXCEPTION 'Informe a data do saldo informado.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_account_balances_trg ON public.accounts;
CREATE TRIGGER validate_account_balances_trg
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_account_balances();
