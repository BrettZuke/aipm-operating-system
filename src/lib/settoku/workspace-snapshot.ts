// Live workspace snapshot for Settoku Chat.
//
// THE BUG THIS FIXES: the chat used to read the Supabase `transactions` table directly, but
// that table is only a partial early import — stale for the coach tenant (the coach, frozen ~May)
// and empty for creator tenants (the creator, whose money lives in Stripe). The dashboards never
// read it for revenue; they pull live from FanBasis / Stripe. So the chat reported "$0 / no
// sales" while the dashboard showed real money.
//
// THE FIX: build the chat's numbers from the SAME live readers the dashboard uses, branched
// by tenant, so chat and dashboard can never disagree:
//   - coach tenant w/ FanBasis  (the coach)   -> live FanBasis API   (USD, merchant of record)
//   - creator tenant w/ Stripe  (the creator) -> live Stripe API     (MRR, sales, subs)
//   - anything else                      -> the Supabase ledger (the honest fallback)
//
// Everything is agency-scoped: every query and every API gate keys off the ACTIVE agencyId,
// so the chat only ever sees the client whose workspace you're in.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types.generated";
import { parseRange } from "@/lib/creator/range";
import { fanbasisEnabledFor, fanbasisEnrichedCustomers } from "@/lib/coach/fanbasis";
import { fetchStripeSnapshot } from "@/lib/creator/stripe";
import { creatorSettingsFromRaw, type RawSettings } from "@/lib/creator/settings";

type Supa = SupabaseClient<Database>;

export interface RevenueSnapshot {
  /** Human-readable provenance — surfaced in the prompt so the answer can cite its source. */
  source: string;
  /** Whether numbers are live (true) or a stale/empty fallback the user should be warned about. */
  live: boolean;
  currency: string; // ISO code, upper-case (USD, PLN, …)
  today: number | null;
  todayCount: number | null;
  last7: number | null;
  last7Count: number | null;
  last30: number | null;
  last30Count: number | null;
  allTime: number | null;
  mrr: number | null;
  activeSubscribers: number | null;
  topOffers: { label: string; revenue: number; count: number }[];
  note: string | null;
}

export interface WorkspaceSnapshot {
  workspaceName: string;
  clients: number;
  activeClients: number;
  callsLogged: number;
  closedWonCount: number;
  closedWonValue: number;
  revenue: RevenueSnapshot;
  /** Pre-formatted block to drop into the chat system prompt. */
  promptBlock: string;
}

function money(n: number | null, currency: string): string {
  if (n === null || !Number.isFinite(n)) return "n/a";
  return `${currency} ${Math.round(n).toLocaleString()}`;
}

// ── FanBasis (coach tenant: the coach) ─────────────────────────────────────────────
// FanBasis' public API exposes ONLY per-customer lifetime totals dated to each customer's LAST
// payment — there is no per-charge endpoint (/transactions, /payments, /orders all 404). Summing
// a customer's whole lifetime spend into the window of their last payment inflates payment-plan
// buyers (a 3×$1,120 plan shows as $3,360 on one day). So for recent windows we attribute ONE
// representative installment (lifetime ÷ #payments) to that date: exact for the single-payment
// majority, a close estimate for plans. All-time stays the exact lifetime sum.
async function fanbasisRevenue(): Promise<RevenueSnapshot> {
  try {
    const customers = await fanbasisEnrichedCustomers();
    const allTime = customers.reduce((s, c) => s + c.revenue, 0);
    const todayStr = parseRange({ range: "today" }).from;
    const from7 = parseRange({ range: "7d" }).from;
    const from30 = parseRange({ range: "30d" }).from;

    const inWin = (since: string) => (c: { day: string | null }) => !!c.day && c.day >= since && c.day <= todayStr;
    const installment = (c: { revenue: number; transactions: number }) => c.revenue / Math.max(1, c.transactions);
    const winRev = (since: string) => customers.filter(inWin(since)).reduce((s, c) => s + installment(c), 0);
    const winCnt = (since: string) => customers.filter(inWin(since)).length;
    const planCnt = (since: string) => customers.filter((c) => c.transactions > 1 && inWin(since)(c)).length;

    // Top offers all-time — lifetime totals, no windowing, so these are exact.
    const offerMap = new Map<string, { revenue: number; count: number }>();
    for (const c of customers) {
      const cell = offerMap.get(c.section) ?? { revenue: 0, count: 0 };
      cell.revenue += c.revenue;
      cell.count += 1;
      offerMap.set(c.section, cell);
    }
    const topOffers = Array.from(offerMap.entries())
      .map(([label, v]) => ({ label, revenue: v.revenue, count: v.count }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const plans30 = planCnt(from30);
    return {
      source: "FanBasis (live)",
      live: true,
      currency: "USD",
      today: winRev(todayStr), todayCount: winCnt(todayStr),
      last7: winRev(from7), last7Count: winCnt(from7),
      last30: winRev(from30), last30Count: winCnt(from30),
      allTime,
      mrr: null, // FanBasis exposes customer aggregates, not subscription MRR
      activeSubscribers: null,
      topOffers,
      note:
        "All-time is exact. Recent-window revenue estimates ONE installment per buyer (lifetime ÷ #payments) on their latest payment date — the FanBasis API has no per-charge endpoint, so a plan buyer's exact charge for a specific day lives in the FanBasis dashboard." +
        (plans30 ? ` ${plans30} of the last-30-day buyers are on payment plans (those amounts are estimates).` : ""),
    };
  } catch (e) {
    return unreachable("FanBasis", e);
  }
}

// ── Stripe (creator tenant: the creator) ───────────────────────────────────────────
// One 30-day snapshot call yields MRR + active subs + 30d revenue, and its dailyRevenue series
// lets us derive today and last-7d without extra round-trips.
async function stripeRevenue(key: string): Promise<RevenueSnapshot> {
  try {
    const snap = await fetchStripeSnapshot({ key, range: parseRange({ range: "30d" }) });
    const todayStr = parseRange({ range: "today" }).from;
    const from7 = parseRange({ range: "7d" }).from;
    const sumRev = (pred: (d: string) => boolean) =>
      snap.dailyRevenue.filter((d) => pred(d.date)).reduce((s, d) => s + d.revenue, 0);
    const sumCnt = (pred: (d: string) => boolean) =>
      snap.dailyRevenue.filter((d) => pred(d.date)).reduce((s, d) => s + d.count, 0);
    return {
      source: "Stripe (live)",
      live: true,
      currency: (snap.currency || "usd").toUpperCase(),
      today: sumRev((d) => d === todayStr),
      todayCount: sumCnt((d) => d === todayStr),
      last7: sumRev((d) => d >= from7),
      last7Count: sumCnt((d) => d >= from7),
      last30: snap.revenueNet,
      last30Count: snap.salesCount,
      allTime: null, // a true lifetime total would need a full-history scan; 30d + MRR answers the common asks
      mrr: snap.mrr,
      activeSubscribers: snap.activeSubscribers,
      topOffers: [],
      note: snap.refunds > 0 ? `Revenue is net of ${money(snap.refunds, (snap.currency || "usd").toUpperCase())} refunds in the last 30d.` : null,
    };
  } catch (e) {
    return unreachable("Stripe", e);
  }
}

// ── Supabase ledger (honest fallback) ────────────────────────────────────────
async function ledgerRevenue(supabase: Supa, agencyId: string): Promise<RevenueSnapshot> {
  const { data: tx } = await supabase
    .from("transactions")
    .select("amount, kind, occurred_at")
    .eq("agency_id", agencyId);
  const rows = tx ?? [];
  const todayStr = parseRange({ range: "today" }).from;
  const from7 = parseRange({ range: "7d" }).from;
  const from30 = parseRange({ range: "30d" }).from;
  const net = (since?: string) => {
    const inWin = (t: { occurred_at: string | null }) => !since || (t.occurred_at ?? "") >= since;
    const pay = rows.filter((t) => t.kind === "payment" && inWin(t)).reduce((s, t) => s + Number(t.amount ?? 0), 0);
    const ref = rows.filter((t) => t.kind === "refund" && inWin(t)).reduce((s, t) => s + Number(t.amount ?? 0), 0);
    return pay - ref;
  };
  const cnt = (since: string) => rows.filter((t) => t.kind === "payment" && (t.occurred_at ?? "") >= since).length;
  const latest = rows.map((t) => t.occurred_at ?? "").sort().at(-1)?.slice(0, 10) ?? null;
  return {
    source: "Supabase ledger",
    live: false,
    currency: "USD",
    today: net(todayStr),
    todayCount: cnt(todayStr),
    last7: net(from7),
    last7Count: cnt(from7),
    last30: net(from30),
    last30Count: cnt(from30),
    allTime: net(),
    mrr: null,
    activeSubscribers: null,
    topOffers: [],
    note: rows.length === 0
      ? "No transactions recorded for this workspace yet."
      : `This is the manual ledger (latest entry ${latest}). If a payment provider is connected, trust the dashboard over this.`,
  };
}

function unreachable(provider: string, e: unknown): RevenueSnapshot {
  return {
    source: `${provider} (live — temporarily unreachable)`,
    live: false,
    currency: "USD",
    today: null, todayCount: null, last7: null, last7Count: null, last30: null, last30Count: null,
    allTime: null, mrr: null, activeSubscribers: null, topOffers: [],
    note: `Couldn't reach ${provider} just now (${e instanceof Error ? e.message : "unknown error"}). Ask again in a moment.`,
  };
}

export async function buildWorkspaceSnapshot(supabase: Supa, agencyId: string): Promise<WorkspaceSnapshot> {
  const [{ data: agency }, clientsTotal, clientsActive, callsCount, { data: deals }, { data: settingsRow }, { data: topClientRows }, { data: goalRows }] = await Promise.all([
    supabase.from("agencies").select("name, dashboard_template").eq("id", agencyId).maybeSingle<{ name: string; dashboard_template: string | null }>(),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("agency_id", agencyId),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active"),
    supabase.from("calls").select("*", { count: "exact", head: true }).eq("agency_id", agencyId),
    supabase.from("deals").select("stage, amount").eq("agency_id", agencyId),
    supabase.from("agency_settings").select("data").eq("agency_id", agencyId).maybeSingle(),
    supabase.from("clients").select("name, mrr").eq("agency_id", agencyId).eq("status", "active").order("mrr", { ascending: false }).limit(5),
    supabase.from("goals").select("name, target_value, current_value").eq("agency_id", agencyId).limit(5),
  ]);

  const won = (deals ?? []).filter((d) => d.stage === "closed_won");
  const closedWonValue = won.reduce((s, d) => s + Number(d.amount ?? 0), 0);

  // Pipeline = deals grouped by stage (count + value), so the chat can answer "what's in the pipeline".
  const stageMap = new Map<string, { count: number; value: number }>();
  for (const d of deals ?? []) {
    const cell = stageMap.get(d.stage ?? "unknown") ?? { count: 0, value: 0 };
    cell.count += 1;
    cell.value += Number(d.amount ?? 0);
    stageMap.set(d.stage ?? "unknown", cell);
  }
  const pipeline = Array.from(stageMap.entries()).map(([stage, v]) => ({ stage, ...v }));

  // Pick the revenue source the same way the dashboard does.
  let revenue: RevenueSnapshot;
  if (fanbasisEnabledFor(agencyId)) {
    revenue = await fanbasisRevenue();
  } else if (agency?.dashboard_template === "creator") {
    const settings = creatorSettingsFromRaw((settingsRow?.data ?? {}) as RawSettings);
    revenue = settings.stripeKey ? await stripeRevenue(settings.stripeKey) : await ledgerRevenue(supabase, agencyId);
  } else {
    revenue = await ledgerRevenue(supabase, agencyId);
  }

  const r = revenue;
  const cur = r.currency;
  const lines: string[] = [
    `WORKSPACE: ${agency?.name ?? "Unknown"}`,
    `Clients: ${clientsActive.count ?? 0} active of ${clientsTotal.count ?? 0} total`,
    `Calls logged: ${callsCount.count ?? 0}`,
    `Closed-won deals: ${won.length} (contract value ${money(closedWonValue, cur)})`,
    ``,
    `REVENUE — source: ${r.source}${r.live ? "" : "  ⚠️ not live"}`,
    `- Today: ${money(r.today, cur)}${r.todayCount != null ? ` (${r.todayCount} sale${r.todayCount === 1 ? "" : "s"})` : ""}`,
    `- Last 7 days: ${money(r.last7, cur)}${r.last7Count != null ? ` (${r.last7Count} sale${r.last7Count === 1 ? "" : "s"})` : ""}`,
    `- Last 30 days: ${money(r.last30, cur)}${r.last30Count != null ? ` (${r.last30Count} sale${r.last30Count === 1 ? "" : "s"})` : ""}`,
  ];
  if (r.allTime != null) lines.push(`- All-time: ${money(r.allTime, cur)}`);
  if (r.mrr != null) lines.push(`- MRR: ${money(r.mrr, cur)}${r.activeSubscribers != null ? ` across ${r.activeSubscribers} active subscribers` : ""}`);
  if (r.topOffers.length) {
    lines.push(`- Top offers (all-time): ${r.topOffers.map((o) => `${o.label} ${money(o.revenue, cur)} (${o.count})`).join(", ")}`);
  }
  if (r.note) lines.push(`- Note: ${r.note}`);

  // Wider OS context so the chat can answer pipeline / client / goal questions, not just revenue.
  if (pipeline.length) {
    lines.push(``, `PIPELINE (deals by stage): ${pipeline.map((p) => `${p.stage} ${p.count} (${money(p.value, cur)})`).join(", ")}`);
  }
  const topClients = (topClientRows ?? []).filter((c) => Number(c.mrr ?? 0) > 0);
  if (topClients.length) {
    lines.push(`TOP CLIENTS by MRR: ${topClients.map((c) => `${c.name} ${money(Number(c.mrr ?? 0), cur)}`).join(", ")}`);
  }
  const goals = goalRows ?? [];
  if (goals.length) {
    lines.push(`GOALS: ${goals.map((g) => `${g.name} ${Number(g.current_value ?? 0).toLocaleString()}/${Number(g.target_value ?? 0).toLocaleString()}`).join(", ")}`);
  }

  lines.push(``, `All figures are for THIS workspace only and use UTC day boundaries (matching the dashboard).`);

  return {
    workspaceName: agency?.name ?? "Unknown",
    clients: clientsTotal.count ?? 0,
    activeClients: clientsActive.count ?? 0,
    callsLogged: callsCount.count ?? 0,
    closedWonCount: won.length,
    closedWonValue,
    revenue,
    promptBlock: lines.join("\n"),
  };
}
