ALTER TABLE public.firing_settings
  ALTER COLUMN resistance_cost SET DEFAULT 2500;

ALTER TABLE public.class_material_settings
  ALTER COLUMN resistance_base_cost_per_firing SET DEFAULT 0;

COMMENT ON COLUMN public.class_material_settings.resistance_base_cost_per_firing IS
  'Complemento mínimo opcional por peça/queima. O padrão é zero; a resistência é rateada pela ocupação da peça.';
