
-- 1) students table
CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  class_name text,
  monthly_fee numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  legacy_source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='students' AND policyname='students_ws_select') THEN
    CREATE POLICY "students_ws_select" ON public.students FOR SELECT TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='students' AND policyname='students_ws_write') THEN
    CREATE POLICY "students_ws_write" ON public.students FOR ALL TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()))
      WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS students_ws_legacy_uidx
  ON public.students (workspace_id, legacy_source_id)
  WHERE legacy_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS students_ws_name_idx ON public.students (workspace_id, name);

DROP TRIGGER IF EXISTS update_students_updated_at ON public.students;
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) extend existing tables
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS legacy_source_id text,
  ADD COLUMN IF NOT EXISTS class_name text,
  ADD COLUMN IF NOT EXISTS record_type text DEFAULT 'class',
  ADD COLUMN IF NOT EXISTS generates_makeup boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS makeup_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS makeup_reference text,
  ADD COLUMN IF NOT EXISTS makeups_used_in_month integer,
  ADD COLUMN IF NOT EXISTS makeups_available_in_month integer;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_ws_legacy_uidx
  ON public.attendance_records (workspace_id, legacy_source_id)
  WHERE legacy_source_id IS NOT NULL;

ALTER TABLE public.cash_flow_entries
  ADD COLUMN IF NOT EXISTS legacy_source_id text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS day_of_month integer,
  ADD COLUMN IF NOT EXISTS specific_date date;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cash_flow_day_of_month_range') THEN
    ALTER TABLE public.cash_flow_entries
      ADD CONSTRAINT cash_flow_day_of_month_range
      CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_ws_legacy_uidx
  ON public.cash_flow_entries (workspace_id, legacy_source_id)
  WHERE legacy_source_id IS NOT NULL;

ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS legacy_source_id text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS supplier_url text,
  ADD COLUMN IF NOT EXISTS purchase_link text;

CREATE UNIQUE INDEX IF NOT EXISTS raw_materials_ws_legacy_uidx
  ON public.raw_materials (workspace_id, legacy_source_id)
  WHERE legacy_source_id IS NOT NULL;

ALTER TABLE public.class_materials_usage
  ADD COLUMN IF NOT EXISTS legacy_source_id text,
  ADD COLUMN IF NOT EXISTS piece_name text,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS class_materials_ws_legacy_uidx
  ON public.class_materials_usage (workspace_id, legacy_source_id)
  WHERE legacy_source_id IS NOT NULL;

-- 3) legacy_import_archive
CREATE TABLE IF NOT EXISTS public.legacy_import_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sheet_name text NOT NULL,
  source_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, sheet_name, source_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_import_archive TO authenticated;
GRANT ALL ON public.legacy_import_archive TO service_role;

ALTER TABLE public.legacy_import_archive ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='legacy_import_archive' AND policyname='legacy_archive_ws_select') THEN
    CREATE POLICY "legacy_archive_ws_select" ON public.legacy_import_archive FOR SELECT TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='legacy_import_archive' AND policyname='legacy_archive_ws_write') THEN
    CREATE POLICY "legacy_archive_ws_write" ON public.legacy_import_archive FOR ALL TO authenticated
      USING (public.is_workspace_member(workspace_id, auth.uid()))
      WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
  END IF;
END $$;
