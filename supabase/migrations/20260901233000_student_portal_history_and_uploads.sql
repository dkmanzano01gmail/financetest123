CREATE OR REPLACE FUNCTION public.student_portal_attendance(_student_id uuid DEFAULT NULL)
RETURNS SETOF public.attendance_records
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target_student public.students%ROWTYPE;
BEGIN
  IF _student_id IS NULL THEN
    SELECT student.* INTO target_student
    FROM public.student_portal_access access
    JOIN public.students student ON student.id = access.student_id
    WHERE access.user_id = auth.uid()
      AND access.status = 'ativo'
      AND access.revoked_at IS NULL
    LIMIT 1;
  ELSE
    SELECT * INTO target_student FROM public.students WHERE id = _student_id;
    IF target_student.id IS NOT NULL
       AND public.workspace_role_of(target_student.workspace_id, auth.uid())::text NOT IN ('owner','member') THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF target_student.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT attendance.*
  FROM public.attendance_records attendance
  WHERE attendance.workspace_id = target_student.workspace_id
    AND (
      attendance.student_id = target_student.id
      OR (
        attendance.student_id IS NULL
        AND lower(trim(attendance.student_name)) = lower(trim(target_student.name))
        AND NOT EXISTS (
          SELECT 1 FROM public.students duplicate
          WHERE duplicate.workspace_id = target_student.workspace_id
            AND duplicate.id <> target_student.id
            AND lower(trim(duplicate.name)) = lower(trim(target_student.name))
        )
      )
    )
  ORDER BY attendance.session_date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_portal_attendance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_portal_update_piece(
  _piece_id uuid,
  _student_id uuid DEFAULT NULL,
  _comments text DEFAULT NULL,
  _photo_path text DEFAULT NULL
)
RETURNS public.class_materials_usage
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target_student public.students%ROWTYPE;
  updated_piece public.class_materials_usage%ROWTYPE;
BEGIN
  IF _student_id IS NULL THEN
    SELECT student.* INTO target_student
    FROM public.student_portal_access access
    JOIN public.students student ON student.id = access.student_id
    WHERE access.user_id = auth.uid()
      AND access.status = 'ativo'
      AND access.revoked_at IS NULL
    LIMIT 1;
  ELSE
    SELECT * INTO target_student FROM public.students WHERE id = _student_id;
    IF target_student.id IS NOT NULL
       AND public.workspace_role_of(target_student.workspace_id, auth.uid())::text NOT IN ('owner','member') THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF target_student.id IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.class_materials_usage piece
  SET comments = NULLIF(trim(_comments), ''),
      photo_path = COALESCE(NULLIF(_photo_path, ''), piece.photo_path),
      updated_at = now()
  WHERE piece.id = _piece_id
    AND piece.workspace_id = target_student.workspace_id
    AND (
      piece.student_id = target_student.id
      OR (
        piece.student_id IS NULL
        AND lower(trim(piece.student_name)) = lower(trim(target_student.name))
        AND NOT EXISTS (
          SELECT 1 FROM public.students duplicate
          WHERE duplicate.workspace_id = target_student.workspace_id
            AND duplicate.id <> target_student.id
            AND lower(trim(duplicate.name)) = lower(trim(target_student.name))
        )
      )
    )
  RETURNING piece.* INTO updated_piece;

  IF updated_piece.id IS NULL THEN RAISE EXCEPTION 'Piece not found'; END IF;
  RETURN updated_piece;
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_update_piece(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_portal_update_piece(uuid, uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS "student_own_piece_photos" ON storage.objects;
CREATE POLICY "student_own_piece_photos" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'class-piece-photos'
  AND EXISTS (
    SELECT 1
    FROM public.class_materials_usage piece
    JOIN public.students student
      ON student.id = public.student_portal_student_id(piece.workspace_id, auth.uid())
    WHERE piece.photo_path = name
      AND (
        piece.student_id = student.id
        OR (
          piece.student_id IS NULL
          AND lower(trim(piece.student_name)) = lower(trim(student.name))
          AND NOT EXISTS (
            SELECT 1 FROM public.students duplicate
            WHERE duplicate.workspace_id = student.workspace_id
              AND duplicate.id <> student.id
              AND lower(trim(duplicate.name)) = lower(trim(student.name))
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "student_upload_own_piece_photos" ON storage.objects;
CREATE POLICY "student_upload_own_piece_photos" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'class-piece-photos'
  AND ((storage.foldername(name))[1])::uuid IN (
    SELECT workspace_id FROM public.student_portal_access
    WHERE user_id = auth.uid() AND status = 'ativo' AND revoked_at IS NULL
  )
  AND ((storage.foldername(name))[2])::uuid = public.student_portal_student_id(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS public.student_project_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.student_projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_project_images ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_project_images TO authenticated;
GRANT ALL ON public.student_project_images TO service_role;

CREATE POLICY "student_project_images_admin" ON public.student_project_images
FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "student_project_images_own" ON public.student_project_images
FOR ALL TO authenticated
USING (
  student_id = public.student_portal_student_id(workspace_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.student_projects project
    WHERE project.id = public.student_project_images.project_id
      AND project.student_id = public.student_project_images.student_id
      AND project.workspace_id = public.student_project_images.workspace_id
  )
)
WITH CHECK (
  student_id = public.student_portal_student_id(workspace_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.student_projects project
    WHERE project.id = public.student_project_images.project_id
      AND project.student_id = public.student_project_images.student_id
      AND project.workspace_id = public.student_project_images.workspace_id
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-project-sketches',
  'student-project-sketches',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "workspace_members_manage_project_sketches" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'student-project-sketches'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'student-project-sketches'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "students_read_own_project_sketches" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'student-project-sketches'
  AND ((storage.foldername(name))[2])::uuid = public.student_portal_student_id(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE POLICY "students_upload_own_project_sketches" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'student-project-sketches'
  AND ((storage.foldername(name))[2])::uuid = public.student_portal_student_id(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
