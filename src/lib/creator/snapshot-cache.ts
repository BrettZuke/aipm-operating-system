// Tiny module-level TTL cache for expensive per-(agency, range) analytics snapshots.
// The dashboard renders every tab server-side on each load, so heavy readers (GA4 fan-outs)
// otherwise re-run on every page view. Wrapping them here makes repeat loads instant while
// keeping data fresh to within `ttlMs`. Keyed by a caller-supplied string (property+range+scope).
//
// Mirrors the existing inline caches (fanbasis/sheets/fx/webinarjam) but shared, since several
// readers need the same behaviour. Module-level state lives per warm serverless instance.
export interface TtlCache<T> {
  get(key: string, compute: () => Promise<T>): Promise<T>;
}

export function makeTtlCache<T>(ttlMs: number, maxEntries = 64): TtlCache<T> {
  const store = new Map<string, { at: number; data: T }>();
  return {
    async get(key, compute) {
      const hit = store.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.data;
      const data = await compute();
      store.set(key, { at: Date.now(), data });
      // Bound memory: range/funnel permutations are few, but never let the map grow unbounded.
      if (store.size > maxEntries) {
        let oldestKey: string | null = null;
        let oldestAt = Infinity;
        for (const [k, v] of store) if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
        if (oldestKey) store.delete(oldestKey);
      }
      return data;
    },
  };
}
