// Starting and finishing a scan.
//
// A scan reads every creator you track: their Instagram through one background job at Apify, their
// YouTube through YouTube's own free API at the same time. Instagram runs in the background because
// it takes minutes; the dashboard hears about it either from Apify's own callback or, when there is
// no public address to call back to, from the page checking for itself.
//
// The money rules live here. One scan at a time per workspace. At most three newly tracked creators
// being read at once. At most sixty accounts per scan, inside that workspace's own daily ceiling.
// Every read carries a hard spend cap. The one-time token in the callback address is stored only as
// its fingerprint, so a copy of the database row cannot be used to trigger anything.
//
// The start rules are checked here first, for a quick refusal that costs nothing, and checked again
// by the database when the job row is written, inside a lock, so two starts at once cannot both pass.

import { createHash, randomBytes } from "node:crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeEqual } from "@/lib/safe-equal";
import { getRun, IG_SCRAPER, isTerminalRunStatus, RUN_WEBHOOK_EVENTS, scanChargeCap, startRun } from "./apify";
import { CLAIM_STALE_MS, ingestInstagramJob, refreshYoutube, SCAN_ROLES, type YoutubeRefreshResult } from "./ingest";
import { utcDayStart } from "./limits";
import { normalizeIgHandle, profileUrl } from "./normalize-instagram";
import { DAILY_APIFY_CEILING_USD, planInstagramScan } from "./scan-plan";
import { CREATOR_LITE_COLUMNS, type CreatorLite, type JobPurpose, type JobResult, type JobStatus, type Platform, type ResearchJob, type ScanMode } from "./types";

export const SCAN_SETTINGS: Record<ScanMode, { newerThan: string; resultsLimit: number }> = {
  full: { newerThan: "120 days", resultsLimit: 30 },
  recent: { newerThan: "30 days", resultsLimit: 15 },
};
/** An unfinished scan younger than this still blocks; an older one is treated as stuck. */
export const IN_FLIGHT_MS = 45 * 60_000;
/** Newly tracked creators whose first read may run at once. More wait for the next scan. */
export const MAX_ONBOARDS_IN_FLIGHT = 3;
export const YOUTUBE_BUDGET_MS = 240_000;
const SCAN_TIMEOUT_SECS = 1_200;
const CHECK_EVERY_MS = 60_000;
const START_GRACE_MS = 10 * 60_000;
// Apify keeps a free account's results for seven days; after that a scan can no longer be taken in.
const JOB_MAX_AGE_MS = 7 * 24 * 3_600_000;
const UNFINISHED: JobStatus[] = ["starting", "running", "ingesting"];

export function hashWebhookToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A fresh one-time token for the callback address, and the fingerprint stored in its place. */
export function newWebhookToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashWebhookToken(token) };
}

/** Check a presented token against the stored fingerprint, in constant time. */
export function webhookTokenMatches(token: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!token || !storedHash) return false;
  return safeEqual(hashWebhookToken(token), storedHash);
}

/** Where Apify should call back when a read finishes. Set RESEARCH_PUBLIC_URL to your deployed
    address to use it; without it there is nothing public to call, and the page checks for itself. */
export function webhookBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.RESEARCH_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  // A callback has to be an address Apify can reach, so http on this machine is not one.
  if (url.protocol !== "https:" || /^(localhost|127\.|\[::1\])/i.test(url.hostname)) return null;
  return url.origin;
}

export function webhookUrl(jobId: string, token: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const base = webhookBase(env);
  return base ? `${base}/api/research/apify?job=${encodeURIComponent(jobId)}&token=${encodeURIComponent(token)}` : null;
}

export interface UnfinishedJob {
  id: string;
  purpose: JobPurpose;
  creator_ids: string[];
  created_at: string;
}

/** The workspace's reads that have not finished and are young enough to still block another. */
export async function unfinishedJobs(sb: SupabaseClient, agencyId: string): Promise<UnfinishedJob[]> {
  const { data, error } = await sb
    .from("research_jobs")
    .select("id,purpose,creator_ids,created_at")
    .eq("agency_id", agencyId)
    .in("status", UNFINISHED)
    .gt("created_at", new Date(Date.now() - IN_FLIGHT_MS).toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Checking for a running scan failed: ${error.message}`);
  return (data ?? []) as UnfinishedJob[];
}

export type ScanRefusal = "scan_running" | "creator_in_flight" | "onboards_full" | "daily_ceiling";

export const REFUSAL_MESSAGE: Record<ScanRefusal, string> = {
  scan_running: "A scan is already running for this workspace. It usually finishes within a few minutes.",
  creator_in_flight: "Their Instagram posts are already being read.",
  onboards_full: `${MAX_ONBOARDS_IN_FLIGHT} new creators are already being read, so this one will be read on the next scan.`,
  daily_ceiling: "This workspace has used today's Instagram reading allowance. It resets at midnight UTC.",
};

const REFUSALS = Object.keys(REFUSAL_MESSAGE) as ScanRefusal[];

/** Pure: the database's answer to a start, either the new job's id or the rule that refused it.
    Anything else is an error, never a start. */
export function parseJobStart(data: unknown): { jobId: string } | { refusal: ScanRefusal } {
  const d = (data ?? {}) as { job_id?: unknown; refusal?: unknown };
  if (typeof d.job_id === "string" && d.job_id !== "") return { jobId: d.job_id };
  if (typeof d.refusal === "string" && (REFUSALS as string[]).includes(d.refusal)) return { refusal: d.refusal as ScanRefusal };
  throw new Error(`Starting the scan answered ${JSON.stringify(data)}`);
}

/** Why a new Instagram read may not start, or null when it may. A scan waits only for another scan.
    A newly tracked creator's first read waits when an unfinished read already includes them, or
    when the three slots for new creators are full. Reads older than IN_FLIGHT_MS block nothing. */
export function scanRefusal(purpose: JobPurpose, creatorIds: string[], unfinished: UnfinishedJob[], nowMs: number): ScanRefusal | null {
  const live = unfinished.filter((j) => nowMs - Date.parse(j.created_at) < IN_FLIGHT_MS);
  if (purpose === "scan") return live.some((j) => j.purpose === "scan") ? "scan_running" : null;
  if (live.some((j) => (j.creator_ids ?? []).some((id) => creatorIds.includes(id)))) return "creator_in_flight";
  if (live.filter((j) => j.purpose === "onboard").length >= MAX_ONBOARDS_IN_FLIGHT) return "onboards_full";
  return null;
}

export interface ScanOptions {
  /** Left out: every active creator with a role a scan reads. */
  creatorIds?: string[];
  mode: ScanMode;
  startedBy: string | null;
  /** Left out: both platforms. */
  platforms?: Platform[];
  /** How the YouTube read runs. By default after the answer goes back, so a button responds at once;
      a script passes a runner that waits. */
  runYoutube?: (task: () => Promise<void>) => void | Promise<void>;
  youtubeBudgetMs?: number;
  onYoutubeDone?: (result: YoutubeRefreshResult) => void;
  /** Overrides for a deliberately tiny read, used by tests and scripts. */
  resultsLimit?: number;
  maxChargeUsd?: number;
  /** "scan" reads the roster; "onboard" is one newly tracked creator's first Instagram read. */
  purpose?: JobPurpose;
  /** Called once every free check has passed and right before the first spend, to reserve the day's
      allowance. A message refuses the scan with that message. */
  beforeStart?: () => Promise<string | null>;
}

export type ScanStart =
  | {
      ok: true;
      jobId: string | null;
      instagramCreators: number;
      /** Accounts in scope this scan does not read (over the per-scan limit, or past the day's
          ceiling). A later scan reads them, longest unread first. */
      instagramLeft: number;
      youtubeCreators: number;
      maxChargeUsd: number | null;
      /** True when Apify has no public address to call back to, so the page checks for itself. */
      pollOnly: boolean;
    }
  | { ok: false; error: string; refusal?: ScanRefusal | "cap_used" };

export function scanResultsLimit(opts: Pick<ScanOptions, "mode" | "resultsLimit">): number {
  return Math.max(1, Math.min(200, Math.floor(opts.resultsLimit ?? SCAN_SETTINGS[opts.mode].resultsLimit)));
}

async function startInstagramJob(
  sb: SupabaseClient,
  agencyId: string,
  creators: CreatorLite[],
  opts: ScanOptions,
): Promise<{ ok: true; jobId: string; maxChargeUsd: number; pollOnly: boolean } | { ok: false; error: string; refusal?: ScanRefusal }> {
  const settings = SCAN_SETTINGS[opts.mode];
  const resultsLimit = scanResultsLimit(opts);
  const maxChargeUsd = opts.maxChargeUsd ?? scanChargeCap(creators.length, resultsLimit);
  const { token, hash } = newWebhookToken();

  // The row is written by the database inside a lock for this workspace, after the rules above and
  // the day's ceiling are checked again against every scan committed so far.
  const { data: answer, error } = await sb.rpc("research_start_job", {
    p_agency: agencyId,
    p_purpose: opts.purpose ?? "scan",
    p_mode: opts.mode,
    p_creator_ids: creators.map((c) => c.id),
    p_max_charge_usd: maxChargeUsd,
    p_webhook_token_hash: hash,
    p_started_by: opts.startedBy,
    p_in_flight_secs: Math.round(IN_FLIGHT_MS / 1000),
    p_max_onboards: MAX_ONBOARDS_IN_FLIGHT,
    p_since: utcDayStart(),
    p_daily_ceiling_usd: DAILY_APIFY_CEILING_USD,
  });
  if (error) throw new Error(`Creating the scan failed: ${error.message}`);
  const inserted = parseJobStart(answer);
  if ("refusal" in inserted) return { ok: false, error: REFUSAL_MESSAGE[inserted.refusal], refusal: inserted.refusal };
  const jobId = inserted.jobId;

  const callback = webhookUrl(jobId, token);
  let runId: string | null = null;
  try {
    const directUrls = creators.map((c) => profileUrl(normalizeIgHandle(c.instagram ?? "") ?? c.handle));
    const started = await startRun(
      IG_SCRAPER,
      { directUrls, resultsType: "posts", resultsLimit, onlyPostsNewerThan: settings.newerThan },
      {
        maxTotalChargeUsd: maxChargeUsd,
        timeoutSecs: SCAN_TIMEOUT_SECS,
        ...(callback ? { webhook: { url: callback, eventTypes: RUN_WEBHOOK_EVENTS } } : {}),
      },
    );
    runId = started.runId;
    const { error: runError } = await sb
      .from("research_jobs")
      .update({ apify_run_id: started.runId, token_hint: started.tokenIndex, status: "running" })
      .eq("id", jobId)
      .eq("agency_id", agencyId);
    if (runError) throw new Error(`Saving the run id failed: ${runError.message}`);
    return { ok: true, jobId, maxChargeUsd, pollOnly: !callback };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[research] starting scan ${jobId} failed (run ${runId ?? "not started"}):`, message);
    const { error: failError } = await sb
      .from("research_jobs")
      .update({ status: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString(), ...(runId ? { apify_run_id: runId } : {}) })
      .eq("id", jobId)
      .eq("agency_id", agencyId);
    if (failError) console.error(`[research] marking scan ${jobId} failed also failed:`, failError.message);
    return { ok: false, error: message };
  }
}

/** Start a scan: one Instagram read for the creators in scope who have an Instagram account, and a
    YouTube read for those with a channel. */
export async function scanCreators(sb: SupabaseClient, agencyId: string, opts: ScanOptions): Promise<ScanStart> {
  const purpose = opts.purpose ?? "scan";
  if (purpose === "onboard" && (opts.creatorIds?.length !== 1 || (opts.platforms ?? []).join() !== "instagram")) {
    throw new Error("A new creator's first read is exactly one creator's Instagram");
  }
  let query = sb
    .from("content_creators")
    .select(CREATOR_LITE_COLUMNS)
    .eq("agency_id", agencyId)
    .eq("status", "active")
    .in("role", SCAN_ROLES)
    .order("name");
  if (opts.creatorIds) query = query.in("id", opts.creatorIds);
  const { data, error } = await query;
  if (error) throw new Error(`Loading your creators failed: ${error.message}`);
  const creators = (data ?? []) as CreatorLite[];
  const platforms = opts.platforms ?? ["instagram", "youtube"];
  const instagram = platforms.includes("instagram") ? creators.filter((c) => normalizeIgHandle(c.instagram ?? "") !== null) : [];
  const youtube = platforms.includes("youtube") ? creators.filter((c) => (c.youtube ?? "").trim() !== "") : [];
  if (instagram.length === 0 && youtube.length === 0) {
    return { ok: false, error: "There are no active creators with an Instagram or YouTube account to scan." };
  }
  const refusal = scanRefusal(purpose, instagram.map((c) => c.id), await unfinishedJobs(sb, agencyId), Date.now());
  if (refusal) return { ok: false, error: REFUSAL_MESSAGE[refusal], refusal };

  const plan = instagram.length > 0 ? await planInstagramScan(sb, agencyId, instagram, scanResultsLimit(opts), opts.maxChargeUsd) : { creators: [], left: 0 };
  if (instagram.length > 0 && plan.creators.length === 0 && youtube.length === 0) {
    return { ok: false, error: REFUSAL_MESSAGE.daily_ceiling, refusal: "daily_ceiling" };
  }

  // Reserved only now: every refusal above is free, so none of them uses up the day's allowance.
  const capRefusal = await opts.beforeStart?.();
  if (capRefusal) return { ok: false, error: capRefusal, refusal: "cap_used" };

  let jobId: string | null = null;
  let maxChargeUsd: number | null = null;
  let pollOnly = false;
  if (plan.creators.length > 0) {
    const started = await startInstagramJob(sb, agencyId, plan.creators, opts);
    if (!started.ok) return started;
    jobId = started.jobId;
    maxChargeUsd = started.maxChargeUsd;
    pollOnly = started.pollOnly;
  }

  if (youtube.length > 0) {
    const ids = youtube.map((c) => c.id);
    const run = opts.runYoutube ?? after;
    await run(async () => {
      try {
        const result = await refreshYoutube(sb, agencyId, ids, Date.now() + (opts.youtubeBudgetMs ?? YOUTUBE_BUDGET_MS));
        opts.onYoutubeDone?.(result);
        console.log(`[research] YouTube read for ${agencyId}: ${result.reached.length} reached, ${result.skipped.length} skipped, ${result.unreached.length} not reached`);
      } catch (e) {
        console.error(`[research] YouTube read for ${agencyId} failed:`, e instanceof Error ? e.message : e);
      }
    });
  }

  return { ok: true, jobId, instagramCreators: plan.creators.length, instagramLeft: plan.left, youtubeCreators: youtube.length, maxChargeUsd, pollOnly };
}

export interface JobView {
  id: string;
  purpose: JobPurpose;
  status: JobStatus;
  mode: ScanMode;
  created_at: string;
  finished_at: string | null;
  result: JobResult | null;
  error: string | null;
  cost_usd: number | null;
}

const JOB_VIEW_COLUMNS = "id,purpose,status,mode,created_at,finished_at,result,error,cost_usd";

/** The workspace's most recent scan, for the line beside the Scan now button. */
export async function latestJob(sb: SupabaseClient, agencyId: string): Promise<JobView | null> {
  const { data, error } = await sb
    .from("research_jobs")
    .select(JOB_VIEW_COLUMNS)
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading the latest scan failed: ${error.message}`);
  return (data as JobView | null) ?? null;
}

export interface JobsSummary {
  running: boolean;
  checked: number;
  ingested: number;
  job: JobView | null;
}

async function failJob(sb: SupabaseClient, job: ResearchJob, message: string): Promise<void> {
  const { error } = await sb
    .from("research_jobs")
    .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("agency_id", job.agency_id)
    .in("status", UNFINISHED);
  if (error) throw new Error(`Marking scan ${job.id} failed did not save: ${error.message}`);
}

/** Move this workspace's unfinished reads along: ask Apify at most once a minute, take in the ones
    that have finished, retry an ingest whose claim went stale, and fail reads that can never
    finish. Calling this twice in a row does nothing the second time. */
export async function checkJobs(sb: SupabaseClient, agencyId: string, opts: { thumbnailBudgetMs?: number } = {}): Promise<JobsSummary> {
  const { data, error } = await sb
    .from("research_jobs")
    .select("*")
    .eq("agency_id", agencyId)
    .in("status", UNFINISHED)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Reading unfinished scans failed: ${error.message}`);
  const now = Date.now();
  let checked = 0;
  let ingested = 0;

  for (const job of (data ?? []) as ResearchJob[]) {
    const age = now - Date.parse(job.created_at);
    if (job.status === "starting") {
      if (age > START_GRACE_MS) await failJob(sb, job, "The scan did not start.");
      continue;
    }
    if (age > JOB_MAX_AGE_MS) {
      await failJob(sb, job, job.error ?? "The scan could not be collected within seven days.");
      continue;
    }
    if (job.status === "ingesting") {
      const claimedAt = job.claimed_at ? Date.parse(job.claimed_at) : 0;
      if (now - claimedAt < CLAIM_STALE_MS) continue;
      checked++;
      const outcome = await ingestInstagramJob(sb, job, opts);
      if (outcome.state === "done" || outcome.state === "failed") ingested++;
      continue;
    }
    // Running.
    if (job.last_checked_at && now - Date.parse(job.last_checked_at) < CHECK_EVERY_MS) continue;
    const { error: stampError } = await sb.from("research_jobs").update({ last_checked_at: new Date(now).toISOString() }).eq("id", job.id).eq("agency_id", agencyId);
    if (stampError) throw new Error(`Stamping scan ${job.id} failed: ${stampError.message}`);
    checked++;
    if (!job.apify_run_id) {
      await failJob(sb, job, "The scan never got a run id back.");
      continue;
    }
    try {
      const { run } = await getRun(job.apify_run_id, job.token_hint);
      if (!isTerminalRunStatus(run.status)) continue;
    } catch (e) {
      // Apify unreachable, or the read not visible right now: the next check tries again.
      console.error(`[research] checking scan ${job.id} failed:`, e instanceof Error ? e.message : e);
      continue;
    }
    const outcome = await ingestInstagramJob(sb, job, opts);
    if (outcome.state === "done" || outcome.state === "failed") ingested++;
  }

  const job = await latestJob(sb, agencyId);
  return { running: !!job && UNFINISHED.includes(job.status), checked, ingested, job };
}
