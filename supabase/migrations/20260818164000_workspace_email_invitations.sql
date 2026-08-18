-- Pending workspace invitations are matched only against the verified email
-- stored by Supabase Auth. Email content never grants application access.
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_one_pending_email
  ON public.workspace_invitations (workspace_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace owners read invitations"
  ON public.workspace_invitations;
CREATE POLICY "Workspace owners read invitations"
  ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) = 'owner');

DROP POLICY IF EXISTS "Workspace owners create invitations"
  ON public.workspace_invitations;
CREATE POLICY "Workspace owners create invitations"
  ON public.workspace_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND public.workspace_role_of(workspace_id, auth.uid()) = 'owner'
  );

DROP POLICY IF EXISTS "Workspace owners update invitations"
  ON public.workspace_invitations;
CREATE POLICY "Workspace owners update invitations"
  ON public.workspace_invitations
  FOR UPDATE TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) = 'owner')
  WITH CHECK (public.workspace_role_of(workspace_id, auth.uid()) = 'owner');

DROP POLICY IF EXISTS "Workspace owners delete invitations"
  ON public.workspace_invitations;
CREATE POLICY "Workspace owners delete invitations"
  ON public.workspace_invitations
  FOR DELETE TO authenticated
  USING (public.workspace_role_of(workspace_id, auth.uid()) = 'owner');

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitations_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT invitation.workspace_id, NEW.id, invitation.role
  FROM public.workspace_invitations invitation
  WHERE invitation.status = 'pending'
    AND invitation.expires_at > now()
    AND lower(invitation.email) = lower(NEW.email)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invitations
  SET status = 'accepted',
      accepted_by = NEW.id,
      accepted_at = now(),
      updated_at = now()
  WHERE status = 'pending'
    AND expires_at > now()
    AND lower(email) = lower(NEW.email)
    AND EXISTS (
      SELECT 1
      FROM public.workspace_members member
      WHERE member.workspace_id = workspace_invitations.workspace_id
        AND member.user_id = NEW.id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_accept_workspace_invitations
  ON auth.users;
CREATE TRIGGER on_auth_user_accept_workspace_invitations
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.accept_workspace_invitations_on_signup();

REVOKE ALL ON FUNCTION public.accept_workspace_invitations_on_signup()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.workspace_invitations IS
  'Owner-created invitations accepted only when Supabase Auth creates a user with the matching email.';
