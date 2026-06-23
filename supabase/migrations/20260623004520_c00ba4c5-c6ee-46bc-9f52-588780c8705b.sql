CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION app_private.workspace_role_of(_workspace_id uuid, _user_id uuid)
RETURNS public.workspace_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.workspace_members
  WHERE workspace_id = _workspace_id
    AND user_id = _user_id
  LIMIT 1;
$$;

GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.workspace_role_of(uuid, uuid) TO authenticated;

ALTER POLICY "Members read workspace" ON public.workspaces
  USING (app_private.is_workspace_member(id, auth.uid()));
ALTER POLICY "Owners update workspace" ON public.workspaces
  USING (app_private.workspace_role_of(id, auth.uid()) = 'owner');
ALTER POLICY "Owners delete workspace" ON public.workspaces
  USING (app_private.workspace_role_of(id, auth.uid()) = 'owner');

ALTER POLICY "Members read members" ON public.workspace_members
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));
ALTER POLICY "Owners manage members" ON public.workspace_members
  USING (app_private.workspace_role_of(workspace_id, auth.uid()) = 'owner' OR user_id = auth.uid())
  WITH CHECK (app_private.workspace_role_of(workspace_id, auth.uid()) = 'owner' OR user_id = auth.uid());

ALTER POLICY "Members read categories" ON public.categories
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));
ALTER POLICY "Editors write categories" ON public.categories
  USING (app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'))
  WITH CHECK (app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'));

ALTER POLICY "Members read accounts" ON public.accounts
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));
ALTER POLICY "Editors write accounts" ON public.accounts
  USING (app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'))
  WITH CHECK (app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'));

ALTER POLICY "Members read cards" ON public.credit_cards
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));
ALTER POLICY "Editors write cards" ON public.credit_cards
  USING (app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'))
  WITH CHECK (app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'));

ALTER POLICY "Members read transactions" ON public.transactions
  USING (app_private.is_workspace_member(workspace_id, auth.uid()));
ALTER POLICY "Editors write transactions" ON public.transactions
  USING (app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'))
  WITH CHECK (app_private.workspace_role_of(workspace_id, auth.uid()) IN ('owner','member'));

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) FROM anon;