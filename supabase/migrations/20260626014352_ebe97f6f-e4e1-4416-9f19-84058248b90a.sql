
CREATE OR REPLACE FUNCTION public.user_reject_test(_request_id uuid, _reason text DEFAULT NULL::text)
 RETURNS customization_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Clear category from transactions touched by this rule (best effort: restore null importance suggestion)
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
     SET status = 'rejected', rejected_at = now(), rejection_reason = _reason
   WHERE id = _request_id
   RETURNING * INTO _req;
  RETURN _req;
END;
$function$;
