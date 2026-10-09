-- User-scoped recommendations for the owner's personal profile. These rules
-- only suggest reviewing a transaction as an internal transfer; they never
-- change financial data without the user's confirmation.

INSERT INTO public.customizations (
  workspace_id,
  type,
  name,
  description,
  configuration_json,
  created_by,
  is_active,
  is_testing,
  target_scope,
  target_user_id
)
SELECT
  workspace.id,
  'transaction_movement_rule',
  'Transferências entre contas da família',
  'Sugere Transferir para movimentações com as contrapartes pessoais configuradas.',
  jsonb_build_object(
    'movement_kind', 'internal_transfer',
    'match_groups', jsonb_build_array(
      jsonb_build_object(
        'all', jsonb_build_array('daniel kuhn manzano', 'itau'),
        'label', 'Daniel Kuhn Manzano · Banco Itaú'
      ),
      jsonb_build_object(
        'all', jsonb_build_array('giovanna belchior cintra', 'nu pagamentos'),
        'label', 'Giovanna Belchior Cintra · Nu Pagamentos'
      )
    )
  ),
  workspace.owner_id,
  true,
  false,
  'user',
  workspace.owner_id
FROM public.workspaces AS workspace
WHERE lower(btrim(workspace.name)) = 'manzano'
  AND workspace.type = 'personal'
  AND NOT EXISTS (
    SELECT 1
    FROM public.customizations AS existing
    WHERE existing.workspace_id = workspace.id
      AND existing.type = 'transaction_movement_rule'
      AND existing.name = 'Transferências entre contas da família'
      AND existing.target_scope = 'user'
      AND existing.target_user_id = workspace.owner_id
  );
