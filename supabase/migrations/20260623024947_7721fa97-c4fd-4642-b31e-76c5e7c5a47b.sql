
-- 1) super_admins table
CREATE TABLE public.super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.super_admins TO authenticated;
GRANT ALL ON public.super_admins TO service_role;

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins see themselves" ON public.super_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Seed: Daniel Manzano
INSERT INTO public.super_admins (user_id)
VALUES ('0fc9511c-da1f-4fde-aba5-4a5397ad0bca')
ON CONFLICT DO NOTHING;

-- 2) is_super_admin helper
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

-- 3) Augment customization_requests
ALTER TABLE public.customization_requests
  ADD COLUMN IF NOT EXISTS complexity text,
  ADD COLUMN IF NOT EXISTS ai_classification_reason text,
  ADD COLUMN IF NOT EXISTS auto_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rollback_payload jsonb;

-- Only one request in "testing" per workspace at a time
CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_test_per_workspace
  ON public.customization_requests (workspace_id)
  WHERE status = 'testing';

-- 4) Update RLS: super admins can SELECT & UPDATE any request
DROP POLICY IF EXISTS "Members manage requests in their workspaces" ON public.customization_requests;

CREATE POLICY "Members manage own workspace requests"
  ON public.customization_requests
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- Also let super admins see customizations across workspaces (for context)
DROP POLICY IF EXISTS "Members manage customizations in their workspaces" ON public.customizations;
CREATE POLICY "Members or super admins manage customizations"
  ON public.customizations
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- 5) Admin approve: move advanced request to "testing".
-- Creates a placeholder customization linked to the request so the user can see what's being tested.
CREATE OR REPLACE FUNCTION public.admin_approve_request(_request_id uuid, _admin_note text DEFAULT NULL)
RETURNS public.customization_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _req public.customization_requests;
  _existing_test uuid;
  _cust_id uuid;
  _interp jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin only';
  END IF;

  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _req.status <> 'needs_admin_review' THEN
    RAISE EXCEPTION 'Request not in needs_admin_review (current: %)', _req.status;
  END IF;

  -- Block if another test already in progress for this workspace
  SELECT id INTO _existing_test FROM public.customization_requests
   WHERE workspace_id = _req.workspace_id AND status = 'testing' LIMIT 1;
  IF _existing_test IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma personalização em teste neste workspace.';
  END IF;

  _interp := COALESCE(_req.ai_interpretation, '{}'::jsonb);

  INSERT INTO public.customizations (workspace_id, type, name, description, configuration_json, created_by, request_id, is_active)
  VALUES (
    _req.workspace_id,
    COALESCE(_interp->>'type', 'other'),
    COALESCE(LEFT(_interp->>'summary', 80), LEFT(_req.request_text, 80)),
    COALESCE(_interp->>'summary', _admin_note),
    COALESCE(_interp->'configuration_json', '{}'::jsonb),
    _req.user_id,
    _req.id,
    true
  )
  RETURNING id INTO _cust_id;

  UPDATE public.customization_requests
     SET status = 'testing',
         applied_customization_id = _cust_id,
         tested_at = now(),
         rollback_payload = jsonb_build_object('customization_id', _cust_id, 'kind', 'delete_customization')
   WHERE id = _request_id
   RETURNING * INTO _req;

  RETURN _req;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_approve_request(uuid, text) TO authenticated;

-- 6) Admin reject
CREATE OR REPLACE FUNCTION public.admin_reject_request(_request_id uuid, _reason text DEFAULT NULL)
RETURNS public.customization_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _req public.customization_requests;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin only';
  END IF;
  UPDATE public.customization_requests
     SET status = 'rejected_by_admin', rejected_at = now(), rejection_reason = _reason
   WHERE id = _request_id AND status IN ('needs_admin_review','submitted','interpreting')
   RETURNING * INTO _req;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não está aguardando análise.'; END IF;
  RETURN _req;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_reject_request(uuid, text) TO authenticated;

-- 7) User approves test
CREATE OR REPLACE FUNCTION public.user_approve_test(_request_id uuid)
RETURNS public.customization_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _req public.customization_requests;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT public.is_workspace_member(_req.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _req.status <> 'testing' THEN
    RAISE EXCEPTION 'Pedido não está em teste.';
  END IF;
  UPDATE public.customization_requests
     SET status = 'approved', approved_at = now(), completed_at = now()
   WHERE id = _request_id
   RETURNING * INTO _req;
  RETURN _req;
END;
$$;
GRANT EXECUTE ON FUNCTION public.user_approve_test(uuid) TO authenticated;

-- 8) User rejects test → rollback
CREATE OR REPLACE FUNCTION public.user_reject_test(_request_id uuid, _reason text DEFAULT NULL)
RETURNS public.customization_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _req public.customization_requests;
  _payload jsonb;
  _cust_id uuid;
  _kind text;
  _previous jsonb;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT public.is_workspace_member(_req.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _req.status <> 'testing' THEN
    RAISE EXCEPTION 'Pedido não está em teste.';
  END IF;

  _payload := COALESCE(_req.rollback_payload, '{}'::jsonb);
  _kind := _payload->>'kind';
  _cust_id := NULLIF(_payload->>'customization_id','')::uuid;

  IF _kind = 'delete_customization' AND _cust_id IS NOT NULL THEN
    DELETE FROM public.customizations WHERE id = _cust_id;
  ELSIF _kind = 'restore_customization' AND _cust_id IS NOT NULL THEN
    _previous := _payload->'previous';
    UPDATE public.customizations
       SET configuration_json = COALESCE(_previous->'configuration_json', configuration_json),
           name = COALESCE(_previous->>'name', name),
           description = _previous->>'description',
           is_active = COALESCE((_previous->>'is_active')::boolean, is_active)
     WHERE id = _cust_id;
  END IF;
  -- For 'noop' or unknown kinds: do nothing (status change is enough)

  UPDATE public.customization_requests
     SET status = 'rejected', rejected_at = now(), rejection_reason = _reason
   WHERE id = _request_id
   RETURNING * INTO _req;
  RETURN _req;
END;
$$;
GRANT EXECUTE ON FUNCTION public.user_reject_test(uuid, text) TO authenticated;
