// What a saved hook and a written script look like once they land on the Content board.
//
// The labels below are not free choices. The Record tab parses a card's script with
// src/lib/content/film.ts, which looks for HOOK, ON SCREEN, CTA, SHOT LIST and TITLE at the start
// of a line and treats everything else as the spoken words. Get a label wrong and a student opens
// Record to an empty script, so the layout is pinned by a test against that same parser.

import type { Adaptation, Breakdown, Metric, Platform, PostKind } from "./types";

/** The board's platform codes. */
export function platformCode(platform: Platform): "ig" | "yt" {
  return platform === "youtube" ? "yt" : "ig";
}

/** The board's format codes. */
export function cardFormat(post: { platform: Platform; kind: PostKind }): "reel" | "short" | "long_form" | "carousel" {
  if (post.platform === "youtube") return post.kind === "short" ? "short" : "long_form";
  return post.kind === "carousel" ? "carousel" : "reel";
}

/** Where a card came from and how to make it, for the board's notes field. Record reads its
    "Subject:" line out of this, so the borrowed pattern goes there. */
export function researchCardNotes(args: {
  creator: string;
  postUrl: string;
  multiple: number | null;
  metric: Metric | null;
  breakdown: Breakdown | null;
  adaptation: Adaptation | null;
  extra?: string[];
}): string {
  const unit = args.metric === "engagement" ? "engagement" : "views";
  return [
    args.breakdown?.pattern_you_can_use ? `Subject: ${args.breakdown.pattern_you_can_use}` : null,
    `From Research: ${args.creator}${args.multiple != null ? `, ${args.multiple}x their normal ${unit}` : ""}.`,
    args.postUrl,
    args.breakdown?.hook_type ? `Hook type: ${args.breakdown.hook_type}` : null,
    args.adaptation?.how_to_shoot_it ? `How to shoot it: ${args.adaptation.how_to_shoot_it}` : null,
    ...(args.extra ?? []),
  ]
    .filter((line): line is string => !!line)
    .join("\n")
    .slice(0, 5_000);
}

/** The script laid out the way the Record tab reads it. A blank line ends a one-line label, so the
    spoken body starts after one. */
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
