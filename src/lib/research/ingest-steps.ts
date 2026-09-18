// The bookkeeping parts of taking a finished scan in: the rows the Run history shows, permanent
// copies of the cover images, and the counts on the roster. Split out of ingest.ts so each file
// stays small enough to read in one sitting.

import type { SupabaseClient } from "@supabase/supabase-js";
import { storeThumbnail, thumbnailPath, THUMB_BUCKET } from "./media";
import type { Platform, ResearchJob } from "./types";

const THUMB_CONCURRENCY = 6;
const ID_CHUNK = 100;

/** The Run history rows an earlier attempt at this job already wrote, found by the job id, so a
    retried ingest updates them instead of logging the same scan twice. */
export async function runRowIds(sb: SupabaseClient, job: Pick<ResearchJob, "id" | "agency_id">): Promise<{ scrape?: string; parse?: string }> {
  const { data, error } = await sb
    .from("content_machine_runs")
    .select("id,stage")
    .eq("agency_id", job.agency_id)
    .eq("detail->>job_id", job.id);
  if (error) throw new Error(`Reading the run history failed: ${error.message}`);
  const out: { scrape?: string; parse?: string } = {};
  for (const row of (data ?? []) as { id: string; stage: string }[]) {
    if (row.stage === "scrape" || row.stage === "parse") out[row.stage] = row.id;
  }
  return out;
}

/** Add a run history row, or update the one with this id. Returns the row id. */
export async function saveRunRow(
  sb: SupabaseClient,
  job: Pick<ResearchJob, "id" | "agency_id">,
  stage: "scrape" | "parse",
  fields: Record<string, unknown>,
  id?: string,
): Promise<string> {
  if (id) {
    const { error } = await sb.from("content_machine_runs").update(fields).eq("id", id).eq("agency_id", job.agency_id);
    if (error) throw new Error(`Updating the ${stage} run row failed: ${error.message}`);
    return id;
  }
  const { data, error } = await sb
    .from("content_machine_runs")
    .insert({ agency_id: job.agency_id, stage, ...fields })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Logging the ${stage} run failed: ${error?.message ?? "no row came back"}`);
  return (data as { id: string }).id;
}

export interface ThumbnailReport {
  stored: number;
  failed: number;
  left: number;
}

/** Copy cover images into storage for the posts that still have none: standouts first, six at a
    time, and no new download starts after the deadline. Whatever is left keeps its Instagram link
    and gets a copy on the next scan, which reads fresh links anyway. */
export async function storeMissingThumbnails(
  sb: SupabaseClient,
  agencyId: string,
  postIds: string[],
  deadlineMs: number,
): Promise<ThumbnailReport> {
  const candidates: { id: string; display_url: string; is_outlier: boolean; strength: number | null }[] = [];
  for (let i = 0; i < postIds.length; i += ID_CHUNK) {
    const { data, error } = await sb
      .from("content_posts")
      .select("id,display_url,is_outlier,strength")
      .eq("agency_id", agencyId)
      .in("id", postIds.slice(i, i + ID_CHUNK))
      .is("thumb_url", null)
      .not("display_url", "is", null);
    if (error) throw new Error(`Reading posts without a cover image failed: ${error.message}`);
    candidates.push(...((data ?? []) as typeof candidates));
  }
  candidates.sort((a, b) => Number(b.is_outlier) - Number(a.is_outlier) || (b.strength ?? 0) - (a.strength ?? 0));

  let next = 0;
  let stored = 0;
  let failed = 0;
  const worker = async () => {
    while (next < candidates.length && Date.now() < deadlineMs) {
      const post = candidates[next++];
      try {
        const url = await storeThumbnail(sb, post.display_url);
        const { error } = await sb.from("content_posts").update({ thumb_url: url }).eq("id", post.id).eq("agency_id", agencyId);
        if (error) {
          const path = thumbnailPath(url);
          if (path) {
            const removed = await sb.storage.from(THUMB_BUCKET).remove([path]);
            if (removed.error) console.error(`[research] could not remove the orphan cover image ${path}:`, removed.error.message);
          }
          throw new Error(`Saving the cover image address failed: ${error.message}`);
        }
        stored++;
      } catch (e) {
        // One dead link must not stop the others; it is counted and tried again on the next scan.
        failed++;
        console.error(`[research] cover image for post ${post.id} failed:`, e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all(Array.from({ length: THUMB_CONCURRENCY }, worker));
  return { stored, failed, left: candidates.length - next };
}

/** Refresh the roster's collected counts and last read time for these creators on one platform. */
export async function updateCreatorCounts(sb: SupabaseClient, agencyId: string, creatorIds: string[], platform: Platform): Promise<void> {
  const nowIso = new Date().toISOString();
  for (const id of creatorIds) {
    const { count, error } = await sb
      .from("content_posts")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("creator_id", id)
      .eq("platform", platform);
    if (error) throw new Error(`Counting posts failed: ${error.message}`);
    const patch = platform === "instagram" ? { posts_count: count ?? 0 } : { videos_count: count ?? 0 };
    const { error: writeError } = await sb
      .from("content_creators")
      .update({ ...patch, last_scraped_at: nowIso, updated_at: nowIso })
      .eq("id", id)
      .eq("agency_id", agencyId);
    if (writeError) throw new Error(`Updating the creator's counts failed: ${writeError.message}`);
  }
}
