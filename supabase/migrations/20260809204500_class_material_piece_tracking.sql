-- Keep the student-piece form and the production schema in sync.
ALTER TABLE public.class_materials_usage
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_status text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS completed_at date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_materials_usage_production_status_check'
      AND conrelid = 'public.class_materials_usage'::regclass
  ) THEN
    ALTER TABLE public.class_materials_usage
      ADD CONSTRAINT class_materials_usage_production_status_check
      CHECK (
        production_status IN (
          'in_progress',
          'drying',
          'bisque',
          'glazing',
          'completed',
          'delivered'
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS class_materials_usage_student_id_idx
  ON public.class_materials_usage(workspace_id, student_id, usage_date DESC);
