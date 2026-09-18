// Which Instagram creators one scan reads and what the run may cost. A roster can grow without limit,
// so a scan reads at most MAX_SCAN_CREATORS, the ones read longest ago first, and no more than fit in
// what is left of the workspace's daily Apify ceiling; the rest wait for a later scan.
//
// The plan only decides how many creators to ask for. The ceiling itself is enforced when the job is
// inserted, by the research_start_job database function under a per-workspace lock, so two starts
// racing each other cannot both fit under it. Both sums read research_jobs, which members cannot
// write, so the spend they see is the spend that happened.

import type { SupabaseClient } from "@supabase/supabase-js";
import { scanChargeCap } from "./apify";
import { utcDayStart } from "./limits";

/** Instagram creators one scan reads at most. */
export const MAX_SCAN_CREATORS = 60;
/** The most one workspace's Instagram reads may be capped at in a UTC day, added up. Two dollars of
    free Apify credit is a lot of posts, and it is the ceiling a student cannot cross by accident. */
export const DAILY_APIFY_CEILING_USD = 2;
/** Jobs read to learn when each creator was last included in one. */
const RECENT_JOBS = 500;

// A job counts toward spend and toward "read recently" when it reached Apify or still may: one that
// failed before its run started cost nothing and read nobody.
const REACHED_APIFY = "status.neq.failed,apify_run_id.not.is.null";

export interface ScanPlan<T> {
  creators: T[];
  /** Creators in scope this scan does not read. */
  left: number;
}

/** When each creator was last included in an Instagram job of this workspace, newest job first. A
    creator in none of the latest RECENT_JOBS jobs is absent, which orders them as never read. */
export async function lastInstagramReads(sb: SupabaseClient, agencyId: string): Promise<Map<string, string>> {
  const { data, error } = await sb
    .from("research_jobs")
    .select("creator_ids,created_at")
    .eq("agency_id", agencyId)
    .or(REACHED_APIFY)
    .order("created_at", { ascending: false })
    .limit(RECENT_JOBS);
  if (error) throw new Error(`Reading earlier scans failed: ${error.message}`);
  const last = new Map<string, string>();
  for (const job of (data ?? []) as { creator_ids: string[] | null; created_at: string }[]) {
    for (const id of job.creator_ids ?? []) if (!last.has(id)) last.set(id, job.created_at);
  }
  return last;
}

/** Pure: creators ordered for a scan, never read first, then the longest ago, ties by name. Uses the
    jobs rather than last_scraped_at, which a YouTube refresh also stamps and which only moves when
    posts came back, so a creator with a busy YouTube channel or an empty Instagram would never rotate. */
export function orderForScan<T extends { id: string; name: string }>(creators: T[], lastRead: Map<string, string>): T[] {
  const at = (c: T) => {
    const iso = lastRead.get(c.id);
    return iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY;
  };
  return [...creators].sort((a, b) => at(a) - at(b) || a.name.localeCompare(b.name));
}

/** Pure: how many of `count` creators a run can read at `resultsLimit` posts each inside `budgetUsd`.
    Compared in whole cents, the unit scanChargeCap rounds to, so float noise cannot refuse a run that
    lands exactly on the ceiling. */
export function creatorsWithinBudget(count: number, resultsLimit: number, budgetUsd: number): number {
  const budgetCents = Math.round(budgetUsd * 100);
  let n = Math.max(0, Math.floor(count));
  while (n > 0 && Math.round(scanChargeCap(n, resultsLimit) * 100) > budgetCents) n--;
  return n;
}

/** Dollars this workspace's Instagram jobs were capped at today (UTC). */
export async function apifySpendToday(sb: SupabaseClient, agencyId: string, now: Date = new Date()): Promise<number> {
  const { data, error } = await sb
    .from("research_jobs")
    .select("max_charge_usd")
    .eq("agency_id", agencyId)
    .gte("created_at", utcDayStart(now))
    .or(REACHED_APIFY);
  if (error) throw new Error(`Reading today's scan spend failed: ${error.message}`);
  const cents = ((data ?? []) as { max_charge_usd: number | string | null }[]).reduce((sum, r) => sum + Math.round(Number(r.max_charge_usd ?? 0) * 100), 0);
  return cents / 100;
}

/** The creators a scan reads: at most MAX_SCAN_CREATORS, longest unread first, then trimmed to what is
    left of today's ceiling. With a fixed charge (a test override) nothing is trimmed and the database
    alone decides whether the charge fits. */
export async function planInstagramScan<T extends { id: string; name: string }>(
  sb: SupabaseClient,
  agencyId: string,
  inScope: T[],
  resultsLimit: number,
  fixedChargeUsd: number | undefined,
): Promise<ScanPlan<T>> {
  const ordered = inScope.length > 1 ? orderForScan(inScope, await lastInstagramReads(sb, agencyId)) : inScope;
  let creators = ordered.slice(0, MAX_SCAN_CREATORS);
  if (fixedChargeUsd === undefined && creators.length > 0) {
    const room = DAILY_APIFY_CEILING_USD - (await apifySpendToday(sb, agencyId));
    creators = creators.slice(0, creatorsWithinBudget(creators.length, resultsLimit, room));
  }
  return { creators, left: inScope.length - creators.length };
}
