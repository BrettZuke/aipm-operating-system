import { describe, expect, it } from "vitest";
import { assignToCreators, outlierMirrorRow, SCAN_ROLES } from "./ingest";
import type { CreatorLite, PostInput } from "./types";

const creator = (over: Partial<CreatorLite> = {}): CreatorLite => ({
  id: "c1",
  name: "Some Plumber",
  handle: "someplumber",
  instagram: "someplumber",
  youtube: null,
  youtube_channel_id: null,
  role: "emulate",
  status: "active",
  min_score: null,
  ...over,
});

const post = (over: Partial<PostInput> = {}): PostInput => ({
  platform: "instagram",
  external_id: "ABC",
  url: "https://www.instagram.com/p/ABC/",
  kind: "reel",
  posted_at: "2026-09-10T10:00:00Z",
  caption: "First line\nSecond line",
  description: null,
  duration_s: 30,
  views: 12_000,
  likes: 400,
  comments: 20,
  thumb_url: null,
  display_url: null,
  media_url: null,
  audio_url: null,
  image_urls: null,
  media_expires_at: null,
  owner: "someplumber",
  source: "someplumber",
  ...over,
});

describe("matching scraped posts back to the creator they came from", () => {
  it("matches on who posted it", () => {
    const { byCreator, unmatched } = assignToCreators([post()], [creator()]);
    expect(byCreator.get("c1")).toHaveLength(1);
    expect(unmatched).toBe(0);
  });

  it("falls back to the profile it was read from, for a post made with somebody else", () => {
    const { byCreator } = assignToCreators([post({ owner: "acollaborator" })], [creator()]);
    expect(byCreator.get("c1")).toHaveLength(1);
  });

  it("counts a post it cannot place rather than guessing", () => {
    const { byCreator, unmatched } = assignToCreators([post({ owner: "stranger", source: null })], [creator()]);
    expect(byCreator.size).toBe(0);
    expect(unmatched).toBe(1);
  });

  it("matches on the roster handle when there is no Instagram value", () => {
    const { byCreator } = assignToCreators([post()], [creator({ instagram: null })]);
    expect(byCreator.get("c1")).toHaveLength(1);
  });
});

describe("the row a standout leaves on the Creators tab", () => {
  it("never carries the columns the breakdown owns, so saving numbers cannot blank an explanation", () => {
    const row = outlierMirrorRow("agency", { name: "Some Plumber", handle: "someplumber" }, post(), { metric: "views", score: 12_000, baseline: 1_000, multiple: 12 }, "run1");
    for (const owned of ["analysed", "hook_type", "hook_template", "format", "ask", "why_it_worked"]) {
      expect(row).not.toHaveProperty(owned);
    }
    expect(row.caption_hook).toBe("First line");
    expect(row.post_type).toBe("Video");
    expect(row.creator_median).toBe(1_000);
  });

  it("leaves the run pointer alone when there is no run", () => {
    const row = outlierMirrorRow("agency", { name: "n", handle: "h" }, post(), { metric: "views", score: 1, baseline: 1, multiple: 1 }, null);
    expect(row).not.toHaveProperty("run_id");
  });

  it("uses the words the Creators tab already shows for each kind of post", () => {
    const m = { metric: "views" as const, score: 1, baseline: 1, multiple: 1 };
    expect(outlierMirrorRow("a", { name: "n", handle: "h" }, post({ kind: "carousel" }), m, null).post_type).toBe("Sidecar");
    expect(outlierMirrorRow("a", { name: "n", handle: "h" }, post({ kind: "image" }), m, null).post_type).toBe("Image");
    expect(outlierMirrorRow("a", { name: "n", handle: "h" }, post({ platform: "youtube", kind: "short" }), m, null).post_type).toBe("Video");
  });

  it("puts a YouTube title and description together, because that is the post's words", () => {
    const row = outlierMirrorRow(
      "a",
      { name: "n", handle: "h" },
      post({ platform: "youtube", kind: "video", caption: "The title", description: "The description" }),
      { metric: "views", score: 1, baseline: 1, multiple: 1 },
      null,
    );
    expect(row.caption).toBe("The title\n\nThe description");
  });
});

describe("which creators a scan reads at all", () => {
  it("never reads the ones marked Ideas only", () => {
    expect(SCAN_ROLES).toEqual(["emulate", "watch", "strategist"]);
    expect(SCAN_ROLES).not.toContain("ideas");
  });
});
