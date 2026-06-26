"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";

const ClientSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email().optional().or(z.literal("")),
  status: z.enum(["lead", "active", "paused", "churned"]).default("lead"),
  mrr: z.coerce.number().min(0).default(0),
  total_pending: z.coerce.number().min(0).default(0),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type ClientActionResult =
  | { ok: true; clientId: string }
  | { ok: false; error: string };

export async function createClient(
  _prevState: unknown,
  formData: FormData,
): Promise<ClientActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = ClientSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    status: formData.get("status") || "lead",
    mrr: formData.get("mrr") || 0,
    total_pending: formData.get("total_pending") || 0,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const { data, error } = await supabase
    .from("clients")
    .insert({
      agency_id: agencyId,
      name: parsed.data.name,
      email: parsed.data.email || null,
      status: parsed.data.status,
      mrr: parsed.data.mrr,
      total_pending: parsed.data.total_pending,
      notes: parsed.data.notes || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { ok: true, clientId: data.id };
}

export async function updateClient(
  clientId: string,
  formData: FormData,
): Promise<ClientActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = ClientSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    status: formData.get("status") || "lead",
    mrr: formData.get("mrr") || 0,
    total_pending: formData.get("total_pending") || 0,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const { error } = await supabase
    .from("clients")
    .update({
      name: parsed.data.name,
      email: parsed.data.email || null,
      status: parsed.data.status,
      mrr: parsed.data.mrr,
      total_pending: parsed.data.total_pending,
      notes: parsed.data.notes || null,
    })
    .eq("id", clientId)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/dashboard");
  return { ok: true, clientId };
}

export async function deleteClient(
  clientId: string,
): Promise<ClientActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const { error } = await supabase.from("clients").delete().eq("id", clientId).eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { ok: true, clientId };
}
