DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT workspace_id, import_hash, count(*) c
    FROM public.transactions
    WHERE import_hash IS NOT NULL
    GROUP BY 1,2 HAVING count(*) > 1
  ) x;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Existing duplicate (workspace_id, import_hash) rows: %', dup_count;
  END IF;
END $$;

DROP INDEX IF EXISTS public.transactions_ws_import_hash_unique;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_ws_import_hash_unique
  ON public.transactions (workspace_id, import_hash);