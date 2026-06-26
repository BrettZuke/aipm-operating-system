import Stripe from "stripe";
import type { DateRange } from "./range";

export interface UtmSales {
  key: string;
  count: number;
  revenue: number;
}

export interface StripeSnapshot {
  revenueNet: number;
  revenueNetPrior: number;
  refunds: number;
  mrr: number;
  blendedMrr: number;
  next30d: number;
  ltv: number;
  activeSubscribers: number;
  salesCount: number;
  salesCountPrior: number;
  // Pablo-style completed-checkout detail: total vs unique customers, paid vs free, net of refunds.
  uniqueCustomers: number;
  salesCountPaid: number;
  salesCountFree: number;
  netSalesCount: number;
  // Subscription lifecycle counts (Pablo parity).
  newSubscriptions: number;
  cancelling: number;
  trialingSubscribers: number;
  newOrderRevenue: number;
  byUtmSource: UtmSales[];
  byUtmCampaign: UtmSales[];
  dailyRevenue: DailyRevenue[];
  churnRate: number | null;
  canceledInRange: number;
  chargebacks: number;
  chargebacksAmount: number;
  // Buyer emails for in-range paid charges, used to attribute email -> DM -> sale by matching
  // the payer's email to a Kit click cohort within a time window. `at` = charge epoch seconds.
  buyers: { email: string; amount: number; at: number }[];
  currency: string;
  fetchedAt: string;
}

export interface DailyRevenue {
  date: string;
  revenue: number;
  count: number;
}

interface FetchArgs {
  key: string;
  range: DateRange;
}

function dayStartEpoch(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
}

function dayEndExclusiveEpoch(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d + 1) / 1000);
}

async function paidChargesBetween(
  stripe: Stripe,
  fromEpoch: number,
  toEpochExclusive: number,
): Promise<Stripe.Charge[]> {
  const out: Stripe.Charge[] = [];
  for await (const c of stripe.charges.list({
    created: { gte: fromEpoch, lt: toEpochExclusive },
    limit: 100,
  })) {
    if (c.status === "succeeded" && c.paid) out.push(c);
  }
  return out;
}

async function listActiveSubscriptions(stripe: Stripe): Promise<Stripe.Subscription[]> {
  const out: Stripe.Subscription[] = [];
  for await (const s of stripe.subscriptions.list({ status: "active", limit: 100 })) {
    out.push(s);
  }
  return out;
}

// Completed checkout sessions = new orders placed in the window (renewals don't create sessions).
// These carry the UTM metadata stamped at checkout, so they're the exact source of "sales by source".
async function completedSessionsBetween(
  stripe: Stripe,
  fromEpoch: number,
  toEpochExclusive: number,
): Promise<Stripe.Checkout.Session[]> {
  const out: Stripe.Checkout.Session[] = [];
  for await (const s of stripe.checkout.sessions.list({
    created: { gte: fromEpoch, lt: toEpochExclusive },
    limit: 100,
  })) {
    if (s.status === "complete" && (s.payment_status === "paid" || s.payment_status === "no_payment_required")) {
      out.push(s);
    }
  }
  return out;
}

async function disputesBetween(stripe: Stripe, fromEpoch: number, toEpochExclusive: number): Promise<Stripe.Dispute[]> {
  const out: Stripe.Dispute[] = [];
  for await (const d of stripe.disputes.list({ created: { gte: fromEpoch, lt: toEpochExclusive }, limit: 100 })) {
    out.push(d);
  }
  return out;
}

// Subscriptions that were canceled inside the window — for churn. status:"canceled" can't be
// date-filtered on the list call, so we list recent cancellations and filter by canceled_at.
async function canceledSubsBetween(stripe: Stripe, fromEpoch: number, toEpochExclusive: number): Promise<number> {
  let count = 0;
  let scanned = 0;
  for await (const s of stripe.subscriptions.list({ status: "canceled", limit: 100 })) {
    scanned += 1;
    const ts = s.canceled_at ?? s.ended_at ?? 0;
    if (ts >= fromEpoch && ts < toEpochExclusive) count += 1;
    if (scanned >= 500) break; // safety cap for high-volume accounts
  }
  return count;
}

// New subscriptions created inside the window. `created` IS filterable on the list call, so this
// is bounded by the window's volume (no full-history scan needed).
async function subsCreatedBetween(stripe: Stripe, fromEpoch: number, toEpochExclusive: number): Promise<number> {
  let count = 0;
  for await (const s of stripe.subscriptions.list({ status: "all", created: { gte: fromEpoch, lt: toEpochExclusive }, limit: 100 })) {
    count += 1;
    if (count >= 1000) break; // safety cap
  }
  return count;
}

async function trialingCount(stripe: Stripe): Promise<number> {
  let count = 0;
  for await (const _s of stripe.subscriptions.list({ status: "trialing", limit: 100 })) {
    count += 1;
    if (count >= 1000) break;
  }
  return count;
}

function groupByUtm(sessions: Stripe.Checkout.Session[], key: "utm_source" | "utm_campaign"): UtmSales[] {
  const map = new Map<string, { count: number; revenue: number }>();
  for (const s of sessions) {
    const label = (s.metadata?.[key] || "(untagged)").toString();
    const cur = map.get(label) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += (s.amount_total ?? 0) / 100;
    map.set(label, cur);
  }
  return Array.from(map.entries())
    .map(([k, v]) => ({ key: k, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue);
}

function sumGrossMinusRefunds(charges: Stripe.Charge[]): number {
  return charges.reduce((acc, c) => acc + (c.amount ?? 0) - (c.amount_refunded ?? 0), 0);
}

function sumRefunds(charges: Stripe.Charge[]): number {
  return charges.reduce((acc, c) => acc + (c.amount_refunded ?? 0), 0);
}

function monthlyAmountFor(sub: Stripe.Subscription): number {
  let total = 0;
  for (const item of sub.items.data) {
    const price = item.price;
    if (!price.recurring) continue;
    const quantity = item.quantity ?? 1;
    const unit = (price.unit_amount ?? 0) * quantity;
    const intervalCount = price.recurring.interval_count ?? 1;
    switch (price.recurring.interval) {
      case "day":
        total += (unit * 30) / intervalCount;
        break;
      case "week":
        total += (unit * 4.345) / intervalCount;
        break;
      case "month":
        total += unit / intervalCount;
        break;
      case "year":
        total += unit / (12 * intervalCount);
        break;
    }
  }
  return total;
}

export async function fetchStripeSnapshot({ key, range }: FetchArgs): Promise<StripeSnapshot> {
  // Omit apiVersion → SDK uses account default. Dahlia-era SDK dropped `invoice` from Charge,
  // so blendedMrr can no longer cheaply separate one-time vs subscription charges from charges.list.
  const stripe = new Stripe(key);

  const rangeFrom = dayStartEpoch(range.from);
  const rangeTo = dayEndExclusiveEpoch(range.to);
  const priorFrom = dayStartEpoch(range.prevFrom);
  const priorTo = dayEndExclusiveEpoch(range.prevTo);
  const now = Math.floor(Date.now() / 1000);
  const yearAgo = now - 365 * 86400;

  const [rangeCharges, priorCharges, lastYearCharges, activeSubs, rangeSessions, priorSessions, rangeDisputes, canceledInRange, newSubscriptions, trialingSubscribers] = await Promise.all([
    paidChargesBetween(stripe, rangeFrom, rangeTo),
    paidChargesBetween(stripe, priorFrom, priorTo),
    paidChargesBetween(stripe, yearAgo, now + 1),
    listActiveSubscriptions(stripe),
    completedSessionsBetween(stripe, rangeFrom, rangeTo),
    completedSessionsBetween(stripe, priorFrom, priorTo),
    disputesBetween(stripe, rangeFrom, rangeTo),
    canceledSubsBetween(stripe, rangeFrom, rangeTo),
    subsCreatedBetween(stripe, rangeFrom, rangeTo),
    trialingCount(stripe),
  ]);

  const currency =
    rangeCharges[0]?.currency ?? priorCharges[0]?.currency ?? lastYearCharges[0]?.currency ?? activeSubs[0]?.currency ?? "usd";

  const revenueNet = sumGrossMinusRefunds(rangeCharges) / 100;
  const revenueNetPrior = sumGrossMinusRefunds(priorCharges) / 100;
  const refunds = sumRefunds(rangeCharges) / 100;

  const mrr = activeSubs.reduce((acc, s) => acc + monthlyAmountFor(s), 0) / 100;
  // Blended MRR (typical formula = MRR + one-time-90d/3) requires distinguishing subscription vs
  // one-time charges; v22 SDK doesn't expose `invoice` on Charge directly. For v1 we pin blended
  // to MRR. Refine when the creator's volume justifies expanding invoices on the list call.
  const blendedMrr = mrr;
  const next30d = mrr;

  const customerTotals = new Map<string, number>();
  for (const c of lastYearCharges) {
    const cid = typeof c.customer === "string" ? c.customer : c.customer?.id;
    if (!cid) continue;
    customerTotals.set(cid, (customerTotals.get(cid) ?? 0) + ((c.amount ?? 0) - (c.amount_refunded ?? 0)));
  }
  const ltv = customerTotals.size > 0
    ? Array.from(customerTotals.values()).reduce((a, b) => a + b, 0) / customerTotals.size / 100
    : 0;

  const byUtmSource = groupByUtm(rangeSessions, "utm_source");
  const byUtmCampaign = groupByUtm(rangeSessions, "utm_campaign");
  const newOrderRevenue = rangeSessions.reduce((acc, s) => acc + (s.amount_total ?? 0), 0) / 100;

  // Completed-checkout detail (Pablo parity): unique customers, paid vs free, net of refunds.
  const customerIds = new Set<string>();
  for (const s of rangeSessions) {
    const cid = typeof s.customer === "string" ? s.customer : s.customer?.id;
    if (cid) customerIds.add(cid);
    else if (s.customer_details?.email) customerIds.add(`email:${s.customer_details.email}`);
  }
  const uniqueCustomers = customerIds.size;
  const salesCountPaid = rangeSessions.filter((s) => (s.amount_total ?? 0) > 0).length;
  const salesCountFree = rangeSessions.length - salesCountPaid;
  const refundedOrders = rangeCharges.filter((c) => (c.amount_refunded ?? 0) > 0).length;
  const netSalesCount = Math.max(0, salesCountPaid - refundedOrders);
  const cancelling = activeSubs.filter((s) => s.cancel_at_period_end).length;

  // Churn = subs canceled in range ÷ exposed base (still-active + those canceled in range).
  // null when there's no base to divide by (avoids a meaningless 0% on a brand-new account).
  const churnBase = activeSubs.length + canceledInRange;
  const churnRate = churnBase > 0 ? canceledInRange / churnBase : null;
  const chargebacks = rangeDisputes.length;
  const chargebacksAmount = rangeDisputes.reduce((acc, d) => acc + (d.amount ?? 0), 0) / 100;

  // Daily revenue (net of refunds) across the range, for the sales-over-time chart.
  const dayMap = new Map<string, { revenue: number; count: number }>();
  for (const c of rangeCharges) {
    const date = new Date((c.created ?? 0) * 1000).toISOString().slice(0, 10);
    const cur = dayMap.get(date) ?? { revenue: 0, count: 0 };
    cur.revenue += ((c.amount ?? 0) - (c.amount_refunded ?? 0)) / 100;
    cur.count += 1;
    dayMap.set(date, cur);
  }
  const dailyRevenue: DailyRevenue[] = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, revenue: v.revenue, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Buyer emails (for email -> DM -> sale attribution). Stripe Checkout / payment links set
  // billing_details.email; receipt_email is the fallback. Net of refunds, paid charges only.
  const buyers = rangeCharges
    .map((c) => ({
      email: (c.billing_details?.email ?? c.receipt_email ?? "").trim().toLowerCase(),
      amount: ((c.amount ?? 0) - (c.amount_refunded ?? 0)) / 100,
      at: c.created ?? 0,
    }))
    .filter((b) => b.email.length > 0 && b.amount > 0);

  return {
    revenueNet,
    revenueNetPrior,
    refunds,
    mrr,
    blendedMrr,
    next30d,
    ltv,
    activeSubscribers: activeSubs.length,
    salesCount: rangeSessions.length,
    salesCountPrior: priorSessions.length,
    uniqueCustomers,
    salesCountPaid,
    salesCountFree,
    netSalesCount,
    newSubscriptions,
    cancelling,
    trialingSubscribers,
    newOrderRevenue,
    byUtmSource,
    byUtmCampaign,
    dailyRevenue,
    churnRate,
    canceledInRange,
    chargebacks,
    chargebacksAmount,
    buyers,
    currency,
    fetchedAt: new Date().toISOString(),
  };
}

// ─────────────────────────── Transactions ledger (Stripe) ───────────────────────────
// Live money ledger for creator tenants — every charge in the window, plus refunds and
// disputes, replacing the manual Supabase ledger that coach/agency workspaces use.

export interface LedgerEntry {
  id: string;
  created: number; // epoch seconds
  kind: "payment" | "refund" | "chargeback";
  status: string; // succeeded | failed | refunded | disputed | won | lost | ...
  amount: number; // major units; positive for payment, negative for refund/chargeback
  currency: string;
  customerEmail: string | null;
  description: string | null;
  cardBrand: string | null;
  last4: string | null;
  receiptUrl: string | null;
}

export interface StripeLedger {
  entries: LedgerEntry[];
  currency: string;
  grossPaid: number;
  refunded: number;
  disputed: number;
  net: number;
  paymentCount: number;
  refundCount: number;
  failedCount: number;
  dailyNet: DailyRevenue[];
  fetchedAt: string;
}

export async function fetchStripeLedger({ key, range }: FetchArgs): Promise<StripeLedger> {
  const stripe = new Stripe(key);
  const from = dayStartEpoch(range.from);
  const to = dayEndExclusiveEpoch(range.to);

  const charges: Stripe.Charge[] = [];
  for await (const c of stripe.charges.list({ created: { gte: from, lt: to }, limit: 100 })) {
    charges.push(c);
  }
  const disputes = await disputesBetween(stripe, from, to);

  const entries: LedgerEntry[] = [];
  let grossPaid = 0;
  let refunded = 0;
  let disputed = 0;
  let paymentCount = 0;
  let refundCount = 0;
  let failedCount = 0;

  for (const c of charges) {
    const card = c.payment_method_details?.card ?? null;
    const base = {
      customerEmail: c.billing_details?.email ?? c.receipt_email ?? null,
      description: c.description ?? null,
      cardBrand: card?.brand ?? null,
      last4: card?.last4 ?? null,
      receiptUrl: c.receipt_url ?? null,
      currency: c.currency,
    };
    if (c.status === "succeeded" && c.paid) {
      grossPaid += c.amount ?? 0;
      paymentCount += 1;
      entries.push({ id: c.id, created: c.created, kind: "payment", status: c.disputed ? "disputed" : "succeeded", amount: (c.amount ?? 0) / 100, ...base });
      if ((c.amount_refunded ?? 0) > 0) {
        refunded += c.amount_refunded ?? 0;
        refundCount += 1;
        entries.push({ id: `${c.id}:refund`, created: c.created, kind: "refund", status: "refunded", amount: -((c.amount_refunded ?? 0) / 100), ...base });
      }
    } else if (c.status === "failed") {
      failedCount += 1;
      entries.push({ id: c.id, created: c.created, kind: "payment", status: "failed", amount: (c.amount ?? 0) / 100, ...base });
    }
  }

  for (const d of disputes) {
    disputed += d.amount ?? 0;
    entries.push({
      id: d.id,
      created: d.created,
      kind: "chargeback",
      status: d.status,
      amount: -((d.amount ?? 0) / 100),
      currency: d.currency,
      customerEmail: null,
      description: `Dispute · ${d.reason ?? "unknown"}`,
      cardBrand: null,
      last4: null,
      receiptUrl: null,
    });
  }

  entries.sort((a, b) => b.created - a.created);

  // Daily net (succeeded − refunds), for the cash-flow bars.
  const dayMap = new Map<string, { revenue: number; count: number }>();
  for (const e of entries) {
    if (e.kind === "chargeback") continue;
    const date = new Date(e.created * 1000).toISOString().slice(0, 10);
    const cur = dayMap.get(date) ?? { revenue: 0, count: 0 };
    cur.revenue += e.amount;
    if (e.kind === "payment" && e.status === "succeeded") cur.count += 1;
    dayMap.set(date, cur);
  }
  const dailyNet: DailyRevenue[] = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, revenue: v.revenue, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const currency = charges[0]?.currency ?? disputes[0]?.currency ?? "usd";
  return {
    entries,
    currency,
    grossPaid: grossPaid / 100,
    refunded: refunded / 100,
    disputed: disputed / 100,
    // Net = gross − refunds, matching the dashboard's revenueNet for the same window. Disputed
    // charges already sit in grossPaid (they're still `succeeded`); we surface `disputed`
    // separately rather than double-subtracting it here.
    net: (grossPaid - refunded) / 100,
    paymentCount,
    refundCount,
    failedCount,
    dailyNet,
    fetchedAt: new Date().toISOString(),
  };
}

// ─────────────────────────── Subscription schedule (Stripe) ───────────────────────────
// Upcoming payments for creator tenants: each live subscription's next charge date + amount,
// with past-due / failed subscriptions surfaced first.

export interface ScheduleRow {
  id: string;
  customerEmail: string | null;
  customerName: string | null;
  amount: number; // per-period major units
  currency: string;
  interval: string; // month | year | week | day
  intervalCount: number;
  nextChargeEpoch: number | null;
  status: string; // active | trialing | past_due | unpaid | incomplete | paused
  failed: boolean;
  cancelAtPeriodEnd: boolean;
  startedEpoch: number;
}

export interface StripeSchedule {
  rows: ScheduleRow[];
  currency: string;
  activeCount: number;
  pastDueCount: number;
  canceledCount: number;
  mrr: number;
  next30dCount: number;
  next30dAmount: number;
  fetchedAt: string;
}

// In Stripe API v2025+ (SDK v22) current_period_end moved off the Subscription onto each
// SubscriptionItem. Read it defensively so we stay correct regardless of pinned API version.
function itemPeriodEnd(item: Stripe.SubscriptionItem): number | null {
  const v = (item as { current_period_end?: number }).current_period_end;
  return typeof v === "number" ? v : null;
}

function customerEmailName(cust: Stripe.Subscription["customer"]): { email: string | null; name: string | null } {
  if (cust && typeof cust === "object" && !("deleted" in cust && cust.deleted)) {
    const c = cust as Stripe.Customer;
    return { email: c.email ?? null, name: c.name ?? null };
  }
  return { email: null, name: null };
}

export async function fetchStripeSchedule({ key }: { key: string }): Promise<StripeSchedule> {
  const stripe = new Stripe(key);
  const subs: Stripe.Subscription[] = [];
  for await (const s of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.customer"] })) {
    subs.push(s);
  }

  const now = Math.floor(Date.now() / 1000);
  const in30 = now + 30 * 86400;

  const rows: ScheduleRow[] = [];
  let activeCount = 0;
  let pastDueCount = 0;
  let canceledCount = 0;
  let mrr = 0;
  let next30dCount = 0;
  let next30dAmount = 0;
  let currency = "usd";

  for (const s of subs) {
    if (s.status === "canceled") {
      canceledCount += 1;
      continue;
    }
    const item = s.items.data.find((i) => i.price.recurring) ?? s.items.data[0];
    if (!item) continue;
    const price = item.price;
    const rec = price.recurring;
    const qty = item.quantity ?? 1;
    const amount = ((price.unit_amount ?? 0) * qty) / 100;
    currency = price.currency ?? currency;
    const { email, name } = customerEmailName(s.customer);
    const failed = s.status === "past_due" || s.status === "unpaid" || s.status === "incomplete";
    if (s.status === "active" || s.status === "trialing") activeCount += 1;
    if (failed) pastDueCount += 1;
    mrr += monthlyAmountFor(s) / 100;
    const nextChargeEpoch = itemPeriodEnd(item);
    if (nextChargeEpoch && nextChargeEpoch >= now && nextChargeEpoch <= in30) {
      next30dCount += 1;
      next30dAmount += amount;
    }
    rows.push({
      id: s.id,
      customerEmail: email,
      customerName: name,
      amount,
      currency: price.currency,
      interval: rec?.interval ?? "month",
      intervalCount: rec?.interval_count ?? 1,
      nextChargeEpoch,
      status: s.status,
      failed,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      startedEpoch: s.created,
    });
  }

  // Failed/past-due first, then soonest upcoming charge.
  rows.sort((a, b) => {
    if (a.failed !== b.failed) return a.failed ? -1 : 1;
    return (a.nextChargeEpoch ?? Infinity) - (b.nextChargeEpoch ?? Infinity);
  });

  return {
    rows,
    currency,
    activeCount,
    pastDueCount,
    canceledCount,
    mrr,
    next30dCount,
    next30dAmount,
    fetchedAt: new Date().toISOString(),
  };
}
