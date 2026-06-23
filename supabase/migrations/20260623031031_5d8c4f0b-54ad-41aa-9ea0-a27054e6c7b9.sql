CREATE OR REPLACE FUNCTION public.consume_credits(_workspace_id uuid, _request_id uuid, _credits integer, _reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.customization_credits;
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  _row := public.ensure_current_credits(_workspace_id);

  -- Unlimited mode: always allow. Still record usage for history.
  UPDATE public.customization_credits
     SET credits_used = credits_used + _credits
   WHERE id = _row.id;

  INSERT INTO public.customization_usage (workspace_id, request_id, credits_used, usage_reason)
  VALUES (_workspace_id, _request_id, _credits, _reason);

  RETURN TRUE;
END;
$function$;