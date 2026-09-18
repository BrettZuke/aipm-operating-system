// Downloading a scraped picture or video safely, and keeping a copy of the cover image that does
// not expire.
//
// A link that came out of a scraper is not a link anybody typed: it is whatever a third party put
// in a field. So nothing here fetches anything unless it is an https address on Instagram's own
// picture and video servers, and a redirect is checked again at every hop. A download also stops
// the moment it passes a size cap, so a huge file cannot fill the server while it is being read.
//
// Instagram's own picture links stop working after two or three days, which is why the cover image
// is copied into this dashboard's own storage the first time a post is read. The bytes are stored
// exactly as they came down: no image library is involved, so nothing has to be installed and
// nothing can go wrong in a resize.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IG_SCRAPER, runSyncItems } from "./apify";
import { normalizeInstagramItem } from "./normalize-instagram";

export const ALLOWED_MEDIA_HOSTS = ["cdninstagram.com", "fbcdn.net"] as const;
export const THUMB_BUCKET = "research-thumbs";

/** Cover images are stored as they arrive, so the cap is also the bucket's file size limit. */
export const THUMB_MAX_BYTES = 2 * 1024 * 1024;
const THUMB_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const REFRESH_CHARGE_USD = 0.01;
const REFRESH_TIMEOUT_MS = 90_000;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export class MediaFetchError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "MediaFetchError";
  }
}

/** True only for an https address on one of Instagram's own servers (the host itself or something
    under it), with no username, no password and no odd port. */
export function isAllowedMediaUrl(raw: string | null | undefined): boolean {
  if (typeof raw !== "string" || !URL.canParse(raw)) return false;
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return ALLOWED_MEDIA_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Download a scraped link into memory, refusing anything off the allowed list, following at most
    three redirects and checking each one, and stopping as soon as the file passes maxBytes.
    A non-2xx answer throws with the status, so an expired link (403 or 410) can be told apart. */
export async function fetchCapped(url: string, maxBytes: number, timeoutMs: number): Promise<{ bytes: Buffer; contentType: string | null }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedMediaUrl(current)) throw new MediaFetchError("Refused to download a link that is not on Instagram's own servers");
    const res = await fetch(current, { redirect: "manual", signal, cache: "no-store", headers: { "User-Agent": BROWSER_UA } });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location || !URL.canParse(location, current)) throw new MediaFetchError(`The download redirected with no usable address (${res.status})`, res.status);
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new MediaFetchError(`The download answered ${res.status}`, res.status);
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await res.body?.cancel();
      throw new MediaFetchError(`That file is ${declared} bytes, over the ${maxBytes} byte limit`, 413);
    }
    if (!res.body) throw new MediaFetchError("The download answered with nothing in it", res.status);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new MediaFetchError(`That file went past the ${maxBytes} byte limit`, 413);
      }
      chunks.push(value);
    }
    return { bytes: Buffer.concat(chunks), contentType: res.headers.get("content-type") };
  }
  throw new MediaFetchError(`The download redirected more than ${MAX_REDIRECTS} times`);
}

export const THUMB_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type ThumbType = keyof typeof THUMB_TYPES;

/** What kind of picture these bytes actually are, read from the first few bytes rather than from
    what the server said they were. Null when it is not a picture the thumbnail bucket accepts. */
export function imageTypeOf(bytes: Uint8Array): ThumbType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (at: number, word: string) => [...word].every((ch, i) => bytes[at + i] === ch.charCodeAt(0));
  if (bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}

/** Copy a cover image into this dashboard's own public bucket, exactly as it came down. Returns the
    address it can be shown from, which does not expire. */
export async function storeThumbnail(sb: SupabaseClient, displayUrl: string): Promise<string> {
  const { bytes } = await fetchCapped(displayUrl, THUMB_MAX_BYTES, THUMB_TIMEOUT_MS);
  const type = imageTypeOf(bytes);
  if (!type) throw new MediaFetchError("That cover image is not a picture this dashboard can store");
  const path = `${randomUUID()}.${THUMB_TYPES[type]}`;
  const { error } = await sb.storage.from(THUMB_BUCKET).upload(path, bytes, { contentType: type, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`Saving the cover image failed: ${error.message}`);
  return sb.storage.from(THUMB_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** The file inside the thumbnail bucket one of our own addresses points at, or null for any other
    address. Used to tidy up a copy whose row never saved. */
export function thumbnailPath(publicUrl: string | null | undefined): string | null {
  const m = (publicUrl ?? "").match(new RegExp(`/storage/v1/object/public/${THUMB_BUCKET}/([0-9a-f-]{36}\\.(?:jpg|png|webp))$`));
  return m ? m[1] : null;
}

/** True when Instagram's links for a post have run out, or when we cannot tell. A link we cannot
    date is a link we cannot trust to load. */
export function isMediaExpired(expiresAt: string | null | undefined, nowMs = Date.now(), marginMs = 30 * 60_000): boolean {
  if (!expiresAt) return true;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at - marginMs <= nowMs;
}

export interface MediaFields {
  display_url: string | null;
  media_url: string | null;
  audio_url: string | null;
  image_urls: string[] | null;
  media_expires_at: string | null;
}

/** Read ONE post again to get fresh picture and video links (one result, capped at a cent) and save
    them on the row. Only called when the stored links have expired or were refused. */
export async function refreshInstagramMedia(
  sb: SupabaseClient,
  agencyId: string,
  post: { id: string; url: string },
  opts: { timeoutMs?: number } = {},
): Promise<MediaFields> {
  const items = await runSyncItems(
    IG_SCRAPER,
    { directUrls: [post.url], resultsType: "posts", resultsLimit: 1 },
    { maxTotalChargeUsd: REFRESH_CHARGE_USD, timeoutMs: Math.min(opts.timeoutMs ?? REFRESH_TIMEOUT_MS, REFRESH_TIMEOUT_MS) },
  );
  const fresh = items.map(normalizeInstagramItem).find((p) => p !== null && p.url === post.url);
  if (!fresh) throw new Error("Instagram did not return that post. It may have been deleted, or the account may be private.");
  const fields: MediaFields = {
    display_url: fresh.display_url,
    media_url: fresh.media_url,
    audio_url: fresh.audio_url,
    image_urls: fresh.image_urls,
    media_expires_at: fresh.media_expires_at,
  };
  const { error } = await sb
    .from("content_posts")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("agency_id", agencyId);
  if (error) throw new Error(`Saving the refreshed links failed: ${error.message}`);
  return fields;
}
