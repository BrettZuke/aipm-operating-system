// The daily caps, kept in a ledger nobody signed in can touch.
//
// Every action that costs money or uses a free allowance reserves one row in research_usage BEFORE
// it spends anything. The reservation is made by a database function that counts and writes inside
// one lock, so two clicks a moment apart cannot both pass the same cap, and only the server may
// call it, so deleting a row does not give an allowance back. Days start at midnight UTC, except
// the YouTube search allowance every workspace shares, which resets at midnight Pacific because
// that is when YouTube resets it.
//
// A reservation is never given back, not when the work fails and not when a later step refuses it.
// By then the provider's own allowance was usually spent too, and a refund would be a way to reset
// a cap by making something fail on purpose.

import type { SupabaseClient } from "@supabase/supabase-js";
import { pacificDayStart, YOUTUBE_SEARCHES_PER_DAY } from "./search";

/** Caps per workspace per day. Set for one student running one or two clients, not an agency. */
export const DAILY_LIMITS = {
  manualScans: 6,
  onboards: 20,
  youtubeRefreshes: 40,
  breakdowns: 30,
  adaptations: 30,
  scripts: 15,
  draftUploads: 30,
  draftScores: 25,
  searches: 20,
} as const;
export type LimitKey = keyof typeof DAILY_LIMITS;

/** The research_usage kind each cap reserves. The table's own rule lists the same kinds. */
export const USAGE_KIND: Record<LimitKey, string> = {
  manualScans: "manual_scan",
  onboards: "onboard",
  youtubeRefreshes: "youtube_refresh",
  breakdowns: "breakdown",
  adaptations: "adaptation",
  scripts: "script",
  draftUploads: "draft_upload",
  draftScores: "draft_score",
  searches: "search",
};

/** The kind the shared YouTube search guard reserves, across every workspace on this dashboard. */
export const SHARED_YOUTUBE_SEARCH_KIND = "youtube_search";
export const SHARED_YOUTUBE_SEARCH_MESSAGE =
  "YouTube search has reached its shared limit for today. It resets at midnight Pacific time.";

const LIMIT_LABEL: Record<LimitKey, string> = {
  manualScans: "scans",
  onboards: "new creator reads",
  youtubeRefreshes: "YouTube channel reads",
  breakdowns: "video breakdowns",
  adaptations: "Make it yours runs",
  scripts: "scripts",
  draftUploads: "draft video uploads",
  draftScores: "draft scores",
  searches: "creator searches",
};

export type LimitDecision = { ok: true } | { ok: false; error: string };

/** Midnight UTC at the start of the day `now` falls in. */
export function utcDayStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function limitMessage(key: LimitKey, cap: number = DAILY_LIMITS[key]): string {
  return `You have used all ${cap} ${LIMIT_LABEL[key]} for today. They reset at midnight UTC.`;
}

/** Pure: whether one more fits under the cap, given how many were used. */
export function limitDecision(key: LimitKey, used: number, cap: number = DAILY_LIMITS[key]): LimitDecision {
  return used < cap ? { ok: true } : { ok: false, error: limitMessage(key, cap) };
}

async function reserveRow(
  sb: SupabaseClient,
  fn: "research_reserve" | "research_reserve_global",
  args: Record<string, unknown>,
  what: string,
): Promise<boolean> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`Reserving ${what} failed: ${error.message}`);
  // Fail closed: only a plain true lets work spend. Anything else is an error, never a yes.
  if (typeof data !== "boolean") throw new Error(`Reserving ${what} answered ${JSON.stringify(data)} instead of true or false`);
  return data;
}

/** Reserve one of today's allowance for this workspace, right before the work spends. Refused with
    a message naming the cap and when it resets. Throws when nothing came back, so nothing ever
    spends on an unknown. `now` and `cap` are for tests; callers leave them alone. */
export async function reserveLimit(
  sb: SupabaseClient,
  agencyId: string,
  key: LimitKey,
  ref: string | null,
  opts: { now?: Date; cap?: number } = {},
): Promise<LimitDecision> {
  const cap = opts.cap ?? DAILY_LIMITS[key];
  const granted = await reserveRow(
    sb,
    "research_reserve",
    { p_agency: agencyId, p_kind: USAGE_KIND[key], p_cap: cap, p_since: utcDayStart(opts.now), p_ref: ref },
    `one of today's ${LIMIT_LABEL[key]}`,
  );
  return granted ? { ok: true } : { ok: false, error: limitMessage(key, cap) };
}

/** How many of `key` this workspace has reserved today. A read for showing and for pre-checks: on
    its own it never lets work run, only reserveLimit does that. */
export async function usedToday(sb: SupabaseClient, agencyId: string, key: LimitKey, now: Date = new Date()): Promise<number> {
  const { count, error } = await sb
    .from("research_usage")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("kind", USAGE_KIND[key])
    .gte("created_at", utcDayStart(now))
    .lte("created_at", now.toISOString());
  if (error) throw new Error(`Counting today's ${LIMIT_LABEL[key]} failed: ${error.message}`);
  return count ?? 0;
}

/** Reserve several caps for one piece of work, such as a script that has to break its video down
    first. With more than one, every cap is read first so a full one refuses before anything is
    reserved; then they are reserved in order and the first refusal stops the rest. */
export async function reserveLimits(sb: SupabaseClient, agencyId: string, keys: LimitKey[], ref: string | null, now: Date = new Date()): Promise<LimitDecision> {
  if (keys.length > 1) {
    for (const key of keys) {
      const decision = limitDecision(key, await usedToday(sb, agencyId, key, now));
      if (!decision.ok) return decision;
    }
  }
  for (const key of keys) {
    const decision = await reserveLimit(sb, agencyId, key, ref, { now });
    if (!decision.ok) return decision;
  }
  return { ok: true };
}

/** reserveLimits in the shape the modules call right before they spend: null when it is reserved,
    the refusal in words when it is not. */
export async function reserveOrRefuse(sb: SupabaseClient, agencyId: string, keys: LimitKey[], ref: string | null): Promise<string | null> {
  const decision = await reserveLimits(sb, agencyId, keys, ref);
  return decision.ok ? null : decision.error;
}

/** Reserve one of the YouTube searches every workspace on this dashboard shares. The key allows a
    hundred a day, the guard stops short of that, and the count starts at midnight Pacific. */
export async function reserveSharedYoutubeSearch(sb: SupabaseClient, agencyId: string, query: string, now: Date = new Date()): Promise<LimitDecision> {
  const granted = await reserveRow(
    sb,
    "research_reserve_global",
    { p_agency: agencyId, p_kind: SHARED_YOUTUBE_SEARCH_KIND, p_cap: YOUTUBE_SEARCHES_PER_DAY, p_since: pacificDayStart(now), p_ref: query },
    "a shared YouTube search",
  );
  return granted ? { ok: true } : { ok: false, error: SHARED_YOUTUBE_SEARCH_MESSAGE };
}

export interface LimitUse {
  key: LimitKey;
  label: string;
  used: number;
  cap: number;
}

/** What is left of today's allowances, for the line under the Scan now button. */
export async function limitsUsedToday(sb: SupabaseClient, agencyId: string, keys: LimitKey[], now: Date = new Date()): Promise<LimitUse[]> {
  const out: LimitUse[] = [];
  for (const key of keys) {
    out.push({ key, label: LIMIT_LABEL[key], used: await usedToday(sb, agencyId, key, now), cap: DAILY_LIMITS[key] });
  }
  return out;
}
