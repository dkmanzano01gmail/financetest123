-- Student 360º profiles and multi-kiln pricing.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS enrollment_date date,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS social_link text,
  ADD COLUMN IF NOT EXISTS photo_url text;

UPDATE public.students
SET enrollment_date = created_at::date
WHERE enrollment_date IS NULL;

CREATE TABLE IF NOT EXISTS public.student_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_type text NOT NULL DEFAULT 'tuition'
    CHECK (payment_type IN ('tuition','material','other')),
  reference_month date,
  payment_method text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_payments_ws_student_date_idx
  ON public.student_payments(workspace_id, student_id, payment_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_payments TO authenticated;
GRANT ALL ON public.student_payments TO service_role;
ALTER TABLE public.student_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'student_payments'
      AND policyname = 'student_payments_ws_all'
  ) THEN
    CREATE POLICY "student_payments_ws_all"
      ON public.student_payments FOR ALL TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()))
      WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;
END $$;
DROP TRIGGER IF EXISTS student_payments_uat ON public.student_payments;
CREATE TRIGGER student_payments_uat
  BEFORE UPDATE ON public.student_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.kilns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  model text,
  serial_number text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  oven_diameter_cm numeric(10,2) NOT NULL DEFAULT 57,
  area_adjustment numeric(10,4) NOT NULL DEFAULT 1.0825,
  resistance_cost numeric(14,2) NOT NULL DEFAULT 2000,
  resistance_burns integer NOT NULL DEFAULT 275,
  power_kw numeric(10,3) NOT NULL DEFAULT 9.85,
  biscuit_hours numeric(10,2) NOT NULL DEFAULT 9,
  glaze_hours numeric(10,2) NOT NULL DEFAULT 10.5,
  utilization numeric(8,4) NOT NULL DEFAULT 0.65,
  kwh_cost numeric(14,4) NOT NULL DEFAULT 1,
  final_buffer numeric(8,4) NOT NULL DEFAULT 0.1,
  customer_margin_percent numeric(8,2) NOT NULL DEFAULT 100,
  biscuit_resistance_burns integer NOT NULL DEFAULT 275,
  biscuit_utilization numeric(8,4) NOT NULL DEFAULT 0.65,
  glaze6_resistance_burns integer NOT NULL DEFAULT 175,
  glaze6_hours numeric(10,2) NOT NULL DEFAULT 10.5,
  glaze6_utilization numeric(8,4) NOT NULL DEFAULT 0.75,
  glaze7_resistance_burns integer NOT NULL DEFAULT 150,
  glaze7_hours numeric(10,2) NOT NULL DEFAULT 11,
  glaze7_utilization numeric(8,4) NOT NULL DEFAULT 0.78,
  glaze10_resistance_burns integer NOT NULL DEFAULT 110,
  glaze10_hours numeric(10,2) NOT NULL DEFAULT 12,
  glaze10_utilization numeric(8,4) NOT NULL DEFAULT 0.90,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kilns_ws_name_unique_idx
  ON public.kilns(workspace_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS kilns_one_default_per_ws_idx
  ON public.kilns(workspace_id) WHERE is_default;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kilns TO authenticated;
GRANT ALL ON public.kilns TO service_role;
ALTER TABLE public.kilns ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'kilns'
      AND policyname = 'kilns_ws_all'
  ) THEN
    CREATE POLICY "kilns_ws_all"
      ON public.kilns FOR ALL TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()))
      WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;
END $$;
DROP TRIGGER IF EXISTS kilns_uat ON public.kilns;
CREATE TRIGGER kilns_uat
  BEFORE UPDATE ON public.kilns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Preserve the original single-oven configuration as the first kiln.
INSERT INTO public.kilns (
  workspace_id, name, is_default,
  oven_diameter_cm, area_adjustment, resistance_cost, resistance_burns,
  power_kw, biscuit_hours, glaze_hours, utilization, kwh_cost, final_buffer,
  customer_margin_percent, biscuit_resistance_burns, biscuit_utilization,
  glaze6_resistance_burns, glaze6_hours, glaze6_utilization,
  glaze7_resistance_burns, glaze7_hours, glaze7_utilization,
  glaze10_resistance_burns, glaze10_hours, glaze10_utilization
)
SELECT
  fs.workspace_id, 'Forno principal', true,
  fs.oven_diameter_cm, fs.area_adjustment, fs.resistance_cost, fs.resistance_burns,
  fs.power_kw, fs.biscuit_hours, fs.glaze_hours, fs.utilization, fs.kwh_cost,
  fs.final_buffer, fs.customer_margin_percent, fs.biscuit_resistance_burns,
  fs.biscuit_utilization, fs.glaze6_resistance_burns, fs.glaze6_hours,
  fs.glaze6_utilization, fs.glaze7_resistance_burns, fs.glaze7_hours,
  fs.glaze7_utilization, fs.glaze10_resistance_burns, fs.glaze10_hours,
  fs.glaze10_utilization
FROM public.firing_settings fs
WHERE NOT EXISTS (
  SELECT 1 FROM public.kilns k WHERE k.workspace_id = fs.workspace_id
);

ALTER TABLE public.class_materials_usage
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kiln_id uuid REFERENCES public.kilns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_status text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS completed_at date;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_materials_usage_production_status_check'
      AND conrelid = 'public.class_materials_usage'::regclass
  ) THEN
    ALTER TABLE public.class_materials_usage
      ADD CONSTRAINT class_materials_usage_production_status_check
      CHECK (production_status IN (
        'in_progress','drying','bisque','glazing','completed','delivered'
      ));
  END IF;
END $$;

UPDATE public.class_materials_usage cmu
SET student_id = (
  SELECT s.id
  FROM public.students s
  WHERE s.workspace_id = cmu.workspace_id
    AND lower(trim(s.name)) = lower(trim(cmu.student_name))
  ORDER BY s.created_at
  LIMIT 1
)
WHERE cmu.student_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.workspace_id = cmu.workspace_id
      AND lower(trim(s.name)) = lower(trim(cmu.student_name))
  );

CREATE INDEX IF NOT EXISTS class_materials_ws_student_id_date_idx
  ON public.class_materials_usage(workspace_id, student_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS class_materials_ws_kiln_idx
  ON public.class_materials_usage(workspace_id, kiln_id);

ALTER TABLE public.firing_pricing
  ADD COLUMN IF NOT EXISTS kiln_id uuid REFERENCES public.kilns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS firing_pricing_ws_kiln_idx
  ON public.firing_pricing(workspace_id, kiln_id);

-- Public image bucket; writes remain restricted to members of the workspace
-- identified by the first folder in the object path.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-photos',
  'student-photos',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'student_photos_member_insert'
  ) THEN
    CREATE POLICY "student_photos_member_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'student-photos'
        AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'student_photos_member_update'
  ) THEN
    CREATE POLICY "student_photos_member_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
      )
      WITH CHECK (
        bucket_id = 'student-photos'
        AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'student_photos_member_delete'
  ) THEN
    CREATE POLICY "student_photos_member_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'student-photos'
        AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
      );
  END IF;
END $$;
