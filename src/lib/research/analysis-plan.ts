// Which route a post's analysis takes, richest first. Pure, so the choice for every platform, kind,
// length and key situation is unit tested; analyze.ts runs the steps and falls through on failure.

import type { Platform, PostKind } from "./types";

/** A YouTube video longer than a Short is watched up to this second: the open is what gets copied. */
export const YOUTUBE_CLIP_S = 120;
/** Reels longer than this are too large to send whole (15MB inline), so they go to the transcript. */
export const INLINE_VIDEO_MAX_S = 150;
export const INLINE_VIDEO_MAX_BYTES = 15 * 1024 * 1024;
export const SLIDES_MAX = 6;
export const SLIDE_MAX_BYTES = 2 * 1024 * 1024;
const SHORT_MAX_S = 180;

export type AnalysisStep =
  | { kind: "gemini_youtube"; clipEndS: number | null }
  | { kind: "gemini_video" }
  | { kind: "gemini_slides"; count: number }
  | { kind: "transcript" }
  | { kind: "caption" };

export interface PlanInput {
  platform: Platform;
  kind: PostKind;
  duration_s: number | null;
  media_url: string | null;
  audio_url: string | null;
  display_url: string | null;
  image_urls: string[] | null;
}

/** The routes to try for one post, richest first; the executor stops at the first that answers.
    YouTube: Gemini watches it from its url, else the title and description. Instagram reel: Gemini
    watches the downloaded bytes, else a Whisper transcript, else the caption. Carousel or image:
    Gemini looks at the slides, else the caption. */
export function analysisPlan(post: PlanInput, opts: { geminiAvailable: boolean }): AnalysisStep[] {
  const steps: AnalysisStep[] = [];
  if (post.platform === "youtube") {
    if (opts.geminiAvailable) {
      const short = post.duration_s !== null && post.duration_s <= SHORT_MAX_S;
      steps.push({ kind: "gemini_youtube", clipEndS: short ? null : YOUTUBE_CLIP_S });
    }
    steps.push({ kind: "caption" });
    return steps;
  }
  if (post.kind === "reel" || post.kind === "short" || post.kind === "video") {
    const fitsInline = post.duration_s === null || post.duration_s <= INLINE_VIDEO_MAX_S;
    if (opts.geminiAvailable && post.media_url && fitsInline) steps.push({ kind: "gemini_video" });
    if (post.audio_url || post.media_url) steps.push({ kind: "transcript" });
    steps.push({ kind: "caption" });
    return steps;
  }
  const slides = post.image_urls?.length ? post.image_urls.length : post.display_url ? 1 : 0;
  if (opts.geminiAvailable && slides > 0) steps.push({ kind: "gemini_slides", count: Math.min(SLIDES_MAX, slides) });
  steps.push({ kind: "caption" });
  return steps;
}
