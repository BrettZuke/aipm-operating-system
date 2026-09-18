// The Standout videos feed: the filters in the address turned into one page of cards. Which window,
// which order and where the next page starts are all pure, so they are pinned by tests;
// loadFeedPosts is the only part that talks to the database.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BreakdownSource, Metric, Platform, PostKind } from "./types";

export const FEED_PAGE = 36;
export const FEED_WINDOWS = [7, 30, 90] as const;
export const FEED_SORTS = ["standout", "multiple", "views", "newest"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export interface FeedFilters {
  window: (typeof FEED_WINDOWS)[number];
  platform: Platform | null;
  format: PostKind | null;
  creatorId: string | null;
  sort: FeedSort;
  show: "standouts" | "all";
}

export const DEFAULT_FEED_FILTERS: FeedFilters = { window: 30, platform: null, format: null, creatorId: null, sort: "standout", show: "standouts" };

/** One card in the feed. Only what a card shows: no media urls, no transcript. */
export interface FeedPost {
  id: string;
  platform: Platform;
  kind: PostKind;
  url: string;
  thumb_url: string | null;
  /** The breakdown's title once analysed, else the caption's first line (the title on YouTube). */
  title: string | null;
  views: number | null;
  metric: Metric | null;
  score: number | null;
  baseline: number | null;
  multiple: number | null;
  is_outlier: boolean;
  posted_at: string | null;
  creator: { id: string; name: string; handle: string } | null;
  analysed: boolean;
  /** How the breakdown was made, when there is one. */
  source: BreakdownSource | null;
  adapted: boolean;
}

export interface OrderTerm {
  column: string;
  ascending: boolean;
  nullsFirst: boolean;
}

/** Sort terms for each feed sort, always ending on id so pages never overlap or skip a post. */
export function feedOrder(sort: FeedSort): OrderTerm[] {
  const desc = (column: string): OrderTerm => ({ column, ascending: false, nullsFirst: false });
  const tail: OrderTerm = { column: "id", ascending: true, nullsFirst: false };
  switch (sort) {
    case "multiple":
      return [desc("multiple"), desc("strength"), tail];
    case "views":
      return [desc("views"), desc("posted_at"), tail];
    case "newest":
      return [desc("posted_at"), tail];
    default:
      return [desc("strength"), desc("posted_at"), tail];
  }
}

export function windowStart(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/** The offset of the next page, or null on the last one. The query reads one row past the page to
    know whether another page exists. */
export function nextCursor(offset: number, rowsRead: number, pageSize = FEED_PAGE): number | null {
  return rowsRead > pageSize ? offset + pageSize : null;
}

function firstLine(text: string | null): string | null {
  const line = (text ?? "").split("\n").map((l) => l.trim()).find(Boolean);
  return line ? line.slice(0, 160) : null;
}

interface FeedRow {
  id: string;
  platform: Platform;
  kind: PostKind;
  url: string;
  thumb_url: string | null;
  caption: string | null;
  views: number | null;
  metric: Metric | null;
  score: number | null;
  baseline: number | null;
  multiple: number | null;
  is_outlier: boolean;
  posted_at: string | null;
  /** breakdown->>title and breakdown->>source, read as text so a page never carries whole breakdowns. */
  breakdown_title: string | null;
  breakdown_source: BreakdownSource | null;
  adapted_at: string | null;
  content_creators: { id: string; name: string; handle: string } | { id: string; name: string; handle: string }[] | null;
}

export function toFeedPost(row: FeedRow): FeedPost {
  const creator = Array.isArray(row.content_creators) ? (row.content_creators[0] ?? null) : row.content_creators;
  const num = (v: number | null) => (v === null ? null : Number(v));
  return {
    id: row.id,
    platform: row.platform,
    kind: row.kind,
    url: row.url,
    thumb_url: row.thumb_url,
    title: row.breakdown_title ?? firstLine(row.caption),
    views: num(row.views),
    metric: row.metric,
    score: num(row.score),
    baseline: num(row.baseline),
    multiple: num(row.multiple),
    is_outlier: row.is_outlier,
    posted_at: row.posted_at,
    creator,
    analysed: row.breakdown_source !== null,
    source: row.breakdown_source,
    adapted: row.adapted_at !== null,
  };
}

export const FEED_COLUMNS =
  "id,platform,kind,url,thumb_url,caption,views,metric,score,baseline,multiple,is_outlier,posted_at,breakdown_title:breakdown->>title,breakdown_source:breakdown->>source,adapted_at,content_creators(id,name,handle)";

export async function loadFeedPosts(sb: SupabaseClient, agencyId: string, filters: FeedFilters, cursor: number, now = new Date()): Promise<{ posts: FeedPost[]; nextCursor: number | null }> {
  let query = sb.from("content_posts").select(FEED_COLUMNS).eq("agency_id", agencyId).gte("posted_at", windowStart(filters.window, now));
  if (filters.show === "standouts") query = query.eq("is_outlier", true);
  if (filters.platform) query = query.eq("platform", filters.platform);
  if (filters.format) query = query.eq("kind", filters.format);
  if (filters.creatorId) query = query.eq("creator_id", filters.creatorId);
  for (const term of feedOrder(filters.sort)) query = query.order(term.column, { ascending: term.ascending, nullsFirst: term.nullsFirst });
  const { data, error } = await query.range(cursor, cursor + FEED_PAGE);
  if (error) throw new Error(`Reading the feed failed: ${error.message}`);
  const rows = (data ?? []) as unknown as FeedRow[];
  return { posts: rows.slice(0, FEED_PAGE).map(toFeedPost), nextCursor: nextCursor(cursor, rows.length) };
}
