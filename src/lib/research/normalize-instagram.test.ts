import { describe, expect, it } from "vitest";
import { handleFromProfileUrl, MAX_IMAGE_URLS, normalizeInstagramItem, normalizeInstagramItems, oeExpiry, profileUrl } from "./normalize-instagram";

const reel = {
  shortCode: "C9abcDEF12",
  type: "Video",
  productType: "clips",
  timestamp: "2026-08-01T10:00:00.000Z",
  caption: "One line\nSecond line",
  likesCount: 240,
  commentsCount: 12,
  videoPlayCount: 50_000,
  videoViewCount: 31_000,
  videoDuration: 27.5,
  displayUrl: "https://scontent.cdninstagram.com/v/cover.jpg?oe=68B0C480",
  videoUrl: "https://scontent.cdninstagram.com/v/video.mp4?oe=68B0C480",
  audioUrl: "https://scontent.cdninstagram.com/v/audio.m4a",
  ownerUsername: "SomeCreator",
  inputUrl: "https://www.instagram.com/SomeCreator/",
};

describe("turning a scraped row into a post", () => {
  it("reads a reel end to end", () => {
    const p = normalizeInstagramItem(reel)!;
    expect(p.platform).toBe("instagram");
    expect(p.kind).toBe("reel");
    expect(p.external_id).toBe("C9abcDEF12");
    expect(p.url).toBe("https://www.instagram.com/p/C9abcDEF12/");
    expect(p.views).toBe(50_000);
    expect(p.likes).toBe(240);
    expect(p.comments).toBe(12);
    expect(p.duration_s).toBe(27.5);
    expect(p.owner).toBe("somecreator");
    expect(p.source).toBe("somecreator");
    expect(p.posted_at).toBe("2026-08-01T10:00:00.000Z");
  });

  it("prefers the plays number over the older, lower one", () => {
    expect(normalizeInstagramItem(reel)!.views).toBe(50_000);
    expect(normalizeInstagramItem({ ...reel, videoPlayCount: undefined })!.views).toBe(31_000);
    expect(normalizeInstagramItem({ ...reel, videoPlayCount: 0, videoViewCount: 0 })!.views).toBeNull();
  });

  it("treats hidden likes as unknown, not zero", () => {
    expect(normalizeInstagramItem({ ...reel, likesCount: -1 })!.likes).toBeNull();
    expect(normalizeInstagramItem({ ...reel, likesCount: 0 })!.likes).toBe(0);
  });

  it("knows a carousel from an image from a reel", () => {
    expect(normalizeInstagramItem({ ...reel, type: "Sidecar" })!.kind).toBe("carousel");
    expect(normalizeInstagramItem({ ...reel, type: "Image" })!.kind).toBe("image");
    expect(normalizeInstagramItem({ ...reel, type: "Something" })).toBeNull();
  });

  it("keeps at most eight carousel slides", () => {
    const images = Array.from({ length: 12 }, (_, i) => `https://scontent.cdninstagram.com/s${i}.jpg`);
    const p = normalizeInstagramItem({ ...reel, type: "Sidecar", images })!;
    expect(p.image_urls).toHaveLength(MAX_IMAGE_URLS);
  });

  it("throws away rows that carry an error or no usable code", () => {
    expect(normalizeInstagramItem({ ...reel, error: "not found" })).toBeNull();
    expect(normalizeInstagramItem({ ...reel, shortCode: "ab" })).toBeNull();
    expect(normalizeInstagramItem({ ...reel, shortCode: "has spaces!" })).toBeNull();
    expect(normalizeInstagramItem(null)).toBeNull();
    expect(normalizeInstagramItem([reel])).toBeNull();
  });

  it("leaves the date null when the timestamp is nonsense", () => {
    expect(normalizeInstagramItem({ ...reel, timestamp: "not a date" })!.posted_at).toBeNull();
  });

  it("keeps the first copy of a repeated post", () => {
    const posts = normalizeInstagramItems([reel, { ...reel, likesCount: 999 }, { ...reel, shortCode: "OTHER12345" }]);
    expect(posts).toHaveLength(2);
    expect(posts[0].likes).toBe(240);
  });
});

describe("when Instagram's links run out", () => {
  it("reads the expiry out of the address", () => {
    expect(oeExpiry("https://x.cdninstagram.com/a.mp4?oe=68B0C480")).toBe(new Date(0x68b0c480 * 1000).toISOString());
  });

  it("ignores an oe value that is not a sensible date", () => {
    expect(oeExpiry("https://x.cdninstagram.com/a.mp4?oe=1")).toBeNull();
    expect(oeExpiry("https://x.cdninstagram.com/a.mp4?oe=zzzz")).toBeNull();
    expect(oeExpiry("https://x.cdninstagram.com/a.mp4")).toBeNull();
    expect(oeExpiry(null)).toBeNull();
  });

  it("falls back to the cover image's expiry when the video has none", () => {
    const p = normalizeInstagramItem({ ...reel, videoUrl: "https://x.cdninstagram.com/a.mp4" })!;
    expect(p.media_expires_at).toBe(new Date(0x68b0c480 * 1000).toISOString());
  });
});

describe("handles", () => {
  it("pulls a lowercased username out of a profile link", () => {
    expect(handleFromProfileUrl("https://www.instagram.com/Some.Creator_1/")).toBe("some.creator_1");
    expect(handleFromProfileUrl("https://instagram.com/name?hl=en")).toBe("name");
    expect(handleFromProfileUrl("https://somewhere.test/name")).toBeNull();
  });

  it("builds the profile link the scraper is given", () => {
    expect(profileUrl("@SomeOne")).toBe("https://www.instagram.com/someone/");
  });
});
