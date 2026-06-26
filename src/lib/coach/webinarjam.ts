// WebinarJam / EverWebinar reader for the coach's coach dashboard. Self-contained: it pulls
// registrants live and aggregates per-webinar engagement (registrations, attendance,
// watch time). Gated to the coach's workspace upstream in page.tsx.
//
// Two things worth knowing:
//   1. api.webinarjam.com sits behind Cloudflare's Browser Integrity Check and 403s a
//      default server User-Agent (error 1010). We send a browser UA so Node fetch gets
//      through — verified against the live account.
//   2. Sales and traffic-source live elsewhere for the coach (FanBasis revenue / GA4 traffic):
//      he doesn't use WebinarJam's buy button and doesn't pass UTMs to it, so this tab is
//      deliberately registrations + attendance + watch-time only (no double-counting).

import { createClient } from "@/lib/supabase/server";

export type WjProduct = "webinarjam" | "everwebinar";

const WJ_BASE = "https://api.webinarjam.com";
const WJ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE_CAP = 80; // safety stop (~2000 registrants/webinar) so a runaway never hangs the page
const CACHE_TTL_MS = 30 * 60 * 1000;

// Minute each webinar's offer/pitch lands, so the tab can show "still in the room at the pitch".
// Pitch timing is a content decision (not in the registrant data), so it's configured here —
// a one-line edit sets a webinar's real pitch minute (e.g. Membership once it has run live).
const PITCH_MINUTES: Record<number, number> = {
  2: 56,  // your agency Live Masterclass
  17: 56, // your agency evergreen (same deck)
};
const DEFAULT_PITCH_MIN = 45;
const pitchMinFor = (webinarId: number): number => PITCH_MINUTES[webinarId] ?? DEFAULT_PITCH_MIN;

/** the coach-only: enabled when the WJ key is configured and this is the target workspace.
 *  Reuses FANBASIS_TARGET_AGENCY_ID (already set for the coach) unless a WJ-specific id is given. */
export function webinarjamEnabledFor(agencyId: string | null | undefined): boolean {
  const target = process.env.WEBINARJAM_TARGET_AGENCY_ID || process.env.FANBASIS_TARGET_AGENCY_ID;
  return !!process.env.WEBINARJAM_API_KEY && !!agencyId && agencyId === target;
}

function wjKey(): string {
  const k = process.env.WEBINARJAM_API_KEY?.trim();
  if (!k) throw new Error("WEBINARJAM_API_KEY not set");
  return k;
}

async function wjPost(product: WjProduct, path: string, fields: Record<string, string | number>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ api_key: wjKey() });
  for (const [k, v] of Object.entries(fields)) body.set(k, String(v));
  const res = await fetch(`${WJ_BASE}/${product}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": WJ_UA, Accept: "application/json" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WebinarJam ${product}/${path} -> HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export interface WjWebinar { id: number; name: string; product: WjProduct }

export interface WjSnapshot {
  product: WjProduct;
  webinarId: number;
  name: string;
  eventId: number;
  eventDate: string;       // human run date, e.g. "Wed, 3 Jun 2026, 07:00 PM"
  eventTs: number;         // sortable YYYYMMDDhhmm (0 if unparseable)
  registrations: number;
  attendedLive: number;
  showRate: number;        // 0..1 of registrants who attended live
  attendedReplay: number;
  replayRate: number;      // 0..1
  avgWatchSec: number;     // mean live watch time among live attendees
  medianWatchSec: number;
  pitchMin: number;        // configured minute the coach makes the offer (~56)
  attendedAtPitch: number; // live attendees still watching at the pitch minute
  watchBuckets: { label: string; sessions: number }[]; // live drop-off distribution (BarList-shaped)
  retention: { label: string; sessions: number }[];    // still watching at >=15/30/45/60 min (live)
  regByDay: { date: string; sessions: number }[];       // registrations over time (Sparkline-shaped)
  inWebinarRevenue: number; // WJ-tracked only (0 for the coach); shown only when > 0
  buyers: number;
  fetchedAt: string;
}

interface RawRegistrant {
  attended_live?: string;
  attended_replay?: string;
  time_live?: string;
  purchased_live?: string;
  purchased_replay?: string;
  revenue_live?: number | string;
  revenue_replay?: number | string;
  signup_date?: string;
  event?: string;       // run date string, e.g. "Wed, 3 Jun 2026, 07:00 PM"
  event_id?: number | string;
  schedule?: string;
  schedule_id?: number | string;
}

function hmsToSec(hms: unknown): number {
  const parts = String(hms ?? "").split(":");
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts.map((x) => parseInt(x, 10));
  if ([h, m, s].some((n) => Number.isNaN(n))) return 0;
  return h * 3600 + m * 60 + s;
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};
// signup_date looks like "Mon, 22 Jun 2026, 09:30 PM" -> "2026-06-22"
function signupDay(s: unknown): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/.exec(String(s ?? ""));
  if (!m) return null;
  const [, day, mon, year] = m;
  if (!day || !mon || !year) return null;
  const mm = MONTHS[mon];
  if (!mm) return null;
  return `${year}-${mm}-${day.padStart(2, "0")}`;
}

// event date like "Wed, 3 Jun 2026, 07:00 PM" -> sortable integer YYYYMMDDhhmm (0 if unparseable)
function eventTsOf(s: unknown): number {
  const m = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/.exec(String(s ?? ""));
  if (!m) return 0;
  const [, day, mon, year, hh, mm, ap] = m;
  const mi = mon ? MONTHS[mon] : undefined;
  if (!day || !mi || !year) return 0;
  let h = hh ? parseInt(hh, 10) : 0;
  if (ap) { const up = ap.toUpperCase(); if (up === "PM" && h < 12) h += 12; if (up === "AM" && h === 12) h = 0; }
  return parseInt(year, 10) * 1e8 + parseInt(mi, 10) * 1e6 + parseInt(day, 10) * 1e4 + h * 100 + (mm ? parseInt(mm, 10) : 0);
}

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

export async function fetchWebinarjamWebinars(product: WjProduct): Promise<WjWebinar[]> {
  const j = await wjPost(product, "webinars", {});
  const arr = (j.webinar ?? j.webinars ?? []) as Array<Record<string, unknown>>;
  return arr
    .map((w) => ({ id: Number(w.webinar_id ?? w.id ?? 0), name: String(w.name ?? "").trim(), product }))
    .filter((w) => w.id > 0);
}

function extractRows(j: Record<string, unknown>): { rows: RawRegistrant[]; total: number; lastPage: number } {
  const block = (j.registrants ?? {}) as Record<string, unknown>;
  const rows = (block.data ?? []) as RawRegistrant[];
  return { rows, total: Number(block.total ?? rows.length), lastPage: Number(block.last_page ?? 1) };
}

type WjMetrics = Omit<WjSnapshot, "product" | "webinarId" | "name" | "eventId" | "eventDate" | "eventTs" | "fetchedAt" | "pitchMin">;

function aggregateRows(rows: RawRegistrant[], pitchMin: number): WjMetrics {
  const yes = (v: unknown) => String(v ?? "").toLowerCase() === "yes";
  const live = rows.filter((r) => yes(r.attended_live));
  const replay = rows.filter((r) => yes(r.attended_replay));
  // Watch time over the SAME population the show rate counts — every attended_live person,
  // time_live as-is (including 0:00 quick-bouncers). Averaging over a filtered subset would
  // make "avg watch time" describe a different denominator than "attended live", which misleads.
  const liveSecs = live.map((r) => hmsToSec(r.time_live));
  const avg = liveSecs.length ? liveSecs.reduce((a, b) => a + b, 0) / liveSecs.length : 0;
  const sorted = [...liveSecs].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] ?? 0 : 0;

  // watch-time drop-off buckets (minutes) among live attendees
  const bucketDefs: Array<[string, (min: number) => boolean]> = [
    ["0-5 min", (m) => m < 5],
    ["5-15 min", (m) => m >= 5 && m < 15],
    ["15-30 min", (m) => m >= 15 && m < 30],
    ["30-45 min", (m) => m >= 30 && m < 45],
    ["45-60 min", (m) => m >= 45 && m < 60],
    ["60+ min", (m) => m >= 60],
  ];
  const watchBuckets = bucketDefs
    .map(([label, test]) => ({ label, sessions: liveSecs.filter((s) => test(s / 60)).length }))
    .filter((b) => b.sessions > 0);

  // "Still in the room at N minutes": survival curve that directly shows how many made the pitch.
  const retention = ([15, 30, 45, 60] as const)
    .map((min) => ({ label: `${min} min`, sessions: liveSecs.filter((s) => s >= min * 60).length }))
    .filter((r) => r.sessions > 0);
  // How many live attendees were still watching when the coach made the offer.
  const attendedAtPitch = liveSecs.filter((s) => s >= pitchMin * 60).length;

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = signupDay(r.signup_date);
    if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const regByDay = Array.from(byDay.entries())
    .map(([date, sessions]) => ({ date, sessions }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const inWebinarRevenue = rows.reduce((s, r) => s + Number(r.revenue_live ?? 0) + Number(r.revenue_replay ?? 0), 0);
  const buyers = rows.filter((r) => yes(r.purchased_live) || yes(r.purchased_replay)).length;
  const registrations = rows.length;

  return {
    registrations,
    attendedLive: live.length,
    showRate: registrations ? live.length / registrations : 0,
    attendedReplay: replay.length,
    replayRate: registrations ? replay.length / registrations : 0,
    avgWatchSec: avg,
    medianWatchSec: median,
    attendedAtPitch,
    watchBuckets,
    retention,
    regByDay,
    inWebinarRevenue,
    buyers,
  };
}

// Fetch every registrant for a webinar and split them into one snapshot PER RUN (event date),
// since a single WebinarJam webinar can be run on many dates (e.g. the coach tenant's masterclass).
export async function fetchWebinarjamEvents(product: WjProduct, webinarId: number, name: string): Promise<WjSnapshot[]> {
  const first = extractRows(await wjPost(product, "registrants", { webinar_id: webinarId, page: 1 }));
  let rows: RawRegistrant[] = [...first.rows];
  const lastPage = Math.min(first.lastPage, PAGE_CAP);
  if (lastPage > 1) {
    const tasks: Array<() => Promise<RawRegistrant[]>> = [];
    for (let p = 2; p <= lastPage; p++) {
      const page = p;
      tasks.push(async () => extractRows(await wjPost(product, "registrants", { webinar_id: webinarId, page })).rows);
    }
    for (const more of await pool(tasks, 6, () => [] as RawRegistrant[])) rows = rows.concat(more);
  }

  // group registrants by the run they belong to (event_id, falling back to schedule_id)
  const groups = new Map<string, RawRegistrant[]>();
  for (const r of rows) {
    const key = String(r.event_id ?? r.schedule_id ?? "0");
    const g = groups.get(key);
    if (g) g.push(r); else groups.set(key, [r]);
  }

  const fetchedAt = new Date().toISOString();
  const pitchMin = pitchMinFor(webinarId);
  const out: WjSnapshot[] = [];
  for (const [key, grp] of groups) {
    const eventDate = String(grp[0]?.event ?? grp[0]?.schedule ?? "");
    out.push({
      product, webinarId, name,
      eventId: Number(key) || 0,
      eventDate,
      eventTs: eventTsOf(eventDate),
      pitchMin,
      ...aggregateRows(grp, pitchMin),
      fetchedAt,
    });
  }
  return out;
}

async function buildSnapshots(): Promise<WjSnapshot[]> {
  const out: WjSnapshot[] = [];
  for (const product of ["webinarjam", "everwebinar"] as WjProduct[]) {
    let list: WjWebinar[] = [];
    try { list = await fetchWebinarjamWebinars(product); } catch { continue; }
    for (const w of list) {
      if (/webinarjam example/i.test(w.name)) continue; // default sample webinar
      try {
        const events = await fetchWebinarjamEvents(product, w.id, w.name);
        for (const e of events) if (e.registrations > 0) out.push(e);
      } catch { /* skip this webinar, keep the rest */ }
    }
  }
  return out.sort((a, b) => b.eventTs - a.eventTs); // newest run first
}

// Module-level TTL cache (mirrors the GA4 client singleton pattern) so the ~40 registrant
// calls don't re-run on every dashboard load — only on a cold instance or after 30 min.
let _cache: { at: number; data: WjSnapshot[] } | null = null;
export async function loadWebinarjamSnapshots(): Promise<WjSnapshot[]> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.data;
  const data = await buildSnapshots();
  _cache = { at: Date.now(), data };
  return data;
}

// ---- Email / SMS notification stats (WebinarJam's own sender) ----
// Pulled from WebinarJam's internal dashboard API by a scheduled scraper and stored in
// agency_settings.data.coach.webinarjam_notifications (the public API has none). Matched to each
// run by DATE, not id — a webinar's event_id and schedule_id can differ (e.g. webinar 18).
export interface WjNotif { subject: string; time: string | null; sent: number; open: number; click: number; }
export interface WjRunNotifs { email: WjNotif[]; sms: WjNotif[]; }

interface StoredSchedule { label?: string; email?: WjNotif[]; sms?: WjNotif[] }
interface StoredBlob { synced_at?: string; webinars?: Record<string, { perSchedule?: Record<string, StoredSchedule> }> }

export interface WjNotifications {
  syncedAt: string | null;
  /** notifications for a given webinar run, matched by run-date timestamp (eventTsOf). */
  forRun(webinarId: number, eventTs: number): WjRunNotifs | null;
}

export async function loadWebinarjamNotifications(agencyId: string): Promise<WjNotifications> {
  let blob: StoredBlob | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("agency_settings").select("data").eq("agency_id", agencyId).maybeSingle();
    blob = (((data?.data ?? {}) as { coach?: { webinarjam_notifications?: StoredBlob } }).coach?.webinarjam_notifications) ?? null;
  } catch { blob = null; }
  return {
    syncedAt: blob?.synced_at ?? null,
    forRun(webinarId, eventTs) {
      const per = blob?.webinars?.[String(webinarId)]?.perSchedule;
      if (!per) return null;
      for (const s of Object.values(per)) {
        if (eventTsOf(s.label) === eventTs) return { email: s.email ?? [], sms: s.sms ?? [] };
      }
      return null;
    },
  };
}
