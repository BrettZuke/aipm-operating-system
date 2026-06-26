"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import type { Json } from "@/lib/supabase/types.generated";

type Result = { ok: true } | { ok: false; error: string };

export async function saveOrganization(_prev: unknown, formData: FormData): Promise<Result> {
  const name = String(formData.get("name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;

  if (!name) return { ok: false, error: "Workspace name required" };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  // Update name on agencies (real column)
  const { error: agErr } = await supabase
    .from("agencies")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", agencyId);
  if (agErr) return { ok: false, error: agErr.message };

  // Industry + website live in agency_settings.data (jsonb bag for flexible fields)
  const { data: existing } = await supabase.from("agency_settings").select("data").eq("agency_id", agencyId).maybeSingle();
  const data = ((existing?.data as Record<string, unknown> | null) ?? {});
  const newData = { ...data, industry, website };

  // Upsert in case the row doesn't exist yet
  const { error: setErr } = await supabase
    .from("agency_settings")
    .upsert({ agency_id: agencyId, data: newData as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "agency_id" });
  if (setErr) return { ok: false, error: setErr.message };

  revalidatePath("/settings/organization");
  revalidatePath("/dashboard");
  return { ok: true };
}
