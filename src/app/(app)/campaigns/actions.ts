"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";

const CampaignSchema = z.object({
  name: z.string().min(1).max(120),
  status: z.enum(["draft", "active", "paused", "completed", "archived"]).default("draft"),
  client_id: z.string().uuid().optional().or(z.literal("")),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  budget: z.coerce.number().min(0).default(0),
});

export type AR = { ok: true; id: string } | { ok: false; error: string };

export async function createCampaign(_: unknown, fd: FormData): Promise<AR> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No workspace" };
  const parsed = CampaignSchema.safeParse({
    name: fd.get("name"), status: fd.get("status") || "draft",
    client_id: fd.get("client_id") || undefined,
    start_date: fd.get("start_date") || undefined, end_date: fd.get("end_date") || undefined,
    budget: fd.get("budget") || 0,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const { data, error } = await supabase.from("campaigns").insert({
    agency_id: agencyId, name: parsed.data.name, status: parsed.data.status,
    client_id: parsed.data.client_id || null,
    start_date: parsed.data.start_date || null, end_date: parsed.data.end_date || null,
    budget: parsed.data.budget,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/campaigns");
  return { ok: true, id: data.id };
}

export async function updateCampaign(id: string, fd: FormData): Promise<AR> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No workspace" };
  const parsed = CampaignSchema.safeParse({
    name: fd.get("name"), status: fd.get("status") || "draft",
    client_id: fd.get("client_id") || undefined,
    start_date: fd.get("start_date") || undefined, end_date: fd.get("end_date") || undefined,
    budget: fd.get("budget") || 0,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  const { error } = await supabase.from("campaigns").update({
    name: parsed.data.name, status: parsed.data.status,
    client_id: parsed.data.client_id || null,
    start_date: parsed.data.start_date || null, end_date: parsed.data.end_date || null,
    budget: parsed.data.budget,
  }).eq("id", id).eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/campaigns");
  return { ok: true, id };
}

export async function deleteCampaign(id: string): Promise<AR> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No workspace" };
  const { error } = await supabase.from("campaigns").delete().eq("id", id).eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/campaigns");
  return { ok: true, id };
}
