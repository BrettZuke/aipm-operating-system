// Independent pipeline probes for the coach's "Data health" trust panel. Every other reader on the
// Analytics page answers "what are the numbers"; this answers "can I trust them": is each pipe
// actually receiving data, and how fresh is it. Deliberately independent of the other readers
// (FanBasis / GA4 / sheet) so a momentary outage in one doesn't blind the health check on the
// rest. Two tables the page doesn't otherwise count directly: lead_attribution (UTM capture) and
// calls (iClosed webhook deliveries). Cheap: header-only counts + one latest-row lookup each.

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PipelineProbes {
  leadsCaptured: number;      // rows in lead_attribution (opt-in UTM capture)
  leadsWithSource: number;    // of those, how many carry a utm_source
  lastCaptureAt: string | null;
  iclosedCalls: number;       // calls rows delivered by the iClosed webhook
  lastIclosedAt: string | null;
}

export async function fetchPipelineProbes(agencyId: string): Promise<PipelineProbes> {
  // lead_attribution / calls jsonb paths aren't in the generated types; use the untyped client.
  const sb = (await createClient()) as unknown as SupabaseClient;

  const [totalRes, srcRes, latestRes, iclosedCountRes, iclosedLatestRes] = await Promise.all([
    sb.from("lead_attribution").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    sb.from("lead_attribution").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).neq("utm_source", ""),
    sb.from("lead_attribution").select("last_touch_at").eq("agency_id", agencyId).order("last_touch_at", { ascending: false }).limit(1),
    // iClosed rows are the only calls carrying data->iclosed_event (both insert + update paths set it).
    sb.from("calls").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).not("data->>iclosed_event", "is", null),
    sb.from("calls").select("occurred_at").eq("agency_id", agencyId).not("data->>iclosed_event", "is", null).order("occurred_at", { ascending: false }).limit(1),
  ]);

  return {
    leadsCaptured: totalRes.count ?? 0,
    leadsWithSource: srcRes.count ?? 0,
    lastCaptureAt: latestRes.data?.[0]?.last_touch_at ?? null,
    iclosedCalls: iclosedCountRes.count ?? 0,
    lastIclosedAt: iclosedLatestRes.data?.[0]?.occurred_at ?? null,
  };
}
