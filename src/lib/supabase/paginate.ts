/**
 * Paginates a Supabase query past the default 1000-row cap.
 *
 * Usage:
 *   const rows = await fetchAllPages(
 *     (from, to) => supabase.from("clients").select("id,name,status").eq("agency_id", agencyId).range(from, to)
 *   );
 *
 * The factory closure runs once per page; pass `range` to it explicitly so the
 * caller doesn't have to. Stops when a page returns < PAGE_SIZE rows.
 */

const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllPages<T>(
  factory: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await factory(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Paginated fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}
