UPDATE public.customizations
SET type = 'nav_visibility',
    configuration_json = jsonb_build_object(
      'menu_key', COALESCE(configuration_json->'nav_visibility'->>'menu_key', configuration_json->>'menu_key'),
      'visible', COALESCE((configuration_json->'nav_visibility'->>'visible')::boolean, (configuration_json->>'visible')::boolean, false)
    )
WHERE type = 'card_visibility'
  AND (configuration_json ? 'nav_visibility' OR (configuration_json ? 'menu_key' AND NOT (configuration_json ? 'card_id')));