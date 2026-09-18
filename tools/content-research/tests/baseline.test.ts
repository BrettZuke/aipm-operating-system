import { describe, expect, it } from "vitest";
import {
  BASELINE_AGE_HOURS,
  BASELINE_MIN_POSTS,
  BASELINE_WINDOW,
  baselineBasis,
  chooseInstagramMetric,
  computeBaselines,
  engagementScore,
  median,
  MIN_MULTIPLE,
  strengthOf,
  viewsScore,
  type BaselinePost,
} from "../lib/baseline";

const NOW = Date.parse("2026-09-17T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function post(over: Partial<BaselinePost> & { id: string }): BaselinePost {
  return {
    platform: "instagram",
    kind: "reel",
    posted_at: hoursAgo(200),
    views: 1_000,
    likes: 100,
    comments: 10,
    ...over,
  };
}

describe("which number a post is judged on", () => {
  it("uses views when enough posts carry one", () => {
    const posts = Array.from({ length: 12 }, (_, i) => post({ id: `p${i}`, views: i < 6 ? 1_000 : null }));
    expect(chooseInstagramMetric(posts)).toBe("views");
  });

  it("falls back to engagement for a carousel-heavy account", () => {
    // 12 posts, only 2 with views. max(5, floor(12/4)=3) is 5, and 2 is under it.
    const posts = Array.from({ length: 12 }, (_, i) => post({ id: `p${i}`, views: i < 2 ? 1_000 : null }));
    expect(chooseInstagramMetric(posts)).toBe("engagement");
  });

  it("needs at least five posts with views however small the account is", () => {
    const posts = Array.from({ length: 8 }, (_, i) => post({ id: `p${i}`, views: i < 4 ? 900 : null }));
    expect(chooseInstagramMetric(posts)).toBe("engagement");
    const oneMore = [...posts, post({ id: "p8", views: 900 })];
    expect(chooseInstagramMetric(oneMore)).toBe("views");
  });

  it("counts a view only when it is above zero", () => {
    expect(viewsScore(post({ id: "a", views: 0 }))).toBeNull();
    expect(viewsScore(post({ id: "a", views: null }))).toBeNull();
    expect(viewsScore(post({ id: "a", views: 12 }))).toBe(12);
  });

  it("treats hidden likes as unknown rather than zero", () => {
    expect(engagementScore(post({ id: "a", likes: null, comments: 7 }))).toBe(7);
    expect(engagementScore(post({ id: "a", likes: null, comments: null }))).toBeNull();
    expect(engagementScore(post({ id: "a", likes: 10, comments: 5 }))).toBe(15);
  });
});

describe("the 72 hour rule", () => {
  it("leaves posts younger than 72 hours out of the normal", () => {
    const posts = [
      ...Array.from({ length: 5 }, (_, i) => post({ id: `old${i}`, posted_at: hoursAgo(100), views: 1_000 })),
      post({ id: "fresh", posted_at: hoursAgo(BASELINE_AGE_HOURS - 1), views: 99_999 }),
    ];
    const basis = baselineBasis(posts, viewsScore, NOW);
    expect(basis).toHaveLength(5);
    expect(basis).not.toContain(99_999);
  });

  it("counts a post that is exactly 72 hours old", () => {
    const posts = [post({ id: "edge", posted_at: hoursAgo(BASELINE_AGE_HOURS), views: 500 })];
    expect(baselineBasis(posts, viewsScore, NOW)).toEqual([500]);
  });

  it("still lets a young post be a standout even though it did not move the bar", () => {
    const posts: BaselinePost[] = [
      ...Array.from({ length: 6 }, (_, i) => post({ id: `old${i}`, posted_at: hoursAgo(200), views: 1_000 })),
      post({ id: "fresh", posted_at: hoursAgo(5), views: 10_000 }),
    ];
    const { metrics } = computeBaselines(posts, { minScore: null, now: NOW });
    const fresh = metrics.find((m) => m.id === "fresh");
    expect(fresh?.baseline).toBe(1_000);
    expect(fresh?.multiple).toBe(10);
    expect(fresh?.is_outlier).toBe(true);
  });

  it("leaves out a post with no date at all, because it cannot prove its age", () => {
    const posts = [post({ id: "nodate", posted_at: null, views: 5_000 }), post({ id: "dated", views: 100 })];
    expect(baselineBasis(posts, viewsScore, NOW)).toEqual([100]);
  });

  it("reads only the most recent 60 qualifying posts", () => {
    const posts = Array.from({ length: 80 }, (_, i) =>
      post({ id: `p${i}`, posted_at: hoursAgo(100 + i), views: i < BASELINE_WINDOW ? 100 : 1_000_000 }),
    );
    const basis = baselineBasis(posts, viewsScore, NOW);
    expect(basis).toHaveLength(BASELINE_WINDOW);
    expect(basis.every((v) => v === 100)).toBe(true);
  });
});

describe("the middle number and the multiple", () => {
  it("takes the middle of an odd list", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the middle two of an even list", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("has no answer for an empty list", () => {
    expect(median([])).toBeNull();
  });

  it("works the multiple out to one decimal place", () => {
    const posts = [
      ...Array.from({ length: 5 }, (_, i) => post({ id: `n${i}`, views: 1_000 })),
      post({ id: "hit", views: 2_450 }),
    ];
    const { metrics } = computeBaselines(posts, { minScore: null, now: NOW });
    expect(metrics.find((m) => m.id === "hit")?.multiple).toBe(2.5);
  });

  it("needs a standout to beat the normal by 2x, and 1.9x is not enough", () => {
    const posts = [
      ...Array.from({ length: 5 }, (_, i) => post({ id: `n${i}`, views: 1_000 })),
      post({ id: "nearly", views: 1_900 }),
      post({ id: "just", views: 2_000 }),
    ];
    const { metrics } = computeBaselines(posts, { minScore: null, now: NOW });
    expect(metrics.find((m) => m.id === "nearly")?.is_outlier).toBe(false);
    expect(metrics.find((m) => m.id === "just")?.multiple).toBe(MIN_MULTIPLE);
    expect(metrics.find((m) => m.id === "just")?.is_outlier).toBe(true);
  });

  it("gives no normal and no standouts when there are fewer than five settled posts", () => {
    const posts = Array.from({ length: BASELINE_MIN_POSTS - 1 }, (_, i) => post({ id: `p${i}`, views: 1_000 }));
    const { metrics, groups } = computeBaselines(posts, { minScore: null, now: NOW });
    expect(groups[0].baseline).toBeNull();
    expect(groups[0].skipped).toContain("4 posts");
    expect(metrics.every((m) => m.is_outlier === false)).toBe(true);
  });

  it("respects a floor on the raw number, so a tiny post cannot be a standout", () => {
    const posts = [
      ...Array.from({ length: 5 }, (_, i) => post({ id: `n${i}`, views: 100 })),
      post({ id: "tiny", views: 400 }),
    ];
    const withFloor = computeBaselines(posts, { minScore: 1_000, now: NOW });
    expect(withFloor.metrics.find((m) => m.id === "tiny")?.multiple).toBe(4);
    expect(withFloor.metrics.find((m) => m.id === "tiny")?.is_outlier).toBe(false);
  });
});

describe("ranking by strength", () => {
  it("damps the multiple by the reach it actually got", () => {
    // 104x on 5,000,000 views beats 174x on 3,800.
    expect(strengthOf(104, 5_000_000)).toBeGreaterThan(strengthOf(174, 3_800));
  });

  it("never lets a tiny number make the log go negative", () => {
    expect(strengthOf(3, 1)).toBe(3 * Math.log10(10));
  });

  it("ranks a real hit above a fluke in a whole creator's numbers", () => {
    const posts = [
      ...Array.from({ length: 6 }, (_, i) => post({ id: `n${i}`, views: 20_000 })),
      post({ id: "big", views: 2_000_000 }),
      post({ id: "fluke", posted_at: hoursAgo(300), views: 60_000 }),
    ];
    const { metrics } = computeBaselines(posts, { minScore: null, now: NOW });
    const big = metrics.find((m) => m.id === "big")!;
    const fluke = metrics.find((m) => m.id === "fluke")!;
    expect(big.is_outlier && fluke.is_outlier).toBe(true);
    expect(big.strength!).toBeGreaterThan(fluke.strength!);
  });
});

describe("YouTube Shorts and long videos", () => {
  const yt = (id: string, kind: "short" | "video", views: number) =>
    post({ id, platform: "youtube", kind, views, posted_at: hoursAgo(200) });

  it("gives each its own normal once both have enough posts", () => {
    const posts = [
      ...Array.from({ length: 5 }, (_, i) => yt(`s${i}`, "short", 100_000)),
      ...Array.from({ length: 5 }, (_, i) => yt(`v${i}`, "video", 5_000)),
    ];
    const { groups } = computeBaselines(posts, { minScore: null, now: NOW });
    expect(groups.map((g) => g.group).sort()).toEqual(["short", "video"]);
    expect(groups.find((g) => g.group === "short")?.baseline).toBe(100_000);
    expect(groups.find((g) => g.group === "video")?.baseline).toBe(5_000);
  });

  it("keeps them together when splitting would leave one side with no normal", () => {
    const posts = [
      ...Array.from({ length: 6 }, (_, i) => yt(`s${i}`, "short", 10_000)),
      ...Array.from({ length: 2 }, (_, i) => yt(`v${i}`, "video", 10_000)),
    ];
    const { groups } = computeBaselines(posts, { minScore: null, now: NOW });
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("youtube");
    expect(groups[0].baseline).toBe(10_000);
  });

  it("judges Instagram and YouTube separately for the same creator", () => {
    const posts = [
      ...Array.from({ length: 5 }, (_, i) => post({ id: `ig${i}`, views: 1_000 })),
      ...Array.from({ length: 5 }, (_, i) => yt(`yt${i}`, "video", 500_000)),
    ];
    const { groups } = computeBaselines(posts, { minScore: null, now: NOW });
    expect(groups.find((g) => g.platform === "instagram")?.baseline).toBe(1_000);
    expect(groups.find((g) => g.platform === "youtube")?.baseline).toBe(500_000);
  });
});
