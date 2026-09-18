// Writing the markdown report of the standouts, ranked, with everything that has been broken down.

import { readFileSync } from "node:fs";
import { heading, say, type Args } from "../lib/cli";
import { buildReport, reportOrder, type CreatorGroup } from "../lib/report";
import { allBreakdowns, readGroups, readPosts, readProfile, totalApifyUsd, writeReport } from "../lib/store";

export async function reportCommand(args: Args): Promise<void> {
  const slug = args.positional[0];
  if (!slug) {
    say("Give a client: npx tsx research.ts report clearpath-coaching");
    return;
  }
  const client = readProfile(slug);
  const posts = readPosts(slug);
  if (posts.length === 0) {
    say(`No posts have been read for ${client.name} yet. Run: npx tsx research.ts scan ${slug}`);
    return;
  }
  const groups = readGroups(slug) as unknown as CreatorGroup[];
  const breakdowns = new Map(allBreakdowns(slug).map((b) => [b.post_url, b]));
  const markdown = buildReport({ client, posts, groups, breakdowns, scannedAt: new Date(), apifyUsd: totalApifyUsd(slug) });
  const file = writeReport(slug, markdown);

  if (args.flags.print === true) {
    say(readFileSync(file, "utf8"));
    return;
  }

  const { posts: listed, areStandouts } = reportOrder(posts);
  heading(areStandouts ? `${client.name}: ${listed.length} standout${listed.length === 1 ? "" : "s"}` : `${client.name}: no standouts, showing the best ${listed.length} of what was read`);
  listed.forEach((p, i) => {
    const b = breakdowns.get(p.url);
    say(
      `  ${String(i + 1).padStart(2)}. ${p.multiple != null ? `${p.multiple}x` : "no normal"}  ${p.creator}  ${(p.score ?? 0).toLocaleString("en-US")} ${p.metric === "engagement" ? "engagement" : "views"}${b ? "  (broken down)" : ""}`,
    );
    say(`      ${b?.breakdown.title ?? p.caption?.split("\n")[0]?.slice(0, 66) ?? "Untitled"}`);
  });
  say("");
  say(`Full report: ${file}`);
  say("Add --print to read it here.");
  if (listed.length > 0 && breakdowns.size < listed.length) {
    say("");
    say(`Next: npx tsx research.ts breakdown ${slug} 1`);
  }
}
