// Downloading a scraped video safely.
//
// A link that came out of a scraper is not a link you typed: it is whatever a third party put in a
// field. So nothing here fetches anything unless it is an https address on Instagram's own picture
// and video servers, and a redirect is checked again at every hop. The download also stops the moment
// it passes a size cap, so a huge file cannot fill the machine while it is being read.

export const ALLOWED_MEDIA_HOSTS = ["cdninstagram.com", "fbcdn.net"] as const;

const MAX_REDIRECTS = 3;
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

/** Download a scraped media link into memory, refusing anything off the allowed list, following at
    most three redirects and checking each one, and stopping as soon as the file passes maxBytes.
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
      throw new MediaFetchError(`That video is ${declared} bytes, over the ${maxBytes} byte limit`, 413);
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
        throw new MediaFetchError(`That video went past the ${maxBytes} byte limit`, 413);
      }
      chunks.push(value);
    }
    return { bytes: Buffer.concat(chunks), contentType: res.headers.get("content-type") };
  }
  throw new MediaFetchError(`The download redirected more than ${MAX_REDIRECTS} times`);
}

/** True when Instagram's links for a post have run out, or when we cannot tell. A link we cannot
    date is a link we cannot trust to load. */
export function isMediaExpired(expiresAt: string | null | undefined, nowMs = Date.now(), marginMs = 30 * 60_000): boolean {
  if (!expiresAt) return true;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at - marginMs <= nowMs;
}
