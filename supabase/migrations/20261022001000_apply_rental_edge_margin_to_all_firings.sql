-- A margem horizontal vale para todas as modalidades do Selá Queimas.
-- A migração anterior já criou a configuração com o padrão de 1 cm;
-- aqui atualizamos as duas funções públicas sem alterar pedidos existentes.
DO $$
DECLARE
  function_definition text;
  glaze_only_assignment constant text :=
    'spacing := CASE WHEN slot.firing_type = ''glaze'' THEN cfg.glaze_spacing_cm ELSE 0 END;';
  all_firings_assignment constant text := 'spacing := cfg.glaze_spacing_cm;';
BEGIN
  SELECT pg_get_functiondef('public.rental_public_quote(uuid,jsonb)'::regprocedure)
  INTO function_definition;

  IF position(glaze_only_assignment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar a regra de margem em rental_public_quote';
  END IF;
  EXECUTE replace(function_definition, glaze_only_assignment, all_firings_assignment);

  SELECT pg_get_functiondef(
    'public.rental_public_create_order(uuid,text,text,text,text,text,jsonb,text)'::regprocedure
  ) INTO function_definition;

  IF position(glaze_only_assignment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar a regra de margem em rental_public_create_order';
  END IF;
  EXECUTE replace(function_definition, glaze_only_assignment, all_firings_assignment);
END;
$$;
