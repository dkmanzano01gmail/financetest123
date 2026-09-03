-- Prevent workspace members from promoting themselves or joining another
-- workspace by writing directly to workspace_members. Invitation acceptance
-- runs through a SECURITY DEFINER trigger and is not affected by these RLS
-- policies.

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage members" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace owners insert members" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace owners update members" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace owners delete members" ON public.workspace_members;

CREATE POLICY "Workspace owners insert members"
ON public.workspace_members
FOR INSERT TO authenticated
WITH CHECK (
  app_private.workspace_role_of(workspace_id, auth.uid()) = 'owner'
);

CREATE POLICY "Workspace owners update members"
ON public.workspace_members
FOR UPDATE TO authenticated
USING (
  app_private.workspace_role_of(workspace_id, auth.uid()) = 'owner'
)
WITH CHECK (
  app_private.workspace_role_of(workspace_id, auth.uid()) = 'owner'
);

CREATE POLICY "Workspace owners delete members"
ON public.workspace_members
FOR DELETE TO authenticated
USING (
  app_private.workspace_role_of(workspace_id, auth.uid()) = 'owner'
);

-- Keep only the table operations used by the application. RLS still scopes
-- each authenticated operation, while service_role retains its existing
-- privileges for trusted server-side flows and invitation acceptance.
REVOKE ALL PRIVILEGES ON TABLE public.workspace_members FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_members TO authenticated;

-- TRUNCATE bypasses row-level policies, and application clients do not need
-- administrative table privileges. Remove them from all existing and future
-- public tables without changing normal RLS-protected CRUD grants.
REVOKE TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES
FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
