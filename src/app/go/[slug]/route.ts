import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Link Bank: short, clean channel links for places people SEE the link (bio, DMs).
 *
 *   https://YOUR-SETTOKU/go/bio      -> your funnel + ?utm_source=instagram&utm_medium=bio
 *   https://YOUR-SETTOKU/go/youtube  -> your funnel + ?utm_source=youtube&utm_medium=video
 *
 * Each slug maps to a fixed { source, medium }. The destination is your funnel,
 * set once via NEXT_PUBLIC_FUNNEL_URL. This is never an open redirect: it only
 * ever sends to your own configured funnel. Any utm_* you append to the /go URL
 * wins over the defaults, so /go/story?utm_campaign=launch works too.
 *
 * To track ONE specific post / video / email, build a one-off link at /links.
 */

const CHANNELS: Record<string, { source: string; medium: string }> = {
  bio: { source: "instagram", medium: "bio" },
  dm: { source: "instagram", medium: "dm" },
  story: { source: "instagram", medium: "story" },
  reel: { source: "instagram", medium: "reel" },
  post: { source: "instagram", medium: "post" },
  email: { source: "email", medium: "broadcast" },
  youtube: { source: "youtube", medium: "video" },
  tiktok: { source: "tiktok", medium: "video" },
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const key = (slug || "").toLowerCase();
  const funnel = process.env.NEXT_PUBLIC_FUNNEL_URL;

  // Not configured yet: return a plain, helpful note instead of a broken redirect.
  if (!funnel) {
    return new NextResponse(
      `Link bank is not configured. Set NEXT_PUBLIC_FUNNEL_URL to your funnel URL, ` +
        `then /go/${key} will redirect there with UTMs attached. See UTM-GUIDE.md.`,
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  let dest: URL;
  try {
    dest = new URL(funnel);
  } catch {
    return new NextResponse("NEXT_PUBLIC_FUNNEL_URL is not a valid URL.", { status: 500 });
  }

  // Unknown slug still works: treat the slug itself as the source.
  const channel = CHANNELS[key] ?? { source: key || "link", medium: "link" };
  const incoming = req.nextUrl.searchParams;

  // Apply channel defaults, but never overwrite a utm_* the caller passed explicitly.
  const setIfAbsent = (k: string, v: string) => {
    if (v && !incoming.has(k) && !dest.searchParams.has(k)) dest.searchParams.set(k, v);
  };
  setIfAbsent("utm_source", channel.source);
  setIfAbsent("utm_medium", channel.medium);
  // Carry through any utm_* the caller added (utm_campaign, utm_content, ...).
  incoming.forEach((v, k) => {
    if (k.startsWith("utm_")) dest.searchParams.set(k, v);
  });

  const res = NextResponse.redirect(dest.toString(), 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
