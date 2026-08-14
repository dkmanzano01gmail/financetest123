-- The card reconciliation flow preserves the bank payment and creates an
-- analytical inverse entry. Older clients must never be able to call the
-- destructive archive-and-delete workflow again.

REVOKE ALL ON FUNCTION public.archive_and_delete_card_payment(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_and_delete_card_payment(uuid, uuid, date) FROM authenticated;

NOTIFY pgrst, 'reload schema';
