"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";

const ReportSchema = z.object({
  wins: z.string().max(2000).optional().or(z.literal("")),
  blockers: z.string().max(2000).optional().or(z.literal("")),
  tomorrow: z.string().max(2000).optional().or(z.literal("")),
  metrics: z.string().max(500).optional().or(z.literal("")),
});

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function submitEodReport(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, agencyId, user } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = ReportSchema.safeParse({
    wins: formData.get("wins") || "",
    blockers: formData.get("blockers") || "",
    tomorrow: formData.get("tomorrow") || "",
    metrics: formData.get("metrics") || "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const responses = {
    wins: parsed.data.wins || "",
    blockers: parsed.data.blockers || "",
    tomorrow: parsed.data.tomorrow || "",
    metrics: parsed.data.metrics || "",
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reportDate = today.toISOString().slice(0, 10);

  // Upsert: one report per member per day
  const { data: existing } = await supabase
    .from("eod_reports")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("member_id", user.id)
    .eq("report_date", reportDate)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("eod_reports")
      .update({ responses, submitted_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/sales/eod");
    return { ok: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from("eod_reports")
    .insert({
      agency_id: agencyId,
      member_id: user.id,
      report_date: reportDate,
      responses,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sales/eod");
  return { ok: true, id: data.id };
}

export async function deleteEodReport(id: string): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const { error } = await supabase.from("eod_reports").delete().eq("id", id).eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sales/eod");
  return { ok: true, id };
}
