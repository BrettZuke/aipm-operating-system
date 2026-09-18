// The markdown report: the standouts, ranked, with the numbers and whatever has been broken down.
//
// This is the thing a student actually sends a client, so every number in it comes from a scrape and
// nothing in it is rounded up for effect. Where there is no number, it says there is no number.

import { BASELINE_AGE_HOURS, BASELINE_MIN_POSTS, MIN_MULTIPLE, type GroupReport } from "./baseline";
import type { StoredBreakdown } from "./store";
import type { ClientProfile, ScoredPost } from "./types";

const n = (v: number | null | undefined): string => (v == null ? "no number" : Math.round(v).toLocaleString("en-US"));

function surface(p: ScoredPost): string {
  if (p.platform === "youtube") return p.kind === "short" ? "YouTube Short" : "YouTube video";
  return p.kind === "carousel" ? "Instagram carousel" : p.kind === "image" ? "Instagram image" : "Instagram reel";
}

function ago(iso: string | null): string {
  if (!iso) return "date unknown";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return "date unknown";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "about a month ago" : `about ${months} months ago`;
}

/** Standouts, strongest first. Strength is the multiple damped by the reach it actually got, so a
    huge multiple on a tiny post does not outrank a real hit. */
export function rankOutliers(posts: ScoredPost[]): ScoredPost[] {
  return posts.filter((p) => p.is_outlier).sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
}

/** How many near misses to show when nothing cleared the 2x bar. */
export const NEAR_MISS_COUNT = 5;

/** The numbered list the report prints and every other command counts against. Standouts when there
    are any, otherwise the best of what was read, so "breakdown 1" always means something. */
export function reportOrder(posts: ScoredPost[]): { posts: ScoredPost[]; areStandouts: boolean } {
  const outliers = rankOutliers(posts);
  if (outliers.length > 0) return { posts: outliers, areStandouts: true };
  const best = [...posts]
    .filter((p) => (p.score ?? 0) > 0)
    .sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, NEAR_MISS_COUNT);
  return { posts: best, areStandouts: false };
}

/** A baseline group with the creator it belongs to, so the report can say whose normal it is. */
export interface CreatorGroup extends GroupReport {
  creator: string;
}

export interface ReportArgs {
  client: ClientProfile;
  posts: ScoredPost[];
  groups: CreatorGroup[];
  breakdowns: Map<string, StoredBreakdown>;
  scannedAt: Date;
  apifyUsd: number;
}

export function buildReport(args: ReportArgs): string {
  const { posts: listed, areStandouts } = reportOrder(args.posts);
  const creators = [...new Set(args.posts.map((p) => p.creator))];
  const out: string[] = [];

  out.push(`# What is working in ${args.client.name}'s world`);
  out.push("");
  out.push(`${args.scannedAt.toISOString().slice(0, 10)}. ${args.posts.length} recent posts read across ${creators.length} creator${creators.length === 1 ? "" : "s"}.`);
  out.push("");
  out.push(
    `A post is a standout here when it beat **its own creator's normal** by ${MIN_MULTIPLE}x or more. That is the ` +
      `only fair way to compare a big account with a small one, and it is why a post with fewer views can ` +
      `rank above one with more. The normal is the middle number of that creator's recent posts, counting ` +
      `only posts at least ${BASELINE_AGE_HOURS} hours old, because a post from yesterday is still growing.`,
  );
  out.push("");

  if (listed.length === 0) {
    out.push("## Nothing to measure yet");
    out.push("");
    out.push(
      "None of the posts read carried a number to judge. That usually means the accounts are new, private, " +
        "or posting in a format with no public count. Track a few more creators and scan again.",
    );
  } else {
    if (!areStandouts) {
      out.push("## No standouts this time, so here is the best of what was read");
      out.push("");
      out.push(
        "Nothing in this batch beat its creator's normal by 2x. That is a real answer, not a failure: it " +
          "usually means these accounts are posting steadily rather than hitting. The posts below are the " +
          "closest, in order, and they are still worth a look. Track a few more creators, or scan again in a week.",
      );
      out.push("");
    } else {
      out.push(`## The ${listed.length} standout${listed.length === 1 ? "" : "s"}`);
      out.push("");
    }
    listed.forEach((p, i) => {
      const stored = args.breakdowns.get(p.url);
      const unit = p.metric === "engagement" ? "engagement (likes plus comments)" : "views";
      out.push(`### ${i + 1}. ${stored?.breakdown.title ?? p.caption?.split("\n")[0]?.slice(0, 70) ?? "Untitled post"}`);
      out.push("");
      out.push(`**${p.creator}** on ${surface(p)}, posted ${ago(p.posted_at)}.`);
      out.push("");
      out.push(
        p.multiple != null
          ? `- ${n(p.score)} ${unit}, against their normal of ${n(p.baseline)}. That is **${p.multiple}x**.`
          : `- ${n(p.score)} ${unit}. This creator has no normal worked out yet, so there is no multiple.`,
      );
      if (p.views != null && p.metric !== "views") out.push(`- Views: ${n(p.views)}.`);
      if (p.likes != null || p.comments != null) out.push(`- ${n(p.likes)} likes, ${n(p.comments)} comments.`);
      out.push(`- ${p.url}`);
      out.push("");
      if (stored) {
        const b = stored.breakdown;
        if (b.hook.spoken) out.push(`**It opens with:** "${b.hook.spoken}"`);
        else if (b.hook.on_screen) out.push(`**On screen first:** "${b.hook.on_screen}"`);
        else if (b.hook.caption) out.push(`**The caption opens:** "${b.hook.caption}"`);
        if (b.hook.spoken || b.hook.on_screen || b.hook.caption) out.push("");
        if (b.hook_type) out.push(`**Hook type:** ${b.hook_type}${b.hook_template ? `. Reusable as: ${b.hook_template}` : ""}`);
        if (b.format) out.push(`**Format:** ${b.format}`);
        if (b.why_it_holds_attention) {
          out.push("");
          out.push(`**Why people stayed:** ${b.why_it_holds_attention}`);
        }
        if (b.pattern_you_can_use) {
          out.push("");
          out.push(`**What to copy:** ${b.pattern_you_can_use}`);
        }
        if (b.ask) out.push(`**Its ask:** "${b.ask}"`);
        out.push("");
        out.push(
          `_Worked out by ${stored.breakdown.source === "watched" ? "watching the video" : stored.breakdown.source === "transcript" ? "reading what is said (the video itself was not watched)" : "reading the caption and the numbers only"}._`,
        );
      } else {
        out.push(`_Not broken down yet. Run:_ \`npx tsx research.ts breakdown ${args.client.slug} ${i + 1}\``);
      }
      out.push("");
    });
  }

  const patterns = [...args.breakdowns.values()]
    .map((b) => b.breakdown.pattern_you_can_use)
    .filter((p): p is string => !!p);
  if (patterns.length > 1) {
    out.push("## The patterns worth stealing");
    out.push("");
    for (const p of [...new Set(patterns)]) out.push(`- ${p}`);
    out.push("");
  }

  out.push("## How each account was measured");
  out.push("");
  for (const g of args.groups) {
    const who = g.group === "short" ? "YouTube Shorts" : g.group === "video" ? "YouTube long videos" : g.group === "youtube" ? "YouTube" : "Instagram";
    if (g.skipped) {
      out.push(`- ${g.creator}, ${who}: no normal yet. ${g.skipped}.`);
    } else {
      out.push(`- ${g.creator}, ${who}: normal is ${n(g.baseline)} ${g.metric === "engagement" ? "engagement" : "views"}, from ${g.basis} posts out of ${g.posts} read.`);
    }
  }
  out.push("");
  out.push(
    `Where an account has fewer than ${BASELINE_MIN_POSTS} settled posts there is no honest normal to compare ` +
      "against, so nothing from it is called a standout. Scan again once they have posted more.",
  );
  out.push("");
  out.push("## What this cost");
  out.push("");
  out.push(
    args.apifyUsd > 0
      ? `${args.apifyUsd.toFixed(4)} US dollars of Apify credit, all of it reading Instagram. YouTube and every AI call in this report were free.`
      : "Nothing. YouTube and every AI call in this report are on free allowances.",
  );
  out.push("");
  out.push("---");
  out.push("");
  out.push(
    "Every number here came out of a live read of the public post. Nothing is estimated and nothing is " +
      "rounded up. Where a number was not available it says so.",
  );
  return `${out.join("\n")}\n`;
}
