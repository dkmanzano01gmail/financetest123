CREATE TABLE IF NOT EXISTS public.user_onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tour_key text NOT NULL DEFAULT 'main_navigation',
  tour_version integer NOT NULL DEFAULT 1,
  current_step integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_onboarding_progress_step_check CHECK (current_step >= 0),
  CONSTRAINT user_onboarding_progress_unique UNIQUE (user_id, workspace_id, tour_key)
);

ALTER TABLE public.user_onboarding_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own onboarding progress"
  ON public.user_onboarding_progress;
CREATE POLICY "Users read their own onboarding progress"
  ON public.user_onboarding_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users create their own onboarding progress"
  ON public.user_onboarding_progress;
CREATE POLICY "Users create their own onboarding progress"
  ON public.user_onboarding_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update their own onboarding progress"
  ON public.user_onboarding_progress;
CREATE POLICY "Users update their own onboarding progress"
  ON public.user_onboarding_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_onboarding_progress_updated_at
  ON public.user_onboarding_progress;
CREATE TRIGGER update_user_onboarding_progress_updated_at
  BEFORE UPDATE ON public.user_onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
