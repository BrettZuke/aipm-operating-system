import { describe, it, expect } from "vitest";
import { compactCount, lastScrapedLabel, normaliseHandle, platformsOf } from "./creators";

describe("normaliseHandle", () => {
  it("strips a leading at sign", () => {
    expect(normaliseHandle("@brodyautomates")).toBe("brodyautomates");
  });

  it("leaves a bare handle alone", () => {
    expect(normaliseHandle("brodyautomates")).toBe("brodyautomates");
  });

  it("pulls the handle out of an Instagram profile URL", () => {
    expect(normaliseHandle("https://www.instagram.com/tenfoldmarc/")).toBe("tenfoldmarc");
  });

  it("drops tracking query strings", () => {
    expect(normaliseHandle("https://www.instagram.com/samson.ai/?igsh=abc123")).toBe("samson.ai");
  });

  it("keeps the handle when a URL ends in a section like reels", () => {
    expect(normaliseHandle("https://www.instagram.com/justyn.ai/reels")).toBe("justyn.ai");
  });

  it("pulls the handle out of a YouTube channel URL", () => {
    expect(normaliseHandle("https://www.youtube.com/@JackhopkinsCEO")).toBe("JackhopkinsCEO");
  });

  it("handles a YouTube URL that ends in a section", () => {
    expect(normaliseHandle("https://www.youtube.com/@danmartell/videos")).toBe("danmartell");
  });

  it("trims surrounding whitespace", () => {
    expect(normaliseHandle("  @niksetting  ")).toBe("niksetting");
  });

  it("returns empty for empty input rather than throwing", () => {
    expect(normaliseHandle("   ")).toBe("");
  });
});

describe("platformsOf", () => {
  it("names both platforms when both handles are set", () => {
    expect(platformsOf({ instagram: "a", youtube: "b" })).toEqual(["Instagram", "YouTube"]);
  });

  it("names only what is actually set", () => {
    expect(platformsOf({ instagram: "a", youtube: null })).toEqual(["Instagram"]);
    expect(platformsOf({ instagram: null, youtube: null })).toEqual([]);
  });
});

describe("compactCount", () => {
  it("leaves small numbers alone", () => {
    expect(compactCount(962)).toBe("962");
  });

  it("shows one decimal under ten thousand", () => {
    expect(compactCount(6962)).toBe("7.0k");
  });

  it("drops the decimal at ten thousand and above", () => {
    expect(compactCount(188909)).toBe("189k");
  });

  it("switches to millions", () => {
    expect(compactCount(1_560_000)).toBe("1.6M");
  });

  it("returns empty for a missing count", () => {
    expect(compactCount(null)).toBe("");
  });
});

describe("lastScrapedLabel", () => {
  const now = new Date("2026-07-28T12:00:00Z");

  it("says so plainly when nothing has been collected", () => {
    expect(lastScrapedLabel(null, now)).toBe("Never scraped");
  });

  it("treats an unparseable timestamp as never scraped", () => {
    expect(lastScrapedLabel("not a date", now)).toBe("Never scraped");
  });

  it("reads today for a scrape hours ago", () => {
    expect(lastScrapedLabel("2026-07-28T06:00:00Z", now)).toBe("Scraped today");
  });

  it("reads yesterday at one day", () => {
    expect(lastScrapedLabel("2026-07-27T06:00:00Z", now)).toBe("Scraped yesterday");
  });

  it("counts days under a month", () => {
    expect(lastScrapedLabel("2026-07-18T12:00:00Z", now)).toBe("Scraped 10 days ago");
  });

  it("switches to months past thirty days", () => {
    expect(lastScrapedLabel("2026-05-28T12:00:00Z", now)).toBe("Scraped 2 months ago");
  });
});
