-- Private, temporary-shareable material statements. Objects are stored under
-- {workspace_id}/{student_id}/... and exposed only through expiring signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'class-material-statements',
  'class-material-statements',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Workspace members read class material statements" ON storage.objects;
CREATE POLICY "Workspace members read class material statements"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'class-material-statements'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "Workspace members upload class material statements" ON storage.objects;
CREATE POLICY "Workspace members upload class material statements"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'class-material-statements'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "Workspace members delete class material statements" ON storage.objects;
CREATE POLICY "Workspace members delete class material statements"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'class-material-statements'
  AND public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);
