"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";

const STAGES = ["discovery", "proposal", "negotiation", "closed_won", "closed_lost", "new"] as const;
type Stage = typeof STAGES[number];

type Result = { ok: true } | { ok: false; error: string };

export async function updateDealStage(dealId: string, newStage: Stage): Promise<Result> {
  if (!STAGES.includes(newStage)) return { ok: false, error: "Invalid stage" };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  // closed_won/closed_lost should also stamp closed_at; reopened deals clear it
  const update: { stage: string; closed_at?: string | null; updated_at: string } = {
    stage: newStage,
    updated_at: new Date().toISOString(),
  };
  if (newStage === "closed_won" || newStage === "closed_lost") {
    update.closed_at = new Date().toISOString();
  } else {
    update.closed_at = null;
  }

  const { error } = await supabase
    .from("deals")
    .update(update)
    .eq("agency_id", agencyId)
    .eq("id", dealId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/sales/pipeline");
  revalidatePath("/sales");
  return { ok: true };
}
