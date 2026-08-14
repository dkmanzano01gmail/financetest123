-- Delete a transaction safely. When it belongs to a card-payment allocation,
-- remove the allocation, every inverse entry for that original payment, and
-- finally the original bank transaction in one atomic operation.

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
  IF public.workspace_role_of(target.workspace_id, auth.uid()) NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Sem permissão para remover esta transação.';
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

  PERFORM 1
  FROM public.transactions
  WHERE id = original_id
  FOR UPDATE;

  PERFORM 1
  FROM public.credit_card_payment_allocations
  WHERE original_transaction_id = original_id
  FOR UPDATE;

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
