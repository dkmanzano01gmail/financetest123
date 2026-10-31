-- Selá Queimas: shelf thickness is required for conservative vertical planning.

ALTER TABLE public.rental_settings
  ADD COLUMN IF NOT EXISTS kiln_shelf_thickness_cm numeric(8,2) NOT NULL DEFAULT 1.5;

ALTER TABLE public.rental_settings
  DROP CONSTRAINT IF EXISTS rental_settings_kiln_shelf_thickness_chk;

ALTER TABLE public.rental_settings
  ADD CONSTRAINT rental_settings_kiln_shelf_thickness_chk
    CHECK (
      kiln_shelf_thickness_cm > 0
      AND kiln_shelf_thickness_cm <= 10
      AND kiln_shelf_thickness_cm < kiln_internal_height_cm
    );

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
    NEW.kiln_wall_clearance_cm,
    NEW.kiln_shelf_thickness_cm
  ) IS DISTINCT FROM ROW(
    OLD.kiln_shelf_diameter_cm,
    OLD.kiln_internal_height_cm,
    OLD.kiln_wall_clearance_cm,
    OLD.kiln_shelf_thickness_cm
  ) THEN
    INSERT INTO public.rental_capacity_settings_history (
      workspace_id, setting_key, old_value, new_value, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id,
      'kiln_geometry',
      jsonb_build_object(
        'shelf_diameter_cm', OLD.kiln_shelf_diameter_cm,
        'internal_height_cm', OLD.kiln_internal_height_cm,
        'wall_clearance_cm', OLD.kiln_wall_clearance_cm,
        'shelf_thickness_cm', OLD.kiln_shelf_thickness_cm
      ),
      jsonb_build_object(
        'shelf_diameter_cm', NEW.kiln_shelf_diameter_cm,
        'internal_height_cm', NEW.kiln_internal_height_cm,
        'wall_clearance_cm', NEW.kiln_wall_clearance_cm,
        'shelf_thickness_cm', NEW.kiln_shelf_thickness_cm
      ),
      auth.uid(),
      auth.jwt() ->> 'email'
    );
  END IF;

  IF ROW(
    NEW.kiln_support_inventory,
    NEW.kiln_supports_per_level
  ) IS DISTINCT FROM ROW(
    OLD.kiln_support_inventory,
    OLD.kiln_supports_per_level
  ) THEN
    INSERT INTO public.rental_capacity_settings_history (
      workspace_id, setting_key, old_value, new_value, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id,
      'support_inventory',
      jsonb_build_object(
        'inventory', OLD.kiln_support_inventory,
        'supports_per_level', OLD.kiln_supports_per_level
      ),
      jsonb_build_object(
        'inventory', NEW.kiln_support_inventory,
        'supports_per_level', NEW.kiln_supports_per_level
      ),
      auth.uid(),
      auth.jwt() ->> 'email'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_settings_capacity_audit ON public.rental_settings;
CREATE TRIGGER rental_settings_capacity_audit
AFTER UPDATE OF kiln_shelf_diameter_cm, kiln_internal_height_cm,
  kiln_wall_clearance_cm, kiln_shelf_thickness_cm,
  kiln_support_inventory, kiln_supports_per_level
ON public.rental_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_rental_capacity_settings_changes();
