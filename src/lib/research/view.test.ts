import { describe, expect, it } from "vitest";
import { DEFAULT_FEED_FILTERS } from "./feed";
import { SCAN_SETTINGS } from "./jobs";
import {
  ageText,
  compactNumber,
  dateText,
  DRAFT_UPLOAD_TYPES,
  draftCardFormat,
  draftContentType,
  durationText,
  filtersFromParams,
  filtersToParams,
  formatsFor,
  hookQuote,
  jobIsRunning,
  listKey,
  multipleText,
  pollDecision,
  researchSub,
  revealPlan,
  SCAN_MODE_LABEL,
  scanStartedText,
  scanStatus,
  sourceNote,
  withFormatFor,
} from "./view";
import { DRAFT_TYPES } from "./score";
import type { JobView } from "./jobs";

describe("which sub-tab a link means", () => {
  it("keeps the old links working", () => {
    expect(researchSub("signal")).toBe("feed");
    expect(researchSub("roster")).toBe("creators");
    expect(researchSub(null)).toBe("feed");
    expect(researchSub("nonsense")).toBe("feed");
    expect(researchSub("drafts")).toBe("drafts");
  });
});

describe("the filters in the address", () => {
  it("falls back to the default for anything that is not allowed", () => {
    const filters = filtersFromParams((k) => ({ days: "5", platform: "tiktok", sort: "loudest", creator: "not-a-uuid" })[k] ?? null);
    expect(filters).toEqual(DEFAULT_FEED_FILTERS);
  });

  it("reads back exactly what it wrote", () => {
    const filters = { window: 90 as const, platform: "youtube" as const, format: "short" as const, creatorId: "0f8fad5b-d9cb-469f-a165-70867728950e", sort: "views" as const, show: "all" as const };
    const params = filtersToParams(new URLSearchParams("tab=creators"), filters);
    expect(params.get("tab")).toBe("creators");
    expect(filtersFromParams((k) => params.get(k))).toEqual(filters);
  });

  it("leaves the defaults out of the address", () => {
    const params = filtersToParams(new URLSearchParams(), DEFAULT_FEED_FILTERS);
    expect(params.toString()).toBe("");
  });

  it("drops a format the new platform does not have", () => {
    const filters = { ...DEFAULT_FEED_FILTERS, platform: "youtube" as const, format: "short" as const };
    expect(withFormatFor(filters, "instagram").format).toBeNull();
    expect(withFormatFor(filters, "youtube").format).toBe("short");
    expect(formatsFor("instagram")).toEqual(["reel", "carousel", "image"]);
  });
});

describe("the numbers on a card", () => {
  it("writes a multiple the way it is read", () => {
    expect(multipleText(12.44)).toBe("12.4");
    expect(multipleText(104.6)).toBe("105");
    expect(multipleText(null)).toBeNull();
  });

  it("shortens big numbers and leaves small ones alone", () => {
    expect(compactNumber(2_100_000)).toBe("2.1M");
    expect(compactNumber(184_000)).toBe("184K");
    expect(compactNumber(920)).toBe("920");
    expect(compactNumber(null)).toBeNull();
  });

  it("says how old a post is in the shortest unit that still reads", () => {
    const now = Date.parse("2026-09-17T12:00:00Z");
    expect(ageText("2026-09-17T09:00:00Z", now)).toBe("today");
    expect(ageText("2026-09-14T12:00:00Z", now)).toBe("3d");
    expect(ageText("2026-09-01T12:00:00Z", now)).toBe("2w");
    expect(ageText("2026-05-17T12:00:00Z", now)).toBe("4mo");
    expect(ageText(null, now)).toBeNull();
  });

  it("writes dates the same way on the server and in the browser", () => {
    expect(dateText("2026-09-16T23:30:00Z")).toBe("16 Sep 2026");
    expect(dateText(null)).toBeNull();
  });

  it("writes a length as a clock", () => {
    expect(durationText(45)).toBe("0:45");
    expect(durationText(605)).toBe("10:05");
    expect(durationText(0)).toBeNull();
  });
});

describe("what to quote as the hook", () => {
  it("prefers what was said, then what was on screen, then the caption", () => {
    const base = { title: "A title", hook: { spoken: null as string | null, on_screen: null as string | null, caption: null as string | null } };
    expect(hookQuote({ ...base, hook: { ...base.hook, spoken: "said it" } })).toBe("said it");
    expect(hookQuote({ ...base, hook: { ...base.hook, on_screen: "on screen" } })).toBe("on screen");
    expect(hookQuote({ ...base, hook: { ...base.hook, caption: "caption line" } })).toBe("caption line");
    expect(hookQuote(base)).toBe("A title");
  });

  it("says so when the video was not watched", () => {
    expect(sourceNote("watched")).toBeNull();
    expect(sourceNote("transcript")).toContain("not watched");
    expect(sourceNote("caption")).toContain("not watched");
  });
});

const job = (over: Partial<JobView> = {}): JobView => ({
  id: "j",
  purpose: "scan",
  status: "running",
  mode: "recent",
  created_at: new Date().toISOString(),
  finished_at: null,
  result: null,
  error: null,
  cost_usd: null,
  ...over,
});

describe("the line beside Scan now", () => {
  it("is live while a scan is running", () => {
    const now = Date.now();
    const status = scanStatus(job({ created_at: new Date(now - 120_000).toISOString() }), null, now);
    expect(status.tone).toBe("live");
    expect(status.text).toContain("Scanning");
  });

  it("treats a scan older than the stale window as stuck, not running", () => {
    const now = Date.now();
    expect(jobIsRunning(job({ created_at: new Date(now - 60 * 60_000).toISOString() }), now)).toBe(false);
  });

  it("says a scan failed rather than showing an older successful read", () => {
    const now = Date.now();
    const status = scanStatus(job({ status: "failed", finished_at: new Date(now - 60_000).toISOString() }), new Date(now - 600_000).toISOString(), now);
    expect(status.tone).toBe("bad");
  });

  it("says not scanned yet when nothing has ever run", () => {
    expect(scanStatus(null, null, Date.now()).text).toBe("Not scanned yet");
  });
});

describe("what a scan says when it starts", () => {
  it("names both platforms and the accounts left over", () => {
    const text = scanStartedText({ instagramCreators: 3, instagramLeft: 2, youtubeCreators: 1 });
    expect(text).toContain("3 Instagram accounts");
    expect(text).toContain("1 YouTube channel");
    expect(text).toContain("2 accounts are left for the next scan");
  });

  it("asks the student to keep the tab open when there is no address to call back to", () => {
    expect(scanStartedText({ instagramCreators: 1, youtubeCreators: 0, pollOnly: true })).toContain("Keep this tab open");
    expect(scanStartedText({ instagramCreators: 1, youtubeCreators: 0, pollOnly: false })).not.toContain("Keep this tab open");
  });
});

describe("checking on a running scan", () => {
  it("only checks while the page is on screen, and gives up in the end", () => {
    const startedMs = 0;
    expect(pollDecision({ running: true, visible: true, startedMs, nowMs: 1_000 })).toBe("poll");
    expect(pollDecision({ running: true, visible: false, startedMs, nowMs: 1_000 })).toBe("wait");
    expect(pollDecision({ running: false, visible: true, startedMs, nowMs: 1_000 })).toBe("stop");
    expect(pollDecision({ running: true, visible: true, startedMs, nowMs: 16 * 60_000 })).toBe("stop");
  });
});

describe("Show more", () => {
  it("reveals what is already loaded before asking for another page", () => {
    expect(revealPlan({ visible: 24, loaded: 36, hasMore: true, step: 24 })).toEqual({ nextVisible: 48, fetch: true });
    expect(revealPlan({ visible: 24, loaded: 60, hasMore: true, step: 24 })).toEqual({ nextVisible: 48, fetch: false });
    expect(revealPlan({ visible: 24, loaded: 30, hasMore: false, step: 24 })).toEqual({ nextVisible: 30, fetch: false });
  });
});

describe("uploads and formats", () => {
  it("reads the type from the file name when the browser does not say", () => {
    expect(draftContentType("clip.mov", "")).toBe("video/quicktime");
    expect(draftContentType("clip.mp4", "video/mp4")).toBe("video/mp4");
    expect(draftContentType("clip.avi", "video/x-msvideo")).toBeNull();
  });

  it("maps a draft format to a board format", () => {
    expect(draftCardFormat("long")).toBe("long_form");
    expect(draftCardFormat("reel")).toBe("reel");
  });
});

describe("the copies the screens keep of backend rules", () => {
  it("offers a label for every scan mode the server has", () => {
    expect(Object.keys(SCAN_MODE_LABEL).sort()).toEqual(Object.keys(SCAN_SETTINGS).sort());
    expect(SCAN_MODE_LABEL.recent).toContain(SCAN_SETTINGS.recent.newerThan.split(" ")[0]);
    expect(SCAN_MODE_LABEL.full).toContain(SCAN_SETTINGS.full.newerThan.split(" ")[0]);
  });

  it("accepts exactly the upload types the server accepts", () => {
    expect(Object.keys(DRAFT_UPLOAD_TYPES).sort()).toEqual(Object.keys(DRAFT_TYPES).sort());
  });
});

describe("keeping a list's state on the right rows", () => {
  it("gives the same set of ids the same key whatever order they arrive in", () => {
    expect(listKey(["a", "b"])).toBe(listKey(["b", "a"]));
    expect(listKey(["a", "b"])).not.toBe(listKey(["a", "c"]));
  });
});
