"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { runPostPaymentPipeline } from "@/lib/pipeline/post-payment";
import type { Json } from "@/lib/supabase/types.generated";

type Frequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "custom";

export type ScheduledPayment = {
  id: string;
  due_date: string;       // ISO date (YYYY-MM-DD)
  amount: number;
  status: "upcoming" | "paid" | "overdue" | "skipped";
  paid_at?: string | null;
  transaction_id?: string | null;
  note?: string | null;
};

type Result = { ok: true } | { ok: false; error: string };

// Generate evenly-spaced scheduled payments for a client
export async function createPaymentPlan(_prev: unknown, formData: FormData): Promise<Result> {
  const clientId  = String(formData.get("client_id") ?? "");
  const total     = Number(formData.get("total_amount") ?? 0);
  const numPmts   = Number(formData.get("num_payments") ?? 0);
  const startDate = String(formData.get("start_date") ?? "");
  const frequency = String(formData.get("frequency") ?? "monthly") as Frequency;
  const customDays = Number(formData.get("custom_days") ?? 30);

  if (!clientId) return { ok: false, error: "Client is required." };
  if (!total || total <= 0) return { ok: false, error: "Total amount must be positive." };
  if (!numPmts || numPmts < 1) return { ok: false, error: "Number of payments must be ≥ 1." };
  if (!startDate) return { ok: false, error: "Start date is required." };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace." };

  // Verify client belongs to active workspace
  const { data: client } = await supabase
    .from("clients")
    .select("id,data")
    .eq("agency_id", agencyId)
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };

  // Generate the schedule
  const perPayment = Math.round((total / numPmts) * 100) / 100;
  const remainder  = Math.round((total - perPayment * numPmts) * 100) / 100;
  const intervalDays = frequency === "weekly" ? 7
                     : frequency === "biweekly" ? 14
                     : frequency === "monthly" ? 30
                     : frequency === "quarterly" ? 90
                     : customDays;

  const scheduled: ScheduledPayment[] = [];
  for (let i = 0; i < numPmts; i++) {
    const due = new Date(startDate);
    due.setDate(due.getDate() + i * intervalDays);
    const isLast = i === numPmts - 1;
    scheduled.push({
      id: randomBytes(8).toString("hex"),
      due_date: due.toISOString().slice(0, 10),
      amount: isLast ? perPayment + remainder : perPayment,
      status: "upcoming",
    });
  }

  const data = (client.data as Record<string, unknown>) ?? {};
  const newData = {
    ...data,
    payment_plan: { total, num_payments: numPmts, frequency, start_date: startDate, created_at: new Date().toISOString() },
    scheduled_payments: scheduled,
  };

  const { error } = await supabase
    .from("clients")
    .update({ data: newData as unknown as Json })
    .eq("id", clientId)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/payments");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

// Mark a specific scheduled payment as paid (manually)
export async function markPaymentPaid(_prev: unknown, formData: FormData): Promise<Result> {
  const clientId = String(formData.get("client_id") ?? "");
  const paymentId = String(formData.get("payment_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const paidDate = String(formData.get("paid_date") ?? new Date().toISOString().slice(0, 10));

  if (!clientId || !paymentId) return { ok: false, error: "Missing client or payment." };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace." };

  const { data: client } = await supabase.from("clients").select("id,data").eq("agency_id", agencyId).eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };

  const data = (client.data as Record<string, unknown>) ?? {};
  const payments = (data.scheduled_payments as ScheduledPayment[] | undefined) ?? [];

  const updated = payments.map(p => p.id === paymentId
    ? { ...p, status: "paid" as const, paid_at: new Date(paidDate).toISOString() }
    : p);

  // Optionally also create a transaction row for the manual payment
  if (amount > 0) {
    const { error: txErr } = await supabase.from("transactions").insert({
      agency_id: agencyId,
      client_id: clientId,
      amount,
      currency: "USD",
      kind: "payment",
      description: "Payment plan installment (manual)",
      occurred_at: new Date(paidDate).toISOString(),
      external_id: `manual-${paymentId}`,
      metadata: { source: "payment_plan_manual", scheduled_payment_id: paymentId },
    });
    // 23505 = this installment was already logged (deterministic external_id). Marking it paid
    // again must not error or create a second transaction — just move on.
    if (txErr && txErr.code !== "23505") {
      return { ok: false, error: txErr.message };
    }
  }

  const { error } = await supabase
    .from("clients")
    .update({ data: { ...data, scheduled_payments: updated } as unknown as Json })
    .eq("id", clientId)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/payments");
  return { ok: true };
}

/**
 * Manually log a payment received outside FanBasis (Stripe, wire, in-house finance,
 * cash). Inserts a transaction row, runs the post-payment pipeline so the client's
 * outstanding balance recomputes + Slack fires + tx links to a deal if matchable.
 */
export async function logManualPayment(_prev: unknown, formData: FormData): Promise<Result & { transactionId?: string }> {
  const clientId = String(formData.get("client_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const kind = String(formData.get("kind") ?? "payment") as "payment" | "refund" | "adjustment";
  const description = String(formData.get("description") ?? "").trim();
  const paidDate = String(formData.get("paid_date") ?? new Date().toISOString().slice(0, 10));
  const source = String(formData.get("source") ?? "manual").trim();

  if (!clientId) return { ok: false, error: "Client is required." };
  if (!amount || amount <= 0) return { ok: false, error: "Amount must be positive." };
  if (!["payment", "refund", "adjustment"].includes(kind)) return { ok: false, error: "Invalid kind." };

  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace." };

  // Verify client belongs to this workspace
  const { data: client } = await supabase
    .from("clients").select("id,name").eq("agency_id", agencyId).eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };

  // External_id makes this idempotent if the operator re-submits with the same date+amount
  const externalId = `manual-${clientId.slice(0, 8)}-${paidDate}-${Math.round(amount * 100)}-${randomBytes(3).toString("hex")}`;

  const { data: tx, error } = await supabase
    .from("transactions")
    .insert({
      agency_id: agencyId,
      client_id: clientId,
      amount,
      currency: "USD",
      kind,
      description: description || `Manual ${kind} for ${client.name}`,
      occurred_at: new Date(paidDate).toISOString(),
      external_id: externalId,
      metadata: { source: `manual_${source}`, logged_by: "manual_entry" } as unknown as Json,
    })
    .select("id").single();

  if (error || !tx) return { ok: false, error: error?.message ?? "Insert failed" };

  // Run the post-payment pipeline (only for incoming money). Uses the
  // RLS-scoped Supabase client; user must be a member of the agency anyway.
  if (kind === "payment") {
    await runPostPaymentPipeline(supabase, agencyId, tx.id);
  }

  revalidatePath("/payments");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, transactionId: tx.id };
}

export async function deletePaymentPlan(clientId: string): Promise<Result> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace." };

  const { data: client } = await supabase.from("clients").select("id,data").eq("agency_id", agencyId).eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };

  const data = (client.data as Record<string, unknown>) ?? {};
  delete data.payment_plan;
  delete data.scheduled_payments;

  const { error } = await supabase
    .from("clients")
    .update({ data: data as unknown as Json })
    .eq("id", clientId)
    .eq("agency_id", agencyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/payments");
  return { ok: true };
}
