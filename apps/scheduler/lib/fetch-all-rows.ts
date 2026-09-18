/**
 * Pages a PostgREST read past the server's row cap.
 *
 * PostgREST answers a select with at most `db-max-rows` rows - 1000 on
 * hosted Supabase - and says nothing about having stopped: a truncated read
 * looks exactly like a small table. Anything that scans a whole set (a
 * count, a leaderboard, a conflict pre-check) is therefore quietly wrong
 * once a clinic passes that mark.
 *
 * Takes a factory rather than a query because a PostgREST builder is
 * single-use: each page needs a fresh one. Works on .rpc() the same as on
 * .from().select(). On a failed page it reports the error and no rows,
 * which is what callers already expect from a failed query - a partial list
 * silently presented as complete is the bug this exists to fix.
 *
 * Lived in pages/index.jsx until pages/admin.tsx needed it too (it was the
 * one unpaged sessions read left in this portal).
 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

type PageResult<T> = { data: T[] | null; error: unknown };
type Pageable<T> = { range: (from: number, to: number) => PromiseLike<PageResult<T>> };

export async function fetchAllRows<T>(makeQuery: () => Pageable<T>): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const res = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (res.error) return { data: null, error: res.error };
    const batch = res.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { data: rows, error: null };
  }
  // Only reachable past MAX_PAGES * PAGE_SIZE rows. Loud, because the list is
  // short again and this time we know it.
  console.error(`[scheduler] fetchAllRows: stopped at ${MAX_PAGES * PAGE_SIZE} rows; the list is truncated`);
  return { data: rows, error: null };
}
