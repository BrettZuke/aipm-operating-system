// Sale attribution for the coach. FanBasis (unlike the creator's Stripe) returns no UTM, so we join each
// FanBasis buyer to the UTM captured at opt-in (lead_attribution table, keyed by email) and
// roll revenue up by source / campaign / content. Buyers with no captured UTM (bought cold, or
// before tracking went live) fall into "(untagged)".

import { fanbasisEnrichedCustomers } from "./fanbasis";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DateRange } from "@/lib/creator/range";

export interface SourceRow { key: string; revenue: number; count: number }
export interface AttributionResult {
  bySource: SourceRow[];
  byCampaign: SourceRow[];
  byContent: SourceRow[];
  taggedRevenue: number;
  untaggedRevenue: number;
  taggedBuyers: number;
  totalBuyers: number;
}

interface AttrRow { email: string | null; utm_source: string | null; utm_campaign: string | null; utm_content: string | null }

export async function fetchAttribution({
  agencyId,
  range,
  offer,
}: {
  agencyId: string;
  range: DateRange;
  offer?: string;
}): Promise<AttributionResult> {
  const inRange = (d: string | null) => !!d && d >= range.from && d <= range.to;

  const [customers, sb] = await Promise.all([
    fanbasisEnrichedCustomers(),
    createClient(),
  ]);
  // lead_attribution isn't in the generated DB types yet; use the untyped client for this query.
  const supabase = sb as unknown as SupabaseClient;
  const scoped = customers.filter((c) => c.email && inRange(c.day) && (!offer || c.section === offer));

  const { data } = await supabase
    .from("lead_attribution")
    .select("email, utm_source, utm_campaign, utm_content")
    .eq("agency_id", agencyId)
    .limit(10000);

  const map = new Map<string, AttrRow>();
  for (const r of (data ?? []) as AttrRow[]) {
    if (r.email) map.set(r.email.toLowerCase(), r);
  }

  const aggregate = (pick: (a: AttrRow | undefined) => string | null | undefined): SourceRow[] => {
    const m = new Map<string, { revenue: number; count: number }>();
    for (const c of scoped) {
      const a = map.get((c.email ?? "").toLowerCase());
      const key = (pick(a) || "").trim() || "(untagged)";
      const cell = m.get(key) ?? { revenue: 0, count: 0 };
      cell.revenue += c.revenue;
      cell.count += 1;
      m.set(key, cell);
    }
    return Array.from(m.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  };

  const bySource = aggregate((a) => a?.utm_source);
  const byCampaign = aggregate((a) => a?.utm_campaign);
  const byContent = aggregate((a) => a?.utm_content);

  const taggedCustomers = scoped.filter((c) => {
    const a = map.get((c.email ?? "").toLowerCase());
    return !!(a && a.utm_source);
  });
  const taggedRevenue = taggedCustomers.reduce((s, c) => s + c.revenue, 0);
  const totalRevenue = scoped.reduce((s, c) => s + c.revenue, 0);

  return {
    bySource,
    byCampaign,
    byContent,
    taggedRevenue,
    untaggedRevenue: Math.max(0, totalRevenue - taggedRevenue),
    taggedBuyers: taggedCustomers.length,
    totalBuyers: scoped.length,
  };
}
