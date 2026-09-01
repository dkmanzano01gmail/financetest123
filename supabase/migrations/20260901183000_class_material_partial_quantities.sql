ALTER TABLE public.class_materials_usage
  ADD COLUMN IF NOT EXISTS completed_quantity integer,
  ADD COLUMN IF NOT EXISTS delivered_quantity integer,
  ADD COLUMN IF NOT EXISTS invoiced_quantity integer;

ALTER TABLE public.class_materials_usage
  ADD CONSTRAINT class_materials_usage_completed_quantity_check
    CHECK (completed_quantity IS NULL OR (completed_quantity >= 0 AND completed_quantity <= quantity)),
  ADD CONSTRAINT class_materials_usage_delivered_quantity_check
    CHECK (delivered_quantity IS NULL OR (delivered_quantity >= 0 AND delivered_quantity <= COALESCE(completed_quantity, quantity))),
  ADD CONSTRAINT class_materials_usage_invoiced_quantity_check
    CHECK (invoiced_quantity IS NULL OR (invoiced_quantity >= 0 AND invoiced_quantity <= COALESCE(completed_quantity, quantity)));
