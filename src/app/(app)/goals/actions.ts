"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";

const GoalSchema = z.object({
  name: z.string().min(1, "Name required").max(120),
  target_value: z.coerce.number().min(0),
  current_value: z.coerce.number().min(0).default(0),
  unit: z.string().max(40).default("currency"),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
  owner_id: z.string().uuid().optional().or(z.literal("")),
});

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

export async function createGoal(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = GoalSchema.safeParse({
    name: formData.get("name"),
    target_value: formData.get("target_value"),
    current_value: formData.get("current_value") || 0,
    unit: formData.get("unit") || "currency",
    period_start: formData.get("period_start") || undefined,
    period_end: formData.get("period_end") || undefined,
    owner_id: formData.get("owner_id") || undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

  const { data, error } = await supabase
    .from("goals")
    .insert({
      agency_id: agencyId,
      name: parsed.data.name,
      target_value: parsed.data.target_value,
      current_value: parsed.data.current_value,
      unit: parsed.data.unit,
      period_start: parsed.data.period_start || null,
      period_end: parsed.data.period_end || null,
      owner_id: parsed.data.owner_id || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/goals");
  return { ok: true, id: data.id };
}

export async function updateGoal(id: string, formData: FormData): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = GoalSchema.safeParse({
    name: formData.get("name"),
    target_value: formData.get("target_value"),
    current_value: formData.get("current_value") || 0,
    unit: formData.get("unit") || "currency",
    period_start: formData.get("period_start") || undefined,
    period_end: formData.get("period_end") || undefined,
    owner_id: formData.get("owner_id") || undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

  const { error } = await supabase
    .from("goals")
    .update({
      name: parsed.data.name,
      target_value: parsed.data.target_value,
      current_value: parsed.data.current_value,
      unit: parsed.data.unit,
      period_start: parsed.data.period_start || null,
      period_end: parsed.data.period_end || null,
      owner_id: parsed.data.owner_id || null,
    })
    .eq("id", id)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/goals");
  return { ok: true, id };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const { error } = await supabase.from("goals").delete().eq("id", id).eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/goals");
  return { ok: true, id };
}
