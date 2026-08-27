ALTER TABLE public.class_materials_usage
  ADD COLUMN IF NOT EXISTS modeled_weight_g numeric(14,2) CHECK (modeled_weight_g >= 0),
  ADD COLUMN IF NOT EXISTS bisque_weight_g numeric(14,2) CHECK (bisque_weight_g >= 0),
  ADD COLUMN IF NOT EXISTS glazed_weight_g numeric(14,2) CHECK (glazed_weight_g >= 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_materials_usage_stage_weights_order_check'
      AND conrelid = 'public.class_materials_usage'::regclass
  ) THEN
    ALTER TABLE public.class_materials_usage
      ADD CONSTRAINT class_materials_usage_stage_weights_order_check
      CHECK (
        bisque_weight_g IS NULL
        OR glazed_weight_g IS NULL
        OR glazed_weight_g >= bisque_weight_g
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.class_materials_usage.modeled_weight_g IS
  'Piece weight in grams immediately after modeling; used to calculate clay cost.';

COMMENT ON COLUMN public.class_materials_usage.bisque_weight_g IS
  'Piece weight in grams after the bisque firing.';

COMMENT ON COLUMN public.class_materials_usage.glazed_weight_g IS
  'Piece weight in grams after glazing; difference from bisque weight determines glaze usage.';
