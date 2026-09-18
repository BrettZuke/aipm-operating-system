import { describe, expect, it } from "vitest";
import { feedOrder, nextCursor, toFeedPost, windowStart, FEED_PAGE } from "./feed";

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: "p1",
    platform: "instagram",
    kind: "reel",
    url: "https://www.instagram.com/p/ABC/",
    thumb_url: null,
    caption: "First line of the caption\nAnd the rest of it",
    views: "12000",
    metric: "views",
    score: "12000",
    baseline: "1000",
    multiple: "12",
    is_outlier: true,
    posted_at: "2026-09-10T10:00:00Z",
    breakdown_title: null,
    breakdown_source: null,
    adapted_at: null,
    content_creators: { id: "c1", name: "Some Plumber", handle: "someplumber" },
    ...over,
  }) as unknown as Parameters<typeof toFeedPost>[0];

describe("turning a row into a card", () => {
  it("uses the breakdown's title once there is one, and the caption's first line before that", () => {
    expect(toFeedPost(row()).title).toBe("First line of the caption");
    expect(toFeedPost(row({ breakdown_title: "Two vans, one price list" })).title).toBe("Two vans, one price list");
  });

  it("reads the numbers back as numbers", () => {
    const card = toFeedPost(row());
    expect(card.views).toBe(12_000);
    expect(card.multiple).toBe(12);
    expect(card.baseline).toBe(1_000);
  });

  it("says whether it has been broken down and made into hooks", () => {
    expect(toFeedPost(row()).analysed).toBe(false);
    expect(toFeedPost(row({ breakdown_source: "watched" })).analysed).toBe(true);
    expect(toFeedPost(row({ adapted_at: "2026-09-16T00:00:00Z" })).adapted).toBe(true);
  });

  it("copes with the creator arriving as a list", () => {
    const card = toFeedPost(row({ content_creators: [{ id: "c1", name: "Some Plumber", handle: "someplumber" }] }));
    expect(card.creator?.name).toBe("Some Plumber");
  });
});

describe("ordering and paging the feed", () => {
  it("always ends on the id, so pages never overlap or skip a video", () => {
    for (const sort of ["standout", "multiple", "views", "newest"] as const) {
      const terms = feedOrder(sort);
      expect(terms[terms.length - 1].column).toBe("id");
    }
    expect(feedOrder("multiple")[0].column).toBe("multiple");
    expect(feedOrder("views")[0].column).toBe("views");
    expect(feedOrder("newest")[0].column).toBe("posted_at");
    expect(feedOrder("standout")[0].column).toBe("strength");
  });

  it("only offers another page when one row past this page came back", () => {
    expect(nextCursor(0, FEED_PAGE + 1)).toBe(FEED_PAGE);
    expect(nextCursor(0, FEED_PAGE)).toBeNull();
    expect(nextCursor(FEED_PAGE, FEED_PAGE + 1)).toBe(FEED_PAGE * 2);
  });

  it("counts the window back from now", () => {
    const now = new Date("2026-09-17T00:00:00Z");
    expect(windowStart(7, now)).toBe("2026-09-10T00:00:00.000Z");
  });
});
