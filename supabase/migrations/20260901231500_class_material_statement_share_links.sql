CREATE TABLE IF NOT EXISTS public.class_material_statement_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id uuid NULL REFERENCES public.students(id) ON DELETE SET NULL,
  bucket_id text NOT NULL DEFAULT 'class-material-statements',
  object_path text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL DEFAULT auth.uid()
);

ALTER TABLE public.class_material_statement_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS class_material_statement_links_expiry_idx
  ON public.class_material_statement_links (expires_at);

DROP POLICY IF EXISTS "Workspace members create material statement links"
  ON public.class_material_statement_links;
CREATE POLICY "Workspace members create material statement links"
  ON public.class_material_statement_links
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Workspace members view material statement links"
  ON public.class_material_statement_links;
CREATE POLICY "Workspace members view material statement links"
  ON public.class_material_statement_links
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

COMMENT ON TABLE public.class_material_statement_links IS
  'Hashed access tokens used to redirect WhatsApp recipients to private material PDFs.';
