-- Keep separate, durable audit timestamps for the administrator review and
-- the user's final decision after testing. The legacy approved_at/rejected_at
-- fields are retained for backwards compatibility with the existing UI.
ALTER TABLE public.customization_requests
  ADD COLUMN IF NOT EXISTS admin_decision text,
  ADD COLUMN IF NOT EXISTS admin_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_decision text,
  ADD COLUMN IF NOT EXISTS user_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.customization_requests
  DROP CONSTRAINT IF EXISTS customization_requests_admin_decision_chk,
  DROP CONSTRAINT IF EXISTS customization_requests_user_decision_chk;

ALTER TABLE public.customization_requests
  ADD CONSTRAINT customization_requests_admin_decision_chk
    CHECK (admin_decision IS NULL OR admin_decision IN ('approved', 'rejected')),
  ADD CONSTRAINT customization_requests_user_decision_chk
    CHECK (user_decision IS NULL OR user_decision IN ('approved', 'rejected'));

COMMENT ON COLUMN public.customization_requests.admin_decision IS
  'Administrator decision when manual review is required: approved or rejected.';
COMMENT ON COLUMN public.customization_requests.user_decision IS
  'Request owner decision after testing: approved or rejected.';

-- Best-effort backfill. For older advanced requests the exact admin timestamp
-- was not stored separately, so the development email/test timestamp is the
-- closest preserved audit event.
UPDATE public.customization_requests
SET admin_decision = 'rejected',
    admin_decided_at = rejected_at
WHERE status = 'rejected_by_admin'
  AND admin_decision IS NULL;

UPDATE public.customization_requests
SET admin_decision = 'approved',
    admin_decided_at = COALESCE(development_email_sent_at, tested_at, approved_at, updated_at)
WHERE admin_decision IS NULL
  AND auto_applied = false
  AND (
    status IN ('approved_for_development', 'testing')
    OR (status IN ('approved', 'rejected') AND tested_at IS NOT NULL)
  );

UPDATE public.customization_requests
SET user_decision = 'approved',
    user_decided_at = COALESCE(completed_at, approved_at, updated_at),
    user_decided_by = user_id
WHERE status = 'approved'
  AND user_decision IS NULL;

UPDATE public.customization_requests
SET user_decision = 'rejected',
    user_decided_at = COALESCE(rejected_at, updated_at),
    user_decided_by = user_id
WHERE status = 'rejected'
  AND tested_at IS NOT NULL
  AND user_decision IS NULL;

CREATE OR REPLACE FUNCTION public.audit_customization_request_decisions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'needs_admin_review'
       AND NEW.status IN ('approved_for_development', 'testing') THEN
      NEW.admin_decision := 'approved';
      NEW.admin_decided_at := COALESCE(NEW.admin_decided_at, now());
      NEW.admin_decided_by := COALESCE(NEW.admin_decided_by, auth.uid());
    ELSIF NEW.status = 'rejected_by_admin' THEN
      NEW.admin_decision := 'rejected';
      NEW.admin_decided_at := COALESCE(NEW.admin_decided_at, now());
      NEW.admin_decided_by := COALESCE(NEW.admin_decided_by, auth.uid());
    END IF;

    IF OLD.status = 'testing' AND NEW.status = 'approved' THEN
      NEW.user_decision := 'approved';
      NEW.user_decided_at := COALESCE(NEW.user_decided_at, now());
      NEW.user_decided_by := COALESCE(NEW.user_decided_by, auth.uid());
    ELSIF OLD.status = 'testing' AND NEW.status = 'rejected' THEN
      NEW.user_decision := 'rejected';
      NEW.user_decided_at := COALESCE(NEW.user_decided_at, now());
      NEW.user_decided_by := COALESCE(NEW.user_decided_by, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_customization_request_decisions
  ON public.customization_requests;
CREATE TRIGGER audit_customization_request_decisions
BEFORE UPDATE ON public.customization_requests
FOR EACH ROW
EXECUTE FUNCTION public.audit_customization_request_decisions();

-- Super-admin-only read model. It deliberately crosses workspace/profile RLS
-- only after checking the current account's super-admin role.
CREATE OR REPLACE FUNCTION public.get_admin_customization_history()
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  user_id uuid,
  user_name text,
  user_email text,
  request_text text,
  request_type text,
  status text,
  complexity text,
  estimated_credits integer,
  target_scope text,
  created_at timestamptz,
  tested_at timestamptz,
  completed_at timestamptz,
  rejection_reason text,
  admin_decision text,
  admin_decided_at timestamptz,
  admin_actor_name text,
  admin_actor_email text,
  user_decision text,
  user_decided_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    r.id,
    r.workspace_id,
    w.name AS workspace_name,
    r.user_id,
    COALESCE(NULLIF(p.display_name, ''), p.email, 'Usuário') AS user_name,
    p.email AS user_email,
    r.request_text,
    r.request_type,
    r.status,
    r.complexity,
    r.estimated_credits,
    r.target_scope,
    r.created_at,
    r.tested_at,
    r.completed_at,
    r.rejection_reason,
    r.admin_decision,
    r.admin_decided_at,
    COALESCE(NULLIF(ap.display_name, ''), ap.email) AS admin_actor_name,
    ap.email AS admin_actor_email,
    r.user_decision,
    r.user_decided_at
  FROM public.customization_requests r
  LEFT JOIN public.workspaces w ON w.id = r.workspace_id
  LEFT JOIN public.profiles p ON p.id = r.user_id
  LEFT JOIN public.profiles ap ON ap.id = r.admin_decided_by
  WHERE public.is_super_admin(auth.uid())
  ORDER BY r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_admin_customization_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_customization_history() TO authenticated;
