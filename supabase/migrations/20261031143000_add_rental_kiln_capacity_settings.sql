-- Selá Queimas: physical kiln dimensions and configurable furniture inventory.

ALTER TABLE public.rental_settings
  ADD COLUMN IF NOT EXISTS kiln_shelf_diameter_cm numeric(8,2) NOT NULL DEFAULT 52.5,
  ADD COLUMN IF NOT EXISTS kiln_internal_height_cm numeric(8,2) NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS kiln_wall_clearance_cm numeric(8,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kiln_support_inventory jsonb NOT NULL DEFAULT
    '[{"height_cm":15,"quantity":8},{"height_cm":12.5,"quantity":8},{"height_cm":10,"quantity":8},{"height_cm":7.5,"quantity":8},{"height_cm":5,"quantity":8},{"height_cm":2.5,"quantity":8}]'::jsonb;

ALTER TABLE public.rental_settings
  DROP CONSTRAINT IF EXISTS rental_settings_kiln_shelf_diameter_chk,
  DROP CONSTRAINT IF EXISTS rental_settings_kiln_internal_height_chk,
  DROP CONSTRAINT IF EXISTS rental_settings_kiln_wall_clearance_chk,
  DROP CONSTRAINT IF EXISTS rental_settings_kiln_support_inventory_chk;

ALTER TABLE public.rental_settings
  ADD CONSTRAINT rental_settings_kiln_shelf_diameter_chk
    CHECK (kiln_shelf_diameter_cm > 0 AND kiln_shelf_diameter_cm <= 500),
  ADD CONSTRAINT rental_settings_kiln_internal_height_chk
    CHECK (kiln_internal_height_cm > 0 AND kiln_internal_height_cm <= 500),
  ADD CONSTRAINT rental_settings_kiln_wall_clearance_chk
    CHECK (
      kiln_wall_clearance_cm >= 0
      AND kiln_wall_clearance_cm * 2 < kiln_shelf_diameter_cm
    ),
  ADD CONSTRAINT rental_settings_kiln_support_inventory_chk
    CHECK (
      jsonb_typeof(kiln_support_inventory) = 'array'
      AND jsonb_array_length(kiln_support_inventory) BETWEEN 1 AND 20
    );

CREATE TABLE IF NOT EXISTS public.rental_capacity_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  setting_key text NOT NULL CHECK (setting_key IN ('kiln_geometry', 'support_inventory')),
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_capacity_settings_history_workspace_changed_idx
  ON public.rental_capacity_settings_history(workspace_id, changed_at DESC);

GRANT SELECT ON public.rental_capacity_settings_history TO authenticated;
GRANT ALL ON public.rental_capacity_settings_history TO service_role;
ALTER TABLE public.rental_capacity_settings_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_capacity_settings_history_member_select"
  ON public.rental_capacity_settings_history;
CREATE POLICY "rental_capacity_settings_history_member_select"
  ON public.rental_capacity_settings_history FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_rental_kiln_support_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  height_value numeric;
  quantity_value numeric;
BEGIN
  IF jsonb_typeof(NEW.kiln_support_inventory) <> 'array'
     OR jsonb_array_length(NEW.kiln_support_inventory) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'O estoque de suportes deve conter entre 1 e 20 tamanhos.';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(NEW.kiln_support_inventory)
  LOOP
    BEGIN
      height_value := (item ->> 'height_cm')::numeric;
      quantity_value := (item ->> 'quantity')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Altura e quantidade dos suportes devem ser numéricas.';
    END;

    IF height_value <= 0 OR height_value > NEW.kiln_internal_height_cm THEN
      RAISE EXCEPTION 'A altura do suporte deve ser positiva e não superar a altura do forno.';
    END IF;
    IF quantity_value < 0 OR quantity_value > 1000 OR quantity_value <> trunc(quantity_value) THEN
      RAISE EXCEPTION 'A quantidade de suportes deve ser um número inteiro entre 0 e 1000.';
    END IF;
  END LOOP;

  IF (
    SELECT count(*) <> count(DISTINCT (value ->> 'height_cm')::numeric)
    FROM jsonb_array_elements(NEW.kiln_support_inventory)
  ) THEN
    RAISE EXCEPTION 'Não pode haver alturas de suporte duplicadas.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_settings_validate_kiln_support_inventory
  ON public.rental_settings;
CREATE TRIGGER rental_settings_validate_kiln_support_inventory
BEFORE INSERT OR UPDATE OF kiln_internal_height_cm, kiln_support_inventory
ON public.rental_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_rental_kiln_support_inventory();

CREATE OR REPLACE FUNCTION public.audit_rental_capacity_settings_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF ROW(
    NEW.kiln_shelf_diameter_cm,
    NEW.kiln_internal_height_cm,
    NEW.kiln_wall_clearance_cm
  ) IS DISTINCT FROM ROW(
    OLD.kiln_shelf_diameter_cm,
    OLD.kiln_internal_height_cm,
    OLD.kiln_wall_clearance_cm
  ) THEN
    INSERT INTO public.rental_capacity_settings_history (
      workspace_id, setting_key, old_value, new_value, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id,
      'kiln_geometry',
      jsonb_build_object(
        'shelf_diameter_cm', OLD.kiln_shelf_diameter_cm,
        'internal_height_cm', OLD.kiln_internal_height_cm,
        'wall_clearance_cm', OLD.kiln_wall_clearance_cm
      ),
      jsonb_build_object(
        'shelf_diameter_cm', NEW.kiln_shelf_diameter_cm,
        'internal_height_cm', NEW.kiln_internal_height_cm,
        'wall_clearance_cm', NEW.kiln_wall_clearance_cm
      ),
      auth.uid(),
      auth.jwt() ->> 'email'
    );
  END IF;

  IF NEW.kiln_support_inventory IS DISTINCT FROM OLD.kiln_support_inventory THEN
    INSERT INTO public.rental_capacity_settings_history (
      workspace_id, setting_key, old_value, new_value, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id, 'support_inventory', OLD.kiln_support_inventory,
      NEW.kiln_support_inventory, auth.uid(), auth.jwt() ->> 'email'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_settings_capacity_audit ON public.rental_settings;
CREATE TRIGGER rental_settings_capacity_audit
AFTER UPDATE OF kiln_shelf_diameter_cm, kiln_internal_height_cm,
  kiln_wall_clearance_cm, kiln_support_inventory
ON public.rental_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_rental_capacity_settings_changes();

