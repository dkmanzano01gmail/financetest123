-- 1) Scope columns -----------------------------------------------------------
ALTER TABLE public.customization_requests
  ADD COLUMN IF NOT EXISTS target_scope text NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.customizations
  ADD COLUMN IF NOT EXISTS target_scope text NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill legacy rows explicitly as workspace scope
UPDATE public.customization_requests SET target_scope = 'workspace', target_user_id = NULL
 WHERE target_scope IS NULL OR target_scope NOT IN ('user','workspace');
UPDATE public.customizations SET target_scope = 'workspace', target_user_id = NULL
 WHERE target_scope IS NULL OR target_scope NOT IN ('user','workspace');

ALTER TABLE public.customization_requests
  DROP CONSTRAINT IF EXISTS customization_requests_scope_chk;
ALTER TABLE public.customization_requests
  ADD CONSTRAINT customization_requests_scope_chk CHECK (
    (target_scope = 'user' AND target_user_id IS NOT NULL)
    OR (target_scope = 'workspace' AND target_user_id IS NULL)
  );

ALTER TABLE public.customizations
  DROP CONSTRAINT IF EXISTS customizations_scope_chk;
ALTER TABLE public.customizations
  ADD CONSTRAINT customizations_scope_chk CHECK (
    (target_scope = 'user' AND target_user_id IS NOT NULL)
    OR (target_scope = 'workspace' AND target_user_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_customizations_ws_scope_active
  ON public.customizations (workspace_id, target_scope, is_active);
CREATE INDEX IF NOT EXISTS idx_customizations_target_user
  ON public.customizations (target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cust_requests_ws_scope_status
  ON public.customization_requests (workspace_id, target_scope, status);
CREATE INDEX IF NOT EXISTS idx_cust_requests_target_user
  ON public.customization_requests (target_user_id) WHERE target_user_id IS NOT NULL;

-- 2) Scope-aware RLS ----------------------------------------------------------
DROP POLICY IF EXISTS "Members manage own workspace requests" ON public.customization_requests;
CREATE POLICY "Scoped members manage requests"
  ON public.customization_requests FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.is_workspace_member(workspace_id, auth.uid())
      AND (target_scope = 'workspace' OR target_user_id = auth.uid())
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.is_workspace_member(workspace_id, auth.uid())
      AND (target_scope = 'workspace' OR target_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members or super admins manage customizations" ON public.customizations;
CREATE POLICY "Scoped members manage customizations"
  ON public.customizations FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.is_workspace_member(workspace_id, auth.uid())
      AND (target_scope = 'workspace' OR target_user_id = auth.uid())
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.is_workspace_member(workspace_id, auth.uid())
      AND (target_scope = 'workspace' OR target_user_id = auth.uid())
    )
  );

-- 3) Charge credits once, only on approval ------------------------------------
CREATE OR REPLACE FUNCTION public.charge_request_credits(_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _req public.customization_requests;
  _credits int;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id;
  IF _req IS NULL THEN RETURN FALSE; END IF;
  IF NOT public.is_workspace_member(_req.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  -- idempotent: never charge the same request twice
  IF EXISTS (SELECT 1 FROM public.customization_usage WHERE request_id = _request_id) THEN
    RETURN FALSE;
  END IF;
  _credits := COALESCE(_req.approved_credits, _req.estimated_credits, 1);
  PERFORM public.ensure_current_credits(_req.workspace_id);
  UPDATE public.customization_credits
     SET credits_used = credits_used + _credits
   WHERE workspace_id = _req.workspace_id
     AND period_month = EXTRACT(MONTH FROM now())::INT
     AND period_year = EXTRACT(YEAR FROM now())::INT;
  INSERT INTO public.customization_usage (workspace_id, request_id, credits_used, usage_reason)
  VALUES (_req.workspace_id, _request_id, _credits, 'Personalização aprovada');
  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_request_credits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.charge_request_credits(uuid) TO authenticated;

-- 4) Scope-aware approve / reject --------------------------------------------
CREATE OR REPLACE FUNCTION public.user_approve_test(_request_id uuid)
RETURNS customization_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _req public.customization_requests;
  _cust public.customizations;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT public.is_workspace_member(_req.workspace_id, auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  IF _req.target_scope = 'user' THEN
    IF _req.target_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Somente a pessoa dona desta personalização pode aprová-la.';
    END IF;
  ELSE
    IF public.workspace_role_of(_req.workspace_id, auth.uid()) <> 'owner' THEN
      RAISE EXCEPTION 'Somente o dono do workspace pode aprovar personalizações do workspace.';
    END IF;
  END IF;

  -- idempotent: already approved → return as is
  IF _req.status = 'approved' THEN RETURN _req; END IF;
  IF _req.status <> 'testing' THEN RAISE EXCEPTION 'Pedido não está em teste.'; END IF;

  IF _req.applied_customization_id IS NOT NULL THEN
    SELECT * INTO _cust FROM public.customizations WHERE id = _req.applied_customization_id;
    IF _cust IS NOT NULL AND _cust.type = 'label_rename' AND _cust.menu_key IS NOT NULL THEN
      UPDATE public.customizations
         SET is_active = false
       WHERE workspace_id = _cust.workspace_id
         AND type = 'label_rename'
         AND menu_key = _cust.menu_key
         AND target_scope = _cust.target_scope
         AND target_user_id IS NOT DISTINCT FROM _cust.target_user_id
         AND id <> _cust.id
         AND is_active = true;
    END IF;
    UPDATE public.customizations SET is_testing = false, is_active = true WHERE id = _req.applied_customization_id;
  END IF;

  PERFORM public.charge_request_credits(_request_id);

  UPDATE public.customization_requests
     SET status = 'approved', approved_at = now(), completed_at = now()
   WHERE id = _request_id
   RETURNING * INTO _req;
  RETURN _req;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_reject_test(_request_id uuid, _reason text DEFAULT NULL::text)
RETURNS customization_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _req public.customization_requests;
  _payload jsonb;
  _cust_id uuid;
  _cat_id uuid;
  _rule_id uuid;
  _kind text;
  _previous jsonb;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT public.is_workspace_member(_req.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _req.target_scope = 'user' THEN
    IF _req.target_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Somente a pessoa dona desta personalização pode rejeitá-la.';
    END IF;
  ELSE
    IF public.workspace_role_of(_req.workspace_id, auth.uid()) <> 'owner' THEN
      RAISE EXCEPTION 'Somente o dono do workspace pode rejeitar personalizações do workspace.';
    END IF;
  END IF;

  IF _req.status IN ('rejected','rejected_by_admin') THEN RETURN _req; END IF;
  IF _req.status <> 'testing' THEN
    RAISE EXCEPTION 'Pedido não está em teste.';
  END IF;

  _payload := COALESCE(_req.rollback_payload, '{}'::jsonb);
  _kind := _payload->>'kind';
  _cust_id := NULLIF(_payload->>'customization_id','')::uuid;
  _cat_id := NULLIF(_payload->>'category_id','')::uuid;
  _rule_id := NULLIF(_payload->>'importance_rule_id','')::uuid;

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

  IF _rule_id IS NOT NULL THEN
    UPDATE public.transactions
       SET importance_status = NULL,
           importance_suggestion_reason = NULL
     WHERE workspace_id = _req.workspace_id
       AND importance_suggestion_reason IS NOT NULL
       AND importance_suggestion_reason LIKE 'Regra %';
    DELETE FROM public.importance_rules WHERE id = _rule_id AND workspace_id = _req.workspace_id;
  END IF;

  IF _cat_id IS NOT NULL THEN
    DELETE FROM public.categories WHERE id = _cat_id AND workspace_id = _req.workspace_id;
  END IF;

  UPDATE public.customization_requests
     SET status = 'rejected', rejected_at = now(), rejection_reason = _reason,
         approved_credits = NULL
   WHERE id = _request_id
   RETURNING * INTO _req;
  RETURN _req;
END;
$$;

-- 5) Admin approval carries scope over ---------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_request(_request_id uuid, _admin_note text DEFAULT NULL::text)
RETURNS customization_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _req public.customization_requests;
  _existing_test uuid;
  _cust_id uuid;
  _interp jsonb;
  _type text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin only';
  END IF;

  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _req.status <> 'needs_admin_review' THEN
    RAISE EXCEPTION 'Request not in needs_admin_review (current: %)', _req.status;
  END IF;

  _interp := COALESCE(_req.ai_interpretation, '{}'::jsonb);
  _type := COALESCE(_interp->>'type', 'other');

  -- Operations outside the runtime whitelist cannot be executed automatically.
  IF _type NOT IN ('label_rename','nav_visibility','nav_reorder','card_visibility','dashboard_widget_order','saved_filter') THEN
    UPDATE public.customization_requests
       SET status = 'approved_for_development',
           approved_at = now(),
           ai_classification_reason = COALESCE(_admin_note, ai_classification_reason)
     WHERE id = _request_id
     RETURNING * INTO _req;
    RETURN _req;
  END IF;

  SELECT id INTO _existing_test FROM public.customization_requests
   WHERE workspace_id = _req.workspace_id
     AND status = 'testing'
     AND target_scope = _req.target_scope
     AND target_user_id IS NOT DISTINCT FROM _req.target_user_id
   LIMIT 1;
  IF _existing_test IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma personalização em teste neste escopo.';
  END IF;

  INSERT INTO public.customizations (workspace_id, type, name, description, configuration_json, created_by, request_id, is_active, is_testing, target_scope, target_user_id)
  VALUES (
    _req.workspace_id,
    _type,
    COALESCE(LEFT(_interp->>'summary', 80), LEFT(_req.request_text, 80)),
    COALESCE(_interp->>'summary', _admin_note),
    COALESCE(_interp->'configuration_json', '{}'::jsonb),
    _req.user_id,
    _req.id,
    true,
    true,
    _req.target_scope,
    _req.target_user_id
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

REVOKE EXECUTE ON FUNCTION public.user_approve_test(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_reject_test(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_approve_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_approve_test(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_reject_test(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_request(uuid, text) TO authenticated;