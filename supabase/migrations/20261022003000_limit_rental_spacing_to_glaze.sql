-- A margem horizontal existe somente para queimas de esmalte.
-- Biscoito e outras modalidades usam exatamente as dimensões informadas.
DO $$
DECLARE
  function_definition text;
  all_firings_assignment constant text := 'spacing := cfg.glaze_spacing_cm;';
  glaze_only_assignment constant text :=
    'spacing := CASE WHEN slot.firing_type = ''glaze'' THEN cfg.glaze_spacing_cm ELSE 0 END;';
BEGIN
  SELECT pg_get_functiondef('public.rental_public_quote(uuid,jsonb)'::regprocedure)
  INTO function_definition;

  IF position(all_firings_assignment IN function_definition) > 0 THEN
    EXECUTE replace(function_definition, all_firings_assignment, glaze_only_assignment);
  ELSIF position(glaze_only_assignment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar a regra de margem em rental_public_quote';
  END IF;

  SELECT pg_get_functiondef(
    'public.rental_public_create_order(uuid,text,text,text,text,text,jsonb,text)'::regprocedure
  ) INTO function_definition;

  IF position(all_firings_assignment IN function_definition) > 0 THEN
    EXECUTE replace(function_definition, all_firings_assignment, glaze_only_assignment);
  ELSIF position(glaze_only_assignment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar a regra de margem em rental_public_create_order';
  END IF;
END;
$$;
