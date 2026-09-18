// Breaking one video down: why it beat that creator's own normal numbers.
//
// It takes the richest free route it can get, in this order:
//   1. YouTube: Gemini watches the video straight off YouTube. The whole thing when it is a Short,
//      the first two minutes when it is long.
//   2. Instagram reel: download the video (stopping at 15MB) and send it to Gemini to watch.
//   3. Either of those failing: pull the words out with Groq's Whisper and work from those. The
//      breakdown is then marked as read rather than watched, and is never allowed to describe
//      anything visual.
//   4. Carousel or picture post: send the slides to Gemini to look at, else the caption alone.
//
// Whichever route it took is saved with the breakdown, so nobody ever mistakes a caption read for a
// video watched. Every route is free. The only thing that can cost money is reading one post again
// for fresh picture links when Instagram's have expired, capped at a cent and done at most once.

import type { SupabaseClient } from "@supabase/supabase-js";
import { analysisPlan, INLINE_VIDEO_MAX_BYTES, SLIDE_MAX_BYTES, type AnalysisStep } from "./analysis-plan";
import {
  breakdownProblems,
  breakdownPrompt,
  breakdownRepairPrompt,
  coerceBreakdown,
  finalizeBreakdown,
  mergeRepair,
  SOURCE_OF,
  type BreakdownContext,
  type BreakdownInput,
} from "./breakdown";
import { ResearchUserError } from "./errors";
import { geminiAvailable, geminiJson, inlinePart, textPart, youtubePart, type GeminiPart } from "./gemini";
import { askJson, DailyQuotaSpent } from "./llm";
import { fetchCapped, isAllowedMediaUrl, isMediaExpired, MediaFetchError, refreshInstagramMedia, type MediaFields } from "./media";
import { formatTranscript, transcribeUrl } from "./transcribe";
import type { Breakdown, PostRow } from "./types";

/** A breakdown stops starting new work after this long. */
export const ANALYZE_BUDGET_MS = 110_000;
const MIN_STEP_MS = 12_000;
const MEDIA_TIMEOUT_MS = 30_000;
const SLIDE_TIMEOUT_MS = 10_000;
const REFRESH_MIN_MS = 45_000;
const MIN_SPEECH_CHARS = 20;

export type AnalysedPost = Pick<
  PostRow,
  | "id" | "creator_id" | "platform" | "external_id" | "url" | "kind" | "posted_at" | "caption" | "description" | "duration_s" | "views" | "likes"
  | "comments" | "metric" | "score" | "baseline" | "multiple" | "strength" | "is_outlier" | "thumb_url" | "display_url" | "media_url" | "audio_url"
  | "image_urls" | "media_expires_at" | "transcript" | "breakdown" | "breakdown_model" | "analysed_at" | "adaptation" | "adapted_at"
> & { creator_name: string };

const POST_COLUMNS =
  "id,creator_id,platform,external_id,url,kind,posted_at,caption,description,duration_s,views,likes,comments,metric,score,baseline,multiple,strength,is_outlier,thumb_url,display_url,media_url,audio_url,image_urls,media_expires_at,transcript,breakdown,breakdown_model,analysed_at,adaptation,adapted_at,content_creators(name)";

/** One post of this workspace, with the creator's name. A post id from anywhere else reads exactly
    like one that does not exist. */
export async function loadPost(sb: SupabaseClient, agencyId: string, postId: string): Promise<AnalysedPost> {
  const { data, error } = await sb.from("content_posts").select(POST_COLUMNS).eq("id", postId).eq("agency_id", agencyId).maybeSingle();
  if (error) throw new Error(`Loading post ${postId} failed: ${error.message}`);
  if (!data) throw new ResearchUserError("That video is not in this workspace.");
  const { content_creators: joined, ...post } = data as unknown as Omit<AnalysedPost, "creator_name"> & {
    content_creators: { name: string } | { name: string }[] | null;
  };
  const creator = Array.isArray(joined) ? joined[0] : joined;
  return { ...post, creator_name: creator?.name ?? "this creator" };
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function contextOf(post: AnalysedPost): BreakdownContext {
  return {
    creatorName: post.creator_name,
    platform: post.platform,
    kind: post.kind,
    caption: post.caption,
    description: post.description,
    durationS: num(post.duration_s),
    views: num(post.views),
    metric: post.metric,
    score: num(post.score),
    baseline: num(post.baseline),
    multiple: num(post.multiple),
    postedAt: post.posted_at,
  };
}

export interface AnalyzeResult {
  breakdown: Breakdown;
  model: string;
  transcript: string | null;
}

interface StepOutcome {
  raw: unknown;
  input: BreakdownInput;
  model: string;
  transcript: string | null;
}

/** Fresh Instagram links for one breakdown: read again at most once, and only when the stored ones
    have expired or were refused. */
class MediaSource {
  private refreshed = false;
  constructor(
    private readonly sb: SupabaseClient,
    private readonly agencyId: string,
    private readonly post: AnalysedPost,
    public fields: MediaFields,
    private readonly deadline: number,
  ) {}

  async fresh(force = false): Promise<MediaFields> {
    if (this.refreshed || (!force && !isMediaExpired(this.fields.media_expires_at))) return this.fields;
    const left = this.deadline - Date.now();
    if (left < REFRESH_MIN_MS) throw new Error("not enough time left to read the post again for fresh links");
    this.refreshed = true;
    console.log(`[research] reading post ${this.post.id} again for fresh links`);
    this.fields = await refreshInstagramMedia(this.sb, this.agencyId, this.post, { timeoutMs: left - 20_000 });
    return this.fields;
  }

  /** Download one link, reading the post again once when Instagram says it has expired. */
  async bytes(pick: (f: MediaFields) => string | null, maxBytes: number, timeoutMs: number): Promise<{ bytes: Buffer; contentType: string | null }> {
    const url = pick(await this.fresh());
    if (!url) throw new Error("the post has no video link");
    try {
      return await fetchCapped(url, maxBytes, timeoutMs);
    } catch (e) {
      if (e instanceof MediaFetchError && (e.status === 403 || e.status === 410) && !this.refreshed) {
        const again = pick(await this.fresh(true));
        if (!again) throw new Error("the post still has no video link after reading it again");
        return fetchCapped(again, maxBytes, timeoutMs);
      }
      throw e;
    }
  }
}

const left = (deadline: number, most: number) => Math.max(5_000, Math.min(most, deadline - Date.now()));

async function runStep(step: AnalysisStep, post: AnalysedPost, ctx: BreakdownContext, media: MediaSource, deadline: number): Promise<StepOutcome> {
  if (step.kind === "gemini_youtube") {
    // Built again from the video id we checked, never taken from the stored address, so only a
    // YouTube watch address ever reaches Gemini.
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(post.external_id)) throw new Error("the post has no usable YouTube video id");
    const input: BreakdownInput = { kind: "video", clipped: step.clipEndS !== null };
    const parts: GeminiPart[] = [youtubePart(`https://www.youtube.com/watch?v=${post.external_id}`, { endS: step.clipEndS }), textPart(breakdownPrompt(ctx, input))];
    const answer = await geminiJson(parts, { label: "breakdown", timeoutMs: left(deadline, 60_000) });
    return { raw: answer.json, input, model: answer.model, transcript: null };
  }
  if (step.kind === "gemini_video") {
    const { bytes, contentType } = await media.bytes((f) => f.media_url, INLINE_VIDEO_MAX_BYTES, MEDIA_TIMEOUT_MS);
    const input: BreakdownInput = { kind: "video", clipped: false };
    const mime = contentType?.startsWith("video/") ? contentType.split(";")[0] : "video/mp4";
    const parts: GeminiPart[] = [inlinePart(bytes, mime), textPart(breakdownPrompt(ctx, input))];
    const answer = await geminiJson(parts, { label: "breakdown", timeoutMs: left(deadline, 75_000) });
    return { raw: answer.json, input, model: answer.model, transcript: null };
  }
  if (step.kind === "gemini_slides") {
    const fields = await media.fresh();
    const urls = (fields.image_urls?.length ? fields.image_urls : fields.display_url ? [fields.display_url] : []).slice(0, step.count);
    const images: GeminiPart[] = [];
    for (const url of urls) {
      try {
        const { bytes, contentType } = await fetchCapped(url, SLIDE_MAX_BYTES, SLIDE_TIMEOUT_MS);
        images.push(inlinePart(bytes, contentType?.startsWith("image/") ? contentType.split(";")[0] : "image/jpeg"));
      } catch (e) {
        // One dead slide should not cost the whole breakdown; the model is told how many it got.
        console.warn(`[research] a slide of post ${post.id} could not be fetched:`, e instanceof Error ? e.message : e);
      }
    }
    if (images.length === 0) throw new Error("no slide could be fetched");
    const input: BreakdownInput = { kind: "slides", count: images.length };
    const answer = await geminiJson([...images, textPart(breakdownPrompt(ctx, input))], { label: "breakdown", timeoutMs: left(deadline, 60_000) });
    return { raw: answer.json, input, model: answer.model, transcript: null };
  }
  if (step.kind === "transcript") {
    const fields = await media.fresh();
    const url = [fields.audio_url, fields.media_url].find((u) => isAllowedMediaUrl(u));
    if (!url) throw new Error("the post has no link the words can be pulled from");
    const transcript = await transcribeUrl(url, { label: "breakdown", quiet: true });
    if (transcript.text.length < MIN_SPEECH_CHARS) throw new Error("nobody speaks in this video");
    const input: BreakdownInput = { kind: "transcript", transcript: formatTranscript(transcript) };
    const answer = await askJson(breakdownPrompt(ctx, input), { label: "breakdown", timeoutMs: left(deadline, 30_000), temperature: 0.4, deadline, quiet: true });
    return { raw: answer.json, input, model: `${transcript.model} + ${answer.model}`, transcript: transcript.text };
  }
  if (!post.caption && !post.description) {
    throw new ResearchUserError("This video could not be watched right now and it has no caption to read. Try again later.");
  }
  const input: BreakdownInput = { kind: "caption" };
  const answer = await askJson(breakdownPrompt(ctx, input), { label: "breakdown", timeoutMs: left(deadline, 30_000), temperature: 0.4, deadline, quiet: true });
  return { raw: answer.json, input, model: answer.model, transcript: null };
}

/** Check a breakdown, fix it once in words when a check it can fix has failed, and strip whatever
    still points at nothing. */
async function checked(b: Breakdown, input: BreakdownInput, model: string, deadline: number): Promise<{ breakdown: Breakdown; model: string }> {
  let breakdown = b;
  let usedModel = model;
  const problems = breakdownProblems(breakdown, input.kind);
  if (problems.length) console.log(`[research] the first breakdown failed these checks: ${problems.map((p) => p.field).join(", ")}`);
  if (problems.some((p) => p.fixableInText) && deadline - Date.now() > 20_000) {
    try {
      const fix = await askJson(breakdownRepairPrompt(breakdown, problems), { label: "breakdown-repair", timeoutMs: left(deadline, 25_000), temperature: 0.3, deadline, quiet: true });
      breakdown = mergeRepair(breakdown, fix.json);
      usedModel = `${usedModel} + fixed by ${fix.provider}`;
    } catch (e) {
      // The first answer is still worth saving, and filler is stripped below either way.
      console.warn("[research] the breakdown fix could not run, keeping the first answer:", e instanceof Error ? e.message : e);
    }
  }
  const remaining = breakdownProblems(breakdown, input.kind);
  if (remaining.length) console.warn(`[research] breakdown saved with checks still open: ${remaining.map((p) => p.field).join(", ")}`);
  return { breakdown: finalizeBreakdown(breakdown), model: usedModel };
}

/** Break one video down and save it. The richest route that works wins; a route that fails (a
    spent allowance, a video too big, an expired link, no speech) falls through to the next. */
export async function analyzePost(sb: SupabaseClient, agencyId: string, postId: string, opts: { deadline?: number } = {}): Promise<AnalyzeResult> {
  const deadline = opts.deadline ?? Date.now() + ANALYZE_BUDGET_MS;
  const post = await loadPost(sb, agencyId, postId);
  const plan = analysisPlan({ ...post, duration_s: num(post.duration_s) }, { geminiAvailable: geminiAvailable() });
  const media = new MediaSource(sb, agencyId, post, post, deadline);
  const ctx = contextOf(post);

  for (const step of plan) {
    if (deadline - Date.now() < MIN_STEP_MS) break;
    let outcome: StepOutcome;
    try {
      outcome = await runStep(step, post, ctx, media, deadline);
    } catch (e) {
      if (e instanceof ResearchUserError || (step.kind === "caption" && e instanceof DailyQuotaSpent)) throw e;
      console.warn(`[research] post ${post.id}: ${step.kind} did not work, trying the next route:`, e instanceof Error ? e.message : e);
      continue;
    }
    const coerced = coerceBreakdown(outcome.raw, SOURCE_OF[outcome.input.kind]);
    if (!coerced) {
      console.warn(`[research] post ${post.id}: ${step.kind} answered something that is not a breakdown`);
      continue;
    }
    const { breakdown, model } = await checked(coerced, outcome.input, outcome.model, deadline);
    const nowIso = new Date().toISOString();
    const { error } = await sb
      .from("content_posts")
      .update({
        breakdown,
        breakdown_model: model.slice(0, 200),
        analysed_at: nowIso,
        updated_at: nowIso,
        ...(outcome.transcript ? { transcript: outcome.transcript.slice(0, 20_000) } : {}),
      })
      .eq("id", post.id)
      .eq("agency_id", agencyId);
    if (error) throw new Error(`Saving the breakdown failed: ${error.message}`);
    // Update only, never add: a post that is not a standout has no row on the Creators tab, and the
    // caption line is left alone because every scan writes it again from the caption itself.
    const { error: mirrorError } = await sb
      .from("content_outliers")
      .update({
        hook_type: breakdown.hook_type,
        hook_template: breakdown.hook_template,
        format: breakdown.format,
        ask: breakdown.ask,
        why_it_worked: breakdown.why_it_holds_attention,
        analysed: true,
      })
      .eq("agency_id", agencyId)
      .eq("url", post.url);
    if (mirrorError) throw new Error(`Saving the breakdown on the Creators tab failed: ${mirrorError.message}`);
    return { breakdown, model, transcript: outcome.transcript };
  }
  throw new ResearchUserError("This video could not be broken down right now. Try again in a few minutes.");
}
