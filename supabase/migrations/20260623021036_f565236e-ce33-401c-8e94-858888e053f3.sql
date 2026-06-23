
REVOKE EXECUTE ON FUNCTION public.ensure_current_credits(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_credits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(UUID, UUID, INT, TEXT) TO authenticated;
