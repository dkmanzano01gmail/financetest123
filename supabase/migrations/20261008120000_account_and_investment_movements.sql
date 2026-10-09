-- Account-to-account and investment movements are paired ledger entries. They
-- affect each account balance but are excluded from income/expense analytics.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_group_id uuid,
  ADD COLUMN IF NOT EXISTS linked_account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_financial_role_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_financial_role_check
  CHECK (
    financial_role IN (
      'regular',
      'credit_card_payment',
      'credit_card_payment_offset',
      'internal_transfer',
      'investment_contribution',
      'investment_redemption'
    )
  );

-- The card reconciliation migration constrains every non-regular role. Keep
-- its existing guarantees while explicitly admitting account movements.
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_card_payment_shape_check;

ALTER TABLE public.transactions
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
    OR (
      financial_role IN (
        'internal_transfer',
        'investment_contribution',
        'investment_redemption'
      )
      AND type IN ('income', 'expense')
      AND account_id IS NOT NULL
      AND credit_card_id IS NULL
      AND linked_credit_card_id IS NULL
      AND invoice_month IS NULL
      AND reversal_of_transaction_id IS NULL
    )
  );

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_account_movement_link_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_account_movement_link_check
  CHECK (
    (
      financial_role IN (
        'internal_transfer',
        'investment_contribution',
        'investment_redemption'
      )
      AND transfer_group_id IS NOT NULL
      AND linked_account_id IS NOT NULL
      AND account_id IS NOT NULL
      AND credit_card_id IS NULL
    )
    OR
    (
      financial_role NOT IN (
        'internal_transfer',
        'investment_contribution',
        'investment_redemption'
      )
      AND transfer_group_id IS NULL
      AND linked_account_id IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group
  ON public.transactions(workspace_id, transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_account_movement(
  p_workspace_id uuid,
  p_date date,
  p_amount numeric,
  p_description text,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_movement_kind text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  source_account public.accounts%ROWTYPE;
  destination_account public.accounts%ROWTYPE;
  group_id uuid := gen_random_uuid();
  safe_description text;
BEGIN
  IF coalesce(public.workspace_role_of(p_workspace_id, auth.uid())::text, '')
     NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Sem permissão para registrar esta movimentação.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor positivo.';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Informe a data da movimentação.';
  END IF;
  IF p_source_account_id = p_destination_account_id THEN
    RAISE EXCEPTION 'A conta de origem deve ser diferente da conta de destino.';
  END IF;
  IF p_movement_kind NOT IN (
    'internal_transfer',
    'investment_contribution',
    'investment_redemption'
  ) THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido.';
  END IF;

  SELECT * INTO source_account
  FROM public.accounts
  WHERE id = p_source_account_id
    AND workspace_id = p_workspace_id
    AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta de origem inválida ou inativa.';
  END IF;

  SELECT * INTO destination_account
  FROM public.accounts
  WHERE id = p_destination_account_id
    AND workspace_id = p_workspace_id
    AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta de destino inválida ou inativa.';
  END IF;

  IF p_movement_kind = 'internal_transfer'
     AND (source_account.type = 'investment' OR destination_account.type = 'investment') THEN
    RAISE EXCEPTION 'Use aporte ou resgate para movimentações com contas de investimento.';
  END IF;
  IF p_movement_kind = 'investment_contribution'
     AND (source_account.type = 'investment' OR destination_account.type <> 'investment') THEN
    RAISE EXCEPTION 'O aporte deve sair de uma conta comum e entrar em uma conta de investimento.';
  END IF;
  IF p_movement_kind = 'investment_redemption'
     AND (source_account.type <> 'investment' OR destination_account.type = 'investment') THEN
    RAISE EXCEPTION 'O resgate deve sair de uma conta de investimento e entrar em uma conta comum.';
  END IF;

  safe_description := NULLIF(btrim(p_description), '');
  IF safe_description IS NULL THEN
    safe_description := CASE p_movement_kind
      WHEN 'internal_transfer' THEN 'Transferência entre contas'
      WHEN 'investment_contribution' THEN 'Aporte em investimento'
      ELSE 'Resgate de investimento'
    END;
  END IF;

  INSERT INTO public.transactions (
    workspace_id, date, month, year, type, description, amount,
    counterparty, account_id, source, status, notes, created_by,
    financial_role, transfer_group_id, linked_account_id, method
  ) VALUES (
    p_workspace_id, p_date, extract(month FROM p_date)::integer,
    extract(year FROM p_date)::integer, 'expense', safe_description, p_amount,
    destination_account.name, source_account.id, 'manual', 'confirmed', p_notes,
    auth.uid(), p_movement_kind, group_id, destination_account.id, 'account_movement'
  );

  INSERT INTO public.transactions (
    workspace_id, date, month, year, type, description, amount,
    counterparty, account_id, source, status, notes, created_by,
    financial_role, transfer_group_id, linked_account_id, method
  ) VALUES (
    p_workspace_id, p_date, extract(month FROM p_date)::integer,
    extract(year FROM p_date)::integer, 'income', safe_description, p_amount,
    source_account.name, destination_account.id, 'manual', 'confirmed', p_notes,
    auth.uid(), p_movement_kind, group_id, source_account.id, 'account_movement'
  );

  RETURN group_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_account_movement(uuid, date, numeric, text, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_account_movement(uuid, date, numeric, text, uuid, uuid, text, text) TO authenticated;

-- Preserve the existing card-reconciliation behavior and delete both sides of
-- an account movement atomically when either side is removed.
CREATE OR REPLACE FUNCTION public.delete_transaction_with_card_reconciliation(
  target_transaction_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target public.transactions%ROWTYPE;
  original_id uuid;
  offset_ids uuid[];
  deleted_count integer := 0;
BEGIN
  SELECT * INTO target
  FROM public.transactions
  WHERE id = target_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação não encontrada.';
  END IF;
  IF coalesce(public.workspace_role_of(target.workspace_id, auth.uid())::text, '')
     NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Sem permissão para remover esta transação.';
  END IF;

  IF target.transfer_group_id IS NOT NULL
     AND target.financial_role IN (
       'internal_transfer',
       'investment_contribution',
       'investment_redemption'
     ) THEN
    DELETE FROM public.transactions
    WHERE workspace_id = target.workspace_id
      AND transfer_group_id = target.transfer_group_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
  END IF;

  SELECT allocation.original_transaction_id
  INTO original_id
  FROM public.credit_card_payment_allocations allocation
  WHERE allocation.original_transaction_id = target_transaction_id
     OR allocation.offset_transaction_id = target_transaction_id
  ORDER BY allocation.created_at
  LIMIT 1
  FOR UPDATE;

  IF original_id IS NULL THEN
    DELETE FROM public.transactions WHERE id = target_transaction_id;
    RETURN 1;
  END IF;

  PERFORM 1 FROM public.transactions WHERE id = original_id FOR UPDATE;
  PERFORM 1 FROM public.credit_card_payment_allocations
    WHERE original_transaction_id = original_id FOR UPDATE;

  SELECT array_agg(allocation.offset_transaction_id ORDER BY allocation.created_at)
  INTO offset_ids
  FROM public.credit_card_payment_allocations allocation
  WHERE allocation.original_transaction_id = original_id;

  DELETE FROM public.credit_card_payment_allocations
  WHERE original_transaction_id = original_id;

  DELETE FROM public.transactions
  WHERE id = ANY(coalesce(offset_ids, ARRAY[]::uuid[]))
    AND financial_role = 'credit_card_payment_offset';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  DELETE FROM public.transactions WHERE id = original_id;
  IF FOUND THEN deleted_count := deleted_count + 1; END IF;

  RETURN deleted_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_transaction_with_card_reconciliation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_transaction_with_card_reconciliation(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
