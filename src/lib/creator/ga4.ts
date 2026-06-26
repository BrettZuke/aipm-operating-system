import { BetaAnalyticsDataClient } from "@google-analytics/data";
import type { DateRange } from "./range";
import { makeTtlCache } from "./snapshot-cache";

export interface SessionsByDay {
  date: string;
  sessions: number;
}

export interface TopRow {
  label: string;
  sessions: number;
}

export interface Ga4Snapshot {
  sessions: number;
  sessionsPrior: number;
  sessionsTrend: SessionsByDay[];
  topReferrers: TopRow[];
  topPaths: TopRow[];
  topCountries: TopRow[];
  utmSources: TopRow[];
  utmCampaigns: TopRow[];
  deviceSplit: TopRow[];
  visitors: number;
  visitorsPrior: number;
  avgEngagementSec: number;
  beginCheckout: number;
  beginCheckoutPrior: number;
  purchases: number;
  generateLead: number;
  sectionFunnel: TopRow[];
  salesPageSessions: number;
  salesPageSessionsPrior: number;
  // Pablo-style funnel: total VIEWS + UNIQUE visitors at the top (sales page) and the
  // checkout step (the dedicated checkout pages). Sessions ≈ Pablo "views", totalUsers = "unique".
  salesPageViews: number;
  salesPageUsers: number;
  salesPageUsersPrior: number;
  checkoutPageSessions: number;
  checkoutPageViews: number;
  checkoutPageUsers: number;
  checkoutPageUsersPrior: number;
  fetchedAt: string;
}

interface Ga4Args {
  propertyId: string;
  range: DateRange;
  salesPagePath: string;
  /** Comma-separated checkout page path(s), e.g. "/miesieczny,/full-plan". Empty = step hidden. */
  checkoutPagePath?: string;
}

let _client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient {
  if (_client) return _client;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var not set");
  const creds = JSON.parse(raw) as { client_email: string; private_key: string };
  _client = new BetaAnalyticsDataClient({
    credentials: { client_email: creds.client_email, private_key: creds.private_key.replace(/\\n/g, "\n") },
  });
  return _client;
}

interface ReportArgs {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  metrics: string[];
  limit?: number;
  filter?: { dimension: string; value: string | string[] };
}

async function runReport(propertyId: string, a: ReportArgs) {
  const filter = a.filter
    ? {
        dimensionFilter: {
          filter: Array.isArray(a.filter.value)
            ? { fieldName: a.filter.dimension, inListFilter: { values: a.filter.value } }
            : { fieldName: a.filter.dimension, stringFilter: { matchType: "EXACT" as const, value: a.filter.value } },
        },
      }
    : {};
  const [resp] = await getClient().runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: a.startDate, endDate: a.endDate }],
    dimensions: (a.dimensions ?? []).map((name) => ({ name })),
    metrics: a.metrics.map((name) => ({ name })),
    limit: a.limit ? String(a.limit) : undefined,
    ...filter,
  });
  return resp;
}

type Resp = Awaited<ReturnType<typeof runReport>>;

function pickInt(resp: Resp): number {
  return Number(resp.rows?.[0]?.metricValues?.[0]?.value ?? 0);
}

function pickRows(resp: Resp): TopRow[] {
  return (resp.rows ?? []).map((r) => ({
    label: String(r.dimensionValues?.[0]?.value ?? ""),
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
  }));
}

// GA4 Data API caps concurrent requests per property (10 on the standard tier). Run the
// report fan-out through a small worker pool so we never trip RESOURCE_EXHAUSTED.
async function pool<T>(tasks: Array<() => Promise<T>>, limit: number, onError: (idx: number) => T): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const idx = next++;
      try {
        results[idx] = await tasks[idx]();
      } catch {
        // One failed report (e.g. a bad pagePath filter) shouldn't blank every GA4 widget —
        // degrade just that tile to empty so the rest of the snapshot still renders.
        results[idx] = onError(idx);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

// Pull one event's count out of an eventName-dimensioned report (lets us read many
// events from a single API call instead of one call per event).
function eventCount(resp: Resp, name: string): number {
  const row = (resp.rows ?? []).find((r) => r.dimensionValues?.[0]?.value === name);
  return Number(row?.metricValues?.[0]?.value ?? 0);
}

// GA4 reports Instagram traffic under several raw sources (instagram.com, l.instagram.com,
// ig, instagram) and "direct" as both "(direct)" and "(not set)". Collapse them into clean,
// human buckets and sum the sessions so the chart reads "Instagram 168" not five rows.
function cleanSource(raw: string): string {
  const s = (raw || "").toLowerCase().trim();
  if (s.includes("instagram") || s === "ig" || s === "ig.com") return "Instagram";
  if (s.includes("facebook") || s === "fb" || s.includes("fb.com") || s === "m.facebook.com") return "Facebook";
  if (s.includes("youtube") || s === "yt") return "YouTube";
  if (s.includes("tiktok")) return "TikTok";
  if (s.includes("google")) return "Google";
  if (s.includes("t.co") || s.includes("twitter") || s === "x.com") return "X / Twitter";
  if (s.includes("wp.pl") || s.includes("poczta") || s.includes("gmail") || s.includes("outlook") || s.includes("mail.")) return "Email";
  if (s === "" || s === "(direct)" || s === "(not set)" || s === "(none)" || s === "direct") return "Direct";
  return raw;
}

function mergeSources(rows: TopRow[]): TopRow[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(cleanSource(r.label), (map.get(cleanSource(r.label)) ?? 0) + r.sessions);
  return Array.from(map.entries())
    .map(([label, sessions]) => ({ label, sessions }))
    .sort((a, b) => b.sessions - a.sessions);
}

const _ga4Cache = makeTtlCache<Ga4Snapshot>(5 * 60 * 1000);

// Cached entry point (see snapshot-cache.ts): the dashboard re-renders this reader on every load,
// so without the cache the full GA4 fan-out re-runs each time — the main source of dashboard lag.
export function fetchGa4Snapshot(args: Ga4Args): Promise<Ga4Snapshot> {
  const { propertyId, range, salesPagePath, checkoutPagePath } = args;
  const k = JSON.stringify([propertyId, range.from, range.to, range.prevFrom, range.prevTo, salesPagePath, checkoutPagePath ?? ""]);
  return _ga4Cache.get(k, () => computeGa4Snapshot(args));
}

async function computeGa4Snapshot({ propertyId, range, salesPagePath, checkoutPagePath = "" }: Ga4Args): Promise<Ga4Snapshot> {
  // salesPagePath may be a comma-separated list (e.g. Polish + English sales page) → match any.
  const salesPaths = salesPagePath.split(",").map((p) => p.trim()).filter(Boolean);
  const salesFilter: string | string[] = salesPaths.length > 1 ? salesPaths : (salesPaths[0] ?? salesPagePath);
  // checkoutPagePath = the dedicated checkout page(s). When unset, the checkout-reach reports
  // return empty so those metrics read 0 and the UI shows the step as pending.
  const checkoutPaths = checkoutPagePath.split(",").map((p) => p.trim()).filter(Boolean);
  const checkoutFilter: string | string[] = checkoutPaths.length > 1 ? checkoutPaths : (checkoutPaths[0] ?? "");
  const empty = () => Promise.resolve({ rows: [] } as unknown as Resp);
  const [
    sess,
    sessPrior,
    trend,
    refs,
    paths,
    countries,
    utm,
    salesPage,
    salesPagePrior,
    visitorsR,
    visitorsPriorR,
    devicesR,
    campaignsR,
    engagementR,
    eventsR,
    eventsPriorR,
    salesViewsR,
    salesUsersR,
    salesUsersPriorR,
    coSessR,
    coViewsR,
    coUsersR,
    coUsersPriorR,
  ] = await pool(
    [
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["sessions"] }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, metrics: ["sessions"] }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["date"], metrics: ["sessions"] }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions"], limit: 10 }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["pagePath"], metrics: ["sessions"], limit: 10 }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["country"], metrics: ["sessions"], limit: 10 }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["sessionSource"], metrics: ["sessions"], limit: 15 }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["sessions"], filter: { dimension: "pagePath", value: salesFilter } }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, metrics: ["sessions"], filter: { dimension: "pagePath", value: salesFilter } }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["totalUsers"] }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, metrics: ["totalUsers"] }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["deviceCategory"], metrics: ["sessions"], limit: 5 }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["sessionCampaignName"], metrics: ["sessions"], limit: 15 }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["averageSessionDuration"] }),
      // All conversion + scroll events come from ONE eventName-dimensioned report each (current + prior),
      // instead of one request per event — keeps us well under GA4's concurrent-request quota.
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["eventName"], metrics: ["eventCount"], limit: 200 }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, dimensions: ["eventName"], metrics: ["eventCount"], limit: 200 }),
      // Funnel Views: total page views + unique users on the sales page (current + prior unique).
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["screenPageViews"], filter: { dimension: "pagePath", value: salesFilter } }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["totalUsers"], filter: { dimension: "pagePath", value: salesFilter } }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, metrics: ["totalUsers"], filter: { dimension: "pagePath", value: salesFilter } }),
      // Reached checkout: sessions + views + unique users on the checkout page(s) (current + prior unique).
      () => (checkoutPaths.length ? runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["sessions"], filter: { dimension: "pagePath", value: checkoutFilter } }) : empty()),
      () => (checkoutPaths.length ? runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["screenPageViews"], filter: { dimension: "pagePath", value: checkoutFilter } }) : empty()),
      () => (checkoutPaths.length ? runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["totalUsers"], filter: { dimension: "pagePath", value: checkoutFilter } }) : empty()),
      () => (checkoutPaths.length ? runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, metrics: ["totalUsers"], filter: { dimension: "pagePath", value: checkoutFilter } }) : empty()),
    ],
    4,
    () => ({ rows: [] }) as unknown as Resp,
  );

  const trendPoints: SessionsByDay[] = (trend.rows ?? [])
    .map((r) => ({
      date: String(r.dimensionValues?.[0]?.value ?? ""),
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    sessions: pickInt(sess),
    sessionsPrior: pickInt(sessPrior),
    sessionsTrend: trendPoints,
    topReferrers: pickRows(refs),
    topPaths: pickRows(paths),
    topCountries: pickRows(countries),
    utmSources: mergeSources(pickRows(utm)),
    utmCampaigns: pickRows(campaignsR),
    deviceSplit: pickRows(devicesR),
    visitors: pickInt(visitorsR),
    visitorsPrior: pickInt(visitorsPriorR),
    avgEngagementSec: pickInt(engagementR),
    beginCheckout: eventCount(eventsR, "begin_checkout"),
    beginCheckoutPrior: eventCount(eventsPriorR, "begin_checkout"),
    purchases: eventCount(eventsR, "purchase"),
    generateLead: eventCount(eventsR, "generate_lead"),
    sectionFunnel: [
      { label: "Hero (top)", sessions: eventCount(eventsR, "section_hero") },
      { label: "Who it's for", sessions: eventCount(eventsR, "section_who_its_for") },
      { label: "The offer", sessions: eventCount(eventsR, "section_offer") },
      { label: "Pricing", sessions: eventCount(eventsR, "section_pricing") },
      { label: "Proof / members", sessions: eventCount(eventsR, "section_proof") },
      { label: "Final CTA", sessions: eventCount(eventsR, "section_final_cta") },
    ],
    salesPageSessions: pickInt(salesPage),
    salesPageSessionsPrior: pickInt(salesPagePrior),
    salesPageViews: pickInt(salesViewsR),
    salesPageUsers: pickInt(salesUsersR),
    salesPageUsersPrior: pickInt(salesUsersPriorR),
    checkoutPageSessions: pickInt(coSessR),
    checkoutPageViews: pickInt(coViewsR),
    checkoutPageUsers: pickInt(coUsersR),
    checkoutPageUsersPrior: pickInt(coUsersPriorR),
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Comprehensive per-page report (for the Compare view) ───────────────────
// Unlike fetchGa4Snapshot (which mixes site-wide + page-scoped fields), EVERYTHING
// here is scoped to one page's pagePath, so two pages can be compared apples to
// apples across the whole stat set: traffic, engagement quality, opt-ins, scroll
// depth, and where the traffic comes from. Money (revenue/MRR/sales) stays out —
// Stripe cannot see the landing page, so it is shown once, account-wide, in the UI.
export interface ScrollDepth {
  depth: number; // 25 | 50 | 75 | 100
  count: number; // times the milestone fired on this page (scroll_25..scroll_100)
}

export interface Ga4PageReport {
  path: string;
  visitors: number;
  visitorsPrior: number;
  newUsers: number;
  views: number;
  sessions: number;
  sessionsPrior: number;
  avgEngagedSec: number; // engaged seconds per visitor on this page
  engagementRate: number; // 0..1
  bounceRate: number; // 0..1 (lower is better)
  optIns: number; // generate_lead on this page
  scrollReached: number; // GA4 default `scroll` event (~90% depth) — historical
  scroll: ScrollDepth[]; // scroll_25/50/75/100 — new, fills in going forward
  sources: TopRow[];
  devices: TopRow[];
  countries: TopRow[];
  fetchedAt: string;
}

export async function fetchGa4PageReport({
  propertyId,
  range,
  pagePath,
}: {
  propertyId: string;
  range: DateRange;
  pagePath: string;
}): Promise<Ga4PageReport> {
  // A page may be tracked under several paths (e.g. PL + EN) so match any of them.
  const paths = pagePath.split(",").map((p) => p.trim()).filter(Boolean);
  const value: string | string[] = paths.length > 1 ? paths : (paths[0] ?? pagePath);
  const onPage = { dimension: "pagePath", value };

  const [
    visitorsR, visitorsPriorR, newUsersR, viewsR, sessR, sessPriorR,
    engDurR, engRateR, bounceR, eventsR, sourcesR, devicesR, countriesR,
  ] = await pool(
    [
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["totalUsers"], filter: onPage }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, metrics: ["totalUsers"], filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["newUsers"], filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["screenPageViews"], filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["sessions"], filter: onPage }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, metrics: ["sessions"], filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["userEngagementDuration"], filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["engagementRate"], filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["bounceRate"], filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["eventName"], metrics: ["eventCount"], limit: 200, filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["sessionSource"], metrics: ["sessions"], limit: 12, filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["deviceCategory"], metrics: ["sessions"], limit: 5, filter: onPage }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["country"], metrics: ["sessions"], limit: 6, filter: onPage }),
    ],
    4,
    () => ({ rows: [] }) as unknown as Resp,
  );

  const visitors = pickInt(visitorsR);
  const engagedSec = pickInt(engDurR); // userEngagementDuration is already in seconds
  return {
    path: pagePath,
    visitors,
    visitorsPrior: pickInt(visitorsPriorR),
    newUsers: pickInt(newUsersR),
    views: pickInt(viewsR),
    sessions: pickInt(sessR),
    sessionsPrior: pickInt(sessPriorR),
    avgEngagedSec: visitors > 0 ? engagedSec / visitors : 0,
    engagementRate: pickInt(engRateR),
    bounceRate: pickInt(bounceR),
    optIns: eventCount(eventsR, "generate_lead"),
    scrollReached: eventCount(eventsR, "scroll"),
    scroll: [25, 50, 75, 100].map((d) => ({ depth: d, count: eventCount(eventsR, `scroll_${d}`) })),
    sources: mergeSources(pickRows(sourcesR)).slice(0, 6),
    devices: pickRows(devicesR).map((r) => ({
      ...r,
      label: r.label ? r.label.charAt(0).toUpperCase() + r.label.slice(1) : "Unknown",
    })),
    countries: pickRows(countriesR),
    fetchedAt: new Date().toISOString(),
  };
}
