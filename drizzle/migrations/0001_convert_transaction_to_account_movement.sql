-- Convert an existing regular bank transaction into one side of an account
-- movement and create its counterpart atomically.

CREATE OR REPLACE FUNCTION public.convert_transaction_to_account_movement(
  p_transaction_id uuid,
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
  target public.transactions%ROWTYPE;
  source_account public.accounts%ROWTYPE;
  destination_account public.accounts%ROWTYPE;
  group_id uuid := gen_random_uuid();
  safe_description text;
  counterpart_type public.transaction_type;
  counterpart_account_id uuid;
  counterpart_linked_account_id uuid;
  counterpart_name text;
BEGIN
  IF coalesce(public.workspace_role_of(p_workspace_id, auth.uid())::text, '')
     NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Sem permissão para converter esta transação.';
  END IF;

  SELECT * INTO target
  FROM public.transactions
  WHERE id = p_transaction_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação não encontrada.';
  END IF;
  IF coalesce(target.financial_role, 'regular') <> 'regular'
     OR target.credit_card_id IS NOT NULL
     OR target.linked_credit_card_id IS NOT NULL
     OR target.reversal_of_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Somente transações bancárias regulares podem ser convertidas.';
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

  IF target.type = 'income' THEN
    UPDATE public.transactions
    SET date = p_date,
        month = extract(month FROM p_date)::integer,
        year = extract(year FROM p_date)::integer,
        amount = p_amount,
        description = safe_description,
        counterparty = source_account.name,
        account_id = destination_account.id,
        category_id = NULL,
        credit_card_id = NULL,
        linked_credit_card_id = NULL,
        invoice_month = NULL,
        installment = NULL,
        notes = p_notes,
        importance_level = NULL,
        suggested_importance_level = NULL,
        importance_status = NULL,
        importance_confidence = NULL,
        importance_suggestion_reason = NULL,
        financial_role = p_movement_kind,
        transfer_group_id = group_id,
        linked_account_id = source_account.id,
        method = 'account_movement'
    WHERE id = target.id;

    counterpart_type := 'expense';
    counterpart_account_id := source_account.id;
    counterpart_linked_account_id := destination_account.id;
    counterpart_name := destination_account.name;
  ELSE
    UPDATE public.transactions
    SET date = p_date,
        month = extract(month FROM p_date)::integer,
        year = extract(year FROM p_date)::integer,
        amount = p_amount,
        description = safe_description,
        counterparty = destination_account.name,
        account_id = source_account.id,
        category_id = NULL,
        credit_card_id = NULL,
        linked_credit_card_id = NULL,
        invoice_month = NULL,
        installment = NULL,
        notes = p_notes,
        importance_level = NULL,
        suggested_importance_level = NULL,
        importance_status = NULL,
        importance_confidence = NULL,
        importance_suggestion_reason = NULL,
        financial_role = p_movement_kind,
        transfer_group_id = group_id,
        linked_account_id = destination_account.id,
        method = 'account_movement'
    WHERE id = target.id;

    counterpart_type := 'income';
    counterpart_account_id := destination_account.id;
    counterpart_linked_account_id := source_account.id;
    counterpart_name := source_account.name;
  END IF;

  INSERT INTO public.transactions (
    workspace_id, date, month, year, type, description, amount,
    counterparty, account_id, source, status, notes, created_by,
    financial_role, transfer_group_id, linked_account_id, method
  ) VALUES (
    p_workspace_id, p_date, extract(month FROM p_date)::integer,
    extract(year FROM p_date)::integer, counterpart_type, safe_description, p_amount,
    counterpart_name, counterpart_account_id, 'manual', 'confirmed', p_notes,
    auth.uid(), p_movement_kind, group_id, counterpart_linked_account_id,
    'account_movement'
  );

  RETURN group_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_transaction_to_account_movement(
  uuid, uuid, date, numeric, text, uuid, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_transaction_to_account_movement(
  uuid, uuid, date, numeric, text, uuid, uuid, text, text
) TO authenticated;
