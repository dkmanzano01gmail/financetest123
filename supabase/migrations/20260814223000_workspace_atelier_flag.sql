ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS is_atelier boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspaces.is_atelier IS
  'Controls whether atelier-specific navigation and modules are enabled for the workspace.';

-- Preserve atelier access for existing workspaces that already contain atelier data.
UPDATE public.workspaces AS workspace
SET is_atelier = true
WHERE workspace.is_atelier = false
  AND (
    EXISTS (
      SELECT 1 FROM public.students AS student
      WHERE student.workspace_id = workspace.id
    )
    OR EXISTS (
      SELECT 1 FROM public.raw_materials AS material
      WHERE material.workspace_id = workspace.id
    )
    OR EXISTS (
      SELECT 1 FROM public.class_materials_usage AS usage
      WHERE usage.workspace_id = workspace.id
    )
    OR EXISTS (
      SELECT 1 FROM public.kilns AS kiln
      WHERE kiln.workspace_id = workspace.id
    )
  );
