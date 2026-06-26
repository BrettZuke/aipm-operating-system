"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";

const TransactionSchema = z.object({
  client_id: z.string().uuid().optional().or(z.literal("")),
  amount: z.coerce.number(),
  currency: z.string().default("USD"),
  kind: z.enum(["payment", "refund", "chargeback", "adjustment"]).default("payment"),
  description: z.string().max(500).optional().or(z.literal("")),
  occurred_at: z.string().optional(),
});

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createTransaction(
  _prevState: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, agencyId, user } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = TransactionSchema.safeParse({
    client_id: formData.get("client_id") || undefined,
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    kind: formData.get("kind") || "payment",
    description: formData.get("description") || undefined,
    occurred_at: formData.get("occurred_at") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      agency_id: agencyId,
      client_id: parsed.data.client_id || null,
      member_id: user.id,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      kind: parsed.data.kind,
      description: parsed.data.description || null,
      occurred_at: parsed.data.occurred_at
        ? new Date(parsed.data.occurred_at).toISOString()
        : new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, id: data.id };
}

export async function updateTransaction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };

  const parsed = TransactionSchema.safeParse({
    client_id: formData.get("client_id") || undefined,
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    kind: formData.get("kind") || "payment",
    description: formData.get("description") || undefined,
    occurred_at: formData.get("occurred_at") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const { error } = await supabase
    .from("transactions")
    .update({
      client_id: parsed.data.client_id || null,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      kind: parsed.data.kind,
      description: parsed.data.description || null,
      occurred_at: parsed.data.occurred_at
        ? new Date(parsed.data.occurred_at).toISOString()
        : new Date().toISOString(),
    })
    .eq("id", id)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/transactions");
  return { ok: true, id };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace" };
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/transactions");
  return { ok: true, id };
}
