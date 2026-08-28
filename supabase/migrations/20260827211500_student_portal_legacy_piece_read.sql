CREATE OR REPLACE FUNCTION public.student_portal_pieces(_student_id uuid DEFAULT NULL)
RETURNS SETOF public.class_materials_usage
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
  SELECT usage.*
  FROM public.class_materials_usage usage
  WHERE usage.workspace_id = target_student.workspace_id
    AND (
      usage.student_id = target_student.id
      OR (
        usage.student_id IS NULL
        AND lower(trim(usage.student_name)) = lower(trim(target_student.name))
        AND NOT EXISTS (
          SELECT 1 FROM public.students duplicate
          WHERE duplicate.workspace_id = target_student.workspace_id
            AND duplicate.id <> target_student.id
            AND lower(trim(duplicate.name)) = lower(trim(target_student.name))
        )
      )
    )
  ORDER BY usage.usage_date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.student_portal_pieces(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_portal_pieces(uuid) TO authenticated;

DROP POLICY IF EXISTS "student_own_piece_photos" ON storage.objects;
CREATE POLICY "student_own_piece_photos" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'class-material-photos'
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
