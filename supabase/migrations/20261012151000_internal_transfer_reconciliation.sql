-- Maintain both sides of an internal transfer atomically. When an imported
-- bank transaction replaces a generated counterpart, the generated row is
-- retained as ignored history instead of being deleted.

CREATE OR REPLACE FUNCTION public.update_internal_transfer_group(
  p_workspace_id uuid,
  p_transfer_group_id uuid,
  p_date date,
  p_amount numeric,
  p_description text,
  p_source_account_id uuid,
  p_destination_account_id uuid,
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
  movement_count integer;
  outgoing_count integer;
  incoming_count integer;
  safe_description text;
BEGIN
  IF coalesce(public.workspace_role_of(p_workspace_id, auth.uid())::text, '')
     NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta transferência.';
  END IF;
  IF p_transfer_group_id IS NULL THEN
    RAISE EXCEPTION 'Transferência sem vínculo de conciliação.';
  END IF;
  IF p_date IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Informe data e valor positivo.';
  END IF;
  IF p_source_account_id = p_destination_account_id THEN
    RAISE EXCEPTION 'A conta de origem deve ser diferente da conta de destino.';
  END IF;

  SELECT * INTO source_account
  FROM public.accounts
  WHERE id = p_source_account_id AND workspace_id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta de origem inválida.'; END IF;

  SELECT * INTO destination_account
  FROM public.accounts
  WHERE id = p_destination_account_id AND workspace_id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta de destino inválida.'; END IF;

  IF source_account.type = 'investment' OR destination_account.type = 'investment' THEN
    RAISE EXCEPTION 'Use aporte ou resgate para contas de investimento.';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE type = 'expense'),
         count(*) FILTER (WHERE type = 'income')
  INTO movement_count, outgoing_count, incoming_count
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_transfer_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored';

  IF movement_count <> 2 OR outgoing_count <> 1 OR incoming_count <> 1 THEN
    RAISE EXCEPTION 'A transferência precisa ter exatamente duas contrapartidas ativas.';
  END IF;

  PERFORM 1
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_transfer_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored'
  FOR UPDATE;

  safe_description := coalesce(NULLIF(btrim(p_description), ''), 'Transferência entre contas');

  UPDATE public.transactions
  SET date = p_date,
      month = extract(month FROM p_date)::integer,
      year = extract(year FROM p_date)::integer,
      amount = p_amount,
      description = safe_description,
      counterparty = destination_account.name,
      account_id = source_account.id,
      linked_account_id = destination_account.id,
      notes = NULLIF(btrim(p_notes), ''),
      category_id = NULL,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_transfer_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored'
    AND type = 'expense';

  UPDATE public.transactions
  SET date = p_date,
      month = extract(month FROM p_date)::integer,
      year = extract(year FROM p_date)::integer,
      amount = p_amount,
      description = safe_description,
      counterparty = source_account.name,
      account_id = destination_account.id,
      linked_account_id = source_account.id,
      notes = NULLIF(btrim(p_notes), ''),
      category_id = NULL,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_transfer_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored'
    AND type = 'income';

  RETURN p_transfer_group_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_internal_transfer_group(
  uuid, uuid, date, numeric, text, uuid, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_internal_transfer_group(
  uuid, uuid, date, numeric, text, uuid, uuid, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_internal_transfer_counterpart(
  p_workspace_id uuid,
  p_transfer_group_id uuid,
  p_candidate_transaction_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  candidate public.transactions%ROWTYPE;
  generated public.transactions%ROWTYPE;
  opposite public.transactions%ROWTYPE;
BEGIN
  IF coalesce(public.workspace_role_of(p_workspace_id, auth.uid())::text, '')
     NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Sem permissão para conciliar esta transferência.';
  END IF;

  SELECT * INTO candidate
  FROM public.transactions
  WHERE id = p_candidate_transaction_id
    AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND
     OR coalesce(candidate.financial_role, 'regular') <> 'regular'
     OR candidate.account_id IS NULL
     OR candidate.credit_card_id IS NOT NULL
     OR candidate.linked_credit_card_id IS NOT NULL
     OR candidate.reversal_of_transaction_id IS NOT NULL
     OR candidate.status = 'ignored'
     OR candidate.source = 'manual' THEN
    RAISE EXCEPTION 'A contrapartida precisa ser uma transação bancária importada.';
  END IF;

  SELECT * INTO generated
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_transfer_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored'
    AND account_id = candidate.account_id
    AND type = candidate.type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A transação importada não corresponde à conta e ao sentido esperados.';
  END IF;

  IF abs(abs(candidate.amount) - abs(generated.amount)) >= 0.005
     OR abs(candidate.date - generated.date) > 7 THEN
    RAISE EXCEPTION 'A data ou o valor não corresponde à transferência.';
  END IF;

  SELECT * INTO opposite
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_transfer_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored'
    AND id <> generated.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A outra ponta da transferência não foi encontrada.';
  END IF;

  UPDATE public.transactions
  SET financial_role = 'internal_transfer',
      transfer_group_id = p_transfer_group_id,
      linked_account_id = opposite.account_id,
      category_id = NULL,
      linked_credit_card_id = NULL,
      invoice_month = NULL,
      installment = NULL,
      reconciliation_method = 'internal_transfer_import_match',
      reconciled_at = now(),
      reconciled_by = auth.uid(),
      method = 'account_movement_import_match',
      updated_at = now()
  WHERE id = candidate.id AND workspace_id = p_workspace_id;

  UPDATE public.transactions
  SET linked_account_id = candidate.account_id,
      reconciliation_method = 'internal_transfer_import_match',
      reconciled_at = now(),
      reconciled_by = auth.uid(),
      updated_at = now()
  WHERE id = opposite.id AND workspace_id = p_workspace_id;

  UPDATE public.transactions
  SET status = 'ignored',
      reconciliation_method = 'internal_transfer_replaced',
      reconciled_at = now(),
      reconciled_by = auth.uid(),
      notes = concat_ws(E'\n', NULLIF(notes, ''), 'Contrapartida gerada substituída pela transação bancária importada.'),
      updated_at = now()
  WHERE id = generated.id AND workspace_id = p_workspace_id;

  RETURN p_transfer_group_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_internal_transfer_counterpart(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_internal_transfer_counterpart(uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
