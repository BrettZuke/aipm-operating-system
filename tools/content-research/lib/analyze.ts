// Working out why one post beat its creator's normal.
//
// It picks the richest free route it can get, in this order:
//   1. YouTube: Gemini watches the video straight off YouTube. The whole thing when it is a Short,
//      the first two minutes when it is long.
//   2. Instagram reel: download the video (stopping at 15MB) and send it to Gemini to watch.
//   3. Either of those failing: pull the words out with Groq's Whisper and work from the transcript.
//      The breakdown is then marked "transcript" and is never allowed to describe anything visual.
//   4. Carousel or image post: send the slides to Gemini to look at. Failing that, the caption only.
//
// Whatever route it took is written into the saved breakdown, so nobody ever mistakes a caption read
// for a video watched.

import { breakdownPrompt, breakdownProblems, breakdownRepairPrompt, coerceBreakdown, finalizeBreakdown, mergeRepair, performanceLine, SOURCE_OF, YOUTUBE_CLIP_S, type BreakdownContext, type BreakdownInput } from "./breakdown";
import { geminiAvailable, geminiJson, inlinePart, textPart, youtubePart, type GeminiPart } from "./gemini";
import { askJson, DailyQuotaSpent } from "./llm";
import { fetchCapped, isAllowedMediaUrl } from "./media";
import { formatTranscript, transcribeUrl } from "./transcribe";
import type { Breakdown, ScoredPost } from "./types";

const VIDEO_MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const MEDIA_TIMEOUT_MS = 60_000;
const MAX_SLIDES = 6;

export interface AnalyzeResult {
  breakdown: Breakdown;
  /** "gemini:gemini-3.6-flash" and so on, so the report can say who answered. */
  model: string;
  calls: { label: string; provider: string; model: string; ms: number }[];
  transcript: string | null;
  /** The plain-English story of which route was taken, printed as it happens. */
  route: string;
}

export function contextFor(post: ScoredPost): BreakdownContext {
  return {
    creatorName: post.creator,
    platform: post.platform,
    kind: post.kind,
    caption: post.caption,
    description: post.description,
    durationS: post.duration_s,
    views: post.views,
    metric: post.metric,
    score: post.score,
    baseline: post.baseline,
    multiple: post.multiple,
    postedAt: post.posted_at,
  };
}

export function performanceFor(post: ScoredPost): string {
  return performanceLine({ metric: post.metric, score: post.score, baseline: post.baseline, multiple: post.multiple, views: post.views });
}

/** Turn a model answer into a checked, saved-safe breakdown, repairing it once when the checks fail. */
async function settle(
  raw: unknown,
  input: BreakdownInput,
  calls: AnalyzeResult["calls"],
  onNote: (line: string) => void,
): Promise<Breakdown | null> {
  const first = coerceBreakdown(raw, SOURCE_OF[input.kind]);
  if (!first) return null;
  const problems = breakdownProblems(first, input.kind);
  if (problems.length === 0) return finalizeBreakdown(first);
  const fixable = problems.filter((p) => p.fixableInText);
  onNote(`  checking it: ${problems.length} problem${problems.length === 1 ? "" : "s"} found, asking for a fix`);
  if (fixable.length === 0) return finalizeBreakdown(first);
  try {
    const repair = await askJson(breakdownRepairPrompt(first, problems), { label: "breakdown repair", temperature: 0.2 });
    calls.push({ label: "breakdown repair", provider: repair.provider, model: repair.model, ms: repair.ms });
    return finalizeBreakdown(mergeRepair(first, repair.json));
  } catch (e) {
    // A repair that cannot run is not a reason to throw the whole breakdown away. The filler strip
    // at the end still removes anything that points at nothing.
    onNote(`  the fix could not run (${e instanceof Error ? e.message : String(e)}), keeping what we have`);
    return finalizeBreakdown(first);
  }
}

/** Break one post down. onNote is called with each step so the command can print as it goes. */
export async function analyzePost(post: ScoredPost, onNote: (line: string) => void = () => {}): Promise<AnalyzeResult> {
  const ctx = contextFor(post);
  const calls: AnalyzeResult["calls"] = [];
  let transcript: string | null = null;

  // 1 and 2: watch it.
  if (geminiAvailable()) {
    const watched = await tryWatch(post, ctx, calls, onNote);
    if (watched) return { ...watched, transcript };
  } else {
    onNote("  no Gemini key set, so the video cannot be watched; using the words instead");
  }

  // 3: the words only.
  const audio = post.audio_url ?? post.media_url;
  if (audio && isAllowedMediaUrl(audio)) {
    try {
      onNote("  pulling the words out with Groq Whisper");
      const t = await transcribeUrl(audio, { label: "transcribe" });
      calls.push({ label: "transcribe", provider: t.provider, model: t.model, ms: t.ms });
      transcript = formatTranscript(t);
      const input: BreakdownInput = { kind: "transcript", transcript };
      const answer = await askJson(breakdownPrompt(ctx, input), { label: "breakdown from words", temperature: 0.3 });
      calls.push({ label: "breakdown from words", provider: answer.provider, model: answer.model, ms: answer.ms });
      const breakdown = await settle(answer.json, input, calls, onNote);
      if (breakdown) return { breakdown, model: `${answer.provider}:${answer.model}`, calls, transcript, route: "read the words (the video itself was not watched)" };
    } catch (e) {
      onNote(`  the words could not be pulled out (${e instanceof Error ? e.message : String(e)})`);
    }
  } else if (post.platform === "youtube") {
    onNote("  a YouTube video cannot be transcribed without watching it, so the caption route is next");
  }

  // 4: the caption only.
  onNote("  falling back to the caption and the numbers only");
  const input: BreakdownInput = { kind: "caption" };
  const answer = await askJson(breakdownPrompt(ctx, input), { label: "breakdown from caption", temperature: 0.3 });
  calls.push({ label: "breakdown from caption", provider: answer.provider, model: answer.model, ms: answer.ms });
  const breakdown = await settle(answer.json, input, calls, onNote);
  if (!breakdown) throw new Error("The model did not answer with a breakdown at all. Run the command again.");
  return { breakdown, model: `${answer.provider}:${answer.model}`, calls, transcript, route: "read the caption and the numbers only (the video was not watched or transcribed)" };
}

async function tryWatch(
  post: ScoredPost,
  ctx: BreakdownContext,
  calls: AnalyzeResult["calls"],
  onNote: (line: string) => void,
): Promise<Omit<AnalyzeResult, "transcript"> | null> {
  try {
    if (post.platform === "youtube") {
      const clipped = (post.duration_s ?? 0) > 180;
      onNote(clipped ? `  Gemini is watching the first ${YOUTUBE_CLIP_S / 60} minutes on YouTube` : "  Gemini is watching the whole video on YouTube");
      const input: BreakdownInput = { kind: "video", clipped };
      const parts: GeminiPart[] = [youtubePart(post.url, clipped ? { endS: YOUTUBE_CLIP_S } : undefined), textPart(breakdownPrompt(ctx, input))];
      const answer = await geminiJson(parts, { label: "watch youtube", timeoutMs: 120_000 });
      calls.push({ label: "watch youtube", provider: answer.provider, model: answer.model, ms: answer.ms });
      const breakdown = await settle(answer.json, input, calls, onNote);
      return breakdown ? { breakdown, model: `${answer.provider}:${answer.model}`, calls, route: clipped ? "watched the first two minutes on YouTube" : "watched the whole video on YouTube" } : null;
    }

    if (post.kind === "carousel" || post.kind === "image") {
      const urls = (post.image_urls ?? [post.display_url].filter((u): u is string => !!u)).slice(0, MAX_SLIDES);
      if (urls.length === 0) return null;
      onNote(`  Gemini is looking at ${urls.length} slide${urls.length === 1 ? "" : "s"}`);
      const parts: GeminiPart[] = [];
      for (const url of urls) {
        const { bytes, contentType } = await fetchCapped(url, IMAGE_MAX_BYTES, MEDIA_TIMEOUT_MS);
        parts.push(inlinePart(bytes, contentType?.startsWith("image/") ? contentType : "image/jpeg"));
      }
      const input: BreakdownInput = { kind: "slides", count: parts.length };
      parts.push(textPart(breakdownPrompt(ctx, input)));
      const answer = await geminiJson(parts, { label: "look at slides", timeoutMs: 120_000 });
      calls.push({ label: "look at slides", provider: answer.provider, model: answer.model, ms: answer.ms });
      const breakdown = await settle(answer.json, input, calls, onNote);
      return breakdown ? { breakdown, model: `${answer.provider}:${answer.model}`, calls, route: `looked at ${input.count} slides` } : null;
    }

    if (!post.media_url || !isAllowedMediaUrl(post.media_url)) return null;
    onNote("  downloading the reel so Gemini can watch it");
    const { bytes, contentType } = await fetchCapped(post.media_url, VIDEO_MAX_BYTES, MEDIA_TIMEOUT_MS);
    const input: BreakdownInput = { kind: "video", clipped: false };
    const parts: GeminiPart[] = [inlinePart(bytes, contentType?.startsWith("video/") ? contentType : "video/mp4"), textPart(breakdownPrompt(ctx, input))];
    const answer = await geminiJson(parts, { label: "watch reel", timeoutMs: 150_000 });
    calls.push({ label: "watch reel", provider: answer.provider, model: answer.model, ms: answer.ms });
    const breakdown = await settle(answer.json, input, calls, onNote);
    return breakdown ? { breakdown, model: `${answer.provider}:${answer.model}`, calls, route: "watched the reel itself" } : null;
  } catch (e) {
    if (e instanceof DailyQuotaSpent) {
      onNote("  today's free Gemini allowance is spent, so the video cannot be watched until tomorrow");
      return null;
    }
    onNote(`  watching it did not work (${e instanceof Error ? e.message : String(e)})`);
    return null;
  }
}
