-- Targeted recovery for the July 2026 Orna card payment. The previous data
-- migration relied on a workspace display name and could select no rows. This
-- version identifies the archived payment by the actual card name instead.

DO $migration$
DECLARE
  archived record;
  original_id uuid;
  offset_id uuid;
  allocated numeric(14, 2);
  amount_to_restore numeric(14, 2);
BEGIN
  FOR archived IN
    SELECT
      removal.id,
      removal.workspace_id,
      removal.credit_card_id,
      removal.invoice_month,
      removal.original_transaction_id,
      removal.account_id,
      removal.payment_date,
      removal.payment_description,
      removal.payment_amount,
      removal.payment_source,
      removal.removed_by,
      removal.removed_at
    FROM public.credit_card_payment_removals removal
    JOIN public.credit_cards card ON card.id = removal.credit_card_id
    WHERE removal.invoice_month = DATE '2026-07-01'
      AND lower(card.name) LIKE '%orna%'
    ORDER BY removal.removed_at, removal.id
    FOR UPDATE OF removal
  LOOP
    IF archived.account_id IS NULL THEN
      RAISE EXCEPTION
        'A conta do pagamento Orna arquivado % não existe mais.',
        archived.id;
    END IF;

    original_id := NULL;
    offset_id := NULL;

    SELECT tx.id
    INTO original_id
    FROM public.transactions tx
    WHERE tx.id = archived.original_transaction_id
    LIMIT 1;

    -- Reuse an equivalent manual restoration, if one already exists.
    IF original_id IS NULL THEN
      SELECT tx.id
      INTO original_id
      FROM public.transactions tx
      WHERE tx.workspace_id = archived.workspace_id
        AND tx.date = archived.payment_date
        AND tx.type = 'expense'
        AND tx.account_id = archived.account_id
        AND tx.credit_card_id IS NULL
        AND tx.financial_role = 'regular'
        AND abs(abs(tx.amount) - abs(archived.payment_amount)) <= 0.005
        AND lower(trim(tx.description)) = lower(trim(archived.payment_description))
      ORDER BY tx.created_at DESC
      LIMIT 1;
    END IF;

    IF original_id IS NULL THEN
      original_id := archived.original_transaction_id;
      INSERT INTO public.transactions (
        id, workspace_id, date, month, year, type, description, amount,
        account_id, credit_card_id, source, status, notes, financial_role,
        created_by, created_at
      ) VALUES (
        original_id,
        archived.workspace_id,
        archived.payment_date,
        extract(month FROM archived.payment_date)::integer,
        extract(year FROM archived.payment_date)::integer,
        'expense',
        archived.payment_description,
        abs(archived.payment_amount),
        archived.account_id,
        NULL,
        coalesce(nullif(archived.payment_source, ''), 'card_payment_restoration'),
        'confirmed',
        'Pagamento Orna restaurado do arquivo da conciliação ' || archived.id::text || '.',
        'regular',
        archived.removed_by,
        archived.removed_at
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.credit_card_payment_allocations allocation
      WHERE allocation.original_transaction_id = original_id
        AND (
          allocation.credit_card_id <> archived.credit_card_id
          OR allocation.invoice_month <> archived.invoice_month
        )
    ) THEN
      RAISE EXCEPTION
        'O pagamento Orna restaurado % já está associado a outra fatura.',
        original_id;
    END IF;

    SELECT
      coalesce(sum(allocation.allocated_amount), 0),
      (array_agg(allocation.offset_transaction_id ORDER BY allocation.created_at DESC))[1]
    INTO allocated, offset_id
    FROM public.credit_card_payment_allocations allocation
    WHERE allocation.original_transaction_id = original_id
      AND allocation.credit_card_id = archived.credit_card_id
      AND allocation.invoice_month = archived.invoice_month;

    amount_to_restore := round(greatest(abs(archived.payment_amount) - allocated, 0), 2);

    IF amount_to_restore > 0.005 THEN
      INSERT INTO public.transactions (
        workspace_id, date, month, year, type, description, amount, category_id,
        counterparty, account_id, credit_card_id, method, source, status, notes,
        financial_role, linked_credit_card_id, invoice_month,
        reconciliation_method, reconciled_at, reconciled_by,
        reversal_of_transaction_id, created_by
      )
      SELECT
        original.workspace_id,
        original.date,
        original.month,
        original.year,
        'income',
        original.description,
        amount_to_restore,
        original.category_id,
        original.counterparty,
        original.account_id,
        NULL,
        original.method,
        'card_reconciliation',
        'confirmed',
        'Compensação inversa do pagamento Orna restaurado ' || original.id::text || '.',
        'credit_card_payment_offset',
        archived.credit_card_id,
        archived.invoice_month,
        'allocation',
        now(),
        archived.removed_by,
        original.id,
        archived.removed_by
      FROM public.transactions original
      WHERE original.id = original_id
      RETURNING id INTO offset_id;

      INSERT INTO public.credit_card_payment_allocations (
        workspace_id, credit_card_id, invoice_month, original_transaction_id,
        offset_transaction_id, allocated_amount, created_by
      ) VALUES (
        archived.workspace_id,
        archived.credit_card_id,
        archived.invoice_month,
        original_id,
        offset_id,
        amount_to_restore,
        archived.removed_by
      );
    END IF;

    UPDATE public.credit_card_payment_removals
    SET restored_transaction_id = original_id,
        restored_offset_transaction_id = offset_id,
        restored_at = coalesce(restored_at, now())
    WHERE id = archived.id;
  END LOOP;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
