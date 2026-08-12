CREATE OR REPLACE FUNCTION public.set_transaction_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  card_closing_day integer;
  card_due_day integer;
  financial_month date;
BEGIN
  financial_month := date_trunc('month', NEW.date)::date;

  IF NEW.credit_card_id IS NOT NULL THEN
    SELECT
      greatest(1, least(31, coalesce(closing_day, 1))),
      greatest(1, least(31, coalesce(due_day, 1)))
    INTO card_closing_day, card_due_day
    FROM public.credit_cards
    WHERE id = NEW.credit_card_id;

    IF FOUND THEN
      -- Purchases on/after the closing day enter the following statement.
      IF extract(day FROM NEW.date)::integer >= card_closing_day THEN
        financial_month := (financial_month + interval '1 month')::date;
      END IF;

      -- When the due day is before the closing day, payment occurs in the
      -- calendar month after that statement closes.
      IF card_due_day <= card_closing_day THEN
        financial_month := (financial_month + interval '1 month')::date;
      END IF;

      NEW.invoice_month := financial_month;
    END IF;
  END IF;

  NEW.month = extract(month FROM financial_month)::integer;
  NEW.year = extract(year FROM financial_month)::integer;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_transaction_period_trg ON public.transactions;
CREATE TRIGGER set_transaction_period_trg
BEFORE INSERT OR UPDATE OF date, credit_card_id ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.set_transaction_period();

-- Backfill existing card purchases without changing their original purchase date.
UPDATE public.transactions
SET date = date
WHERE credit_card_id IS NOT NULL;
