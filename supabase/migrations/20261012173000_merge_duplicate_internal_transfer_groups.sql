-- Consolidate two independently converted transfer groups when each group
-- contains one imported bank row and one generated/manual counterpart. The two
-- imported rows become the active pair; generated rows are retained as ignored
-- audit history rather than being physically deleted.

CREATE OR REPLACE FUNCTION public.merge_internal_transfer_groups(
  p_workspace_id uuid,
  p_primary_group_id uuid,
  p_matching_group_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  primary_imported public.transactions%ROWTYPE;
  primary_generated public.transactions%ROWTYPE;
  matching_imported public.transactions%ROWTYPE;
  matching_generated public.transactions%ROWTYPE;
  primary_count integer;
  primary_imported_count integer;
  primary_generated_count integer;
  matching_count integer;
  matching_imported_count integer;
  matching_generated_count integer;
BEGIN
  IF coalesce(public.workspace_role_of(p_workspace_id, auth.uid())::text, '')
     NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Sem permissão para consolidar esta transferência.';
  END IF;
  IF p_primary_group_id IS NULL OR p_matching_group_id IS NULL
     OR p_primary_group_id = p_matching_group_id THEN
    RAISE EXCEPTION 'Selecione dois grupos de transferência diferentes.';
  END IF;

  PERFORM 1
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id IN (p_primary_group_id, p_matching_group_id)
    AND status <> 'ignored'
  FOR UPDATE;

  SELECT
    count(*),
    count(*) FILTER (WHERE source <> 'manual'),
    count(*) FILTER (WHERE source = 'manual' AND method = 'account_movement')
  INTO primary_count, primary_imported_count, primary_generated_count
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_primary_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored';

  SELECT
    count(*),
    count(*) FILTER (WHERE source <> 'manual'),
    count(*) FILTER (WHERE source = 'manual' AND method = 'account_movement')
  INTO matching_count, matching_imported_count, matching_generated_count
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_matching_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored';

  IF primary_count <> 2 OR primary_imported_count <> 1 OR primary_generated_count <> 1
     OR matching_count <> 2 OR matching_imported_count <> 1 OR matching_generated_count <> 1 THEN
    RAISE EXCEPTION 'Cada grupo deve ter uma transação bancária e uma contrapartida gerencial.';
  END IF;

  SELECT * INTO primary_imported
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_primary_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored'
    AND source <> 'manual';

  SELECT * INTO primary_generated
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_primary_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored'
    AND source = 'manual'
    AND method = 'account_movement';

  SELECT * INTO matching_imported
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_matching_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored'
    AND source <> 'manual';

  SELECT * INTO matching_generated
  FROM public.transactions
  WHERE workspace_id = p_workspace_id
    AND transfer_group_id = p_matching_group_id
    AND financial_role = 'internal_transfer'
    AND status <> 'ignored'
    AND source = 'manual'
    AND method = 'account_movement';

  IF primary_imported.type = matching_imported.type
     OR primary_imported.account_id IS NULL
     OR matching_imported.account_id IS NULL
     OR primary_imported.account_id = matching_imported.account_id
     OR primary_imported.linked_account_id IS DISTINCT FROM matching_imported.account_id
     OR matching_imported.linked_account_id IS DISTINCT FROM primary_imported.account_id
     OR abs(abs(primary_imported.amount) - abs(matching_imported.amount)) >= 0.005
     OR abs(primary_imported.date - matching_imported.date) > 7 THEN
    RAISE EXCEPTION 'Os lançamentos bancários não formam uma contrapartida inequívoca.';
  END IF;

  UPDATE public.transactions
  SET transfer_group_id = p_primary_group_id,
      linked_account_id = matching_imported.account_id,
      category_id = NULL,
      financial_role = 'internal_transfer',
      method = 'account_movement_import_match',
      reconciliation_method = 'internal_transfer_pair_merged',
      reconciled_at = now(),
      reconciled_by = auth.uid(),
      updated_at = now()
  WHERE id = primary_imported.id
    AND workspace_id = p_workspace_id;

  UPDATE public.transactions
  SET transfer_group_id = p_primary_group_id,
      linked_account_id = primary_imported.account_id,
      category_id = NULL,
      financial_role = 'internal_transfer',
      method = 'account_movement_import_match',
      reconciliation_method = 'internal_transfer_pair_merged',
      reconciled_at = now(),
      reconciled_by = auth.uid(),
      updated_at = now()
  WHERE id = matching_imported.id
    AND workspace_id = p_workspace_id;

  UPDATE public.transactions
  SET status = 'ignored',
      reconciliation_method = 'internal_transfer_pair_merged',
      reconciled_at = now(),
      reconciled_by = auth.uid(),
      notes = concat_ws(
        E'\n',
        NULLIF(notes, ''),
        'Contrapartida gerencial arquivada: os dois lançamentos bancários foram conciliados.'
      ),
      updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND id IN (primary_generated.id, matching_generated.id);

  RETURN p_primary_group_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_internal_transfer_groups(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_internal_transfer_groups(uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
