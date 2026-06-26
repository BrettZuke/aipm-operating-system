"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const PLATFORMS = ["meta", "google", "tiktok", "youtube", "linkedin", "twitter", "other"] as const;
type Platform = typeof PLATFORMS[number];

export async function createAdCampaign(_prev: unknown, formData: FormData): Promise<Result> {
  const name = String(formData.get("name") ?? "").trim();
  const platform = String(formData.get("platform") ?? "") as Platform;
  const clientId = String(formData.get("client_id") ?? "") || null;
  const budgetDollars = Number(formData.get("budget") ?? 0);

  if (!name) return { ok: false, error: "Campaign name required" };
  if (!PLATFORMS.includes(platform)) return { ok: false, error: "Invalid platform" };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const { data, error } = await supabase
    .from("ad_campaigns")
    .insert({
      agency_id: agencyId,
      name,
      platform,
      client_id: clientId,
      budget_cents: Math.round(budgetDollars * 100),
      status: "draft",
    })
    .select("id").single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/ads");
  return { ok: true, id: data.id };
}
