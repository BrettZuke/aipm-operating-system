// Taking a finished scan in: scraped posts into content_posts, the creator-relative maths onto
// every post, the standouts mirrored into content_outliers so the rest of the Content page sees
// them, and the job row closed off.
//
// The same scan can arrive twice (Apify's webhook and this dashboard's own check can both deliver
// it), so every step here can safely run twice: the job is claimed before any work starts, posts
// are saved on their own natural key, run history rows are found again by job id, and cover images
// are only fetched for posts that still have none.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { datasetItems, getRun, isTerminalRunStatus } from "./apify";
import { computeBaselines, MIN_MULTIPLE, type BaselinePost, type PostMetrics } from "./baseline";
import { runRowIds, saveRunRow, storeMissingThumbnails, updateCreatorCounts } from "./ingest-steps";
import { normalizeIgHandle, normalizeInstagramItems } from "./normalize-instagram";
import { CREATOR_LITE_COLUMNS, type CreatorLite, type JobResult, type Platform, type PostInput, type PostKind, type ResearchJob } from "./types";
import { listUploads, resolveChannel, videoDetails, YoutubeQuotaError } from "./youtube";

const UPSERT_CHUNK = 200;
const MIRROR_CHUNK = 100;
/** A claim older than this belongs to an ingest that died, so the next check may take the job over. */
export const CLAIM_STALE_MS = 10 * 60_000;
const THUMB_BUDGET_MS = 200_000;
/** Which roles a scan reads. "Ideas only" creators are inspiration and are never read. */
export const SCAN_ROLES = ["emulate", "watch", "strategist"];
/** How many recent videos a YouTube read pulls per channel. */
export const YOUTUBE_UPLOADS = 50;

export interface UpsertedPost {
  id: string;
  platform: Platform;
  external_id: string;
}

/** Save one creator's posts. Columns the AI layer owns (the breakdown, Make it yours, the
    transcript) are never sent, and the cover image only when there is one, so reading a creator
    again can never blank work that is already there. */
export async function upsertPosts(sb: SupabaseClient, agencyId: string, creator: Pick<CreatorLite, "id">, inputs: PostInput[]): Promise<UpsertedPost[]> {
  const nowIso = new Date().toISOString();
  const unique = new Map<string, PostInput>();
  for (const p of inputs) if (!unique.has(`${p.platform}:${p.external_id}`)) unique.set(`${p.platform}:${p.external_id}`, p);
  const rows = [...unique.values()].map((p) => ({
    agency_id: agencyId,
    creator_id: creator.id,
    platform: p.platform,
    external_id: p.external_id,
    url: p.url,
    kind: p.kind,
    posted_at: p.posted_at,
    caption: p.caption,
    description: p.description,
    duration_s: p.duration_s,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    display_url: p.display_url,
    media_url: p.media_url,
    audio_url: p.audio_url,
    image_urls: p.image_urls,
    media_expires_at: p.media_expires_at,
    scraped_at: nowIso,
    updated_at: nowIso,
    ...(p.thumb_url ? { thumb_url: p.thumb_url } : {}),
  }));
  // One batch writes the union of its rows' columns, filling in the missing ones as empty, so rows
  // with and without a cover image must never share a batch.
  const batches = [rows.filter((r) => "thumb_url" in r), rows.filter((r) => !("thumb_url" in r))];
  const saved: UpsertedPost[] = [];
  for (const batch of batches) {
    for (let i = 0; i < batch.length; i += UPSERT_CHUNK) {
      const { data, error } = await sb
        .from("content_posts")
        .upsert(batch.slice(i, i + UPSERT_CHUNK), { onConflict: "agency_id,platform,external_id" })
        .select("id,platform,external_id");
      if (error) throw new Error(`Saving posts failed: ${error.message}`);
      saved.push(...((data ?? []) as UpsertedPost[]));
    }
  }
  return saved;
}

interface StoredPost extends BaselinePost {
  url: string;
  external_id: string;
  caption: string | null;
  description: string | null;
  metric: string | null;
  score: number | null;
  baseline: number | null;
  multiple: number | null;
  strength: number | null;
  is_outlier: boolean;
}

const STORED_POST_COLUMNS =
  "id,platform,kind,posted_at,views,likes,comments,url,external_id,caption,description,metric,score,baseline,multiple,strength,is_outlier";

const POST_TYPE: Record<PostKind, string> = { reel: "Video", short: "Video", video: "Video", carousel: "Sidecar", image: "Image" };

function firstLine(text: string | null): string | null {
  const line = (text ?? "").split("\n").map((l) => l.trim()).find(Boolean);
  return line ? line.slice(0, 300) : null;
}

/** The content_outliers row for one standout: the maths and who posted it, nothing else. The
    columns the breakdown writes are deliberately left out, so saving the numbers again can never
    blank an explanation that is already there. */
export function outlierMirrorRow(
  agencyId: string,
  creator: { name: string; handle: string },
  post: Pick<StoredPost, "url" | "platform" | "kind" | "posted_at" | "views" | "likes" | "comments" | "caption" | "description">,
  m: Pick<PostMetrics, "metric" | "score" | "baseline" | "multiple">,
  runId: string | null,
): Record<string, unknown> {
  const caption = post.platform === "youtube" ? [post.caption, post.description].filter(Boolean).join("\n\n") : (post.caption ?? "");
  return {
    agency_id: agencyId,
    ...(runId ? { run_id: runId } : {}),
    url: post.url,
    platform: post.platform,
    creator: creator.name,
    handle: creator.handle,
    posted: post.posted_at ? post.posted_at.slice(0, 10) : null,
    post_type: POST_TYPE[post.kind],
    metric: m.metric,
    score: m.score,
    creator_median: m.baseline,
    multiple: m.multiple,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    caption_hook: firstLine(post.caption),
    caption: caption.slice(0, 1_200) || null,
  };
}

function metricsChanged(p: StoredPost, m: PostMetrics): boolean {
  const near = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(Number(a) - b) < 1e-6);
  return (
    p.metric !== m.metric ||
    !near(p.score, m.score) ||
    !near(p.baseline, m.baseline) ||
    !near(p.multiple, m.multiple) ||
    !near(p.strength, m.strength) ||
    p.is_outlier !== m.is_outlier
  );
}

export interface RecomputeResult {
  creatorId: string;
  posts: number;
  outliers: number;
  /** How many platform groups have a normal worked out. Zero means nothing about this creator is
      measurable yet. */
  baselines: number;
  /** One line per group with no normal yet, and why. */
  skipped: { platform: Platform; reason: string }[];
}

/** Work the numbers out again over every stored post of one creator, on both platforms, save what
    changed, and mirror every standout into content_outliers. */
export async function recomputeCreator(sb: SupabaseClient, agencyId: string, creatorId: string, runId: string | null = null): Promise<RecomputeResult> {
  const { data: creator, error } = await sb
    .from("content_creators")
    .select("id,name,handle,min_score")
    .eq("id", creatorId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (error) throw new Error(`Loading the creator failed: ${error.message}`);
  if (!creator) throw new Error(`Creator ${creatorId} is not in this workspace`);
  const c = creator as { name: string; handle: string; min_score: number | null };

  const posts = await fetchAllPages<StoredPost>((from, to) =>
    sb.from("content_posts").select(STORED_POST_COLUMNS).eq("agency_id", agencyId).eq("creator_id", creatorId).order("id").range(from, to),
  );
  const { metrics, groups } = computeBaselines(posts, { minScore: c.min_score, now: Date.now() });
  const byId = new Map(posts.map((p) => [p.id, p]));
  const nowIso = new Date().toISOString();

  const changed = metrics
    .filter((m) => metricsChanged(byId.get(m.id)!, m))
    .map((m) => {
      const p = byId.get(m.id)!;
      // Saving on the row id carries the columns that cannot be empty, unchanged, so the statement
      // is a valid row.
      return {
        id: p.id,
        agency_id: agencyId,
        creator_id: creatorId,
        platform: p.platform,
        external_id: p.external_id,
        url: p.url,
        kind: p.kind,
        metric: m.metric,
        score: m.score,
        baseline: m.baseline,
        multiple: m.multiple,
        strength: m.strength,
        is_outlier: m.is_outlier,
        updated_at: nowIso,
      };
    });
  for (let i = 0; i < changed.length; i += UPSERT_CHUNK) {
    const { error: writeError } = await sb.from("content_posts").upsert(changed.slice(i, i + UPSERT_CHUNK), { onConflict: "id" });
    if (writeError) throw new Error(`Saving the post numbers failed: ${writeError.message}`);
  }

  const mirror = metrics.filter((m) => m.is_outlier).map((m) => outlierMirrorRow(agencyId, c, byId.get(m.id)!, m, runId));
  for (let i = 0; i < mirror.length; i += MIRROR_CHUNK) {
    const { error: mirrorError } = await sb.from("content_outliers").upsert(mirror.slice(i, i + MIRROR_CHUNK), { onConflict: "agency_id,url" });
    if (mirrorError) throw new Error(`Mirroring the standouts failed: ${mirrorError.message}`);
  }

  return {
    creatorId,
    posts: posts.length,
    outliers: mirror.length,
    baselines: groups.filter((g) => g.baseline !== null).length,
    skipped: groups.filter((g) => g.skipped).map((g) => ({ platform: g.platform, reason: g.skipped! })),
  };
}

/** Match scraped posts to the creators the scan asked for: by who posted it, then by the profile it
    was read from, because a post made with somebody else is owned by that somebody else. */
export function assignToCreators(
  inputs: PostInput[],
  creators: Pick<CreatorLite, "id" | "handle" | "instagram">[],
): { byCreator: Map<string, PostInput[]>; unmatched: number } {
  const owners = new Map<string, string>();
  for (const c of creators) {
    const key = normalizeIgHandle(c.instagram ?? "") ?? normalizeIgHandle(c.handle);
    if (key && !owners.has(key)) owners.set(key, c.id);
  }
  const byCreator = new Map<string, PostInput[]>();
  let unmatched = 0;
  for (const p of inputs) {
    const id = (p.owner ? owners.get(p.owner) : undefined) ?? (p.source ? owners.get(p.source) : undefined);
    if (!id) {
      unmatched++;
      continue;
    }
    byCreator.set(id, [...(byCreator.get(id) ?? []), p]);
  }
  return { byCreator, unmatched };
}

/** Claim a job so only one worker takes it in: a running job, or one whose earlier claim went
    stale. Null means somebody else has it, or it is already finished. */
export async function claimJob(sb: SupabaseClient, ref: Pick<ResearchJob, "id" | "agency_id">): Promise<ResearchJob | null> {
  const patch = { status: "ingesting", claimed_at: new Date().toISOString() };
  const fresh = await sb.from("research_jobs").update(patch).eq("id", ref.id).eq("agency_id", ref.agency_id).eq("status", "running").select("*").maybeSingle();
  if (fresh.error) throw new Error(`Claiming the scan failed: ${fresh.error.message}`);
  if (fresh.data) return fresh.data as ResearchJob;
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  const stale = await sb
    .from("research_jobs")
    .update(patch)
    .eq("id", ref.id)
    .eq("agency_id", ref.agency_id)
    .eq("status", "ingesting")
    .lt("claimed_at", staleBefore)
    .select("*")
    .maybeSingle();
  if (stale.error) throw new Error(`Claiming the scan failed: ${stale.error.message}`);
  return (stale.data as ResearchJob | null) ?? null;
}

export interface IngestOutcome {
  jobId: string;
  state: "busy" | "not_finished" | "done" | "failed" | "error";
  result?: JobResult;
  error?: string;
}

async function finishJob(sb: SupabaseClient, job: ResearchJob, fields: Record<string, unknown>): Promise<void> {
  const { error } = await sb.from("research_jobs").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", job.id).eq("agency_id", job.agency_id);
  if (error) throw new Error(`Closing the scan off failed: ${error.message}`);
}

async function ingestClaimed(sb: SupabaseClient, job: ResearchJob, thumbnailDeadlineMs: number): Promise<IngestOutcome> {
  if (!job.apify_run_id) {
    await finishJob(sb, job, { status: "failed", error: "The scan never got a run id back" });
    return { jobId: job.id, state: "failed", error: "no run id" };
  }
  const { run, tokenIndex } = await getRun(job.apify_run_id, job.token_hint);
  if (!isTerminalRunStatus(run.status)) {
    const { error } = await sb.from("research_jobs").update({ status: "running", claimed_at: null }).eq("id", job.id).eq("agency_id", job.agency_id).eq("status", "ingesting");
    if (error) throw new Error(`Letting the scan go again failed: ${error.message}`);
    return { jobId: job.id, state: "not_finished" };
  }

  // Posts from a run that failed, timed out or was stopped were still paid for, so whatever reached
  // the results is saved. The job is then marked failed so nobody mistakes it for a full scan.
  const items = run.defaultDatasetId ? await datasetItems(run.defaultDatasetId, tokenIndex) : [];
  const inputs = normalizeInstagramItems(items);
  const { data: creatorRows, error } = await sb.from("content_creators").select(CREATOR_LITE_COLUMNS).eq("agency_id", job.agency_id).in("id", job.creator_ids);
  if (error) throw new Error(`Loading the scan's creators failed: ${error.message}`);
  const creators = (creatorRows ?? []) as CreatorLite[];
  const { byCreator, unmatched } = assignToCreators(inputs, creators);
  const read = creators.filter((c) => (byCreator.get(c.id)?.length ?? 0) > 0);
  const notRead = creators.filter((c) => !byCreator.has(c.id)).map((c) => c.name);
  const costUsd = run.costUsd;
  const base = { source: "research", job_id: job.id, cost_usd: costUsd };

  const existing = await runRowIds(sb, job);
  await saveRunRow(
    sb,
    job,
    "scrape",
    { creators_read: read.length, creators_skipped: notRead.length, detail: { ...base, skipped: notRead, items: items.length, unmatched } },
    existing.scrape,
  );
  const parseId = await saveRunRow(sb, job, "parse", { creators_read: read.length, detail: { ...base } }, existing.parse);

  const postIds: string[] = [];
  // Skipped means nothing measurable on either platform yet. A creator whose Instagram is still
  // short of old enough posts but whose YouTube has a normal counts as read.
  const noBaseline: string[] = [];
  const instagramWaiting: string[] = [];
  let outliers = 0;
  for (const c of read) {
    const saved = await upsertPosts(sb, job.agency_id, c, byCreator.get(c.id)!);
    postIds.push(...saved.map((s) => s.id));
    const rec = await recomputeCreator(sb, job.agency_id, c.id, parseId);
    outliers += rec.outliers;
    if (rec.baselines === 0) noBaseline.push(c.name);
    for (const s of rec.skipped) if (s.platform === "instagram") instagramWaiting.push(`${c.name}: ${s.reason}`);
  }

  const thumbs = await storeMissingThumbnails(sb, job.agency_id, postIds, thumbnailDeadlineMs);
  await updateCreatorCounts(sb, job.agency_id, read.map((c) => c.id), "instagram");
  await saveRunRow(
    sb,
    job,
    "parse",
    {
      creators_read: read.length - noBaseline.length,
      creators_skipped: noBaseline.length,
      outliers_found: outliers,
      detail: { ...base, skipped: noBaseline, instagram_without_baseline: instagramWaiting, min_multiple: MIN_MULTIPLE, thumbnails: thumbs },
    },
    parseId,
  );

  const result: JobResult = { posts: postIds.length, outliers, creators_read: read.length, creators_skipped: notRead };
  const ok = run.status === "SUCCEEDED";
  const errorText = ok
    ? null
    : `The Instagram read ended ${run.status}${run.statusMessage ? ` (${run.statusMessage.slice(0, 160)})` : ""}. The ${postIds.length} posts it did return were saved.`;
  await finishJob(sb, job, { status: ok ? "done" : "failed", result, cost_usd: costUsd, error: errorText });
  console.log(
    `[research] job ${job.id} ${ok ? "done" : "failed"}: ${postIds.length} posts, ${outliers} standouts, cover images ${JSON.stringify(thumbs)}, ${unmatched} unmatched items, cost ${costUsd ?? "not known"}`,
  );
  return { jobId: job.id, state: ok ? "done" : "failed", result, ...(errorText ? { error: errorText } : {}) };
}

/** Claim a finished scan and take it in. Safe to call from the webhook and the page's own check at
    the same time: only one claim wins. An error is recorded on the job, which stays claimed, so the
    next check after the claim goes stale tries it again. */
export async function ingestInstagramJob(
  sb: SupabaseClient,
  ref: Pick<ResearchJob, "id" | "agency_id">,
  opts: { thumbnailBudgetMs?: number } = {},
): Promise<IngestOutcome> {
  const job = await claimJob(sb, ref);
  if (!job) return { jobId: ref.id, state: "busy" };
  try {
    return await ingestClaimed(sb, job, Date.now() + (opts.thumbnailBudgetMs ?? THUMB_BUDGET_MS));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[research] taking scan ${job.id} in failed:`, message);
    const { error } = await sb.from("research_jobs").update({ error: message.slice(0, 500) }).eq("id", job.id).eq("agency_id", job.agency_id);
    if (error) console.error(`[research] recording that failure on job ${job.id} also failed:`, error.message);
    return { jobId: job.id, state: "error", error: message };
  }
}

export interface YoutubeRefreshResult {
  reached: { id: string; name: string; posts: number; outliers: number }[];
  skipped: { name: string; reason: string }[];
  unreached: string[];
}

/** Pull the latest uploads for each creator with a YouTube channel, save them and work out the
    numbers. Stops cleanly at the deadline and says who it did not get to. */
export async function refreshYoutube(sb: SupabaseClient, agencyId: string, creatorIds: string[] | null, deadlineMs: number): Promise<YoutubeRefreshResult> {
  let query = sb
    .from("content_creators")
    .select(CREATOR_LITE_COLUMNS)
    .eq("agency_id", agencyId)
    .eq("status", "active")
    .in("role", SCAN_ROLES)
    .not("youtube", "is", null)
    .order("name");
  if (creatorIds) query = query.in("id", creatorIds);
  const { data, error } = await query;
  if (error) throw new Error(`Loading the YouTube creators failed: ${error.message}`);
  const creators = (data ?? []) as CreatorLite[];
  const result: YoutubeRefreshResult = { reached: [], skipped: [], unreached: [] };

  for (let i = 0; i < creators.length; i++) {
    const c = creators[i];
    if (Date.now() >= deadlineMs) {
      result.unreached.push(...creators.slice(i).map((x) => x.name));
      break;
    }
    try {
      const channelId = c.youtube_channel_id ?? (await resolveChannel({ handle: c.youtube }))?.channelId ?? null;
      if (!channelId) {
        result.skipped.push({ name: c.name, reason: "YouTube has no channel for that handle" });
        continue;
      }
      if (!c.youtube_channel_id) {
        const { error: cacheError } = await sb.from("content_creators").update({ youtube_channel_id: channelId }).eq("id", c.id).eq("agency_id", agencyId);
        if (cacheError) throw new Error(`Saving the channel id failed: ${cacheError.message}`);
      }
      const inputs = await videoDetails(await listUploads(channelId, YOUTUBE_UPLOADS));
      if (inputs.length > 0) await upsertPosts(sb, agencyId, c, inputs);
      const rec = await recomputeCreator(sb, agencyId, c.id);
      await updateCreatorCounts(sb, agencyId, [c.id], "youtube");
      result.reached.push({ id: c.id, name: c.name, posts: inputs.length, outliers: rec.outliers });
    } catch (e) {
      if (e instanceof YoutubeQuotaError) {
        result.skipped.push({ name: c.name, reason: e.message });
        result.unreached.push(...creators.slice(i + 1).map((x) => x.name));
        break;
      }
      console.error(`[research] the YouTube read failed for creator ${c.id}:`, e instanceof Error ? e.message : e);
      result.skipped.push({ name: c.name, reason: "YouTube could not be read for this channel right now" });
    }
  }
  return result;
}
