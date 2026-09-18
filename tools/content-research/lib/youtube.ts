// YouTube's own free Data API: find a channel, read its recent uploads with their numbers, and
// search for creators in a niche.
//
// It costs no money, but it does have a daily allowance and that allowance belongs to the key, not
// to a client. Reading channels, uploads and videos costs 1 unit each out of 10,000 a day, which is
// plenty. Searching has its own separate bucket of about 100 calls a day, which is not, so the find
// command is the one to be careful with. Every call has a 15 second limit and a spent allowance
// comes back as a clear error rather than an empty list.

import type { PostInput, PostKind } from "./types";

const API = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 15_000;
const DESCRIPTION_CHARS = 2_000;
const SEARCH_WINDOW_DAYS = 365;

/** A video this long or shorter is treated as a Short. */
export const SHORT_MAX_SECONDS = 180;

type Endpoint = "channels" | "playlistItems" | "videos" | "search";

export class YoutubeQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeQuotaError";
  }
}

export class YoutubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "YoutubeApiError";
  }
}

async function yt<T>(endpoint: Endpoint, params: Record<string, string>): Promise<T> {
  const key = (process.env.YOUTUBE_API_KEY ?? "").trim();
  if (!key) throw new YoutubeApiError("YOUTUBE_API_KEY is not set");
  let res: Response;
  try {
    res = await fetch(`${API}/${endpoint}?${new URLSearchParams(params).toString()}`, {
      // The key travels in a header so it never lands in a url or in an error message.
      headers: { "X-Goog-Api-Key": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new YoutubeApiError(`YouTube did not answer within ${TIMEOUT_MS / 1000} seconds`);
    }
    throw e;
  }
  if (!res.ok) {
    const body = await res.text();
    if (/quotaExceeded|dailyLimitExceeded/.test(body)) {
      throw new YoutubeQuotaError(
        endpoint === "search"
          ? "Your YouTube search allowance is spent for today (about 100 searches a day). It resets at midnight Pacific time. Track creators by handle in the meantime."
          : "Your YouTube allowance is spent for today (10,000 units a day). It resets at midnight Pacific time.",
      );
    }
    throw new YoutubeApiError(`YouTube answered ${res.status}: ${body.replace(/\s+/g, " ").slice(0, 200)}`, res.status);
  }
  return (await res.json()) as T;
}

/** Seconds from a YouTube duration such as PT1H2M3S or P1DT4M. Null when it is not one. */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  const value = (iso ?? "").trim();
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!m || value === "P" || value.endsWith("T")) return null;
  const [, days, hours, minutes, seconds] = m;
  return Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

export function youtubeKind(durationS: number | null): PostKind {
  return durationS !== null && durationS > 0 && durationS <= SHORT_MAX_SECONDS ? "short" : "video";
}

export function uploadsPlaylistId(channelId: string): string {
  return `UU${channelId.slice(2)}`;
}

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

/** Whatever the student typed ("@Handle", "Handle", a channel link, a UC id) turned into a lookup. */
export function parseChannelRef(input: { handle?: string | null; channelId?: string | null }): { channelId: string } | { handle: string } | null {
  const id = (input.channelId ?? "").trim();
  if (CHANNEL_ID_RE.test(id)) return { channelId: id };
  const raw = (input.handle ?? "").trim();
  if (!raw) return null;
  const inUrl = raw.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (inUrl) return { channelId: inUrl[1] };
  if (CHANNEL_ID_RE.test(raw)) return { channelId: raw };
  const atHandle = raw.match(/@([A-Za-z0-9._-]{3,100})/);
  const bare = atHandle ? atHandle[1] : /^[A-Za-z0-9._-]{3,100}$/.test(raw) ? raw : null;
  return bare ? { handle: bare } : null;
}

type Thumbs = Record<string, { url?: string } | undefined> | undefined;

/** The best picture the API offers: maxres, then high, then medium. */
export function bestThumbnail(thumbs: Thumbs): string | null {
  for (const size of ["maxres", "high", "medium"]) {
    const url = thumbs?.[size]?.url;
    if (typeof url === "string" && url.startsWith("https://")) return url;
  }
  return null;
}

function count(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

interface VideoItem {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    liveBroadcastContent?: string;
    thumbnails?: Thumbs;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

/** One video from the API turned into a post. Null for live or upcoming streams, which have no
    settled view count or length yet. */
export function normalizeYoutubeVideo(item: unknown): PostInput | null {
  const v = (item ?? {}) as VideoItem;
  if (typeof v.id !== "string" || !/^[A-Za-z0-9_-]{6,20}$/.test(v.id)) return null;
  const live = v.snippet?.liveBroadcastContent;
  if (live && live !== "none") return null;
  const duration = parseIsoDuration(v.contentDetails?.duration);
  const posted = v.snippet?.publishedAt ? Date.parse(v.snippet.publishedAt) : Number.NaN;
  const description = (v.snippet?.description ?? "").trim();
  return {
    platform: "youtube",
    external_id: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    kind: youtubeKind(duration),
    posted_at: Number.isFinite(posted) ? new Date(posted).toISOString() : null,
    caption: v.snippet?.title?.trim() || null,
    description: description ? description.slice(0, DESCRIPTION_CHARS) : null,
    duration_s: duration !== null && duration > 0 ? duration : null,
    views: count(v.statistics?.viewCount),
    // Missing when the channel hides likes or turns comments off: unknown, not zero.
    likes: count(v.statistics?.likeCount),
    comments: count(v.statistics?.commentCount),
    thumb_url: bestThumbnail(v.snippet?.thumbnails) ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    display_url: null,
    media_url: null,
    audio_url: null,
    image_urls: null,
    media_expires_at: null,
    owner: v.snippet?.channelId ?? null,
    source: null,
  };
}

export interface ResolvedChannel {
  channelId: string;
  title: string;
  handle: string | null;
  uploadsPlaylistId: string;
}

interface ChannelItem {
  id?: string;
  snippet?: { title?: string; customUrl?: string; description?: string; thumbnails?: Thumbs };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
}

/** Find a channel by id or by handle. Null when YouTube has no such channel. */
export async function resolveChannel(input: { handle?: string | null; channelId?: string | null }): Promise<ResolvedChannel | null> {
  const ref = parseChannelRef(input);
  if (!ref) return null;
  const params: Record<string, string> = { part: "snippet", maxResults: "1" };
  if ("channelId" in ref) params.id = ref.channelId;
  else params.forHandle = ref.handle;
  const data = await yt<{ items?: ChannelItem[] }>("channels", params);
  const item = data.items?.[0];
  if (!item?.id) return null;
  return {
    channelId: item.id,
    title: item.snippet?.title ?? "YouTube channel",
    handle: item.snippet?.customUrl ?? null,
    uploadsPlaylistId: uploadsPlaylistId(item.id),
  };
}

/** The video ids of a channel's most recent uploads, newest first. */
export async function listUploads(channelId: string, max = 50): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < max) {
    let page: { items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string };
    try {
      page = await yt("playlistItems", {
        part: "contentDetails",
        playlistId: uploadsPlaylistId(channelId),
        maxResults: String(Math.min(50, max - ids.length)),
        ...(pageToken ? { pageToken } : {}),
      });
    } catch (e) {
      // A channel with no public videos answers 404 on its uploads list. That is an empty channel.
      if (e instanceof YoutubeApiError && e.status === 404) return ids;
      throw e;
    }
    for (const item of page.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (id && !ids.includes(id)) ids.push(id);
    }
    if (!page.nextPageToken || (page.items ?? []).length === 0) break;
    pageToken = page.nextPageToken;
  }
  return ids.slice(0, max);
}

async function videoItems(ids: string[]): Promise<VideoItem[]> {
  const out: VideoItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await yt<{ items?: VideoItem[] }>("videos", {
      part: "snippet,statistics,contentDetails",
      id: ids.slice(i, i + 50).join(","),
      maxResults: "50",
    });
    out.push(...(data.items ?? []));
  }
  return out;
}

/** Full details for a list of videos, as posts. */
export async function videoDetails(ids: string[]): Promise<PostInput[]> {
  return (await videoItems(ids)).map(normalizeYoutubeVideo).filter((p): p is PostInput => p !== null);
}

export interface SearchChannel {
  channelId: string;
  title: string;
  handle: string | null;
  subscribers: number | null;
  videoCount: number | null;
  description: string | null;
}

/** Finding creators: the most watched videos of the last year for a search, with their numbers and
    their channels. One search call (the scarce one), then cheap lookups. */
export async function searchVideos(query: string): Promise<{ videos: PostInput[]; channels: SearchChannel[] }> {
  const q = query.trim();
  if (!q) return { videos: [], channels: [] };
  const publishedAfter = new Date(Date.now() - SEARCH_WINDOW_DAYS * 86_400_000).toISOString();
  const found = await yt<{ items?: { id?: { videoId?: string } }[] }>("search", {
    part: "snippet",
    type: "video",
    order: "viewCount",
    publishedAfter,
    maxResults: "50",
    q,
  });
  const ids = [...new Set((found.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => !!id))];
  if (ids.length === 0) return { videos: [], channels: [] };
  const videos = await videoDetails(ids);
  const channelIds = [...new Set(videos.map((v) => v.owner).filter((id): id is string => !!id))];
  const channels: SearchChannel[] = [];
  for (let i = 0; i < channelIds.length; i += 50) {
    const data = await yt<{ items?: ChannelItem[] }>("channels", {
      part: "snippet,statistics",
      id: channelIds.slice(i, i + 50).join(","),
      maxResults: "50",
    });
    for (const c of data.items ?? []) {
      if (!c.id) continue;
      channels.push({
        channelId: c.id,
        title: c.snippet?.title ?? "YouTube channel",
        handle: c.snippet?.customUrl ?? null,
        subscribers: c.statistics?.hiddenSubscriberCount ? null : count(c.statistics?.subscriberCount),
        videoCount: count(c.statistics?.videoCount),
        description: c.snippet?.description?.trim() || null,
      });
    }
  }
  return { videos, channels };
}

/** An Instagram handle mentioned in a channel description. A guess, never stated as fact. */
export function instagramGuess(description: string | null): string | null {
  const m = (description ?? "").match(/instagram\.com\/([A-Za-z0-9._]{2,30})/i);
  return m ? m[1].toLowerCase() : null;
}
