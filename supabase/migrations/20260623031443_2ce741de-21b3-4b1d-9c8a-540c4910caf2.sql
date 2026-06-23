-- Trigger-only functions: not callable via API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_workspace() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_transaction_period() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_account_balances() FROM PUBLIC, anon, authenticated;

-- Authenticated-only helpers and RPCs (all enforce auth.uid()-based checks internally)
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.workspace_role_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_current_credits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_credits(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.consume_credits(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, uuid, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.user_approve_test(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_approve_test(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.user_reject_test(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_reject_test(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_approve_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_request(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_reject_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_request(uuid, text) TO authenticated;