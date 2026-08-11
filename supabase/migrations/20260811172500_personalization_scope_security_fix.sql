-- Security follow-up for user/workspace-scoped customizations.
-- The helper signatures in this project are (workspace_id, user_id).

DROP POLICY IF EXISTS "Scoped members manage requests" ON public.customization_requests;
DROP POLICY IF EXISTS "Scoped members manage customizations" ON public.customizations;

DROP POLICY IF EXISTS "Scoped requests select" ON public.customization_requests;
DROP POLICY IF EXISTS "Scoped requests insert" ON public.customization_requests;
DROP POLICY IF EXISTS "Scoped requests update" ON public.customization_requests;
DROP POLICY IF EXISTS "Scoped requests delete" ON public.customization_requests;

CREATE POLICY "Scoped requests select" ON public.customization_requests
FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid()) OR (
    public.is_workspace_member(workspace_id, auth.uid()) AND
    (target_scope = 'workspace' OR (target_scope = 'user' AND target_user_id = auth.uid()))
  )
);

CREATE POLICY "Scoped requests insert" ON public.customization_requests
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin(auth.uid()) OR (
    user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()) AND (
      (target_scope = 'user' AND target_user_id = auth.uid()) OR
      (target_scope = 'workspace' AND target_user_id IS NULL AND
       public.workspace_role_of(workspace_id, auth.uid()) = 'owner')
    )
  )
);

CREATE POLICY "Scoped requests update" ON public.customization_requests
FOR UPDATE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR (
    public.is_workspace_member(workspace_id, auth.uid()) AND (
      (target_scope = 'user' AND target_user_id = auth.uid()) OR
      (target_scope = 'workspace' AND public.workspace_role_of(workspace_id, auth.uid()) = 'owner')
    )
  )
) WITH CHECK (
  public.is_super_admin(auth.uid()) OR (
    user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()) AND (
      (target_scope = 'user' AND target_user_id = auth.uid()) OR
      (target_scope = 'workspace' AND target_user_id IS NULL AND
       public.workspace_role_of(workspace_id, auth.uid()) = 'owner')
    )
  )
);

CREATE POLICY "Scoped requests delete" ON public.customization_requests
FOR DELETE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR (
    public.is_workspace_member(workspace_id, auth.uid()) AND (
      (target_scope = 'user' AND target_user_id = auth.uid()) OR
      (target_scope = 'workspace' AND public.workspace_role_of(workspace_id, auth.uid()) = 'owner')
    )
  )
);

DROP POLICY IF EXISTS "Scoped customizations select" ON public.customizations;
DROP POLICY IF EXISTS "Scoped customizations insert" ON public.customizations;
DROP POLICY IF EXISTS "Scoped customizations update" ON public.customizations;
DROP POLICY IF EXISTS "Scoped customizations delete" ON public.customizations;

CREATE POLICY "Scoped customizations select" ON public.customizations
FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid()) OR (
    public.is_workspace_member(workspace_id, auth.uid()) AND
    (target_scope = 'workspace' OR (target_scope = 'user' AND target_user_id = auth.uid()))
  )
);

CREATE POLICY "Scoped customizations insert" ON public.customizations
FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin(auth.uid()) OR (
    created_by = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()) AND (
      (target_scope = 'user' AND target_user_id = auth.uid()) OR
      (target_scope = 'workspace' AND target_user_id IS NULL AND
       public.workspace_role_of(workspace_id, auth.uid()) = 'owner')
    )
  )
);

CREATE POLICY "Scoped customizations update" ON public.customizations
FOR UPDATE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR (
    public.is_workspace_member(workspace_id, auth.uid()) AND (
      (target_scope = 'user' AND target_user_id = auth.uid()) OR
      (target_scope = 'workspace' AND public.workspace_role_of(workspace_id, auth.uid()) = 'owner')
    )
  )
) WITH CHECK (
  public.is_super_admin(auth.uid()) OR (
    created_by = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()) AND (
      (target_scope = 'user' AND target_user_id = auth.uid()) OR
      (target_scope = 'workspace' AND target_user_id IS NULL AND
       public.workspace_role_of(workspace_id, auth.uid()) = 'owner')
    )
  )
);

CREATE POLICY "Scoped customizations delete" ON public.customizations
FOR DELETE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR (
    public.is_workspace_member(workspace_id, auth.uid()) AND (
      (target_scope = 'user' AND target_user_id = auth.uid()) OR
      (target_scope = 'workspace' AND public.workspace_role_of(workspace_id, auth.uid()) = 'owner')
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS customization_usage_request_once
ON public.customization_usage(request_id) WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.charge_request_credits(_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _req public.customization_requests;
  _credits int;
  _credit_row public.customization_credits;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF _req.status <> 'testing' THEN
    RAISE EXCEPTION 'Créditos só podem ser cobrados durante a aprovação de um teste.';
  END IF;
  IF NOT public.is_workspace_member(_req.workspace_id, auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _req.target_scope = 'user' THEN
    IF _req.target_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Somente o destinatário pode aprovar esta personalização.';
    END IF;
  ELSIF public.workspace_role_of(_req.workspace_id, auth.uid()) <> 'owner' THEN
    RAISE EXCEPTION 'Somente o dono do workspace pode aprovar esta personalização.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customization_usage WHERE request_id = _request_id) THEN
    RETURN FALSE;
  END IF;
  _credits := COALESCE(_req.approved_credits, _req.estimated_credits, 1);
  IF _credits < 1 THEN RAISE EXCEPTION 'Quantidade de créditos inválida.'; END IF;
  PERFORM public.ensure_current_credits(_req.workspace_id);
  SELECT * INTO _credit_row FROM public.customization_credits
   WHERE workspace_id = _req.workspace_id
     AND period_month = EXTRACT(MONTH FROM now())::int
     AND period_year = EXTRACT(YEAR FROM now())::int
   FOR UPDATE;
  IF _credit_row IS NULL THEN RAISE EXCEPTION 'Saldo de créditos não encontrado.'; END IF;
  IF (_credit_row.credits_included - _credit_row.credits_used) < _credits THEN
    RAISE EXCEPTION 'Créditos insuficientes para aprovar esta personalização.';
  END IF;
  UPDATE public.customization_credits
     SET credits_used = credits_used + _credits, updated_at = now()
   WHERE id = _credit_row.id;
  INSERT INTO public.customization_usage (workspace_id, request_id, credits_used, usage_reason)
  VALUES (_req.workspace_id, _request_id, _credits, 'Personalização aprovada');
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_reject_test(_request_id uuid, _reason text DEFAULT NULL::text)
RETURNS customization_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _req public.customization_requests;
  _payload jsonb;
  _cust_id uuid;
  _kind text;
  _previous jsonb;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT public.is_workspace_member(_req.workspace_id, auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _req.target_scope = 'user' THEN
    IF _req.target_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Somente a pessoa dona desta personalização pode rejeitá-la.';
    END IF;
  ELSIF public.workspace_role_of(_req.workspace_id, auth.uid()) <> 'owner' THEN
    RAISE EXCEPTION 'Somente o dono do workspace pode rejeitar personalizações do workspace.';
  END IF;
  IF _req.status IN ('rejected','rejected_by_admin') THEN RETURN _req; END IF;
  IF _req.status <> 'testing' THEN RAISE EXCEPTION 'Pedido não está em teste.'; END IF;
  _payload := COALESCE(_req.rollback_payload, '{}'::jsonb);
  _kind := _payload->>'kind';
  _cust_id := NULLIF(_payload->>'customization_id','')::uuid;
  IF _kind = 'delete_customization' AND _cust_id IS NOT NULL THEN
    DELETE FROM public.customizations
     WHERE id = _cust_id AND workspace_id = _req.workspace_id AND request_id = _req.id;
  ELSIF _kind = 'restore_customization' AND _cust_id IS NOT NULL THEN
    _previous := _payload->'previous';
    UPDATE public.customizations
       SET configuration_json = COALESCE(_previous->'configuration_json', configuration_json),
           name = COALESCE(_previous->>'name', name),
           description = _previous->>'description',
           is_active = COALESCE((_previous->>'is_active')::boolean, is_active)
     WHERE id = _cust_id AND workspace_id = _req.workspace_id AND request_id = _req.id;
  END IF;
  UPDATE public.customization_requests
     SET status = 'rejected', rejected_at = now(), rejection_reason = _reason,
         approved_credits = NULL
   WHERE id = _request_id RETURNING * INTO _req;
  RETURN _req;
END;
$$;

-- Advanced requests are approved for manual development only. They never execute model JSON.
CREATE OR REPLACE FUNCTION public.admin_approve_request(_request_id uuid, _admin_note text DEFAULT NULL::text)
RETURNS customization_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _req public.customization_requests;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden: super admin only'; END IF;
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _req.status <> 'needs_admin_review' THEN
    RAISE EXCEPTION 'Request not in needs_admin_review (current: %)', _req.status;
  END IF;
  UPDATE public.customization_requests
     SET status = 'approved_for_development', approved_at = now(),
         ai_classification_reason = COALESCE(_admin_note, ai_classification_reason),
         auto_applied = false
   WHERE id = _request_id RETURNING * INTO _req;
  RETURN _req;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_request_credits(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_reject_test(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_approve_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.charge_request_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_reject_test(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_request(uuid, text) TO authenticated;
