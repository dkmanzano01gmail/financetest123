ALTER TABLE public.class_material_settings
  ADD COLUMN IF NOT EXISTS resistance_base_cost_per_firing numeric(14,2) NOT NULL DEFAULT 1.50;

COMMENT ON COLUMN public.class_material_settings.resistance_base_cost_per_firing IS
  'Minimum internal resistance cost allocated to each piece for each charged firing.';
