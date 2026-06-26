import { createClient } from "@supabase/supabase-js";

export interface DmClickCampaign {
  campaign: string;
  clickers: Map<string, number>; // email -> latest click epoch (seconds)
}

// Read this agency's logged DM-link clicks (captured by /api/dm-click), grouped by campaign,
// keeping each email's most recent click time. Service-role read: dm_link_clicks is RLS-locked
// (it holds subscriber emails), so the user-scoped client can't see it. Lookback-capped.
export async function fetchDmClickers(agencyId: string): Promise<DmClickCampaign[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !agencyId) return [];

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("dm_link_clicks")
    .select("email, campaign, clicked_at")
    .eq("agency_id", agencyId)
    .order("clicked_at", { ascending: false })
    .limit(5000);
  if (error || !data) return [];

  const byCampaign = new Map<string, Map<string, number>>();
  for (const row of data) {
    const campaign = (row.campaign as string | null)?.trim() || "dm";
    const email = ((row.email as string | null) ?? "").trim().toLowerCase();
    if (!email) continue;
    const ts = Math.floor(new Date(row.clicked_at as string).getTime() / 1000);
    if (!Number.isFinite(ts)) continue;
    let m = byCampaign.get(campaign);
    if (!m) {
      m = new Map();
      byCampaign.set(campaign, m);
    }
    const prev = m.get(email);
    if (prev === undefined || ts > prev) m.set(email, ts); // rows are newest-first; keep the latest
  }
  return [...byCampaign.entries()].map(([campaign, clickers]) => ({ campaign, clickers }));
}

// A readable label for a campaign code on the dashboard. `handle` is the workspace's DM display
// name (e.g. "dm" + handle "the creator" -> "DM the creator (email)"); null handle -> a generic label.
export function dmCampaignLabel(campaign: string, handle?: string | null): string {
  const who = handle ? `DM ${handle}` : "DM funnel";
  if (!campaign || campaign === "dm") return `${who} (email)`;
  return `${who} · ${campaign}`;
}
