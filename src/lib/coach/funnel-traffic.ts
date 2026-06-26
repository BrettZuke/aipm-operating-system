// Coach-tenant traffic reader (the coach). Self-contained on purpose: it does NOT touch
// src/lib/creator/ga4.ts so the creator's reader stays byte-for-byte unchanged. Every metric
// is scoped to the selected funnel/page's pagePaths, and we compute a per-step funnel
// (sessions + unique users per page, in order) so drop-off is visible across the funnel.

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { createClient } from "@/lib/supabase/server";
import type { DateRange } from "@/lib/creator/range";
import { makeTtlCache } from "@/lib/creator/snapshot-cache";

export interface TopRow { label: string; sessions: number }
export interface SessionsByDay { date: string; sessions: number }

// ---- Funnel config (as stored in agency_settings.data.coach) ----
export interface RawFunnelStep { label: string; path?: string; offsite?: string }
export interface RawFunnel { key: string; name: string; kind: "funnel" | "pages"; steps: RawFunnelStep[] }

export interface CoachConfig {
  ga4PropertyId: string | null;
  funnels: RawFunnel[];
}

export async function loadCoachConfig(agencyId: string): Promise<CoachConfig> {
  const supabase = await createClient();
  const { data } = await supabase.from("agency_settings").select("data").eq("agency_id", agencyId).maybeSingle();
  const coach = ((data?.data ?? {}) as { coach?: { ga4_property_id?: string; funnels?: RawFunnel[] } }).coach ?? {};
  return {
    ga4PropertyId: coach.ga4_property_id ?? null,
    funnels: Array.isArray(coach.funnels) ? coach.funnels : [],
  };
}

// ---- GA4 client (own instance; stateless, property id supplied per call) ----
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

type Filter = { fieldName: string; inListFilter: { values: string[] } };

interface ReportArgs {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  metrics: string[];
  limit?: number;
  pathScope?: string[]; // inList of pagePaths; undefined = whole site
}

async function runReport(propertyId: string, a: ReportArgs) {
  const filter: Filter | null = a.pathScope?.length
    ? { fieldName: "pagePath", inListFilter: { values: a.pathScope } }
    : null;
  const [resp] = await getClient().runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: a.startDate, endDate: a.endDate }],
    dimensions: (a.dimensions ?? []).map((name) => ({ name })),
    metrics: a.metrics.map((name) => ({ name })),
    limit: a.limit ? String(a.limit) : undefined,
    ...(filter ? { dimensionFilter: { filter } } : {}),
  });
  return resp;
}
type Resp = Awaited<ReturnType<typeof runReport>>;

async function pool<T>(tasks: Array<() => Promise<T>>, limit: number, onError: () => T): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try { out[i] = await tasks[i](); } catch { out[i] = onError(); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return out;
}

const int = (r: Resp) => Number(r.rows?.[0]?.metricValues?.[0]?.value ?? 0);
const rows = (r: Resp): TopRow[] =>
  (r.rows ?? []).map((x) => ({ label: String(x.dimensionValues?.[0]?.value ?? ""), sessions: Number(x.metricValues?.[0]?.value ?? 0) }));
const eventCount = (r: Resp, name: string) =>
  Number((r.rows ?? []).find((x) => x.dimensionValues?.[0]?.value === name)?.metricValues?.[0]?.value ?? 0);

function cleanSource(raw: string): string {
  const s = (raw || "").toLowerCase().trim();
  if (s.includes("instagram") || s === "ig") return "Instagram";
  if (s.includes("facebook") || s === "fb" || s === "m.facebook.com") return "Facebook";
  if (s.includes("youtube") || s === "yt") return "YouTube";
  if (s.includes("tiktok")) return "TikTok";
  if (s.includes("google")) return "Google";
  if (s.includes("t.co") || s.includes("twitter") || s === "x.com") return "X / Twitter";
  if (s.includes("gmail") || s.includes("outlook") || s.includes("mail.") || s.includes("kit.com")) return "Email";
  if (s === "" || s === "(direct)" || s === "(not set)" || s === "(none)" || s === "direct") return "Direct";
  return raw;
}
function mergeSources(input: TopRow[]): TopRow[] {
  const m = new Map<string, number>();
  for (const r of input) m.set(cleanSource(r.label), (m.get(cleanSource(r.label)) ?? 0) + r.sessions);
  return Array.from(m.entries()).map(([label, sessions]) => ({ label, sessions })).sort((a, b) => b.sessions - a.sessions);
}

// pagePath in GA4 may or may not carry a trailing slash; match both, compare normalized.
const variants = (p: string) => (p === "/" ? [p] : [p, p + "/"]);
const normPath = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

export interface DanStepMetric {
  label: string;
  path: string | null;
  offsite: string | null;
  sessions: number;
  users: number;
}

export interface DanTraffic {
  sessions: number;
  sessionsPrior: number;
  visitors: number;
  visitorsPrior: number;
  avgEngagementSec: number;
  beginCheckout: number;
  beginCheckoutPrior: number;
  generateLead: number;
  generateLeadPrior: number;
  trend: SessionsByDay[];
  sources: TopRow[];
  utmSources: TopRow[];
  utmCampaigns: TopRow[];
  utmContents: TopRow[]; // visitors per utm_content (the individual piece: email/video/reel)
  devices: TopRow[];
  countries: TopRow[];
  topPaths: TopRow[];
  steps: DanStepMetric[]; // per-step funnel (empty for "All")
  // Scroll-depth "how far down the page people get" — same 6 section events the page fires
  // (section_hero … section_final_cta), scoped to the selected funnel's pages.
  sectionFunnel: TopRow[];
  fetchedAt: string;
}

interface FetchArgs {
  propertyId: string;
  range: DateRange;
  /** On-domain pagePaths to scope every metric to. undefined/empty = whole site ("All"). */
  scopePaths?: string[];
  /** Ordered steps for the per-step funnel breakdown. */
  steps?: RawFunnelStep[];
}

const _danTrafficCache = makeTtlCache<DanTraffic>(5 * 60 * 1000);

// Cached entry point (see snapshot-cache.ts): the coach's Analytics tab renders on every dashboard load,
// so cache the GA4 fan-out per (property, range, scope, steps) for 5 min — the main lag fix.
export function fetchDanTraffic(args: FetchArgs): Promise<DanTraffic> {
  const { propertyId, range, scopePaths, steps } = args;
  const k = JSON.stringify([propertyId, range.from, range.to, range.prevFrom, range.prevTo, scopePaths ?? [], steps ?? []]);
  return _danTrafficCache.get(k, () => computeDanTraffic(args));
}

async function computeDanTraffic({ propertyId, range, scopePaths, steps = [] }: FetchArgs): Promise<DanTraffic> {
  const scope = scopePaths?.length ? scopePaths.flatMap(variants) : undefined;
  const onDomainSteps = steps.filter((s) => s.path && !s.offsite);
  const stepScope = onDomainSteps.length ? onDomainSteps.flatMap((s) => variants(s.path!)) : undefined;
  const empty = () => Promise.resolve({ rows: [] } as unknown as Resp);

  const [sess, sessPrior, visR, visPriorR, trendR, srcR, campR, devR, ctyR, engR, eventsR, eventsPriorR, pathsR, stepRowsR, contentR] = await pool(
    [
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["sessions"], pathScope: scope }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, metrics: ["sessions"], pathScope: scope }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["totalUsers"], pathScope: scope }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, metrics: ["totalUsers"], pathScope: scope }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["date"], metrics: ["sessions"], pathScope: scope }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["sessionSource"], metrics: ["sessions"], limit: 15, pathScope: scope }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["sessionCampaignName"], metrics: ["sessions"], limit: 15, pathScope: scope }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["deviceCategory"], metrics: ["sessions"], limit: 5, pathScope: scope }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["country"], metrics: ["sessions"], limit: 10, pathScope: scope }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, metrics: ["averageSessionDuration"], pathScope: scope }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["eventName"], metrics: ["eventCount"], limit: 200, pathScope: scope }),
      () => runReport(propertyId, { startDate: range.prevFrom, endDate: range.prevTo, dimensions: ["eventName"], metrics: ["eventCount"], limit: 200, pathScope: scope }),
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["pagePath"], metrics: ["sessions"], limit: 10, pathScope: scope }),
      () => (stepScope ? runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["pagePath"], metrics: ["sessions", "totalUsers"], limit: 100, pathScope: stepScope }) : empty()),
      // utm_content = the individual piece (a specific email / video / reel) for the content leaderboard.
      () => runReport(propertyId, { startDate: range.from, endDate: range.to, dimensions: ["sessionManualAdContent"], metrics: ["sessions"], limit: 50, pathScope: scope }),
    ],
    4,
    () => ({ rows: [] }) as unknown as Resp,
  );

  // map step page metrics back to the ordered steps
  const byPath = new Map<string, { sessions: number; users: number }>();
  for (const r of stepRowsR.rows ?? []) {
    const p = normPath(String(r.dimensionValues?.[0]?.value ?? ""));
    byPath.set(p, {
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
      users: Number(r.metricValues?.[1]?.value ?? 0),
    });
  }
  const stepMetrics: DanStepMetric[] = steps.map((s) => {
    const hit = s.path ? byPath.get(normPath(s.path)) : undefined;
    return {
      label: s.label,
      path: s.path ?? null,
      offsite: s.offsite ?? null,
      sessions: hit?.sessions ?? 0,
      users: hit?.users ?? 0,
    };
  });

  const trend: SessionsByDay[] = (trendR.rows ?? [])
    .map((r) => ({ date: String(r.dimensionValues?.[0]?.value ?? ""), sessions: Number(r.metricValues?.[0]?.value ?? 0) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    sessions: int(sess),
    sessionsPrior: int(sessPrior),
    visitors: int(visR),
    visitorsPrior: int(visPriorR),
    avgEngagementSec: int(engR),
    beginCheckout: eventCount(eventsR, "begin_checkout"),
    beginCheckoutPrior: eventCount(eventsPriorR, "begin_checkout"),
    generateLead: eventCount(eventsR, "generate_lead"),
    generateLeadPrior: eventCount(eventsPriorR, "generate_lead"),
    trend,
    sources: mergeSources(rows(srcR)),
    utmSources: mergeSources(rows(srcR)),
    utmCampaigns: rows(campR),
    utmContents: rows(contentR),
    devices: rows(devR),
    countries: rows(ctyR),
    topPaths: rows(pathsR),
    steps: stepMetrics,
    // dbz-insights.js fires these on every the coach page; scoped here to the selected funnel's pages.
    sectionFunnel: [
      { label: "Hero (top)", sessions: eventCount(eventsR, "section_hero") },
      { label: "Who it's for", sessions: eventCount(eventsR, "section_who_its_for") },
      { label: "The offer", sessions: eventCount(eventsR, "section_offer") },
      { label: "Pricing", sessions: eventCount(eventsR, "section_pricing") },
      { label: "Proof / members", sessions: eventCount(eventsR, "section_proof") },
      { label: "Final CTA", sessions: eventCount(eventsR, "section_final_cta") },
    ],
    fetchedAt: new Date().toISOString(),
  };
}
