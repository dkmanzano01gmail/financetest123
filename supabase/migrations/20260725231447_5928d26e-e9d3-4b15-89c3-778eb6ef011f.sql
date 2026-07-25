-- Prevent duplicate imports at the DB level; only applies to rows that carry a hash.
-- Uses a partial unique index so manual transactions (import_hash NULL) are unaffected.
DO $$
BEGIN
  -- Best-effort clean-up: remove exact duplicates that share the same import_hash within a workspace,
  -- keeping the earliest row. This lets the unique index build successfully on existing data.
  DELETE FROM public.transactions t
  USING public.transactions k
  WHERE t.workspace_id = k.workspace_id
    AND t.import_hash IS NOT NULL
    AND t.import_hash = k.import_hash
    AND t.id <> k.id
    AND t.created_at > k.created_at;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_ws_import_hash_unique
  ON public.transactions (workspace_id, import_hash)
  WHERE import_hash IS NOT NULL;