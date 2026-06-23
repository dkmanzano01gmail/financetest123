REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_private.is_workspace_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION app_private.workspace_role_of(uuid, uuid) FROM anon;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.workspace_role_of(uuid, uuid) TO authenticated;