-- Partial credit-card payment reconciliation with an auditable offset entry.
-- The imported bank transaction remains untouched. Each allocation creates an
-- opposite transaction in the same account/category so analytical totals net
-- to zero while the original statement remains visible.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reversal_of_transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_financial_role_check,
  ADD CONSTRAINT transactions_financial_role_check
    CHECK (financial_role IN ('regular', 'credit_card_payment', 'credit_card_payment_offset')),
  DROP CONSTRAINT IF EXISTS transactions_reconciliation_method_check,
  ADD CONSTRAINT transactions_reconciliation_method_check
    CHECK (reconciliation_method IS NULL OR reconciliation_method IN ('manual', 'exact_match', 'allocation')),
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
      OR (
        financial_role = 'credit_card_payment_offset'
        AND type = 'income'
        AND account_id IS NOT NULL
        AND credit_card_id IS NULL
        AND linked_credit_card_id IS NOT NULL
        AND invoice_month IS NOT NULL
        AND reversal_of_transaction_id IS NOT NULL
      )
    );

CREATE TABLE IF NOT EXISTS public.credit_card_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  credit_card_id uuid NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  invoice_month date NOT NULL,
  original_transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  offset_transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  allocated_amount numeric(14, 2) NOT NULL CHECK (allocated_amount > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_payment_allocations_invoice_month_check
    CHECK (invoice_month = date_trunc('month', invoice_month)::date)
);

CREATE INDEX IF NOT EXISTS idx_card_payment_allocations_invoice
  ON public.credit_card_payment_allocations(workspace_id, credit_card_id, invoice_month);
CREATE INDEX IF NOT EXISTS idx_card_payment_allocations_original
  ON public.credit_card_payment_allocations(workspace_id, original_transaction_id);

ALTER TABLE public.credit_card_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read card payment allocations"
  ON public.credit_card_payment_allocations;
CREATE POLICY "Members read card payment allocations"
ON public.credit_card_payment_allocations
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

GRANT SELECT ON public.credit_card_payment_allocations TO authenticated;
GRANT ALL ON public.credit_card_payment_allocations TO service_role;

CREATE OR REPLACE FUNCTION public.allocate_card_payment(
  payment_transaction_id uuid,
  target_credit_card_id uuid,
  target_invoice_month date,
  allocation_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payment public.transactions%ROWTYPE;
  invoice_total numeric(14, 2);
  invoice_allocated numeric(14, 2);
  payment_allocated numeric(14, 2);
  effective_month date;
  offset_id uuid;
  allocation_id uuid;
BEGIN
  SELECT * INTO payment
  FROM public.transactions
  WHERE id = payment_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
  IF public.workspace_role_of(payment.workspace_id, auth.uid()) NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Sem permissão para conciliar este pagamento.';
  END IF;
  IF payment.type <> 'expense' OR payment.account_id IS NULL OR payment.credit_card_id IS NOT NULL
     OR payment.financial_role <> 'regular'
     OR coalesce(payment.status::text, 'confirmed') IN ('ignored', 'cancelled') THEN
    RAISE EXCEPTION 'Selecione uma despesa de uma conta corrente.';
  END IF;
  IF allocation_amount IS NULL OR allocation_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor positivo para abater.';
  END IF;
  allocation_amount := round(allocation_amount, 2);
  IF target_invoice_month IS NULL THEN
    RAISE EXCEPTION 'Selecione o mês da fatura.';
  END IF;
  PERFORM 1 FROM public.credit_cards
  WHERE id = target_credit_card_id AND workspace_id = payment.workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O cartão selecionado não pertence a este workspace.';
  END IF;

  effective_month := date_trunc('month', target_invoice_month)::date;

  SELECT coalesce(sum(CASE WHEN type = 'income' THEN -abs(amount) ELSE abs(amount) END), 0)
  INTO invoice_total
  FROM public.transactions
  WHERE workspace_id = payment.workspace_id
    AND credit_card_id = target_credit_card_id
    AND invoice_month = effective_month
    AND coalesce(status::text, 'confirmed') NOT IN ('ignored', 'cancelled');

  SELECT coalesce(sum(allocated_amount), 0)
  INTO invoice_allocated
  FROM public.credit_card_payment_allocations
  WHERE workspace_id = payment.workspace_id
    AND credit_card_id = target_credit_card_id
    AND invoice_month = effective_month;

  SELECT coalesce(sum(allocated_amount), 0)
  INTO payment_allocated
  FROM public.credit_card_payment_allocations
  WHERE workspace_id = payment.workspace_id
    AND original_transaction_id = payment.id;

  IF allocation_amount > abs(payment.amount) - payment_allocated + 0.005 THEN
    RAISE EXCEPTION 'O valor excede o saldo disponível deste pagamento: %.',
      greatest(abs(payment.amount) - payment_allocated, 0);
  END IF;
  IF allocation_amount > invoice_total - invoice_allocated + 0.005 THEN
    RAISE EXCEPTION 'O valor excede o saldo pendente desta fatura: %.',
      greatest(invoice_total - invoice_allocated, 0);
  END IF;

  INSERT INTO public.transactions (
    workspace_id, date, month, year, type, description, amount, category_id,
    counterparty, account_id, credit_card_id, method, source, status, notes,
    financial_role, linked_credit_card_id, invoice_month, reconciliation_method,
    reconciled_at, reconciled_by, reversal_of_transaction_id, created_by
  ) VALUES (
    payment.workspace_id, payment.date, payment.month, payment.year, 'income',
    payment.description,
    round(allocation_amount, 2), payment.category_id, payment.counterparty,
    payment.account_id, NULL, payment.method, 'card_reconciliation', 'confirmed',
    'Compensação automática vinculada ao pagamento original ' || payment.id::text ||
      '. O lançamento original foi preservado.',
    'credit_card_payment_offset', target_credit_card_id, effective_month,
    'allocation', now(), auth.uid(), payment.id, auth.uid()
  ) RETURNING id INTO offset_id;

  INSERT INTO public.credit_card_payment_allocations (
    workspace_id, credit_card_id, invoice_month, original_transaction_id,
    offset_transaction_id, allocated_amount, created_by
  ) VALUES (
    payment.workspace_id, target_credit_card_id, effective_month, payment.id,
    offset_id, round(allocation_amount, 2), auth.uid()
  ) RETURNING id INTO allocation_id;

  RETURN allocation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_card_payment_allocation_transactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credit_card_payment_allocations
    WHERE original_transaction_id = OLD.id
       OR offset_transaction_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Esta transação participa de uma conciliação de cartão. Desfaça o abatimento antes de editar ou remover.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS protect_card_payment_allocation_transactions_trg
  ON public.transactions;
CREATE TRIGGER protect_card_payment_allocation_transactions_trg
BEFORE UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.protect_card_payment_allocation_transactions();

CREATE OR REPLACE FUNCTION public.allocate_card_payments(
  target_credit_card_id uuid,
  target_invoice_month date,
  allocation_items jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  allocation_ids uuid[] := ARRAY[]::uuid[];
  allocation_id uuid;
BEGIN
  IF allocation_items IS NULL
     OR jsonb_typeof(allocation_items) <> 'array'
     OR jsonb_array_length(allocation_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um pagamento e valor para abater.';
  END IF;

  -- Serialize batches for the same card before locking individual payments.
  -- This keeps simultaneous multi-account reconciliations deterministic.
  PERFORM 1 FROM public.credit_cards
  WHERE id = target_credit_card_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartão não encontrado.'; END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(allocation_items)
  LOOP
    IF nullif(item->>'transaction_id', '') IS NULL
       OR nullif(item->>'amount', '') IS NULL THEN
      RAISE EXCEPTION 'Pagamento ou valor inválido na seleção.';
    END IF;
    allocation_id := public.allocate_card_payment(
      (item->>'transaction_id')::uuid,
      target_credit_card_id,
      target_invoice_month,
      (item->>'amount')::numeric
    );
    allocation_ids := array_append(allocation_ids, allocation_id);
  END LOOP;

  RETURN allocation_ids;
END;
$function$;

CREATE OR REPLACE FUNCTION public.undo_card_payment_allocation(target_allocation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  allocation public.credit_card_payment_allocations%ROWTYPE;
  offset_id uuid;
BEGIN
  SELECT * INTO allocation
  FROM public.credit_card_payment_allocations
  WHERE id = target_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Conciliação não encontrada.'; END IF;
  IF public.workspace_role_of(allocation.workspace_id, auth.uid()) NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Sem permissão para desfazer esta conciliação.';
  END IF;

  offset_id := allocation.offset_transaction_id;
  DELETE FROM public.credit_card_payment_allocations WHERE id = allocation.id;
  DELETE FROM public.transactions
  WHERE id = offset_id
    AND financial_role = 'credit_card_payment_offset';
  RETURN allocation.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.allocate_card_payment(uuid, uuid, date, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_card_payment(uuid, uuid, date, numeric) FROM authenticated;
REVOKE ALL ON FUNCTION public.allocate_card_payments(uuid, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_card_payments(uuid, date, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.undo_card_payment_allocation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_card_payment_allocation(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
