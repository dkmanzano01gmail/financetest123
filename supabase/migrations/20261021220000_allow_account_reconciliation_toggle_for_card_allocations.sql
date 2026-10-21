-- Card allocation rows remain immutable, except for the dedicated account
-- reconciliation flag. Toggling this flag changes only the account balance
-- reconciliation and must not undo or rewrite the card reconciliation.
CREATE OR REPLACE FUNCTION public.protect_card_payment_allocation_transactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.credit_card_payment_allocations
    WHERE original_transaction_id = OLD.id
       OR offset_transaction_id = OLD.id
  ) THEN
    IF TG_OP = 'UPDATE' THEN
      IF (to_jsonb(NEW) - 'exclude_from_account_reconciliation' - 'updated_at')
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - 'exclude_from_account_reconciliation' - 'updated_at') THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Esta transação participa de uma conciliação de cartão. Desfaça o abatimento antes de editar ou remover.';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;
