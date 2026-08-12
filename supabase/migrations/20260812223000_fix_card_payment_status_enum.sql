-- transaction_status is a PostgreSQL enum with confirmed, pending and ignored.
-- Cast it to text before also checking legacy values such as cancelled.
CREATE OR REPLACE FUNCTION public.archive_and_delete_card_payment(
  payment_transaction_id uuid,
  target_credit_card_id uuid,
  target_invoice_month date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payment public.transactions%ROWTYPE;
  purchase_total numeric(14, 2);
  purchase_count integer;
  removal_id uuid;
  effective_credit_card_id uuid;
  effective_invoice_month date;
BEGIN
  SELECT * INTO payment
  FROM public.transactions
  WHERE id = payment_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado.';
  END IF;

  IF NOT public.is_workspace_member(payment.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para remover este pagamento.';
  END IF;

  effective_credit_card_id := coalesce(payment.linked_credit_card_id, target_credit_card_id);
  effective_invoice_month := coalesce(payment.invoice_month, target_invoice_month);

  IF effective_credit_card_id IS NULL
     OR effective_invoice_month IS NULL
     OR payment.account_id IS NULL
     OR payment.type <> 'expense' THEN
    RAISE EXCEPTION 'Este lançamento não pode ser conciliado como pagamento de cartão.';
  END IF;

  effective_invoice_month := date_trunc('month', effective_invoice_month)::date;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_cards
    WHERE id = effective_credit_card_id AND workspace_id = payment.workspace_id
  ) THEN
    RAISE EXCEPTION 'O cartão selecionado não pertence a este workspace.';
  END IF;

  SELECT
    coalesce(sum(CASE WHEN type = 'income' THEN -abs(amount) ELSE abs(amount) END), 0),
    count(*)
  INTO purchase_total, purchase_count
  FROM public.transactions
  WHERE workspace_id = payment.workspace_id
    AND credit_card_id = effective_credit_card_id
    AND invoice_month = effective_invoice_month
    AND coalesce(status::text, 'confirmed') NOT IN ('ignored', 'cancelled');

  IF purchase_count = 0 OR abs(purchase_total - abs(payment.amount)) > 0.01 THEN
    RAISE EXCEPTION 'Os valores não estão conciliados. Compras: %, pagamento: %.',
      purchase_total, abs(payment.amount);
  END IF;

  INSERT INTO public.credit_card_payment_removals (
    workspace_id,
    credit_card_id,
    invoice_month,
    original_transaction_id,
    account_id,
    payment_date,
    payment_description,
    payment_amount,
    payment_source,
    purchase_total,
    purchase_count,
    removed_by
  ) VALUES (
    payment.workspace_id,
    effective_credit_card_id,
    effective_invoice_month,
    payment.id,
    payment.account_id,
    payment.date,
    payment.description,
    abs(payment.amount),
    payment.source,
    purchase_total,
    purchase_count,
    auth.uid()
  )
  RETURNING id INTO removal_id;

  DELETE FROM public.transactions WHERE id = payment.id;
  RETURN removal_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_and_delete_card_payment(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_and_delete_card_payment(uuid, uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
