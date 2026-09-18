// Which posts actually beat their own creator's normal.
//
// This is the whole point of the tool. A post is a standout when it beats the numbers that creator
// usually gets, so a 1.5 million view account and a 15,000 view account are judged on the same scale
// and the big account cannot drown out the small one. Nothing here talks to the internet, so every
// rule below is pinned by a unit test.
//
// Three rules that are not obvious:
//   - The normal only learns from posts at least 72 hours old. A two-day-old reel is still growing,
//     so letting it set the bar would drag the normal down and make everything else look better than
//     it is. A young post can still BE a standout (it only grows from here), it just does not vote.
//   - The normal reads the creator's most recent 60 qualifying posts, so it tracks who they are now,
//     not who they were three years ago.
//   - YouTube Shorts and long videos live on completely different scales, so each gets its own
//     normal once both have enough posts to stand on. Until then they share one.

import type { Metric, Platform, PostKind } from "./types";

/** A post has to beat its creator's normal by this much to count as a standout. */
export const MIN_MULTIPLE = 2;
/** Fewer qualifying posts than this and there is no honest normal to compare against. */
export const BASELINE_MIN_POSTS = 5;
export const BASELINE_AGE_HOURS = 72;
export const BASELINE_WINDOW = 60;

const AGE_MS = BASELINE_AGE_HOURS * 3_600_000;

export interface BaselinePost {
  id: string;
  platform: Platform;
  kind: PostKind;
  posted_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
}

export interface PostMetrics {
  id: string;
  metric: Metric;
  score: number | null;
  baseline: number | null;
  multiple: number | null;
  strength: number | null;
  is_outlier: boolean;
}

export type GroupName = "instagram" | "youtube" | "short" | "video";

export interface GroupReport {
  platform: Platform;
  group: GroupName;
  metric: Metric;
  posts: number;
  /** How many posts the normal was worked out from. */
  basis: number;
  baseline: number | null;
  /** Why this group has no normal, in words. Null when it has one. */
  skipped: string | null;
}

export interface BaselineResult {
  metrics: PostMetrics[];
  groups: GroupReport[];
}

type ScoreFn = (p: BaselinePost) => number | null;

function positive(n: number | null): number {
  return n !== null && n > 0 ? n : 0;
}

export function viewsScore(p: BaselinePost): number | null {
  return p.views !== null && p.views > 0 ? p.views : null;
}

/** Likes plus comments, each only when above zero. A hidden like count is unknown, not zero. */
export function engagementScore(p: BaselinePost): number | null {
  const total = positive(p.likes) + positive(p.comments);
  return total > 0 ? total : null;
}

/** Instagram accounts that post mostly carousels get no view count, so they are measured on
    engagement instead. Views win when at least max(5, a quarter of the posts) carry one. */
export function chooseInstagramMetric(posts: BaselinePost[]): Metric {
  const withViews = posts.filter((p) => viewsScore(p) !== null).length;
  return withViews >= Math.max(BASELINE_MIN_POSTS, Math.floor(posts.length / 4)) ? "views" : "engagement";
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The scores the normal is allowed to learn from: the group's most recent 60 posts that are at
    least 72 hours old, keeping only scores above zero. A post with no date cannot prove its age, so
    it is left out. */
export function baselineBasis(posts: BaselinePost[], score: ScoreFn, nowMs: number): number[] {
  return posts
    .map((p) => ({ p, at: p.posted_at ? Date.parse(p.posted_at) : Number.NaN }))
    .filter(({ at }) => Number.isFinite(at) && nowMs - at >= AGE_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, BASELINE_WINDOW)
    .map(({ p }) => score(p))
    .filter((s): s is number => s !== null && s > 0);
}

/** Ranking only, never qualification: how far a post beat its own normal, damped by the reach it
    actually got, so a 104x post with 5 million views ranks above a 174x post with 3,800. */
export function strengthOf(multiple: number, score: number): number {
  return multiple * Math.log10(Math.max(score, 10));
}

function scoreGroup(
  platform: Platform,
  group: GroupName,
  metric: Metric,
  posts: BaselinePost[],
  score: ScoreFn,
  minScore: number | null,
  nowMs: number,
  result: BaselineResult,
): void {
  const basis = baselineBasis(posts, score, nowMs);
  const normal = basis.length >= BASELINE_MIN_POSTS ? median(basis) : null;
  const baseline = normal === null ? null : Math.round(normal);
  result.groups.push({
    platform,
    group,
    metric,
    posts: posts.length,
    basis: basis.length,
    baseline,
    skipped:
      normal === null
        ? `Only ${basis.length} ${basis.length === 1 ? "post" : "posts"} at least ${BASELINE_AGE_HOURS} hours old with ${metric} to measure; ${BASELINE_MIN_POSTS} are needed before there is an honest normal`
        : null,
  });
  for (const p of posts) {
    const s = score(p);
    if (normal === null || s === null) {
      result.metrics.push({ id: p.id, metric, score: s, baseline: null, multiple: null, strength: null, is_outlier: false });
      continue;
    }
    const multiple = Math.round((s / normal) * 10) / 10;
    result.metrics.push({
      id: p.id,
      metric,
      score: s,
      baseline,
      multiple,
      strength: Math.round(strengthOf(multiple, s) * 1000) / 1000,
      is_outlier: multiple >= MIN_MULTIPLE && (minScore === null || s >= minScore),
    });
  }
}

/** Numbers for every post of ONE creator, on both platforms, plus a report per group saying what
    the normal was and how it was worked out. */
export function computeBaselines(posts: BaselinePost[], opts: { minScore: number | null; now: Date | number }): BaselineResult {
  const nowMs = typeof opts.now === "number" ? opts.now : opts.now.getTime();
  const result: BaselineResult = { metrics: [], groups: [] };

  const instagram = posts.filter((p) => p.platform === "instagram");
  if (instagram.length > 0) {
    const metric = chooseInstagramMetric(instagram);
    scoreGroup("instagram", "instagram", metric, instagram, metric === "views" ? viewsScore : engagementScore, opts.minScore, nowMs, result);
  }

  const youtube = posts.filter((p) => p.platform === "youtube");
  if (youtube.length > 0) {
    const shorts = youtube.filter((p) => p.kind === "short");
    const videos = youtube.filter((p) => p.kind !== "short");
    // "Enough posts" means enough to stand a normal on, so splitting can never leave a group without
    // the normal the combined group would have had.
    const split =
      baselineBasis(shorts, viewsScore, nowMs).length >= BASELINE_MIN_POSTS &&
      baselineBasis(videos, viewsScore, nowMs).length >= BASELINE_MIN_POSTS;
    if (split) {
      scoreGroup("youtube", "short", "views", shorts, viewsScore, opts.minScore, nowMs, result);
      scoreGroup("youtube", "video", "views", videos, viewsScore, opts.minScore, nowMs, result);
    } else {
      scoreGroup("youtube", "youtube", "views", youtube, viewsScore, opts.minScore, nowMs, result);
    }
  }

  return result;
}
