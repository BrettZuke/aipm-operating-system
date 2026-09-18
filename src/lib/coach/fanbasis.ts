// Live FanBasis revenue reader for the coach tenant (the coach). FanBasis is the coach's merchant of
// record (no Stripe). This is the coach equivalent of the creator's live Stripe reader — it pulls
// straight from the FanBasis public API, maps each customer's spend to an offer using the
// product-price catalog, and returns revenue totals / per-offer breakdown / daily series.
//
// API shape (discovered 2026-06-16):
//   Base   https://www.fanbasis.com/public-api   Auth header  x-api-key: <FANBASIS_API_KEY>
//   GET /customers?page=N&per_page=100  -> data.customers[] {id,name,email,country_code,
//        total_transactions, total_spent, last_transaction_date}, data.pagination.has_more
//   GET /products?page=N&per_page=100   -> Laravel paginator at data.data[] {id,title,
//        internal_name,price,...}
// The public API exposes customer-level AGGREGATES (total_spent + last_transaction_date),
// not per-line transactions, so a multi-payment customer's lifetime total lands on their
// last transaction date. Single-payment customers (the majority) map exactly to one offer.

import type { DateRange } from "@/lib/creator/range";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types.generated";

const BASE = "https://www.fanbasis.com/public-api";

// Only the coach's workspace reads FanBasis. Gate on the same agency id the webhook targets, plus
// the API key being present. Any other tenant gets null -> shows its own (Stripe/Supabase) data.
export function fanbasisEnabledFor(agencyId: string | null | undefined): boolean {
  return !!process.env.FANBASIS_API_KEY && !!agencyId && agencyId === process.env.FANBASIS_TARGET_AGENCY_ID;
}

export interface OfferRow {
  section: string;
  revenue: number;
  customers: number;
}
export interface DailyRevenue {
  date: string;
  revenue: number;
  count: number;
}
export interface FanbasisRevenue {
  totalRevenue: number;
  totalRevenuePrior: number;
  customerCount: number;
  customerCountPrior: number;
  aov: number;
  byOffer: OfferRow[];
  byDay: DailyRevenue[];
  offers: string[]; // all sections present all-time, for the selector
  multiPayCustomers: number; // customers whose timing is approximate (>1 transaction)
  unmappedRevenue: number; // revenue whose amount matched no product price
  fetchedAt: string;
}

interface FbCustomer {
  id: number;
  name: string | null;
  email: string | null;
  country_code: string | null;
  total_transactions: number;
  total_spent: string | number | null;
  last_transaction_date: string | null;
}
interface FbProduct {
  id: string;
  title: string | null;
  internal_name: string | null;
  price: string | number | null;
}

async function fbGet(path: string): Promise<unknown> {
  const key = process.env.FANBASIS_API_KEY;
  if (!key) throw new Error("FANBASIS_API_KEY not set");
  const res = await fetch(`${BASE}/${path}`, {
    headers: { "x-api-key": key, Accept: "application/json" },
    // FanBasis data changes slowly; let Next cache the upstream fetch for 5 min.
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`FanBasis ${path} -> HTTP ${res.status}`);
  return res.json();
}

// ---- offer section classifier (title / internal_name -> high-level offer) ----
function sectionFor(title: string, internal: string): string {
  const s = `${title} ${internal}`.toLowerCase();
  if (s.includes("retreat")) return "Example Event";
  if (s.includes("society") || s.includes("membership")) return "the Membership";
  if (s.includes("subscription") || s.includes("retainer")) return "Recurring Plan";
  if (s.includes("masterclass") || s.includes("webinar")) return "Webinar";
  if (
    s.includes("partner") ||
    s.includes("example") ||
    /\btier\s*[123]\b/.test(s) ||
    s.includes("first payment") ||
    s.includes("initial payment")
  )
    return "your agency";
  if (s.includes("deposit")) return "Deposits";
  return "Other";
}

let _cache: { built: number; priceIndex: Map<number, string>; customers: FbCustomer[] } | null = null;

async function loadRaw(): Promise<{ priceIndex: Map<number, string>; customers: FbCustomer[] }> {
  if (_cache && Date.now() - _cache.built < 5 * 60 * 1000) {
    return { priceIndex: _cache.priceIndex, customers: _cache.customers };
  }
  // products (single page covers the catalog at per_page=100)
  const prodResp = (await fbGet("products?page=1&per_page=100")) as { data?: { data?: FbProduct[] } };
  const products = prodResp?.data?.data ?? [];
  const priceIndex = new Map<number, string>();
  for (const p of products) {
    const price = Math.round(Number(p.price ?? 0) * 100) / 100;
    if (price <= 0) continue;
    const section = sectionFor(p.title ?? "", p.internal_name ?? "");
    // First product at a given price wins; same-price products are virtually always same offer.
    if (!priceIndex.has(price)) priceIndex.set(price, section);
  }

  // customers (paginate until has_more is false)
  const customers: FbCustomer[] = [];
  let page = 1;
  for (let safety = 0; safety < 50; safety++) {
    const resp = (await fbGet(`customers?page=${page}&per_page=100`)) as {
      data?: { customers?: FbCustomer[]; pagination?: { has_more?: boolean } };
    };
    customers.push(...(resp?.data?.customers ?? []));
    if (!resp?.data?.pagination?.has_more) break;
    page += 1;
  }

  _cache = { built: Date.now(), priceIndex, customers };
  return { priceIndex, customers };
}

function classify(c: FbCustomer, priceIndex: Map<number, string>): { section: string; mapped: boolean } {
  const spent = Math.round(Number(c.total_spent ?? 0) * 100) / 100;
  const exact = priceIndex.get(spent);
  if (exact) return { section: exact, mapped: true };
  // No exact price match: almost always a multi-installment customer whose running total
  // doesn't equal a single product price. Bucket honestly rather than guess the offer.
  if ((c.total_transactions ?? 0) > 1) return { section: "Payment plans (multi)", mapped: false };
  return { section: "Other", mapped: false };
}

const dayOf = (iso: string | null): string | null => (iso && iso.length >= 10 ? iso.slice(0, 10) : null);
const inRange = (day: string | null, from: string, to: string): boolean => !!day && day >= from && day <= to;

interface FetchArgs {
  range: DateRange;
  /** Optional offer section to scope every metric to. */
  offer?: string;
}

export async function fetchFanbasisRevenue({ range, offer }: FetchArgs): Promise<FanbasisRevenue> {
  const { priceIndex, customers } = await loadRaw();

  const enriched = customers.map((c) => {
    const { section, mapped } = classify(c, priceIndex);
    return {
      section,
      mapped,
      revenue: Number(c.total_spent ?? 0),
      day: dayOf(c.last_transaction_date),
      multi: (c.total_transactions ?? 0) > 1,
    };
  });

  // All sections present all-time (for the offer selector), ordered by lifetime revenue.
  const lifetimeBySection = new Map<string, number>();
  for (const e of enriched) lifetimeBySection.set(e.section, (lifetimeBySection.get(e.section) ?? 0) + e.revenue);
  const offers = Array.from(lifetimeBySection.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  const scope = (from: string, to: string) =>
    enriched.filter((e) => inRange(e.day, from, to) && (!offer || e.section === offer));

  const cur = scope(range.from, range.to);
  const prior = scope(range.prevFrom, range.prevTo);

  const totalRevenue = cur.reduce((s, e) => s + e.revenue, 0);
  const totalRevenuePrior = prior.reduce((s, e) => s + e.revenue, 0);

  const byOfferMap = new Map<string, { revenue: number; customers: number }>();
  for (const e of cur) {
    const cell = byOfferMap.get(e.section) ?? { revenue: 0, customers: 0 };
    cell.revenue += e.revenue;
    cell.customers += 1;
    byOfferMap.set(e.section, cell);
  }
  const byOffer = Array.from(byOfferMap.entries())
    .map(([section, v]) => ({ section, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const byDayMap = new Map<string, { revenue: number; count: number }>();
  for (const e of cur) {
    if (!e.day) continue;
    const cell = byDayMap.get(e.day) ?? { revenue: 0, count: 0 };
    cell.revenue += e.revenue;
    cell.count += 1;
    byDayMap.set(e.day, cell);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalRevenue,
    totalRevenuePrior,
    customerCount: cur.length,
    customerCountPrior: prior.length,
    aov: cur.length ? totalRevenue / cur.length : 0,
    byOffer,
    byDay,
    offers,
    multiPayCustomers: cur.filter((e) => e.multi).length,
    unmappedRevenue: cur.filter((e) => !e.mapped).reduce((s, e) => s + e.revenue, 0),
    fetchedAt: new Date().toISOString(),
  };
}

// Lightweight all-time total, used to fix the dashboard headline cash number for the coach without
// pulling the full per-offer breakdown. Reuses the same cached customer pull.
export async function fanbasisAllTimeRevenue(): Promise<number> {
  const { customers } = await loadRaw();
  return customers.reduce((s, c) => s + Number(c.total_spent ?? 0), 0);
}

// Blended lifetime value across ALL FanBasis buyers (every offer), not just the financed
// students in the sales sheet. All-time revenue ÷ paying customers = the honest "avg cash per buyer".
export interface FanbasisLifetime { revenue: number; customers: number; ltv: number }
export async function fanbasisLifetimeStats(): Promise<FanbasisLifetime> {
  const { customers } = await loadRaw();
  const payers = customers.filter((c) => Number(c.total_spent ?? 0) > 0);
  const revenue = payers.reduce((s, c) => s + Number(c.total_spent ?? 0), 0);
  return { revenue, customers: payers.length, ltv: payers.length ? revenue / payers.length : 0 };
}

export interface EnrichedCustomer {
  email: string | null;
  name: string | null;
  section: string;
  revenue: number;     // lifetime total_spent (exact)
  transactions: number; // # of payments (≥1) — lets callers estimate a per-installment amount
  day: string | null;
  multi: boolean;
  mapped: boolean;
}

// Per-customer rows (with email + offer section + revenue + day) so the attribution reader can
// join each buyer to the UTM we captured at opt-in. FanBasis carries no UTM itself, so the join
// key is the buyer's email. Reuses the same cached pull as fetchFanbasisRevenue.
export async function fanbasisEnrichedCustomers(): Promise<EnrichedCustomer[]> {
  const { priceIndex, customers } = await loadRaw();
  return customers.map((c) => {
    const { section, mapped } = classify(c, priceIndex);
    return {
      email: c.email ? c.email.toLowerCase().trim() : null,
      name: c.name,
      section,
      revenue: Number(c.total_spent ?? 0),
      transactions: Math.max(1, Number(c.total_transactions ?? 1)),
      day: dayOf(c.last_transaction_date),
      multi: (c.total_transactions ?? 0) > 1,
      mapped,
    };
  });
}

// ── Customer sync (FanBasis payers -> Settoku `clients` as tracked CUSTOMERS) ──
// Settoku tracks CUSTOMERS (people who paid), not leads. This writes each FanBasis payer onto
// the `clients` table with status 'active' + a `data.fanbasis` block (lifetime spend, # payments,
// last payment date, offer). The Customers tab shows ONLY rows carrying that block, so the
// thousands of cold leads (closer-call forms, onboarding) never surface. Matching is by lowercased
// email, so a buyer who already exists (e.g. from a closer call) is ENRICHED in place — preserving
// their linked calls/deals — instead of duplicated. Idempotent: safe to re-run nightly.
type CoachSupabase = SupabaseClient<Database>;

export interface CustomerSyncReport {
  customers: number; // FanBasis payers with an email
  inserted: number;  // brand-new customer rows
  updated: number;   // existing rows enriched with FanBasis money
  skipped: number;   // no email / no spend
  errors: string[];
}

export async function syncFanbasisCustomers(supabase: CoachSupabase, agencyId: string): Promise<CustomerSyncReport> {
  const enriched = await fanbasisEnrichedCustomers();
  const payers = enriched.filter((c) => c.email && c.revenue > 0);
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const c of payers) {
    const fanbasis = {
      lifetime: Math.round(c.revenue * 100) / 100,
      payments: c.transactions,
      last_payment: c.day,
      offer: c.section,
      synced_at: new Date().toISOString(),
    };
    const { data: existing, error: selErr } = await supabase
      .from("clients")
      .select("id, data")
      .eq("agency_id", agencyId)
      .eq("email", c.email as string)
      .maybeSingle();
    if (selErr) {
      errors.push(`lookup ${c.email}: ${selErr.message}`);
      continue;
    }

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = ((existing.data as any) ?? {}) as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: any = { status: "active", data: { ...prev, fanbasis } };
      if (c.name) update.name = c.name;
      const { error } = await supabase.from("clients").update(update).eq("id", existing.id);
      if (error) errors.push(`update ${c.email}: ${error.message}`);
      else updated++;
    } else {
      const { error } = await supabase.from("clients").insert({
        agency_id: agencyId,
        name: c.name ?? (c.email as string),
        email: c.email as string,
        status: "active",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { fanbasis, source: "fanbasis" } as any,
      });
      if (error) errors.push(`insert ${c.email}: ${error.message}`);
      else inserted++;
    }
  }

  return { customers: payers.length, inserted, updated, skipped: enriched.length - payers.length, errors };
}
