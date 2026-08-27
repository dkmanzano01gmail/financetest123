ALTER TABLE public.students ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS attendance_student_idx
  ON public.attendance_records(workspace_id, student_id, session_date DESC);

CREATE TABLE IF NOT EXISTS public.student_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  payment_date date,
  due_date date,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_type text NOT NULL DEFAULT 'tuition',
  reference_month date,
  payment_method text,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('pending','paid','overdue','waived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_payments ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.student_payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_payments TO authenticated;
GRANT ALL ON public.student_payments TO service_role;
ALTER TABLE public.student_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS student_payments_student_idx
  ON public.student_payments(workspace_id, student_id, reference_month DESC);

CREATE TABLE public.student_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email text NOT NULL,
  status text NOT NULL DEFAULT 'convite_pendente'
    CHECK (status IN ('convite_pendente','ativo','expirado','revogado')),
  invite_token_hash text,
  requires_password boolean NOT NULL DEFAULT false,
  invited_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_portal_access TO authenticated;
GRANT ALL ON public.student_portal_access TO service_role;
ALTER TABLE public.student_portal_access ENABLE ROW LEVEL SECURITY;
CREATE INDEX student_portal_access_user_idx ON public.student_portal_access(user_id, status);

CREATE TABLE public.student_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  piece_type text,
  clay text,
  glazes text[] NOT NULL DEFAULT '{}',
  desired_dimensions text,
  reference_image_url text,
  notes text,
  status text NOT NULL DEFAULT 'ideia'
    CHECK (status IN ('ideia','planejando','em_andamento','concluido')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_projects TO authenticated;
GRANT ALL ON public.student_projects TO service_role;
ALTER TABLE public.student_projects ENABLE ROW LEVEL SECURITY;
CREATE INDEX student_projects_student_idx
  ON public.student_projects(workspace_id, student_id, archived_at, created_at DESC);

CREATE OR REPLACE FUNCTION public.student_portal_student_id(
  _workspace_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT student_id
  FROM public.student_portal_access
  WHERE workspace_id = _workspace_id
    AND user_id = _user_id
    AND status = 'ativo'
    AND revoked_at IS NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.student_portal_student_id(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_portal_student_id(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_student_portal_access()
RETURNS TABLE (
  id uuid, workspace_id uuid, student_id uuid, user_id uuid,
  invited_email text, status text, accepted_at timestamptz,
  workspace_name text, currency text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.workspace_id, a.student_id, a.user_id,
         a.invited_email, a.status, a.accepted_at, w.name, w.currency
  FROM public.student_portal_access a
  JOIN public.workspaces w ON w.id = a.workspace_id
  WHERE a.user_id = auth.uid()
    AND a.status = 'ativo'
    AND a.revoked_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.current_student_portal_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_student_portal_access() TO authenticated;

CREATE POLICY "student_portal_admin_read" ON public.student_portal_access
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "student_portal_admin_write" ON public.student_portal_access
FOR ALL TO authenticated
USING (public.workspace_role_of(workspace_id, auth.uid())::text IN ('owner','member'))
WITH CHECK (public.workspace_role_of(workspace_id, auth.uid())::text IN ('owner','member'));
CREATE POLICY "student_own_profile_read" ON public.students
FOR SELECT TO authenticated USING (
  id = public.student_portal_student_id(workspace_id, auth.uid())
);
CREATE POLICY "student_own_attendance_read" ON public.attendance_records
FOR SELECT TO authenticated USING (
  student_id = public.student_portal_student_id(workspace_id, auth.uid())
);
CREATE POLICY "student_own_pieces_read" ON public.class_materials_usage
FOR SELECT TO authenticated USING (
  student_id = public.student_portal_student_id(workspace_id, auth.uid())
);
CREATE POLICY "student_own_piece_photos" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'class-material-photos'
  AND EXISTS (
    SELECT 1 FROM public.class_materials_usage p
    WHERE p.photo_path = name
      AND p.student_id = public.student_portal_student_id(p.workspace_id, auth.uid())
  )
);
CREATE POLICY "student_payments_admin" ON public.student_payments
FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "student_own_payments_read" ON public.student_payments
FOR SELECT TO authenticated USING (
  student_id = public.student_portal_student_id(workspace_id, auth.uid())
);
CREATE POLICY "student_projects_admin" ON public.student_projects
FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "student_projects_own" ON public.student_projects
FOR ALL TO authenticated
USING (student_id = public.student_portal_student_id(workspace_id, auth.uid()))
WITH CHECK (student_id = public.student_portal_student_id(workspace_id, auth.uid()));

CREATE TRIGGER student_portal_access_uat BEFORE UPDATE ON public.student_portal_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER student_projects_uat BEFORE UPDATE ON public.student_projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER student_payments_uat BEFORE UPDATE ON public.student_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
