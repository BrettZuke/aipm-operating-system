import { describe, expect, it } from "vitest";
import { ALLOWED_MEDIA_HOSTS, imageTypeOf, isAllowedMediaUrl, isMediaExpired, THUMB_MAX_BYTES, THUMB_TYPES, thumbnailPath } from "./media";

describe("which addresses this tool will download from", () => {
  it("allows Instagram's own servers and anything under them", () => {
    expect(isAllowedMediaUrl("https://cdninstagram.com/a.mp4")).toBe(true);
    expect(isAllowedMediaUrl("https://scontent-lhr8-1.cdninstagram.com/v/a.mp4")).toBe(true);
    expect(isAllowedMediaUrl("https://video.fbcdn.net/v/a.mp4")).toBe(true);
    expect(ALLOWED_MEDIA_HOSTS).toEqual(["cdninstagram.com", "fbcdn.net"]);
  });

  it("refuses anywhere else, however much it looks the part", () => {
    expect(isAllowedMediaUrl("https://cdninstagram.com.evil.example/a.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://notcdninstagram.com/a.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://somewhere.test/cdninstagram.com/a.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://evil.example/?x=cdninstagram.com")).toBe(false);
  });

  it("refuses anything that is not plain https on the normal port", () => {
    expect(isAllowedMediaUrl("http://cdninstagram.com/a.mp4")).toBe(false);
    expect(isAllowedMediaUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedMediaUrl("https://cdninstagram.com:8080/a.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://cdninstagram.com:443/a.mp4")).toBe(true);
  });

  it("refuses an address carrying a username or password", () => {
    expect(isAllowedMediaUrl("https://user:pass@cdninstagram.com/a.mp4")).toBe(false);
    // The real host here IS Instagram's, but a credential in front of it is the shape of a trick,
    // so the guard refuses the whole address rather than reasoning about it.
    expect(isAllowedMediaUrl("https://evil.example@cdninstagram.com/a.mp4")).toBe(false);
  });

  it("refuses the local machine and the cloud metadata address", () => {
    expect(isAllowedMediaUrl("https://127.0.0.1/a.mp4")).toBe(false);
    expect(isAllowedMediaUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedMediaUrl("https://localhost/a.mp4")).toBe(false);
  });

  it("refuses nonsense rather than throwing", () => {
    expect(isAllowedMediaUrl(null)).toBe(false);
    expect(isAllowedMediaUrl("")).toBe(false);
    expect(isAllowedMediaUrl("not a url")).toBe(false);
  });

  it("ignores a trailing dot on the host, which is the same host", () => {
    expect(isAllowedMediaUrl("https://cdninstagram.com./a.mp4")).toBe(true);
  });
});

describe("knowing when a link has run out", () => {
  const now = Date.parse("2026-09-17T12:00:00.000Z");

  it("counts a link with no expiry as expired, because it cannot be trusted", () => {
    expect(isMediaExpired(null, now)).toBe(true);
    expect(isMediaExpired("not a date", now)).toBe(true);
  });

  it("counts one inside the safety margin as expired", () => {
    expect(isMediaExpired(new Date(now + 10 * 60_000).toISOString(), now)).toBe(true);
    expect(isMediaExpired(new Date(now + 2 * 3_600_000).toISOString(), now)).toBe(false);
  });
});

describe("storing a cover image as it came down", () => {
  it("reads the kind of picture from the bytes, not from what the server claimed", () => {
    expect(imageTypeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageTypeOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    const webp = new Uint8Array(16);
    webp.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
    webp.set([..."WEBP"].map((c) => c.charCodeAt(0)), 8);
    expect(imageTypeOf(webp)).toBe("image/webp");
  });

  it("refuses anything that is not a picture the bucket takes", () => {
    expect(imageTypeOf(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull();
    expect(imageTypeOf(new Uint8Array([]))).toBeNull();
  });

  it("stores only the kinds the bucket allows", () => {
    expect(Object.keys(THUMB_TYPES)).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(THUMB_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it("recognises one of its own stored addresses, and nothing else", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(thumbnailPath(`https://abc.supabase.co/storage/v1/object/public/research-thumbs/${id}.jpg`)).toBe(`${id}.jpg`);
    expect(thumbnailPath(`https://abc.supabase.co/storage/v1/object/public/research-thumbs/${id}.webp`)).toBe(`${id}.webp`);
    expect(thumbnailPath("https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBeNull();
    expect(thumbnailPath(null)).toBeNull();
  });
});
