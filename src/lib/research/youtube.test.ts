import { describe, expect, it } from "vitest";
import { bestThumbnail, normalizeYoutubeVideo, parseChannelRef, parseIsoDuration, SHORT_MAX_SECONDS, uploadsPlaylistId, youtubeKind } from "./youtube";

describe("reading a YouTube length", () => {
  it("handles hours, minutes and seconds", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3_723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT3M")).toBe(180);
    expect(parseIsoDuration("P1DT4M")).toBe(86_640);
    expect(parseIsoDuration("PT1M30.5S")).toBe(90.5);
  });

  it("says nothing rather than guessing when it is not a length", () => {
    expect(parseIsoDuration("P")).toBeNull();
    expect(parseIsoDuration("PT")).toBeNull();
    expect(parseIsoDuration("90 seconds")).toBeNull();
    expect(parseIsoDuration(null)).toBeNull();
    expect(parseIsoDuration("")).toBeNull();
  });

  it("calls anything three minutes or under a Short", () => {
    expect(youtubeKind(SHORT_MAX_SECONDS)).toBe("short");
    expect(youtubeKind(SHORT_MAX_SECONDS + 1)).toBe("video");
    expect(youtubeKind(null)).toBe("video");
    expect(youtubeKind(0)).toBe("video");
  });
});

describe("working out which channel is meant", () => {
  it("accepts a channel id, an @handle, a bare name and a link", () => {
    expect(parseChannelRef({ channelId: "UCabcdefghijklmnopqrstuv" })).toEqual({ channelId: "UCabcdefghijklmnopqrstuv" });
    expect(parseChannelRef({ handle: "@SomeChannel" })).toEqual({ handle: "SomeChannel" });
    expect(parseChannelRef({ handle: "SomeChannel" })).toEqual({ handle: "SomeChannel" });
    expect(parseChannelRef({ handle: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv" })).toEqual({
      channelId: "UCabcdefghijklmnopqrstuv",
    });
    expect(parseChannelRef({ handle: "https://www.youtube.com/@SomeChannel" })).toEqual({ handle: "SomeChannel" });
  });

  it("gives nothing back for something that is not a channel", () => {
    expect(parseChannelRef({ handle: "" })).toBeNull();
    expect(parseChannelRef({ handle: "a b" })).toBeNull();
  });

  it("builds the uploads list id from the channel id", () => {
    expect(uploadsPlaylistId("UCabcdefghijklmnopqrstuv")).toBe("UUabcdefghijklmnopqrstuv");
  });
});

describe("turning a video into a post", () => {
  const video = {
    id: "dQw4w9WgXcQ",
    snippet: {
      title: "  How we fixed it  ",
      description: " A description ",
      publishedAt: "2026-07-01T09:00:00Z",
      channelId: "UCabcdefghijklmnopqrstuv",
      liveBroadcastContent: "none",
      thumbnails: { medium: { url: "https://i.ytimg.com/m.jpg" }, maxres: { url: "https://i.ytimg.com/max.jpg" } },
    },
    statistics: { viewCount: "12345", likeCount: "678", commentCount: "9" },
    contentDetails: { duration: "PT2M10S" },
  };

  it("reads one end to end", () => {
    const p = normalizeYoutubeVideo(video)!;
    expect(p.platform).toBe("youtube");
    expect(p.kind).toBe("short");
    expect(p.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(p.caption).toBe("How we fixed it");
    expect(p.views).toBe(12_345);
    expect(p.likes).toBe(678);
    expect(p.duration_s).toBe(130);
    expect(p.thumb_url).toBe("https://i.ytimg.com/max.jpg");
  });

  it("skips a live or upcoming stream, which has no settled numbers yet", () => {
    expect(normalizeYoutubeVideo({ ...video, snippet: { ...video.snippet, liveBroadcastContent: "live" } })).toBeNull();
    expect(normalizeYoutubeVideo({ ...video, snippet: { ...video.snippet, liveBroadcastContent: "upcoming" } })).toBeNull();
  });

  it("treats a hidden like count as unknown", () => {
    const p = normalizeYoutubeVideo({ ...video, statistics: { viewCount: "5" } })!;
    expect(p.likes).toBeNull();
    expect(p.comments).toBeNull();
    expect(p.views).toBe(5);
  });

  it("refuses a row with no usable id", () => {
    expect(normalizeYoutubeVideo({ ...video, id: "" })).toBeNull();
    expect(normalizeYoutubeVideo(null)).toBeNull();
  });

  it("picks the biggest thumbnail on offer", () => {
    expect(bestThumbnail({ high: { url: "https://h.jpg" }, medium: { url: "https://m.jpg" } })).toBe("https://h.jpg");
    expect(bestThumbnail({ medium: { url: "https://m.jpg" } })).toBe("https://m.jpg");
    expect(bestThumbnail(undefined)).toBeNull();
    expect(bestThumbnail({ high: { url: "http://insecure.jpg" } })).toBeNull();
  });
});

