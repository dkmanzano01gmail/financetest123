REVOKE EXECUTE ON FUNCTION public.allocate_card_payment(uuid, uuid, date, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_card_payments(uuid, date, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_and_delete_card_payment(uuid, uuid, date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_transaction_with_card_reconciliation(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.undo_card_payment_allocation(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_customization_request_decisions() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.allocate_card_payment(uuid, uuid, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_card_payments(uuid, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_and_delete_card_payment(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_transaction_with_card_reconciliation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_card_payment_allocation(uuid) TO authenticated;