// Finding creators, the pure half: the cache key for a search, how long an answer stays fresh, the
// day the shared YouTube allowance resets on, ranking channels from a video search, and reading
// Instagram's own "similar accounts". discover.ts makes the calls and writes the cache rows.

import { normalizeIgHandle } from "./normalize-instagram";
import type { PostInput } from "./types";
import type { SearchChannel } from "./youtube";

/** A search answer is reused for this long before the same words search again. */
export const SEARCH_FRESH_MS = 24 * 3_600_000;
/** The YouTube key allows about a hundred searches a day for every workspace on this dashboard
    together, so the guard stops short of it. */
export const YOUTUBE_SEARCHES_PER_DAY = 90;
export const YOUTUBE_RESULTS = 20;
const QUERY_MAX = 100;

/** The cache key for a search: trimmed, lowercased, inner spaces collapsed. */
export function normaliseQuery(query: string): string {
  return (query ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, QUERY_MAX).trim();
}

export function isFresh(createdAt: string | null | undefined, nowMs = Date.now(), ttlMs = SEARCH_FRESH_MS): boolean {
  const at = createdAt ? Date.parse(createdAt) : Number.NaN;
  return Number.isFinite(at) && nowMs - at < ttlMs && at <= nowMs + 60_000;
}

function pacificOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** Midnight in Pacific time at the start of the day `now` falls in there. YouTube's search
    allowance resets then, so the shared guard counts from it. Handles the clocks changing. */
export function pacificDayStart(now: Date = new Date()): string {
  const offset = pacificOffsetMs(now);
  const wall = new Date(now.getTime() + offset);
  const midnightWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  // The offset at midnight can differ from the offset now on the day the clocks change.
  const guess = midnightWall - offset;
  return new Date(midnightWall - pacificOffsetMs(new Date(guess))).toISOString();
}

const RESERVED_IG_PATHS = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv", "direct", "about", "developer", "legal"]);

/** An Instagram handle a YouTube channel names in its own description. A guess to show as "from
    their description", never stated as a fact. */
export function instagramGuess(description: string | null | undefined): string | null {
  const text = description ?? "";
  for (const m of text.matchAll(/instagram\.com\/([A-Za-z0-9._]{1,30})/gi)) {
    const handle = m[1].toLowerCase().replace(/\.+$/, "");
    if (!RESERVED_IG_PATHS.has(handle)) {
      const valid = normalizeIgHandle(handle);
      if (valid) return valid;
    }
  }
  const labelled = text.match(/\b(?:instagram|insta|ig)\b\s*[:\-]?\s*@([A-Za-z0-9._]{2,30})/i);
  return labelled ? normalizeIgHandle(labelled[1].replace(/\.+$/, "")) : null;
}

export interface YoutubeCreatorResult {
  channelId: string;
  title: string;
  handle: string | null;
  avatar: string | null;
  subscribers: number | null;
  videoCount: number | null;
  matchedVideos: number;
  matchedViews: number;
  bestVideo: { title: string | null; views: number | null; url: string; thumb: string | null };
  instagramGuess: string | null;
  tracked: boolean;
}

/** Channels from a video search, ranked by the views of their matching videos added up. */
export function rankYoutubeCreators(videos: PostInput[], channels: SearchChannel[], limit = YOUTUBE_RESULTS): Omit<YoutubeCreatorResult, "tracked">[] {
  const byChannel = new Map<string, PostInput[]>();
  for (const v of videos) if (v.owner) byChannel.set(v.owner, [...(byChannel.get(v.owner) ?? []), v]);
  const out: Omit<YoutubeCreatorResult, "tracked">[] = [];
  for (const channel of channels) {
    const matched = byChannel.get(channel.channelId);
    if (!matched?.length) continue;
    const best = [...matched].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
    out.push({
      channelId: channel.channelId,
      title: channel.title,
      handle: channel.handle,
      avatar: channel.avatar,
      subscribers: channel.subscribers,
      videoCount: channel.videoCount,
      matchedVideos: matched.length,
      matchedViews: matched.reduce((sum, v) => sum + (v.views ?? 0), 0),
      bestVideo: { title: best.caption, views: best.views, url: best.url, thumb: best.thumb_url },
      instagramGuess: instagramGuess(channel.description),
    });
  }
  return out.sort((a, b) => b.matchedViews - a.matchedViews || b.matchedVideos - a.matchedVideos).slice(0, limit);
}

const bare = (v: string | null | undefined) => (v ?? "").trim().replace(/^@+/, "").toLowerCase();

export function markTrackedYoutube<T extends Omit<YoutubeCreatorResult, "tracked">>(
  results: T[],
  roster: { youtube: string | null; youtube_channel_id: string | null }[],
): (T & { tracked: boolean })[] {
  return results.map((r) => ({
    ...r,
    tracked: roster.some((c) => c.youtube_channel_id === r.channelId || (!!r.handle && !!c.youtube && bare(c.youtube) === bare(r.handle))),
  }));
}

export interface SimilarAccount {
  username: string;
  fullName: string | null;
  verified: boolean;
  avatar: string | null;
  tracked: boolean;
}

/** The related accounts Instagram itself returns for one profile, deduplicated, without the profile
    that was asked about. Both spellings of the field names are accepted. */
export function parseRelatedProfiles(items: unknown[], source: string): Omit<SimilarAccount, "tracked">[] {
  const profile = (items.find((i) => i && typeof i === "object" && !("error" in (i as object))) ?? {}) as { relatedProfiles?: unknown };
  const related = Array.isArray(profile.relatedProfiles) ? profile.relatedProfiles : [];
  const out: Omit<SimilarAccount, "tracked">[] = [];
  for (const item of related) {
    const r = (item ?? {}) as Record<string, unknown>;
    const username = normalizeIgHandle(String(r.username ?? ""));
    if (!username || username === source || out.some((o) => o.username === username)) continue;
    const fullName = typeof r.full_name === "string" ? r.full_name : typeof r.fullName === "string" ? r.fullName : null;
    const avatar = typeof r.profile_pic_url === "string" ? r.profile_pic_url : typeof r.profilePicUrl === "string" ? r.profilePicUrl : null;
    out.push({
      username,
      fullName: fullName?.trim() || null,
      verified: r.is_verified === true || r.verified === true,
      avatar: avatar?.startsWith("https://") ? avatar : null,
    });
  }
  return out;
}

export function markTrackedInstagram<T extends Omit<SimilarAccount, "tracked">>(
  accounts: T[],
  roster: { instagram: string | null; handle: string }[],
): (T & { tracked: boolean })[] {
  const tracked = new Set(roster.map((c) => normalizeIgHandle(c.instagram ?? "") ?? normalizeIgHandle(c.handle)).filter((h): h is string => !!h));
  return accounts.map((a) => ({ ...a, tracked: tracked.has(a.username) }));
}
