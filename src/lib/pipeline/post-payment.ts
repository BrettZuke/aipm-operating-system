/**
 * Post-payment pipeline — runs after a transaction lands (FanBasis webhook,
 * manual mark-paid, or cron sync). Keeps the derived data fresh:
 *
 *   1. Link the new transaction to a matching closed_won deal (if any)
 *   2. Recompute the client's contracted_total / collected_total / outstanding_balance
 *   3. Post a Slack notification to #wins
 *
 * The helpers are pure functions of (supabase, agencyId, txId|clientId) — same
 * surface gets used by the webhook (hot path) and the maintenance cron (cold
 * path). Idempotent everywhere.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types.generated";
import { notifyDealClosed, slackPost, formatCurrency } from "@/lib/integrations/slack";

type SB = SupabaseClient<Database>;

const DAY_MS = 86400000;
const PRE_WINDOW_DAYS = 30;
const POST_WINDOW_DAYS = 365;

export type LinkResult = { linked: boolean; dealId?: string };

/** Match a single transaction to a closed_won deal for the same client. */
export async function linkTransactionToDeal(sb: SB, agencyId: string, txId: string): Promise<LinkResult> {
  const { data: tx } = await sb.from("transactions").select("id,client_id,amount,occurred_at,metadata").eq("id", txId).maybeSingle();
  if (!tx || !tx.client_id) return { linked: false };
  const meta = (tx.metadata as Record<string, unknown> | null) ?? {};
  if (meta.deal_id) return { linked: true, dealId: meta.deal_id as string };

  const { data: deals } = await sb.from("deals").select("id,closed_at,amount,data").eq("agency_id", agencyId).eq("client_id", tx.client_id).eq("stage", "closed_won");

  const txTime = new Date(tx.occurred_at).getTime();
  const inWindow = (deals ?? []).filter(d => {
    if (!d.closed_at) return false;
    const t = new Date(d.closed_at).getTime();
    return txTime >= t - PRE_WINDOW_DAYS * DAY_MS && txTime <= t + POST_WINDOW_DAYS * DAY_MS;
  });
  if (inWindow.length === 0) return { linked: false };
  inWindow.sort((a, b) => Math.abs(new Date(a.closed_at!).getTime() - txTime) - Math.abs(new Date(b.closed_at!).getTime() - txTime));
  const winner = inWindow[0];

  await sb.from("transactions").update({ metadata: { ...meta, deal_id: winner.id } as unknown as Json }).eq("id", tx.id);

  // Push tx id onto deal.data.transaction_ids
  const dealData = (winner.data as Record<string, unknown> | null) ?? {};
  const existing = Array.isArray(dealData.transaction_ids) ? (dealData.transaction_ids as string[]) : [];
  const next = Array.from(new Set([...existing, tx.id]));
  await sb.from("deals").update({ data: { ...dealData, transaction_ids: next } as unknown as Json }).eq("id", winner.id);

  return { linked: true, dealId: winner.id };
}

/** Recompute contracted_total / collected_total / outstanding_balance for a client. */
export async function recomputeClientPaymentTotals(sb: SB, agencyId: string, clientId: string) {
  const [{ data: client }, { data: deals }, { data: txs }] = await Promise.all([
    sb.from("clients").select("id,data").eq("agency_id", agencyId).eq("id", clientId).maybeSingle(),
    sb.from("deals").select("amount,stage").eq("agency_id", agencyId).eq("client_id", clientId).eq("stage", "closed_won"),
    sb.from("transactions").select("amount,kind,occurred_at,metadata").eq("agency_id", agencyId).eq("client_id", clientId),
  ]);
  if (!client) return;

  const contracted = (deals ?? []).reduce((s, d) => s + Number(d.amount ?? 0), 0);
  // Refunds/chargebacks are stored as POSITIVE amounts with a refund/chargeback kind — subtract
  // them so a refunded client's collected_total drops instead of inflating (and outstanding rises).
  const collected = (txs ?? []).reduce((s, t) => {
    const amt = Number(t.amount ?? 0);
    return s + (t.kind === "refund" || t.kind === "chargeback" ? -amt : amt);
  }, 0);
  const outstanding = Math.max(0, contracted - collected);
  const lastTx = (txs ?? []).slice().sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0];

  const baseData = (client.data as Record<string, unknown> | null) ?? {};
  const newData: Record<string, unknown> = {
    ...baseData,
    contracted_total: contracted,
    collected_total: collected,
    outstanding_balance: outstanding,
    last_payment_at: lastTx?.occurred_at ?? null,
    last_product: ((lastTx?.metadata as Record<string, unknown> | null)?.product as string | undefined) ?? null,
  };

  // Manage auto-generated scheduled_payment placeholder for the remainder
  const existingScheduled = Array.isArray(baseData.scheduled_payments) ? (baseData.scheduled_payments as Array<{ id?: string }>) : [];
  const manualScheduled = existingScheduled.filter(p => !p.id?.startsWith?.("auto-"));

  if (outstanding > 0 && lastTx) {
    const dueDate = new Date(new Date(lastTx.occurred_at).getTime() + 30 * DAY_MS).toISOString().slice(0, 10);
    newData.scheduled_payments = [...manualScheduled, {
      id: `auto-${clientId.slice(0, 8)}-balance`,
      amount: outstanding,
      due_date: dueDate,
      status: "upcoming",
      notes: `Auto-generated: contracted $${contracted.toFixed(0)}, paid $${collected.toFixed(0)}.`,
    }];
  } else {
    newData.scheduled_payments = manualScheduled;
  }

  await sb.from("clients").update({ data: newData as unknown as Json }).eq("id", clientId);
}

/** Post a Slack notification when a payment lands. Two flavours:
 *  - First payment toward a closed_won deal → "🎉 deal closed"
 *  - Subsequent payment → "💰 payment received"
 */
export async function notifyPaymentReceived(sb: SB, agencyId: string, txId: string, opts?: { dealId?: string; firstPayment?: boolean }) {
  const channel = process.env.SLACK_WINS_CHANNEL;
  if (!channel) return; // skip if not configured

  const { data: tx } = await sb.from("transactions").select("id,client_id,amount,kind,description,metadata,occurred_at").eq("id", txId).maybeSingle();
  if (!tx || tx.kind !== "payment") return;

  const { data: client } = tx.client_id
    ? await sb.from("clients").select("id,name,email").eq("agency_id", agencyId).eq("id", tx.client_id).maybeSingle()
    : { data: null };

  const meta = (tx.metadata as Record<string, unknown> | null) ?? {};
  const product = (meta.product as string | undefined) ?? tx.description ?? "payment";
  const amount = Number(tx.amount);
  const clientName = client?.name ?? "Unknown client";

  // If this is the FIRST payment toward a deal AND the deal is closed_won, treat as a close.
  if (opts?.dealId && opts.firstPayment) {
    const { data: deal } = await sb.from("deals").select("amount,owner_id,name").eq("id", opts.dealId).maybeSingle();
    if (deal) {
      let closerName: string | undefined;
      if (deal.owner_id) {
        const { data: prof } = await sb.from("profiles").select("full_name").eq("id", deal.owner_id).maybeSingle();
        closerName = prof?.full_name ?? undefined;
      }
      await notifyDealClosed({
        channel,
        clientName,
        amount: Number(deal.amount ?? amount),
        closer: closerName,
        description: product,
      });
      return;
    }
  }

  // Default: payment-received notification
  await slackPost(channel, `💰 ${clientName} · ${formatCurrency(amount)} · ${product}`, [
    { type: "section", text: { type: "mrkdwn", text: `*💰 Payment received*` } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Client*\n${clientName}${client?.email ? `\n${client.email}` : ""}` },
        { type: "mrkdwn", text: `*Amount*\n${formatCurrency(amount)}` },
        { type: "mrkdwn", text: `*Product*\n${product}` },
        { type: "mrkdwn", text: `*When*\n${tx.occurred_at?.slice(0, 10) ?? "now"}` },
      ],
    },
  ]);
}

/** Full post-payment pipeline. Call once per new transaction. Each step is
 *  best-effort; if Slack is down we still update the DB. */
export async function runPostPaymentPipeline(sb: SB, agencyId: string, txId: string) {
  const result: { txId: string; clientId?: string; dealId?: string; linked: boolean; notified: boolean; errors: string[] } = {
    txId, linked: false, notified: false, errors: [],
  };

  try {
    const { data: tx } = await sb.from("transactions").select("client_id").eq("id", txId).maybeSingle();
    result.clientId = tx?.client_id ?? undefined;

    // Step 1: link tx → deal
    const linkRes = await linkTransactionToDeal(sb, agencyId, txId);
    result.linked = linkRes.linked;
    result.dealId = linkRes.dealId;

    // Step 2: recompute client totals (if tx has a client)
    if (result.clientId) {
      await recomputeClientPaymentTotals(sb, agencyId, result.clientId);
    }

    // Step 3: detect first-payment-on-deal
    let firstPayment = false;
    if (result.dealId) {
      const { count } = await sb
        .from("transactions").select("id", { count: "exact", head: true })
        .eq("agency_id", agencyId)
        .eq("metadata->>deal_id", result.dealId);
      firstPayment = (count ?? 0) <= 1; // this tx is the only one linked
    }

    // Step 4: Slack notify
    await notifyPaymentReceived(sb, agencyId, txId, { dealId: result.dealId, firstPayment });
    result.notified = true;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "Unknown error");
  }

  return result;
}
