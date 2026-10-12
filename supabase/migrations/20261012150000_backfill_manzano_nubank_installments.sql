-- Backfill the installment counter embedded in the descriptions of the exact
-- Nubank invoice imported for workspace Manzano on 2026-01-15.
--
-- The guard intentionally fails closed: no rows are changed unless the cohort
-- still has the user-confirmed 165 expense rows totalling R$ 14,504.86. Only a
-- blank `installment` is filled; no other transaction field is modified.
do $$
declare
  cohort_count integer;
  cohort_total numeric(14, 2);
  changed_count integer := 0;
begin
  select count(*), round(sum(t.amount), 2)
    into cohort_count, cohort_total
  from public.transactions t
  join public.workspaces w on w.id = t.workspace_id
  join public.credit_cards c on c.id = t.credit_card_id
  where lower(btrim(w.name)) = 'manzano'
    and lower(coalesce(c.institution, c.name, '')) like '%nubank%'
    and t.date = date '2026-01-15'
    and t.type = 'expense';

  if cohort_count = 165 and cohort_total = 14504.86 then
    with extracted as (
      select
        t.id,
        regexp_match(
          t.description,
          '(?:parcela|parcelamento|presta[cç][aã]o)[[:space:]]*[:#-]?[[:space:]]*([0-9]{1,3})[[:space:]]*(?:/|de)[[:space:]]*([0-9]{1,3})',
          'i'
        ) as counter
      from public.transactions t
      join public.workspaces w on w.id = t.workspace_id
      join public.credit_cards c on c.id = t.credit_card_id
      where lower(btrim(w.name)) = 'manzano'
        and lower(coalesce(c.institution, c.name, '')) like '%nubank%'
        and t.date = date '2026-01-15'
        and t.type = 'expense'
        and nullif(btrim(t.installment), '') is null
    ), valid as (
      select
        id,
        counter[1]::integer as current_installment,
        counter[2]::integer as total_installments
      from extracted
      where counter is not null
    )
    update public.transactions t
    set
      installment = valid.current_installment::text || '/' || valid.total_installments::text,
      updated_at = now()
    from valid
    where t.id = valid.id
      and valid.current_installment >= 1
      and valid.total_installments >= 2
      and valid.current_installment <= valid.total_installments
      and valid.total_installments <= 120;

    get diagnostics changed_count = row_count;
    raise notice 'Nubank installment backfill updated % transaction(s).', changed_count;
  else
    raise notice 'Nubank installment backfill skipped: expected 165 rows / 14504.86, found % rows / %.', cohort_count, cohort_total;
  end if;
end
$$;
