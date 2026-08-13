-- Restore card payments removed by the former reconciliation workflow for the
-- July and August 2026 invoices. The original bank expense is recreated and an
-- auditable opposite entry is linked through credit_card_payment_allocations.
-- This migration is idempotent: existing restored transactions/allocations are
-- reused and never duplicated.

ALTER TABLE public.credit_card_payment_removals
  ADD COLUMN IF NOT EXISTS restored_transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_offset_transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz;

DO $migration$
DECLARE
  archived record;
  original_id uuid;
  offset_id uuid;
  original_allocated numeric(14, 2);
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
    JOIN public.workspaces workspace ON workspace.id = removal.workspace_id
    WHERE lower(workspace.name) IN ('daniel – business', 'daniel - business')
      AND workspace.type = 'business'
      AND removal.invoice_month IN (DATE '2026-07-01', DATE '2026-08-01')
    ORDER BY removal.removed_at, removal.id
    FOR UPDATE
  LOOP
    IF archived.account_id IS NULL THEN
      RAISE EXCEPTION
        'Não foi possível restaurar o pagamento arquivado % porque a conta original não existe mais.',
        archived.id;
    END IF;

    -- Prefer the exact former transaction id. If the client already recreated
    -- an identical bank entry manually, reuse it instead of duplicating it.
    SELECT tx.id
    INTO original_id
    FROM public.transactions tx
    WHERE tx.id = archived.original_transaction_id
    LIMIT 1;

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
        'Pagamento restaurado do arquivo da conciliação anterior ' || archived.id::text || '.',
        'regular',
        archived.removed_by,
        archived.removed_at
      );
    END IF;

    -- Any prior partial restoration is respected; only the remaining amount is
    -- compensated. Allocations made for a different invoice are rejected.
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
        'O pagamento restaurado % já está vinculado a outra fatura.',
        original_id;
    END IF;

    SELECT
      coalesce(sum(allocation.allocated_amount), 0),
      (array_agg(allocation.offset_transaction_id ORDER BY allocation.created_at DESC))[1]
    INTO original_allocated, offset_id
    FROM public.credit_card_payment_allocations allocation
    WHERE allocation.original_transaction_id = original_id
      AND allocation.credit_card_id = archived.credit_card_id
      AND allocation.invoice_month = archived.invoice_month;

    amount_to_restore := round(
      greatest(abs(archived.payment_amount) - original_allocated, 0),
      2
    );

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
        'Compensação do pagamento restaurado ' || original.id::text ||
          '. O lançamento bancário original foi preservado.',
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

-- The current UI uses allocations and offsets. Prevent older clients from
-- invoking the obsolete destructive RPC again.
REVOKE ALL ON FUNCTION public.archive_and_delete_card_payment(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_and_delete_card_payment(uuid, uuid, date) FROM authenticated;

NOTIFY pgrst, 'reload schema';
