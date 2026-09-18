// "Watch this one and tell me why it worked."

import { analyzePost, performanceFor } from "../lib/analyze";
import { heading, logRun, printCalls, resolvePost, say, type Args } from "../lib/cli";
import { postId, readBreakdown, readProfile, writeBreakdown } from "../lib/store";
import type { Breakdown } from "../lib/types";

export async function breakdownCommand(args: Args): Promise<void> {
  const [slug, which] = args.positional;
  if (!slug || !which) {
    say("Give a client and which standout, by number from the report or by link:");
    say("  npx tsx research.ts breakdown clearpath-coaching 1");
    return;
  }
  const client = readProfile(slug);
  const post = resolvePost(slug, which);
  const id = postId(post);

  const existing = readBreakdown(slug, id);
  if (existing && args.flags.again !== true) {
    say(`Already broken down on ${existing.at.slice(0, 10)}. Showing that. Add --again to do it afresh.`);
    printBreakdown(existing.breakdown, post.url, existing.breakdown.source);
    return;
  }

  heading(`${post.creator}: ${post.multiple ? `${post.multiple}x their normal` : "no multiple"}`);
  say(`  ${post.url}`);
  say("");
  const result = await analyzePost(post, (line) => say(line));
  say(`  route: ${result.route}`);

  writeBreakdown(slug, id, {
    post_url: post.url,
    creator: post.creator,
    breakdown: result.breakdown,
    model: result.model,
    at: new Date().toISOString(),
    transcript: result.transcript,
  });
  logRun(slug, `breakdown ${id}`, 0, result.calls, result.route);

  printBreakdown(result.breakdown, post.url, result.breakdown.source);
  printCalls(result.calls);
  say("");
  say(`Next: npx tsx research.ts hooks ${slug} ${which}`);
  say(`  (${client.name}'s own version of this, six ways in)`);
}

function printBreakdown(b: Breakdown, url: string, source: string): void {
  heading(b.title ?? "Breakdown");
  say(`  ${url}`);
  say(`  worked out by ${source === "watched" ? "watching it" : source === "transcript" ? "reading what is said (not watched)" : "reading the caption only"}`);
  say("");
  if (b.hook.spoken) say(`  Opens with: "${b.hook.spoken}"`);
  if (b.hook.on_screen) say(`  On screen:  "${b.hook.on_screen}"`);
  if (b.hook.caption) say(`  Caption:    "${b.hook.caption}"`);
  say("");
  if (b.hook_type) say(`  Hook type: ${b.hook_type}`);
  if (b.hook_template) say(`  Reusable as: ${b.hook_template}`);
  if (b.angle) say(`  Angle: ${b.angle}`);
  if (b.format) say(`  Format: ${b.format}`);
  if (b.beats.length) {
    say("");
    say("  How it goes:");
    for (const beat of b.beats) say(`    ${beat}`);
  }
  if (b.creative_choices.length) {
    say("");
    say("  Choices worth noticing:");
    for (const c of b.creative_choices) say(`    ${c}`);
  }
  if (b.why_it_holds_attention) {
    say("");
    say(`  Why people stayed: ${b.why_it_holds_attention}`);
  }
  if (b.pattern_you_can_use) {
    say("");
    say(`  What to copy: ${b.pattern_you_can_use}`);
  }
  if (b.ask) say(`  Its ask: "${b.ask}"`);
}
