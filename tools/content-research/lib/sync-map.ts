// Turning this tool's work into the exact rows the student's dashboard already knows how to draw.
//
// Nothing here talks to the internet, so every shape is unit tested. The columns come from the
// dashboard's own migrations in supabase/migrations at the root of this repo, and the script layout
// comes from its own parser in src/lib/content/film.ts, which is what the Record tab films from. Get the
// labels wrong and a student opens Record to an empty script, so the layout is tested against that
// parser rather than assumed.

import type { Adaptation, Breakdown, Creator, ScoredPost } from "./types";

/** What lands on every row this tool writes, so it can all be found and taken back out again. */
export const TOOL = "content-research";

/** The Apify post types the dashboard's own signal panel already displays. */
export function postTypeOf(post: Pick<ScoredPost, "platform" | "kind">): string {
  if (post.platform === "youtube") return "Video";
  if (post.kind === "carousel") return "Sidecar";
  if (post.kind === "image") return "Image";
  return "Video";
}

/** The board's platform codes. */
export function platformCode(platform: ScoredPost["platform"]): "ig" | "yt" {
  return platform === "youtube" ? "yt" : "ig";
}

/** The board's format codes. */
export function formatCode(post: Pick<ScoredPost, "platform" | "kind">): "reel" | "short" | "long_form" | "carousel" {
  if (post.platform === "youtube") return post.kind === "short" ? "short" : "long_form";
  return post.kind === "carousel" ? "carousel" : "reel";
}

/** A handle with any leading at sign taken off, lowercased. The roster's unique key is the handle
    ignoring case, so it is stored in one shape. */
export function normalizeHandle(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}

export interface CreatorRow {
  agency_id: string;
  handle: string;
  name: string;
  instagram: string | null;
  youtube: string | null;
  role: string;
  status: string;
  note: string;
  posts_count: number;
  videos_count: number;
  last_scraped_at: string | null;
  updated_at: string;
}

/** One tracked competitor as a roster row. Role is "emulate" because these are copy targets: the
    roster's own migration says emulate is the competitor whose content we actually copy. */
export function creatorRow(args: {
  agencyId: string;
  creator: Creator;
  clientName: string;
  posts: ScoredPost[];
  at: Date;
}): CreatorRow {
  const theirs = args.posts.filter((p) => p.creator === args.creator.name);
  const handle = normalizeHandle(args.creator.handle ?? args.creator.name);
  return {
    agency_id: args.agencyId,
    handle,
    name: args.creator.name,
    instagram: args.creator.platform === "instagram" ? handle : null,
    youtube: args.creator.platform === "youtube" ? args.creator.handle ?? args.creator.channel_id : null,
    role: "emulate",
    status: "active",
    note: `Tracked by the content research tool for ${args.clientName}.`,
    posts_count: theirs.filter((p) => p.platform === "instagram").length,
    videos_count: theirs.filter((p) => p.platform === "youtube").length,
    last_scraped_at: theirs.length > 0 ? args.at.toISOString() : null,
    updated_at: args.at.toISOString(),
  };
}

export interface OutlierRow {
  agency_id: string;
  url: string;
  platform: string;
  creator: string | null;
  handle: string | null;
  posted: string | null;
  post_type: string;
  metric: string;
  score: number | null;
  creator_median: number | null;
  multiple: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  caption_hook: string | null;
  caption: string | null;
}

/** The first line of a caption, which is the part anybody actually reads. */
export function captionHook(caption: string | null): string | null {
  const first = (caption ?? "").split("\n").map((l) => l.trim()).find(Boolean);
  return first ? first.slice(0, 300) : null;
}

/** One standout as a row for the signal panel. The maths only: the analysis columns are written in
    a separate step, so a re-sync of the numbers can never blank a breakdown that is already there. */
export function outlierRow(agencyId: string, post: ScoredPost, handle: string | null): OutlierRow {
  return {
    agency_id: agencyId,
    url: post.url,
    platform: post.platform,
    creator: post.creator,
    handle: handle ? normalizeHandle(handle) : null,
    posted: post.posted_at ? post.posted_at.slice(0, 10) : null,
    post_type: postTypeOf(post),
    metric: post.metric ?? "views",
    score: post.score,
    creator_median: post.baseline,
    multiple: post.multiple,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    caption_hook: captionHook(post.caption),
    caption: post.caption ? post.caption.slice(0, 5_000) : null,
  };
}

export interface OutlierAnalysis {
  hook_type: string | null;
  hook_template: string | null;
  format: string | null;
  ask: string | null;
  why_it_worked: string | null;
  analysed: boolean;
}

/** The analysis half of an outlier row. Only written when a breakdown exists, and never with the
    fields blanked, so the signal panel keeps what it already has. */
export function outlierAnalysis(b: Breakdown): OutlierAnalysis {
  return {
    hook_type: b.hook_type,
    hook_template: b.hook_template,
    format: b.format,
    ask: b.ask,
    why_it_worked: b.why_it_holds_attention,
    analysed: true,
  };
}

/** The traceable marker on every card this tool files, and the key that stops a second sync writing
    the same card twice. The board has no unique key of its own, so this is it. */
export function cardSource(slug: string, postId: string, kind: "hook" | "script", index: number): string {
  return `${TOOL}:${slug}:${postId}:${kind}:${index}`;
}

export interface CardRow {
  agency_id: string;
  stage: "ideas" | "scripted";
  title: string;
  format: string;
  platform: string;
  hook: string;
  script: string | null;
  source: string;
  notes: string;
  created_by: string;
  position: number;
  updated_at: string;
}

/** Where a card came from and how to make it, for the board's own notes field. The Record tab reads
    a "Subject:" line out of this, so the borrowed pattern goes there. */
export function cardNotes(args: {
  creator: string;
  postUrl: string;
  multiple: number | null;
  metric: string | null;
  breakdown: Breakdown | null;
  adaptation: Adaptation | null;
  extra?: string[];
}): string {
  const unit = args.metric === "engagement" ? "engagement" : "views";
  return [
    args.breakdown?.pattern_you_can_use ? `Subject: ${args.breakdown.pattern_you_can_use}` : null,
    `From content research: ${args.creator}${args.multiple != null ? `, ${args.multiple}x their normal ${unit}` : ""}.`,
    args.postUrl,
    args.breakdown?.hook_type ? `Hook type: ${args.breakdown.hook_type}` : null,
    args.adaptation?.how_to_shoot_it ? `How to shoot it: ${args.adaptation.how_to_shoot_it}` : null,
    ...(args.extra ?? []),
  ]
    .filter((line): line is string => !!line)
    .join("\n")
    .slice(0, 5_000);
}

/**
 * The script laid out the way the dashboard's Record tab reads it.
 *
 * Its parser (src/lib/content/film.ts, at the root of this repo) looks for these exact labels at the start of
 * a line: HOOK, ON SCREEN, CTA, SHOT LIST, and for YouTube TITLE. Everything unlabelled is treated
 * as the spoken words. A blank line ends a one-line label, so the spoken body starts after one.
 */
export function filmScriptBody(args: {
  hook: string;
  onScreen: string | null;
  spoken: string;
  cta: string;
  shots: string[];
  videoTitle?: string | null;
}): string {
  const out: string[] = [];
  if (args.videoTitle) out.push(`TITLE: ${args.videoTitle}`);
  out.push(`HOOK: ${args.hook}`);
  if (args.onScreen) out.push(`ON SCREEN: ${args.onScreen}`);
  out.push("");
  out.push(args.spoken.trim());
  out.push("");
  if (args.cta) out.push(`CTA: ${args.cta}`);
  if (args.shots.length) {
    out.push("SHOT LIST:");
    for (const shot of args.shots) out.push(`- ${shot}`);
  }
  return out.join("\n");
}

/** Every card one standout produces: the chosen hook first, then the others, then the script. */
export function cardsFor(args: {
  agencyId: string;
  slug: string;
  postId: string;
  post: ScoredPost;
  breakdown: Breakdown | null;
  adaptation: Adaptation | null;
  script: { hook: string; onScreen: string | null; spoken: string; cta: string; shots: string[] } | null;
  at: Date;
}): CardRow[] {
  const rows: CardRow[] = [];
  const common = {
    agency_id: args.agencyId,
    format: formatCode(args.post),
    platform: platformCode(args.post.platform),
    // The board only accepts "human" or "agent:<id>", and this is not a human typing.
    created_by: `agent:${TOOL}`,
    position: 0,
    updated_at: args.at.toISOString(),
  };
  const notes = (extra: string[] = []) =>
    cardNotes({
      creator: args.post.creator,
      postUrl: args.post.url,
      multiple: args.post.multiple,
      metric: args.post.metric,
      breakdown: args.breakdown,
      adaptation: args.adaptation,
      extra,
    });

  const a = args.adaptation;
  if (a) {
    const ordered = [...a.hooks.slice(a.pick, a.pick + 1), ...a.hooks.filter((_, i) => i !== a.pick)];
    ordered.forEach((h, i) => {
      rows.push({
        ...common,
        stage: "ideas",
        title: h.text,
        hook: h.text,
        script: null,
        source: cardSource(args.slug, args.postId, "hook", i),
        notes: notes([h.why ? `Why this hook: ${h.why}` : "", i === 0 && a.pick_reason ? `The pick: ${a.pick_reason}` : ""].filter(Boolean)),
      });
    });
  }

  if (args.script) {
    rows.push({
      ...common,
      stage: "scripted",
      title: args.script.hook,
      hook: args.script.hook,
      script: filmScriptBody({
        hook: args.script.hook,
        onScreen: args.script.onScreen,
        spoken: args.script.spoken,
        cta: args.script.cta,
        shots: args.script.shots,
        videoTitle: null,
      }),
      source: cardSource(args.slug, args.postId, "script", 0),
      notes: notes(),
    });
  }
  return rows;
}
