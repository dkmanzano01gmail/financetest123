-- Centraliza os coeficientes de cobrança do Selá Queimas e audita cada alteração.
ALTER TABLE public.rental_settings
  ADD COLUMN IF NOT EXISTS biscuit_coefficient numeric NOT NULL DEFAULT 0.0045,
  ADD COLUMN IF NOT EXISTS glaze_coefficient numeric NOT NULL DEFAULT 0.007;

ALTER TABLE public.rental_settings DROP CONSTRAINT IF EXISTS rental_settings_biscuit_coefficient_chk;
ALTER TABLE public.rental_settings ADD CONSTRAINT rental_settings_biscuit_coefficient_chk
  CHECK (biscuit_coefficient > 0);
ALTER TABLE public.rental_settings DROP CONSTRAINT IF EXISTS rental_settings_glaze_coefficient_chk;
ALTER TABLE public.rental_settings ADD CONSTRAINT rental_settings_glaze_coefficient_chk
  CHECK (glaze_coefficient > 0);

CREATE TABLE IF NOT EXISTS public.rental_pricing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  firing_type text NOT NULL CHECK (firing_type IN ('biscuit', 'glaze')),
  old_coefficient numeric NOT NULL,
  new_coefficient numeric NOT NULL,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_pricing_history_workspace_changed_idx
  ON public.rental_pricing_history(workspace_id, changed_at DESC);

GRANT SELECT ON public.rental_pricing_history TO authenticated;
GRANT ALL ON public.rental_pricing_history TO service_role;
ALTER TABLE public.rental_pricing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_pricing_history_member_select" ON public.rental_pricing_history;
CREATE POLICY "rental_pricing_history_member_select"
  ON public.rental_pricing_history FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.audit_rental_pricing_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.biscuit_coefficient IS DISTINCT FROM OLD.biscuit_coefficient THEN
    INSERT INTO public.rental_pricing_history (
      workspace_id, firing_type, old_coefficient, new_coefficient, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id, 'biscuit', OLD.biscuit_coefficient, NEW.biscuit_coefficient,
      auth.uid(), auth.jwt() ->> 'email'
    );

    UPDATE public.rental_slots
    SET price_per_liter = NEW.biscuit_coefficient * 1000
    WHERE workspace_id = NEW.workspace_id
      AND firing_type = 'biscuit'
      AND status IN ('draft', 'open');
  END IF;

  IF NEW.glaze_coefficient IS DISTINCT FROM OLD.glaze_coefficient THEN
    INSERT INTO public.rental_pricing_history (
      workspace_id, firing_type, old_coefficient, new_coefficient, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id, 'glaze', OLD.glaze_coefficient, NEW.glaze_coefficient,
      auth.uid(), auth.jwt() ->> 'email'
    );

    UPDATE public.rental_slots
    SET price_per_liter = NEW.glaze_coefficient * 1000
    WHERE workspace_id = NEW.workspace_id
      AND firing_type = 'glaze'
      AND status IN ('draft', 'open');
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_rental_pricing_changes() FROM PUBLIC;

DROP TRIGGER IF EXISTS rental_settings_pricing_audit ON public.rental_settings;
CREATE TRIGGER rental_settings_pricing_audit
AFTER UPDATE OF biscuit_coefficient, glaze_coefficient ON public.rental_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_rental_pricing_changes();

-- Alinha vagas abertas existentes aos parâmetros centralizados sem alterar pedidos históricos.
UPDATE public.rental_slots s
SET price_per_liter = CASE
  WHEN s.firing_type = 'biscuit' THEN cfg.biscuit_coefficient * 1000
  WHEN s.firing_type = 'glaze' THEN cfg.glaze_coefficient * 1000
  ELSE s.price_per_liter
END
FROM public.rental_settings cfg
WHERE cfg.workspace_id = s.workspace_id
  AND s.firing_type IN ('biscuit', 'glaze')
  AND s.status IN ('draft', 'open');
