// Per-workspace creator integration settings, read from agency_settings.data.
// Every value is scoped to the requested agency — there is NO cross-tenant env fallback, so one
// workspace can never read another's keys/data. A missing key simply reads as null/empty.

import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto/secrets";

export interface CreatorSettings {
  agencyId: string;
  ga4PropertyId: string | null;
  kitApiSecret: string | null;
  webinarRegistrantTagId: string | null;
  checkoutTagIds: string[];
  optInTagIds: string[];
  stripeKey: string | null;
  // True when the workspace bills through Whop (has a `whop` integration block) rather than
  // Stripe. Used to show a "connect Whop to track revenue" note instead of Stripe-pending copy.
  hasWhop: boolean;
  salesPagePath: string;
  salesPages: { label: string; path: string }[];
  // Kit tags whose members clicked a DM CTA in an email campaign — matched against Stripe buyers
  // to attribute email -> DM -> sale. Empty until link triggers are set up.
  dmCtaTags: { label: string; tagId: string }[];
  // A sale counts as email-driven if the buyer purchases within this many hours of clicking.
  attributionWindowHours: number;
  checkoutPagePath: string;
  revenueGoalUsd: number;
  siteUrl: string | null;
  // DM funnel (email -> the creator's DM -> sale) is OPT-IN per workspace. `dmTo` is the short code
  // in the /api/dm-click allow-list; `dmHandle` is the display name shown in the copy. Both null =
  // this workspace does not use the DM funnel, so the panel stays hidden (it is not universal).
  dmTo: string | null;
  dmHandle: string | null;
  // Per-workspace Vercel Speed Insights link. Null hides the Site speed panel entirely (so a
  // workspace never sees another workspace's project link).
  speedInsightsUrl: string | null;
}

export interface RawSettings {
  integrations?: {
    ga4?: { property_id?: string; sales_page_path?: string; checkout_page_path?: string; sales_pages?: { label: string; path: string }[] };
    kit?: {
      api_secret?: string;
      webinar_registrant_tag_id?: string | null;
      checkout_tag_ids?: string[];
      opt_in_tag_ids?: string[];
      dm_cta_tags?: { label: string; tag_id: string }[];
      attribution_window_hours?: number;
    };
    stripe?: { key?: string | null };
    whop?: { api_key?: string | null };
    dm?: { to?: string; handle?: string };
  };
  creator?: {
    revenue_goal_usd?: number;
    site_url?: string;
    offer_path?: string;
    speed_insights_url?: string;
  };
}

// Pure mapping raw agency_settings.data → CreatorSettings. Exported so non-request contexts
// (e.g. cron jobs reading via the service-role client) can reuse the exact same parsing.
export function creatorSettingsFromRaw(raw: RawSettings | null | undefined, agencyId = ""): CreatorSettings {
  const r = raw ?? {};
  const salesPagePath = r.integrations?.ga4?.sales_page_path ?? r.creator?.offer_path ?? "/";
  const cfgPages = (r.integrations?.ga4?.sales_pages ?? []).filter((p) => p && p.path);
  return {
    agencyId,
    ga4PropertyId: r.integrations?.ga4?.property_id ?? null,
    kitApiSecret: r.integrations?.kit?.api_secret ?? null,
    webinarRegistrantTagId: r.integrations?.kit?.webinar_registrant_tag_id ?? null,
    checkoutTagIds: r.integrations?.kit?.checkout_tag_ids ?? [],
    optInTagIds: r.integrations?.kit?.opt_in_tag_ids ?? [],
    // Stripe key is encrypted at rest (H4). decryptSecret transparently passes through legacy
    // plaintext, so this is safe before the stored value is migrated to ciphertext.
    stripeKey: decryptSecret(r.integrations?.stripe?.key ?? null),
    hasWhop: !!r.integrations?.whop,
    salesPagePath,
    salesPages: cfgPages.length > 0 ? cfgPages : [{ label: "Sales page", path: salesPagePath }],
    dmCtaTags: (r.integrations?.kit?.dm_cta_tags ?? [])
      .filter((t) => t && t.tag_id)
      .map((t) => ({ label: t.label ?? "Email campaign", tagId: String(t.tag_id) })),
    attributionWindowHours: r.integrations?.kit?.attribution_window_hours ?? 72,
    checkoutPagePath: r.integrations?.ga4?.checkout_page_path ?? "",
    revenueGoalUsd: r.creator?.revenue_goal_usd ?? 10000,
    siteUrl: r.creator?.site_url ?? null,
    dmTo: r.integrations?.dm?.to ?? null,
    dmHandle: r.integrations?.dm?.handle ?? null,
    speedInsightsUrl: r.creator?.speed_insights_url ?? null,
  };
}

export async function loadCreatorSettings(agencyId: string): Promise<CreatorSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agency_settings")
    .select("data")
    .eq("agency_id", agencyId)
    .maybeSingle();

  return creatorSettingsFromRaw((data?.data ?? {}) as RawSettings, agencyId);
}
