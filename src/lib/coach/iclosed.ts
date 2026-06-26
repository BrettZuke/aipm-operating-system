// iClosed booking reader for the coach's coach dashboard. iClosed is the coach's call scheduler; this pulls
// PAST event calls straight from the iClosed public API so the dashboard shows real booking and
// close data (booked / cancelled / held / won) without needing a webhook wired up.
//
// Two deliberate choices:
//   1. Revenue stays on FanBasis (the source of truth). We do NOT sum iClosed deal amounts here,
//      so booked calls are never double-counted as sales.
//   2. Gated to the coach's workspace (his key is ICLOSED_API_KEY) + the FanBasis target agency.
//
// API shape (verified live 2026-06-24):
//   Base   https://public.api.iclosed.io/v1   Auth header  Authorization: Bearer iclosed_<key>
//   GET /eventCalls?eventType=PAST&limit=100&page=N  -> { data: { eventCalls: [...], count } }
//   limit caps at 100; page is 0-indexed. Each call: { dateTimeUTC, cancelReason, cancelledBy,
//   task:[{completed,outcome}], deals:[], inviteeName, inviteeEmail, user:{firstName,lastName} }.
//   outcome vocabulary in the coach's account: "WON" (closed), "NO_SALE" (held, no close), null (open).

import type { DateRange } from "@/lib/creator/range";

const BASE = "https://public.api.iclosed.io/v1";

// Vercel prod stores the key as ICLOSED_API_KEY; local tooling uses ICLOSED_API_KEY. Accept
// either so the reader works in both places (both are valid iClosed keys, verified live).
const iclosedKey = (): string | undefined => process.env.ICLOSED_API_KEY || process.env.ICLOSED_API_KEY;

export function iclosedEnabledFor(agencyId: string | null | undefined): boolean {
  return !!iclosedKey() && !!agencyId && agencyId === process.env.FANBASIS_TARGET_AGENCY_ID;
}

interface IcTask { completed?: boolean; outcome?: string | null }
interface IcCall {
  id: number;
  dateTimeUTC?: string | null;
  cancelReason?: string | null;
  cancelledBy?: unknown;
  task?: IcTask[];
  deals?: unknown[];
  inviteeName?: string | null;
  inviteeEmail?: string | null;
  user?: { firstName?: string | null; lastName?: string | null } | null;
}

export interface IclosedRecent { name: string; date: string; outcome: string; closer: string }
export interface IclosedBookings {
  booked: number;        // calls booked in range
  bookedPrior: number;   // same window, prior period (for trend arrows)
  cancelled: number;     // of those, cancelled / rescheduled away
  held: number;          // dispositioned (won + no-sale) = the call actually happened
  won: number;           // closed (outcome WON)
  closeRate: number;     // won / held (0..1)
  byDay: { date: string; sessions: number }[];
  recent: IclosedRecent[];
  totalAllTime: number;  // every PAST call on record (all dates)
  fetchedAt: string;
}

async function icGet(qs: string): Promise<{ eventCalls: IcCall[]; count: number }> {
  const key = iclosedKey();
  if (!key) throw new Error("iClosed API key not set (ICLOSED_API_KEY / ICLOSED_API_KEY)");
  const res = await fetch(`${BASE}/eventCalls?${qs}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    next: { revalidate: 300 }, // bookings change slowly; let Next cache 5 min
  });
  if (!res.ok) throw new Error(`iClosed eventCalls -> HTTP ${res.status}`);
  const j = (await res.json()) as { data?: { eventCalls?: IcCall[]; count?: number } };
  return { eventCalls: j.data?.eventCalls ?? [], count: Number(j.data?.count ?? 0) };
}

let _cache: { at: number; calls: IcCall[] } | null = null;
const TTL = 5 * 60 * 1000;

async function loadPastCalls(): Promise<IcCall[]> {
  if (_cache && Date.now() - _cache.at < TTL) return _cache.calls;
  const calls: IcCall[] = [];
  for (let page = 0; page < 8; page++) {           // page is 0-indexed; limit caps at 100
    const { eventCalls } = await icGet(`eventType=PAST&limit=100&page=${page}`);
    calls.push(...eventCalls);
    if (eventCalls.length < 100) break;            // short page = last page
  }
  _cache = { at: Date.now(), calls };
  return calls;
}

const dayOf = (iso: string | null | undefined): string | null => (iso && iso.length >= 10 ? iso.slice(0, 10) : null);
const inRange = (d: string | null, from: string, to: string): boolean => !!d && d >= from && d <= to;
const isCancelled = (c: IcCall): boolean => !!(c.cancelReason || c.cancelledBy);
const outcomeOf = (c: IcCall): string | null => (c.task ?? []).map((t) => t.outcome).find((o) => o) ?? null;
const closerOf = (c: IcCall): string => [c.user?.firstName, c.user?.lastName].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");

export async function fetchIclosedBookings(range: DateRange): Promise<IclosedBookings> {
  const calls = await loadPastCalls();
  const withDay = calls.map((c) => ({ c, day: dayOf(c.dateTimeUTC) }));
  const cur = withDay.filter((x) => inRange(x.day, range.from, range.to));
  const prior = withDay.filter((x) => inRange(x.day, range.prevFrom, range.prevTo));

  const cancelled = cur.filter((x) => isCancelled(x.c)).length;
  const won = cur.filter((x) => outcomeOf(x.c) === "WON").length;
  const held = cur.filter((x) => { const o = outcomeOf(x.c); return o === "WON" || o === "NO_SALE"; }).length;

  const byDayMap = new Map<string, number>();
  for (const x of cur) if (x.day) byDayMap.set(x.day, (byDayMap.get(x.day) ?? 0) + 1);
  const byDay = Array.from(byDayMap.entries())
    .map(([date, sessions]) => ({ date, sessions }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const recent: IclosedRecent[] = [...cur]
    .sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""))
    .slice(0, 8)
    .map((x) => ({
      name: x.c.inviteeName?.trim() || x.c.inviteeEmail || "Booking",
      date: x.day ?? "",
      outcome: isCancelled(x.c) ? "Cancelled" : outcomeOf(x.c) === "WON" ? "Won" : outcomeOf(x.c) === "NO_SALE" ? "No sale" : "Booked",
      closer: closerOf(x.c) || "the coach Doe",
    }));

  return {
    booked: cur.length,
    bookedPrior: prior.length,
    cancelled,
    held,
    won,
    closeRate: held > 0 ? won / held : 0,
    byDay,
    recent,
    totalAllTime: calls.length,
    fetchedAt: new Date().toISOString(),
  };
}
