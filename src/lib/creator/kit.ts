import type { DateRange } from "./range";

const BASE = "https://api.convertkit.com/v3";

export interface KitSnapshot {
  totalSubscribers: number;
  newSubscribers: number;
  newSubscribersPrior: number;
  newByDay: { date: string; subs: number }[];
  webinarRegistrants: number | null;
  webinarRegistrantsPrior: number | null;
  // Reliable funnel counts from Kit tags, when configured — GA4's begin_checkout /
  // generate_lead events undercount badly, so these are the source of truth for the funnel.
  checkoutStarted: number | null;
  checkoutStartedPrior: number | null;
  optIns: number | null;
  optInsPrior: number | null;
  fetchedAt: string;
}

async function page(secret: string, params: URLSearchParams) {
  const url = `${BASE}/subscribers?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Kit API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{
    subscribers: { created_at: string }[];
    total_subscribers: number;
    page: number;
    total_pages: number;
  }>;
}

async function countBetween(
  secret: string,
  from: string,
  to: string,
): Promise<{ count: number; byDay: Map<string, number> }> {
  let count = 0;
  const byDay = new Map<string, number>();
  let p = 1;
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
    p += 1;
    if (p > 20) break; // safety cap (1000 subs / window)
  }
  return { count, byDay };
}

async function fetchTotal(secret: string): Promise<number> {
  const data = await page(secret, new URLSearchParams({ api_secret: secret, page: "1" }));
  return Number(data.total_subscribers ?? 0);
}

// Kit's /tags/{id}/subscriptions endpoint IGNORES from/to (verified) — total_subscriptions is
// always lifetime, and the returned array isn't date-filtered either. So to get an in-range
// count we page through and count created_at ourselves. Rows come newest-first, so once a whole
// page is older than `from` we can stop.
async function tagCountInRange(secret: string, tagId: string, from: string, to: string): Promise<number> {
  const fromTs = Date.parse(`${from}T00:00:00Z`);
  const toTs = Date.parse(`${to}T23:59:59Z`);
  let count = 0;
  let p = 1;
  while (true) {
    const params = new URLSearchParams({ api_secret: secret, page: String(p), sort_order: "desc" });
    const res = await fetch(`${BASE}/tags/${tagId}/subscriptions?${params.toString()}`, { next: { revalidate: 300 } });
    if (!res.ok) break;
    const data = (await res.json()) as { subscriptions?: { created_at: string }[]; total_pages?: number };
    const rows = data.subscriptions ?? [];
    if (rows.length === 0) break;
    let anyAtOrAfterFrom = false;
    for (const r of rows) {
      const ts = Date.parse(r.created_at);
      if (Number.isNaN(ts)) continue;
      if (ts >= fromTs) anyAtOrAfterFrom = true;
      if (ts >= fromTs && ts <= toTs) count += 1;
    }
    if (!anyAtOrAfterFrom) break; // whole page older than `from` → older pages can't qualify
    if (p >= (data.total_pages ?? 1)) break;
    p += 1;
    if (p > 20) break; // safety cap (~20k tagged subs)
  }
  return count;
}

// Sum several tags' subscription counts in a window (each tag = one Kit call). Returns null
// when no tag IDs are configured so the dashboard can fall back to its GA4 estimate.
async function sumTagCounts(secret: string, tagIds: string[], from: string, to: string): Promise<number | null> {
  if (!tagIds.length) return null;
  const counts = await Promise.all(tagIds.map((id) => tagCountInRange(secret, id, from, to)));
  return counts.reduce((a, b) => a + b, 0);
}

export async function fetchKitSnapshot(args: {
  secret: string;
  range: DateRange;
  webinarTagId: string | null;
  checkoutTagIds?: string[];
  optInTagIds?: string[];
}): Promise<KitSnapshot> {
  const { secret, range, webinarTagId, checkoutTagIds = [], optInTagIds = [] } = args;
  const [total, cur, prior, webCur, webPrior, coCur, coPrior, optCur, optPrior] = await Promise.all([
    fetchTotal(secret),
    countBetween(secret, range.from, range.to),
    countBetween(secret, range.prevFrom, range.prevTo),
    webinarTagId ? tagCountInRange(secret, webinarTagId, range.from, range.to) : Promise.resolve(null),
    webinarTagId ? tagCountInRange(secret, webinarTagId, range.prevFrom, range.prevTo) : Promise.resolve(null),
    sumTagCounts(secret, checkoutTagIds, range.from, range.to),
    sumTagCounts(secret, checkoutTagIds, range.prevFrom, range.prevTo),
    sumTagCounts(secret, optInTagIds, range.from, range.to),
    sumTagCounts(secret, optInTagIds, range.prevFrom, range.prevTo),
  ]);
  const newByDay = [...cur.byDay.entries()]
    .map(([date, subs]) => ({ date, subs }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    totalSubscribers: total,
    newSubscribers: cur.count,
    newSubscribersPrior: prior.count,
    newByDay,
    webinarRegistrants: webCur,
    webinarRegistrantsPrior: webPrior,
    checkoutStarted: coCur,
    checkoutStartedPrior: coPrior,
    optIns: optCur,
    optInsPrior: optPrior,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Email performance (Kit broadcasts) ─────────────────────────────────────
export interface KitBroadcastStat {
  id: number;
  subject: string;
  date: string; // YYYY-MM-DD (sent)
  recipients: number;
  openRate: number; // 0..1
  clickRate: number; // 0..1
  emailsOpened: number;
  totalClicks: number;
  unsubscribes: number;
}

export interface KitEmailSnapshot {
  broadcastsSent: number;
  broadcastsTracked: number; // how many had tracked engagement (the open/click avg is over these)
  totalRecipients: number;
  avgOpenRate: number; // pooled over tracked broadcasts, 0..1
  avgClickRate: number; // pooled over tracked broadcasts, 0..1
  totalUnsubscribes: number;
  broadcasts: KitBroadcastStat[];
  fetchedAt: string;
}

// Kit returns open_rate / click_rate as float PERCENTAGES (e.g. 44.54 = 44.54%, 0.11 = 0.11%).
// Always divide by 100 — a naive "<=1 means fraction" guess misreads a real 0.11% click rate as 11%.
function normRate(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(1, n / 100));
}

export async function fetchKitEmailSnapshot(secret: string, range: DateRange): Promise<KitEmailSnapshot> {
  const fromTs = Date.parse(`${range.from}T00:00:00Z`);
  const toTs = Date.parse(`${range.to}T23:59:59Z`);

  // 1) List broadcasts, keep the ones sent inside the window (rows are newest-first).
  const candidates: { id: number; subject: string; date: string }[] = [];
  let p = 1;
  while (p <= 10) {
    const res = await fetch(`${BASE}/broadcasts?api_secret=${secret}&page=${p}`, { next: { revalidate: 300 } });
    if (!res.ok) break;
    const data = (await res.json()) as {
      broadcasts?: { id: number; subject?: string; created_at?: string; published_at?: string }[];
      total_pages?: number;
    };
    const rows = data.broadcasts ?? [];
    if (rows.length === 0) break;
    let anyAtOrAfterFrom = false;
    for (const b of rows) {
      const when = Date.parse(b.published_at ?? b.created_at ?? "");
      if (Number.isNaN(when)) continue;
      if (when >= fromTs) anyAtOrAfterFrom = true;
      if (when >= fromTs && when <= toTs) {
        candidates.push({ id: b.id, subject: b.subject ?? "(no subject)", date: new Date(when).toISOString().slice(0, 10) });
      }
    }
    if (!anyAtOrAfterFrom) break;
    if (p >= (data.total_pages ?? 1)) break;
    p += 1;
  }

  // 2) Per-broadcast stats (capped so a long history doesn't fan out unbounded).
  const top = candidates.slice(0, 15);
  const stats = await Promise.all(
    top.map(async (b): Promise<KitBroadcastStat | null> => {
      try {
        const res = await fetch(`${BASE}/broadcasts/${b.id}/stats?api_secret=${secret}`, { next: { revalidate: 300 } });
        if (!res.ok) return null;
        const j = (await res.json()) as { broadcast?: { stats?: Record<string, unknown> } };
        const s = j.broadcast?.stats ?? {};
        return {
          id: b.id,
          subject: b.subject,
          date: b.date,
          recipients: Number(s.recipients ?? 0),
          openRate: normRate(s.open_rate),
          clickRate: normRate(s.click_rate),
          emailsOpened: Number(s.emails_opened ?? 0),
          totalClicks: Number(s.total_clicks ?? 0),
          unsubscribes: Number(s.unsubscribes ?? 0),
        };
      } catch {
        return null;
      }
    }),
  );
  const broadcasts = stats
    .filter((s): s is KitBroadcastStat => s !== null && s.recipients > 1) // drop 1-recipient test sends
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalRecipients = broadcasts.reduce((a, b) => a + b.recipients, 0);
  // Pool open/click from raw counts over broadcasts that actually have tracked engagement, so a
  // just-sent broadcast (0 opens yet) or one with broken tracking doesn't drag the average to ~0.
  const tracked = broadcasts.filter((b) => b.emailsOpened > 0 || b.totalClicks > 0);
  const trackedRecipients = tracked.reduce((a, b) => a + b.recipients, 0);
  return {
    broadcastsSent: broadcasts.length,
    broadcastsTracked: tracked.length,
    totalRecipients,
    avgOpenRate: trackedRecipients > 0 ? tracked.reduce((a, b) => a + b.emailsOpened, 0) / trackedRecipients : 0,
    avgClickRate: trackedRecipients > 0 ? tracked.reduce((a, b) => a + b.totalClicks, 0) / trackedRecipients : 0,
    totalUnsubscribes: broadcasts.reduce((a, b) => a + b.unsubscribes, 0),
    broadcasts,
    fetchedAt: new Date().toISOString(),
  };
}

// Everyone who clicked a "DM the creator" link, as email -> latest click time (epoch seconds). The tag
// is added by a Kit link trigger, so the subscription's created_at IS the click time — which lets
// the dashboard attribute a sale only when the buyer purchases within a window AFTER the click.
// Lifetime cohort (the tag persists), capped so a huge list can't run away.
export async function fetchTagClickers(secret: string, tagId: string): Promise<Map<string, number>> {
  const clicks = new Map<string, number>();
  let p = 1;
  while (p <= 20) {
    const params = new URLSearchParams({ api_secret: secret, page: String(p), sort_order: "desc" });
    const res = await fetch(`${BASE}/tags/${tagId}/subscriptions?${params.toString()}`, { next: { revalidate: 300 } });
    if (!res.ok) break;
    const data = (await res.json()) as {
      subscriptions?: { created_at?: string; subscriber?: { email_address?: string } }[];
      total_pages?: number;
    };
    const rows = data.subscriptions ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      const e = (r.subscriber?.email_address ?? "").trim().toLowerCase();
      if (!e) continue;
      const ts = Math.floor(Date.parse(r.created_at ?? "") / 1000);
      if (!Number.isFinite(ts)) continue;
      const prev = clicks.get(e);
      if (prev === undefined || ts > prev) clicks.set(e, ts); // keep the most recent click
    }
    if (p >= (data.total_pages ?? 1)) break;
    p += 1;
  }
  return clicks;
}
