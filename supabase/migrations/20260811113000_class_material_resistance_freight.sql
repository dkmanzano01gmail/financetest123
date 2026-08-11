ALTER TABLE public.class_materials_usage
  ADD COLUMN IF NOT EXISTS resistance_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freight_rate numeric(8,4) NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS freight_cost numeric(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_materials_usage_freight_rate_check'
      AND conrelid = 'public.class_materials_usage'::regclass
  ) THEN
    ALTER TABLE public.class_materials_usage
      ADD CONSTRAINT class_materials_usage_freight_rate_check
      CHECK (freight_rate >= 0 AND freight_rate <= 1);
  END IF;
END
$$;

COMMENT ON COLUMN public.class_materials_usage.resistance_only IS
  'When true, firing cost includes only the allocated kiln resistance wear, excluding energy and buffer.';

COMMENT ON COLUMN public.class_materials_usage.freight_rate IS
  'Freight surcharge rate applied to the unit material cost base.';

COMMENT ON COLUMN public.class_materials_usage.freight_cost IS
  'Freight surcharge per unit captured when the piece was calculated.';
