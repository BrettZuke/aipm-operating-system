// Date range model for the creator dashboard.
// Lives in URL search params so links are shareable / refresh-stable.

export type RangePreset =
  | "today"
  | "yesterday"
  | "7d"
  | "28d"
  | "30d"
  | "90d"
  | "12m"
  | "mtd"
  | "lastmonth"
  | "ytd"
  | "custom";

export interface DateRange {
  preset: RangePreset;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function presetToFromTo(preset: RangePreset): { from: string; to: string } | null {
  const today = todayUtc();
  switch (preset) {
    case "today":
      return { from: isoDateUtc(today), to: isoDateUtc(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: isoDateUtc(y), to: isoDateUtc(y) };
    }
    case "7d":
      return { from: isoDateUtc(addDays(today, -6)), to: isoDateUtc(today) };
    case "28d":
      return { from: isoDateUtc(addDays(today, -27)), to: isoDateUtc(today) };
    case "30d":
      return { from: isoDateUtc(addDays(today, -29)), to: isoDateUtc(today) };
    case "90d":
      return { from: isoDateUtc(addDays(today, -89)), to: isoDateUtc(today) };
    case "12m":
      return { from: isoDateUtc(addDays(today, -364)), to: isoDateUtc(today) };
    case "mtd": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { from: isoDateUtc(start), to: isoDateUtc(today) };
    }
    case "lastmonth": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { from: isoDateUtc(start), to: isoDateUtc(end) };
    }
    case "ytd": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      return { from: isoDateUtc(start), to: isoDateUtc(today) };
    }
    default:
      return null;
  }
}

function priorWindow(from: string, to: string): { prevFrom: string; prevTo: string } {
  const fromD = new Date(from + "T00:00:00Z");
  const toD = new Date(to + "T00:00:00Z");
  const days = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1;
  const prevTo = addDays(fromD, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { prevFrom: isoDateUtc(prevFrom), prevTo: isoDateUtc(prevTo) };
}

// A YYYY-MM-DD string that also passes the regex can still be a non-date (e.g. 2024-99-99),
// which becomes an Invalid Date downstream and throws in toISOString(). Confirm it round-trips.
function isRealIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseRange(searchParams: { [k: string]: string | string[] | undefined }): DateRange {
  const presetParam = (typeof searchParams.range === "string" ? searchParams.range : "7d") as RangePreset;
  const fromParam = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const toParam = typeof searchParams.to === "string" ? searchParams.to : undefined;

  let preset: RangePreset = presetParam;
  let from: string;
  let to: string;

  if (fromParam && toParam && isRealIsoDate(fromParam) && isRealIsoDate(toParam)) {
    preset = "custom";
    // Guard against an inverted range (from > to), which would yield a negative-length window
    // and nonsensical prior-period math. ISO YYYY-MM-DD sorts lexically, so swap on string compare.
    from = fromParam <= toParam ? fromParam : toParam;
    to = fromParam <= toParam ? toParam : fromParam;
  } else {
    const known = presetToFromTo(presetParam) ?? presetToFromTo("7d")!;
    if (!presetToFromTo(presetParam)) preset = "7d";
    from = known.from;
    to = known.to;
  }

  const { prevFrom, prevTo } = priorWindow(from, to);
  return { preset, from, to, prevFrom, prevTo };
}

export function labelForRange(r: DateRange): string {
  const map: Record<RangePreset, string> = {
    today: "Today",
    yesterday: "Yesterday",
    "7d": "Last 7 days",
    "28d": "Last 28 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    "12m": "Last 12 months",
    mtd: "Month to date",
    lastmonth: "Last month",
    ytd: "Year to date",
    custom: `${r.from} → ${r.to}`,
  };
  return map[r.preset];
}

export const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "28d", label: "Last 28 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "mtd", label: "Month to date" },
  { value: "lastmonth", label: "Last month" },
  { value: "ytd", label: "Year to date" },
  { value: "custom", label: "Custom" },
];

export function computeDelta(
  current: number,
  prior: number,
): { value: number | null; direction: "up" | "down" | "flat" } {
  if (!Number.isFinite(prior) || prior === 0) {
    if (!Number.isFinite(current) || current === 0) return { value: 0, direction: "flat" };
    return { value: null, direction: "up" };
  }
  const delta = (current - prior) / prior;
  if (Math.abs(delta) < 0.001) return { value: 0, direction: "flat" };
  return { value: delta, direction: delta > 0 ? "up" : "down" };
}
