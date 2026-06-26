# UTM Guide: Link Bank + Builder

## What a UTM link actually is

It is just a normal link to your funnel with an invisible label stuck on the end.
When someone clicks it, that label tells your dashboard exactly where the click
came from. The visitor sees a normal page. You see the source. That is the whole
idea.

## You have two kinds of links

### 1. Channel links (the link bank, already built)

For when you just want totals per channel, like "how much from stories overall."
Clean to paste where people actually see the link (bio, DMs). Replace
`YOUR-SETTOKU` with your deployed domain:

- `YOUR-SETTOKU/go/bio` : Instagram bio
- `YOUR-SETTOKU/go/dm` : DMs
- `YOUR-SETTOKU/go/story` : Story sticker
- `YOUR-SETTOKU/go/reel` : Reels
- `YOUR-SETTOKU/go/post` : Feed posts
- `YOUR-SETTOKU/go/email` : Email broadcasts
- `YOUR-SETTOKU/go/youtube` : YouTube
- `YOUR-SETTOKU/go/tiktok` : TikTok

They all redirect to your funnel (set once via `NEXT_PUBLIC_FUNNEL_URL`) with the
right source and medium attached. Want a different channel? Add a line to the map
in `src/app/go/[slug]/route.ts`.

### 2. Builder links (for one specific thing)

When you want to know which specific story, video, or email drove the sales (not
just stories in general), make a one-off labeled link with the builder. You
cannot pre-build a link for every video forever, so the builder makes them on
demand.

Open this page: `YOUR-SETTOKU/links`

How to use it, takes 30 seconds:

1. Open the page.
2. Pick where it goes (usually your main funnel).
3. Pick the Source (Instagram, YouTube, Email).
4. Pick the Medium, the type of placement (story, reel, video, broadcast).
5. Type a Campaign name, the specific thing (for example `ai-tools-video`, or
   `black-friday-email`).
6. Copy the link it builds and paste it wherever you are posting.

## A real example

You post a YouTube video about AI tools and want to know how many sales it brings
in.

1. Go to `YOUR-SETTOKU/links`, choose YouTube, then video, and type
   `ai-tools-video`.
2. Copy the link it gives you and paste it in the video description.
3. In the dashboard, `ai-tools-video` now shows up as its own line, with the
   visitors and sales that came from that one video, separate from everything
   else.

## The one rule to remember

Use the short `/go` links for DMs and your bio, where people actually see the
link. Use a builder link everywhere the link is hidden behind text or a button
(YouTube descriptions, email buttons, story stickers).

## Where the tracking lands

Either way, the source rides all the way through and shows up across your
dashboard:

- **Traffic and views:** GA4. Set `data-ga4` on the capture script and pageviews,
  scroll-depth, and checkout clicks all carry the source.
- **Sales by source:** your payment processor passes UTMs into its webhook, and
  the capture beacon ties buyers back to their first-touch source by email, so
  even off-domain checkouts (FanBasis, Stripe Checkout) get attributed.
- **Subscribers by source:** your email tool (Kit and others) keeps the UTM that
  arrived on the opt-in, so you see which source produced each subscriber.

You watch it all come together under "Revenue by source" and "Revenue by
campaign / content" on the dashboard.

## Setup checklist (one time)

1. Set `NEXT_PUBLIC_FUNNEL_URL` to your main funnel URL (this is where `/go` links
   point).
2. Put the capture script on your funnel and opt-in pages. The file ships at
   `public/settoku-insights.js`; the in-app docs at `/docs/utm-tracking` show the
   exact script tag.
3. Set `FANBASIS_TARGET_AGENCY_ID` so captured opt-ins land in your workspace.
4. Start using the `/go` links and the `/links` builder. Within a few days
   "Revenue by source" fills in.
