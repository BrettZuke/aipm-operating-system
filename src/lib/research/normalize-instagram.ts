// One row from the Apify Instagram scraper turned into a post this tool understands.
//
// Field names verified against a real scraper run: videoPlayCount is the Instagram "views" number and
// is the one to use; videoViewCount is an older, lower count kept only as a fallback; likesCount comes
// back as -1 when the creator hides likes, which means unknown and not zero. Instagram's image and
// video links expire, and the expiry is written into the link itself as oe=<hex seconds>.

import type { PostInput, PostKind } from "./types";

export const MAX_IMAGE_URLS = 8;

const KIND_BY_TYPE: Record<string, PostKind> = {
  // Reels arrive as Video with productType "clips", older feed videos as plain Video. Both are reels.
  Video: "reel",
  Sidecar: "carousel",
  Image: "image",
};

// Unix seconds for 2020-01-01 and 2100-01-01. An oe value outside that window is not an expiry.
const OE_MIN = 1_577_836_800;
const OE_MAX = 4_102_444_800;

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function positive(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function nonNegativeInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

/** When an Instagram link stops working, read out of its own oe=<hex seconds> parameter. Null when
    there is none. */
export function oeExpiry(url: string | null | undefined): string | null {
  if (!url) return null;
  const query = url.split("#")[0].split("?")[1];
  if (!query) return null;
  const oe = new URLSearchParams(query).get("oe");
  if (!oe || !/^[0-9a-f]{1,12}$/i.test(oe)) return null;
  const secs = parseInt(oe, 16);
  if (secs < OE_MIN || secs > OE_MAX) return null;
  return new Date(secs * 1000).toISOString();
}

/** The lowercased username out of a profile link such as https://www.instagram.com/somebody/. */
export function handleFromProfileUrl(url: string | null | undefined): string | null {
  const m = (url ?? "").match(/instagram\.com\/([A-Za-z0-9._]{1,30})(?:[/?#]|$)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Whatever was typed or pasted ("@Name", "Name", a profile link) reduced to a bare lowercase
    Instagram username. Null when it is not one. */
export function normalizeIgHandle(raw: string | null | undefined): string | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  s = s.split(/[?#]/)[0];
  const inUrl = s.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i);
  if (inUrl) s = inUrl[1];
  s = s.replace(/^@+/, "").replace(/\/+$/, "").trim();
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null;
}

/** The profile url to hand the scraper for a handle. */
export function profileUrl(handle: string): string {
  return `https://www.instagram.com/${handle.replace(/^@/, "").toLowerCase()}/`;
}

/** One scraped row to a post. Null for error rows, unknown types, and rows with no usable code. */
export function normalizeInstagramItem(raw: unknown): PostInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (p.error != null) return null;

  const code = text(p.shortCode);
  const kind = typeof p.type === "string" ? KIND_BY_TYPE[p.type] : undefined;
  if (!code || !/^[A-Za-z0-9_-]{5,64}$/.test(code) || !kind) return null;

  const stamp = text(p.timestamp);
  const postedMs = stamp ? Date.parse(stamp) : Number.NaN;
  const views = positive(p.videoPlayCount) ?? positive(p.videoViewCount);
  const videoUrl = text(p.videoUrl);
  const displayUrl = text(p.displayUrl);
  const images = Array.isArray(p.images)
    ? p.images.filter((u): u is string => typeof u === "string" && u.length > 0).slice(0, MAX_IMAGE_URLS)
    : [];
  const owner = text(p.ownerUsername);

  return {
    platform: "instagram",
    external_id: code,
    url: `https://www.instagram.com/p/${code}/`,
    kind,
    posted_at: Number.isFinite(postedMs) ? new Date(postedMs).toISOString() : null,
    caption: text(p.caption),
    description: null,
    duration_s: positive(p.videoDuration),
    views: views === null ? null : Math.round(views),
    // Hidden likes come back as -1. That is unknown, not zero.
    likes: nonNegativeInt(p.likesCount),
    comments: nonNegativeInt(p.commentsCount),
    thumb_url: null,
    display_url: displayUrl,
    media_url: videoUrl,
    audio_url: text(p.audioUrl),
    image_urls: images.length > 0 ? images : null,
    media_expires_at: oeExpiry(videoUrl) ?? oeExpiry(displayUrl),
    owner: owner ? owner.toLowerCase() : null,
    source: handleFromProfileUrl(text(p.inputUrl)),
  };
}

/** A whole scraper run turned into posts. A repeated post keeps the first copy. */
export function normalizeInstagramItems(items: unknown[]): PostInput[] {
  const seen = new Set<string>();
  const out: PostInput[] = [];
  for (const item of items) {
    const post = normalizeInstagramItem(item);
    if (!post || seen.has(post.external_id)) continue;
    seen.add(post.external_id);
    out.push(post);
  }
  return out;
}
