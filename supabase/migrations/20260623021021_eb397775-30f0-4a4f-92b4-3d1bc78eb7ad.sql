
-- Add plan column to workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'personal';

-- customization_requests
CREATE TABLE public.customization_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  request_text TEXT NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'simple', -- simple | medium | advanced | unknown
  status TEXT NOT NULL DEFAULT 'pending', -- pending | analyzed | applied | in_review | rejected | discarded
  estimated_credits INT NOT NULL DEFAULT 1,
  approved_credits INT,
  ai_interpretation JSONB,
  applied_customization_id UUID,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customization_requests TO authenticated;
GRANT ALL ON public.customization_requests TO service_role;

ALTER TABLE public.customization_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage requests in their workspaces"
  ON public.customization_requests FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER update_customization_requests_updated_at
  BEFORE UPDATE ON public.customization_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- customizations
CREATE TABLE public.customizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- label_rename | card_visibility | category_rule | saved_filter | new_category | dashboard_card
  name TEXT NOT NULL,
  description TEXT,
  configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  request_id UUID REFERENCES public.customization_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customizations TO authenticated;
GRANT ALL ON public.customizations TO service_role;

ALTER TABLE public.customizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage customizations in their workspaces"
  ON public.customizations FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER update_customizations_updated_at
  BEFORE UPDATE ON public.customizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_customizations_ws_active ON public.customizations(workspace_id, is_active);

-- customization_credits
CREATE TABLE public.customization_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period_month INT NOT NULL,
  period_year INT NOT NULL,
  credits_included INT NOT NULL DEFAULT 3,
  credits_used INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, period_month, period_year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customization_credits TO authenticated;
GRANT ALL ON public.customization_credits TO service_role;

ALTER TABLE public.customization_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view credits in their workspaces"
  ON public.customization_credits FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER update_customization_credits_updated_at
  BEFORE UPDATE ON public.customization_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- customization_usage
CREATE TABLE public.customization_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.customization_requests(id) ON DELETE SET NULL,
  credits_used INT NOT NULL,
  usage_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customization_usage TO authenticated;
GRANT ALL ON public.customization_usage TO service_role;

ALTER TABLE public.customization_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view usage in their workspaces"
  ON public.customization_usage FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ensure_current_credits: cria a linha do mês atual se não existir
CREATE OR REPLACE FUNCTION public.ensure_current_credits(_workspace_id UUID)
RETURNS public.customization_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.customization_credits;
  _plan TEXT;
  _credits INT;
  _month INT := EXTRACT(MONTH FROM now())::INT;
  _year INT := EXTRACT(YEAR FROM now())::INT;
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT plan INTO _plan FROM public.workspaces WHERE id = _workspace_id;
  _credits := CASE _plan
    WHEN 'personal_plus' THEN 8
    WHEN 'business' THEN 10
    WHEN 'business_pro' THEN 25
    ELSE 3
  END;

  INSERT INTO public.customization_credits (workspace_id, period_month, period_year, credits_included)
  VALUES (_workspace_id, _month, _year, _credits)
  ON CONFLICT (workspace_id, period_month, period_year) DO NOTHING;

  SELECT * INTO _row FROM public.customization_credits
   WHERE workspace_id = _workspace_id AND period_month = _month AND period_year = _year;

  RETURN _row;
END;
$$;

-- consume_credits: valida saldo, debita e registra uso
CREATE OR REPLACE FUNCTION public.consume_credits(
  _workspace_id UUID,
  _request_id UUID,
  _credits INT,
  _reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.customization_credits;
BEGIN
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  _row := public.ensure_current_credits(_workspace_id);

  IF (_row.credits_included - _row.credits_used) < _credits THEN
    RETURN FALSE;
  END IF;

  UPDATE public.customization_credits
     SET credits_used = credits_used + _credits
   WHERE id = _row.id;

  INSERT INTO public.customization_usage (workspace_id, request_id, credits_used, usage_reason)
  VALUES (_workspace_id, _request_id, _credits, _reason);

  RETURN TRUE;
END;
$$;
