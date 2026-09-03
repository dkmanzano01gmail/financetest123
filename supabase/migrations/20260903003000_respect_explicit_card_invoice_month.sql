CREATE OR REPLACE FUNCTION public.set_transaction_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  card_closing_day integer;
  card_due_day integer;
  financial_month date;
  explicit_invoice_month boolean := false;
BEGIN
  financial_month := date_trunc('month', NEW.date)::date;

  IF NEW.credit_card_id IS NOT NULL THEN
    IF NEW.invoice_month IS NOT NULL THEN
      IF TG_OP = 'INSERT' THEN
        explicit_invoice_month := true;
      ELSIF NEW.invoice_month IS DISTINCT FROM OLD.invoice_month THEN
        explicit_invoice_month := true;
      END IF;
    END IF;

    IF explicit_invoice_month THEN
      financial_month := date_trunc('month', NEW.invoice_month)::date;
    ELSE
      SELECT
        greatest(1, least(31, coalesce(closing_day, 1))),
        greatest(1, least(31, coalesce(due_day, 1)))
      INTO card_closing_day, card_due_day
      FROM public.credit_cards
      WHERE id = NEW.credit_card_id;

      IF FOUND THEN
        IF extract(day FROM NEW.date)::integer >= card_closing_day THEN
          financial_month := (financial_month + interval '1 month')::date;
        END IF;

        IF card_due_day <= card_closing_day THEN
          financial_month := (financial_month + interval '1 month')::date;
        END IF;
      END IF;
    END IF;

    NEW.invoice_month := financial_month;
  END IF;

  NEW.month = extract(month FROM financial_month)::integer;
  NEW.year = extract(year FROM financial_month)::integer;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_transaction_period_trg ON public.transactions;
CREATE TRIGGER set_transaction_period_trg
BEFORE INSERT OR UPDATE OF date, credit_card_id, invoice_month ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.set_transaction_period();
