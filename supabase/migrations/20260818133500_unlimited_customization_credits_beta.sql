-- During the beta, credits remain useful as an effort/usage metric but must
-- never block a user from approving a customization. Keep the existing
-- authorization, status and idempotency checks intact.
CREATE OR REPLACE FUNCTION public.charge_request_credits(_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _req public.customization_requests;
  _credits integer;
BEGIN
  SELECT * INTO _req
  FROM public.customization_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF _req IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;

  IF _req.status <> 'testing' THEN
    RAISE EXCEPTION 'Créditos só podem ser registrados durante a aprovação de um teste.';
  END IF;

  IF NOT public.is_workspace_member(_req.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _req.target_scope = 'user' THEN
    IF _req.target_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Somente o destinatário pode aprovar esta personalização.';
    END IF;
  ELSIF public.workspace_role_of(_req.workspace_id, auth.uid()) <> 'owner' THEN
    RAISE EXCEPTION 'Somente o dono do workspace pode aprovar esta personalização.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customization_usage WHERE request_id = _request_id
  ) THEN
    RETURN FALSE;
  END IF;

  _credits := GREATEST(COALESCE(_req.approved_credits, _req.estimated_credits, 1), 1);
  PERFORM public.ensure_current_credits(_req.workspace_id);

  -- Usage may exceed the plan allowance while unlimited beta access is active.
  UPDATE public.customization_credits
  SET credits_used = credits_used + _credits,
      updated_at = now()
  WHERE workspace_id = _req.workspace_id
    AND period_month = EXTRACT(MONTH FROM now())::integer
    AND period_year = EXTRACT(YEAR FROM now())::integer;

  INSERT INTO public.customization_usage
    (workspace_id, request_id, credits_used, usage_reason)
  VALUES
    (_req.workspace_id, _request_id, _credits, 'Personalização aprovada — acesso beta ilimitado');

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_request_credits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.charge_request_credits(uuid) TO authenticated;

COMMENT ON FUNCTION public.charge_request_credits(uuid) IS
  'Registra uso de personalizações sem impor limite de créditos durante o beta.';
