-- Selá Queimas: conservative biscuit loading rules for vertical pieces and stacks.

ALTER TABLE public.rental_settings
  ADD COLUMN IF NOT EXISTS biscuit_vertical_max_height_cm numeric(8,2) NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS biscuit_vertical_max_ratio numeric(5,4) NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS biscuit_stack_max_pieces integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS biscuit_stack_height_factor numeric(5,4) NOT NULL DEFAULT 0.65,
  ADD COLUMN IF NOT EXISTS biscuit_stackable_keywords text NOT NULL DEFAULT
    'bowl,tigela,cumbuca,caneca,xícara,xicara,copo';

ALTER TABLE public.rental_settings
  DROP CONSTRAINT IF EXISTS rental_settings_biscuit_vertical_height_chk,
  DROP CONSTRAINT IF EXISTS rental_settings_biscuit_vertical_ratio_chk,
  DROP CONSTRAINT IF EXISTS rental_settings_biscuit_stack_max_chk,
  DROP CONSTRAINT IF EXISTS rental_settings_biscuit_stack_height_factor_chk,
  DROP CONSTRAINT IF EXISTS rental_settings_biscuit_stackable_keywords_chk;

ALTER TABLE public.rental_settings
  ADD CONSTRAINT rental_settings_biscuit_vertical_height_chk
    CHECK (biscuit_vertical_max_height_cm > 0 AND biscuit_vertical_max_height_cm <= 30),
  ADD CONSTRAINT rental_settings_biscuit_vertical_ratio_chk
    CHECK (biscuit_vertical_max_ratio > 0 AND biscuit_vertical_max_ratio <= 1),
  ADD CONSTRAINT rental_settings_biscuit_stack_max_chk
    CHECK (biscuit_stack_max_pieces BETWEEN 1 AND 10),
  ADD CONSTRAINT rental_settings_biscuit_stack_height_factor_chk
    CHECK (biscuit_stack_height_factor BETWEEN 0.1 AND 1),
  ADD CONSTRAINT rental_settings_biscuit_stackable_keywords_chk
    CHECK (length(btrim(biscuit_stackable_keywords)) > 0);

ALTER TABLE public.rental_capacity_settings_history
  DROP CONSTRAINT IF EXISTS rental_capacity_settings_history_setting_key_check;

ALTER TABLE public.rental_capacity_settings_history
  ADD CONSTRAINT rental_capacity_settings_history_setting_key_check
    CHECK (setting_key IN ('kiln_geometry', 'support_inventory', 'biscuit_loading_rules'));

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

  IF ROW(
    NEW.biscuit_vertical_max_height_cm,
    NEW.biscuit_vertical_max_ratio,
    NEW.biscuit_stack_max_pieces,
    NEW.biscuit_stack_height_factor,
    NEW.biscuit_stackable_keywords
  ) IS DISTINCT FROM ROW(
    OLD.biscuit_vertical_max_height_cm,
    OLD.biscuit_vertical_max_ratio,
    OLD.biscuit_stack_max_pieces,
    OLD.biscuit_stack_height_factor,
    OLD.biscuit_stackable_keywords
  ) THEN
    INSERT INTO public.rental_capacity_settings_history (
      workspace_id, setting_key, old_value, new_value, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id,
      'biscuit_loading_rules',
      jsonb_build_object(
        'vertical_max_height_cm', OLD.biscuit_vertical_max_height_cm,
        'vertical_max_ratio', OLD.biscuit_vertical_max_ratio,
        'stack_max_pieces', OLD.biscuit_stack_max_pieces,
        'stack_height_factor', OLD.biscuit_stack_height_factor,
        'stackable_keywords', OLD.biscuit_stackable_keywords
      ),
      jsonb_build_object(
        'vertical_max_height_cm', NEW.biscuit_vertical_max_height_cm,
        'vertical_max_ratio', NEW.biscuit_vertical_max_ratio,
        'stack_max_pieces', NEW.biscuit_stack_max_pieces,
        'stack_height_factor', NEW.biscuit_stack_height_factor,
        'stackable_keywords', NEW.biscuit_stackable_keywords
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
  kiln_support_inventory, kiln_supports_per_level,
  biscuit_vertical_max_height_cm, biscuit_vertical_max_ratio,
  biscuit_stack_max_pieces, biscuit_stack_height_factor,
  biscuit_stackable_keywords
ON public.rental_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_rental_capacity_settings_changes();
