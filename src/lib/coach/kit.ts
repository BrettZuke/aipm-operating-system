// the coach's Kit (ConvertKit) opt-in reader. Coach equivalent of the creator's lib/creator/kit.ts, but
// kept separate so the creator's reader stays untouched. Pulls account-level opt-ins (total Kit
// subscribers + new in range) so the "Opt-ins" tile works without per-tag config.
//
// Auth: KIT_API_KEY is used as the v3 api_secret (the /subscribers endpoint requires the
// secret, not the public key). If the key is missing or unauthorized, fetchDanKit throws and
// the caller degrades the tile to Pending with the real reason — we never invent numbers.

import type { DateRange } from "@/lib/creator/range";

const BASE = "https://api.convertkit.com/v3";

export interface DanKitSnapshot {
  totalSubscribers: number;
  newSubscribers: number;
  newSubscribersPrior: number;
  newByDay: { date: string; subs: number }[];
  /** True when the in-range count hit the paging cap (large list) so newSubscribers is a floor. */
  newApprox: boolean;
  fetchedAt: string;
}

// Cap paging so a wide window on a large list (the coach ≈ 22k subs) never hammers the API. Total
// subscriber count is one cheap call and is always exact; only the in-range delta is bounded.
const MAX_PAGES = 20; // 20 × 50 ≈ 1000 new subscribers per window

// Only the coach's workspace reads the coach's Kit. Gate on the same agency id the FanBasis reader targets
// (the coach is the FanBasis/coach tenant) plus the key being present.
export function danKitEnabledFor(agencyId: string | null | undefined): boolean {
  return !!process.env.KIT_API_KEY && !!agencyId && agencyId === process.env.FANBASIS_TARGET_AGENCY_ID;
}

async function page(secret: string, params: URLSearchParams) {
  const res = await fetch(`${BASE}/subscribers?${params.toString()}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Kit API ${res.status} (check KIT_API_KEY is a valid v3 secret)`);
  return res.json() as Promise<{
    subscribers: { created_at: string }[];
    total_subscribers: number;
    page: number;
    total_pages: number;
  }>;
}

async function countBetween(secret: string, from: string, to: string): Promise<{ count: number; byDay: Map<string, number>; capped: boolean }> {
  let count = 0;
  const byDay = new Map<string, number>();
  let p = 1;
  let capped = false;
  while (true) {
    const params = new URLSearchParams({
      api_secret: secret,
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`,
      page: String(p),
      sort_order: "desc",
    });
    const data = await page(secret, params);
    for (const s of data.subscribers) {
      count += 1;
      const d = s.created_at.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    if (p >= data.total_pages || data.subscribers.length === 0) break;
    if (p >= MAX_PAGES) { capped = true; break; }
    p += 1;
  }
  return { count, byDay, capped };
}

export async function fetchDanKit({ range }: { range: DateRange }): Promise<DanKitSnapshot> {
  const secret = process.env.KIT_API_KEY;
  if (!secret) throw new Error("KIT_API_KEY not set");
  const [totalResp, cur, prior] = await Promise.all([
    page(secret, new URLSearchParams({ api_secret: secret, page: "1" })),
    countBetween(secret, range.from, range.to),
    countBetween(secret, range.prevFrom, range.prevTo),
  ]);
  const newByDay = [...cur.byDay.entries()]
    .map(([date, subs]) => ({ date, subs }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    totalSubscribers: Number(totalResp.total_subscribers ?? 0),
    newSubscribers: cur.count,
    newSubscribersPrior: prior.count,
    newByDay,
    newApprox: cur.capped,
    fetchedAt: new Date().toISOString(),
  };
}
