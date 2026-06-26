
ALTER TABLE public.customizations
  ADD COLUMN IF NOT EXISTS menu_key text,
  ADD COLUMN IF NOT EXISTS is_testing boolean NOT NULL DEFAULT false;

UPDATE public.customizations
   SET menu_key = (SELECT k FROM jsonb_object_keys(configuration_json->'labels') AS k LIMIT 1)
 WHERE type = 'label_rename' AND menu_key IS NULL AND configuration_json ? 'labels';

UPDATE public.customizations c
   SET is_testing = true
  FROM public.customization_requests r
 WHERE c.request_id = r.id AND r.status = 'testing';

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY workspace_id, menu_key ORDER BY updated_at DESC, created_at DESC) AS rn
    FROM public.customizations
   WHERE type = 'label_rename' AND is_active = true AND is_testing = false AND menu_key IS NOT NULL
)
UPDATE public.customizations c
   SET is_active = false
  FROM ranked
 WHERE c.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS customizations_active_label_unique
  ON public.customizations (workspace_id, menu_key)
  WHERE type = 'label_rename' AND is_active = true AND is_testing = false AND menu_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.user_approve_test(_request_id uuid)
 RETURNS customization_requests
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _req public.customization_requests;
  _cust public.customizations;
BEGIN
  SELECT * INTO _req FROM public.customization_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT public.is_workspace_member(_req.workspace_id, auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _req.status <> 'testing' THEN RAISE EXCEPTION 'Pedido não está em teste.'; END IF;

  IF _req.applied_customization_id IS NOT NULL THEN
    SELECT * INTO _cust FROM public.customizations WHERE id = _req.applied_customization_id;
    IF _cust IS NOT NULL AND _cust.type = 'label_rename' AND _cust.menu_key IS NOT NULL THEN
      UPDATE public.customizations
         SET is_active = false
       WHERE workspace_id = _cust.workspace_id
         AND type = 'label_rename'
         AND menu_key = _cust.menu_key
         AND id <> _cust.id
         AND is_active = true;
    END IF;
    UPDATE public.customizations SET is_testing = false, is_active = true WHERE id = _req.applied_customization_id;
  END IF;

  UPDATE public.customization_requests
     SET status = 'approved', approved_at = now(), completed_at = now()
   WHERE id = _request_id
   RETURNING * INTO _req;
  RETURN _req;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.user_approve_test(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_approve_test(uuid) TO authenticated;
