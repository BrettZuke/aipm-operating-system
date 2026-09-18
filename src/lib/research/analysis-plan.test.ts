import { describe, expect, it } from "vitest";
import { analysisPlan, INLINE_VIDEO_MAX_S, YOUTUBE_CLIP_S, type PlanInput } from "./analysis-plan";

const reel: PlanInput = {
  platform: "instagram",
  kind: "reel",
  duration_s: 34,
  media_url: "https://scontent.cdninstagram.com/v/reel.mp4?oe=6A70104A",
  audio_url: "https://scontent.cdninstagram.com/v/reel.m4a?oe=6A70104A",
  display_url: "https://scontent.cdninstagram.com/v/cover.jpg?oe=6A70104A",
  image_urls: null,
};
const youtube = (kind: "short" | "video", duration: number | null): PlanInput => ({
  platform: "youtube",
  kind,
  duration_s: duration,
  media_url: null,
  audio_url: null,
  display_url: null,
  image_urls: null,
});
const kinds = (steps: ReturnType<typeof analysisPlan>) => steps.map((s) => s.kind);

describe("analysisPlan", () => {
  it("has Gemini watch a YouTube Short whole, then falls back to its title and description", () => {
    expect(analysisPlan(youtube("short", 45), { geminiAvailable: true })).toEqual([{ kind: "gemini_youtube", clipEndS: null }, { kind: "caption" }]);
  });

  it("clips a long YouTube video to its first two minutes, including one of unknown length", () => {
    expect(YOUTUBE_CLIP_S).toBe(120);
    expect(analysisPlan(youtube("video", 1_260), { geminiAvailable: true })[0]).toEqual({ kind: "gemini_youtube", clipEndS: 120 });
    expect(analysisPlan(youtube("video", null), { geminiAvailable: true })[0]).toEqual({ kind: "gemini_youtube", clipEndS: 120 });
    // Exactly 180 seconds is still a Short and is watched whole.
    expect(analysisPlan(youtube("short", 180), { geminiAvailable: true })[0]).toEqual({ kind: "gemini_youtube", clipEndS: null });
  });

  it("reads YouTube from its title and description when Gemini is unavailable (a YouTube url cannot be transcribed)", () => {
    expect(kinds(analysisPlan(youtube("short", 45), { geminiAvailable: false }))).toEqual(["caption"]);
  });

  it("watches a reel inline, then its transcript, then its caption", () => {
    expect(kinds(analysisPlan(reel, { geminiAvailable: true }))).toEqual(["gemini_video", "transcript", "caption"]);
  });

  it("sends a reel too long to fit inline straight to its transcript", () => {
    expect(kinds(analysisPlan({ ...reel, duration_s: INLINE_VIDEO_MAX_S }, { geminiAvailable: true }))).toEqual(["gemini_video", "transcript", "caption"]);
    expect(kinds(analysisPlan({ ...reel, duration_s: INLINE_VIDEO_MAX_S + 1 }, { geminiAvailable: true }))).toEqual(["transcript", "caption"]);
    // Unknown length is tried inline; the 15MB download cap decides at run time.
    expect(kinds(analysisPlan({ ...reel, duration_s: null }, { geminiAvailable: true }))).toEqual(["gemini_video", "transcript", "caption"]);
  });

  it("uses the transcript first when Gemini is disabled or spent", () => {
    expect(kinds(analysisPlan(reel, { geminiAvailable: false }))).toEqual(["transcript", "caption"]);
  });

  it("transcribes from the audio alone, and reads only the caption when there is no media at all", () => {
    expect(kinds(analysisPlan({ ...reel, media_url: null }, { geminiAvailable: true }))).toEqual(["transcript", "caption"]);
    expect(kinds(analysisPlan({ ...reel, media_url: null, audio_url: null }, { geminiAvailable: true }))).toEqual(["caption"]);
  });

  it("looks at up to six carousel slides, or the one image of an image post", () => {
    const slides = Array.from({ length: 8 }, (_, i) => `https://scontent.cdninstagram.com/v/slide${i}.jpg`);
    expect(analysisPlan({ ...reel, kind: "carousel", media_url: null, audio_url: null, image_urls: slides }, { geminiAvailable: true })).toEqual([{ kind: "gemini_slides", count: 6 }, { kind: "caption" }]);
    expect(analysisPlan({ ...reel, kind: "image", media_url: null, audio_url: null }, { geminiAvailable: true })).toEqual([{ kind: "gemini_slides", count: 1 }, { kind: "caption" }]);
    expect(kinds(analysisPlan({ ...reel, kind: "carousel", media_url: null, audio_url: null, image_urls: null, display_url: null }, { geminiAvailable: true }))).toEqual(["caption"]);
    expect(kinds(analysisPlan({ ...reel, kind: "carousel", image_urls: slides }, { geminiAvailable: false }))).toEqual(["caption"]);
  });
});
