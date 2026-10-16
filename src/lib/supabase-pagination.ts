export const SUPABASE_PAGE_SIZE = 1000;
export const MAX_TRANSACTION_ROWS = 10_000;

type SupabasePage<T> = {
  data: T[] | null;
  error: unknown;
};

/**
 * Fetches a PostgREST result in deterministic pages, stopping as soon as the
 * server returns a partial page or the configured safety limit is reached.
 */
export async function fetchSupabasePages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<SupabasePage<T>>,
  maximumRows = MAX_TRANSACTION_ROWS,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; from < maximumRows; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, maximumRows - 1);
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows;
}
