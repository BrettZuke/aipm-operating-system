import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runPostPaymentPipeline } from "@/lib/pipeline/post-payment";
import type { Database } from "@/lib/supabase/types.generated";
import { webhookError } from "@/lib/webhook-error";

/**
 * FanBasis → Zapier → this endpoint
 *
 * Zapier config:
 *   Trigger: FanBasis "New Sale" (or "New Customer")
 *   Action: Webhooks by Zapier → POST
 *   URL:    https://yourhost/api/webhook/fanbasis
 *   Headers: X-Webhook-Token: <your secret>
 *   Body (JSON):
 *     {
 *       "email": "{{customer_email}}",
 *       "name": "{{customer_name}}",
 *       "amount": "{{amount}}",
 *       "currency": "{{currency}}",
 *       "kind": "payment",          // or "refund" / "chargeback"
 *       "external_id": "{{order_id}}",
 *       "occurred_at": "{{paid_at}}",  // optional, defaults to now
 *       "description": "{{product_name}}",
 *       "phone": "{{customer_phone}}", // optional
 *       "mrr": "{{mrr_amount}}"        // optional, if subscription
 *     }
 */

type FanbasisPayload = {
  email: string;
  name?: string;
  amount: number | string;
  currency?: string;
  kind?: "payment" | "refund" | "chargeback" | "adjustment";
  external_id?: string;
  occurred_at?: string;
  description?: string;
  phone?: string;
  mrr?: number | string;
};

export async function POST(req: NextRequest) {
  // Auth
  const token = req.headers.get("x-webhook-token") ?? new URL(req.url).searchParams.get("token");
  const expected = process.env.FANBASIS_WEBHOOK_SECRET;
  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const agencyId = process.env.FANBASIS_TARGET_AGENCY_ID;
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "FANBASIS_TARGET_AGENCY_ID not configured" }, { status: 500 });
  }

  // Parse body
  let body: FanbasisPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email || !body.amount) {
    return NextResponse.json({ ok: false, error: "Missing required fields: email, amount" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (Number.isNaN(amount)) {
    return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
  }

  // Use service role key to bypass RLS (this is server-side only)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase env not configured" }, { status: 500 });
  }
  const supabase = createClient<Database>(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const email = body.email.toLowerCase().trim();
  const name = body.name?.trim() || email;
  const kind = body.kind ?? "payment";
  // Guard against unparseable dates from Zapier (e.g. "2026-06-13 14:30" or a locale string) —
  // new Date("garbage").toISOString() throws RangeError, which would 500 and drop the payment.
  const parsedDate = body.occurred_at ? new Date(body.occurred_at) : null;
  const occurred_at = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? parsedDate.toISOString()
    : new Date().toISOString();

  // 1. Find or create the client
  let clientId: string | null = null;
  const { data: existingClient } = await supabase
    .from("clients")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("email", email)
    .maybeSingle();

  if (existingClient) {
    clientId = existingClient.id;
    // Only update MRR when a real positive value is sent. A one-time payment carrying an empty
    // mrr field used to reset a subscriber's MRR to 0 (Number("") || 0 === 0).
    const mrrVal = body.mrr !== undefined && body.mrr !== "" ? Number(body.mrr) : NaN;
    if (Number.isFinite(mrrVal) && mrrVal > 0) {
      await supabase
        .from("clients")
        .update({ mrr: mrrVal })
        .eq("id", clientId);
    }
  } else {
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({
        agency_id: agencyId,
        name,
        email,
        status: "active",
        mrr: body.mrr ? Number(body.mrr) : 0,
        notes: `Imported from FanBasis · ${body.description ?? ""}`.trim(),
        data: { phone: body.phone ?? null, source: "fanbasis" },
      })
      .select("id")
      .single();

    if (clientError) {
      return webhookError("Client insert failed", clientError);
    }
    clientId = newClient.id;
  }

  // 2. Idempotency check — skip if we've already recorded this transaction
  if (body.external_id) {
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("external_id", body.external_id)
      .maybeSingle();
    if (existingTx) {
      return NextResponse.json({ ok: true, action: "skipped_duplicate", client_id: clientId, transaction_id: existingTx.id });
    }
  }

  // 3. Create the transaction
  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .insert({
      agency_id: agencyId,
      client_id: clientId,
      amount,
      currency: body.currency ?? "USD",
      kind,
      description: body.description ?? `FanBasis ${kind}`,
      external_id: body.external_id ?? null,
      occurred_at,
      metadata: { source: "fanbasis" },
    })
    .select("id")
    .single();

  if (txError) {
    // Lost a race with a concurrent re-delivery of the same event: the DB unique index on
    // (agency_id, external_id) rejected the duplicate. Treat as an idempotent no-op (not a 500),
    // so the provider stops retrying and we never double-count a payment.
    if (txError.code === "23505" && body.external_id) {
      const { data: dupe } = await supabase
        .from("transactions").select("id")
        .eq("agency_id", agencyId).eq("external_id", body.external_id).maybeSingle();
      return NextResponse.json({ ok: true, action: "skipped_duplicate", client_id: clientId, transaction_id: dupe?.id ?? null });
    }
    return webhookError("Transaction insert failed", txError);
  }

  // 4. Run the post-payment pipeline: link tx → deal, recompute client totals,
  //    Slack notify. Best-effort — don't fail the webhook if a step errors.
  const pipeline = kind === "payment"
    ? await runPostPaymentPipeline(supabase, agencyId, tx.id)
    : null;

  return NextResponse.json({
    ok: true,
    action: existingClient ? "updated" : "created",
    client_id: clientId,
    transaction_id: tx.id,
    pipeline,
  });
}

// Health check
export async function GET() {
  const configured = !!(process.env.FANBASIS_WEBHOOK_SECRET && process.env.FANBASIS_TARGET_AGENCY_ID);
  return NextResponse.json({
    ok: true,
    endpoint: "fanbasis-webhook",
    configured,
    method: "POST",
    auth: "Header X-Webhook-Token or ?token= query param",
  });
}
