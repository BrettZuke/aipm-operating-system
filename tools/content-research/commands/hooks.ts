// Six hooks for the client, built on the standout's mechanism and nothing else of theirs.
//
// Every hook is checked in code before you ever see it. A hook that is too long to say in three
// seconds, claims a result nobody can check, promises a personal reply, uses a phrase the client
// bans, or carries a number that is not in their profile, gets thrown away with the reason printed.
// Better five honest hooks than six with a lie in one of them.

import { adaptationProblems, adaptPrompt, coerceAdaptation, finalizeAdaptation, HOOKS_REQUESTED, MIN_HOOKS, profileIsThin, profileSources, screenHooks, type RawAdaptation, type SourceVideo } from "../lib/adaptation";
import { analyzePost, performanceFor } from "../lib/analyze";
import { heading, logRun, printCalls, resolvePost, say, type Args } from "../lib/cli";
import { askJson } from "../lib/llm";
import { postId, readBreakdown, readHooks, readProfile, writeBreakdown, writeHooks } from "../lib/store";
import type { Adaptation, Breakdown, ClientProfile, ScoredPost } from "../lib/types";

export function sourceVideoFor(post: ScoredPost): SourceVideo {
  return {
    creatorName: post.creator,
    platform: post.platform,
    kind: post.kind,
    url: post.url,
    metric: post.metric,
    multiple: post.multiple,
    performance: performanceFor(post),
  };
}

export async function hooksCommand(args: Args): Promise<void> {
  const [slug, which] = args.positional;
  if (!slug || !which) {
    say("Give a client and which standout, by number from the report or by link:");
    say("  npx tsx research.ts hooks clearpath-coaching 1");
    return;
  }
  const client = readProfile(slug);
  const post = resolvePost(slug, which);
  const id = postId(post);

  const existing = readHooks(slug, id);
  if (existing && args.flags.again !== true) {
    say(`Already written on ${existing.at.slice(0, 10)}. Showing those. Add --again to write new ones.`);
    printHooks(existing.adaptation, existing.dropped, client);
    return;
  }

  const calls: { label: string; provider: string; model: string; ms: number }[] = [];
  let stored = readBreakdown(slug, id);
  if (!stored) {
    say("This one has not been broken down yet, so that happens first.");
    const analysis = await analyzePost(post, (line) => say(line));
    calls.push(...analysis.calls);
    stored = { post_url: post.url, creator: post.creator, breakdown: analysis.breakdown, model: analysis.model, at: new Date().toISOString(), transcript: analysis.transcript };
    writeBreakdown(slug, id, stored);
    say(`  route: ${analysis.route}`);
    say("");
  }

  const result = await writeHooksFor(client, post, stored.breakdown, calls, (line) => say(line));
  writeHooks(slug, id, {
    post_url: post.url,
    creator: post.creator,
    adaptation: result.adaptation,
    dropped: result.dropped,
    model: result.model,
    at: new Date().toISOString(),
  });
  logRun(slug, `hooks ${id}`, 0, calls, null);

  printHooks(result.adaptation, result.dropped, client);
  printCalls(calls);
  say("");
  say(`Next: npx tsx research.ts script ${slug} ${which}`);
}

export interface HooksResult {
  adaptation: Adaptation;
  dropped: { text: string; reasons: string[] }[];
  model: string;
}

/** Ask for six hooks, check them, and ask once more when too few survive or they all open the same
    way. Shared with the script command, which needs hooks before it can write anything. */
export async function writeHooksFor(
  client: ClientProfile,
  post: ScoredPost,
  breakdown: Breakdown,
  calls: { label: string; provider: string; model: string; ms: number }[],
  onNote: (line: string) => void,
): Promise<HooksResult> {
  const video = sourceVideoFor(post);
  const thin = profileIsThin(client);
  const sources = profileSources(client);
  if (thin) onNote("  the client profile is thin, so the hooks will keep [brackets] where their real details go");

  const passes: { raw: RawAdaptation; kept: { text: string; why: string }[] }[] = [];
  let model = "unknown";
  let retry: string[] | null = null;

  for (let round = 1; round <= 2; round++) {
    const prompt = adaptPrompt({ breakdown, video, client, thin, retry });
    const answer = await askJson(prompt, { label: round === 1 ? "hooks" : "hooks, second pass", temperature: 0.8 });
    calls.push({ label: round === 1 ? "hooks" : "hooks, second pass", provider: answer.provider, model: answer.model, ms: answer.ms });
    model = `${answer.provider}:${answer.model}`;
    const raw = coerceAdaptation(answer.json);
    if (!raw) {
      onNote("  that answer was not usable, trying once more");
      retry = ["Your answer was not a JSON object with a \"hooks\" list in it. Return exactly the keys asked for."];
      continue;
    }
    const screened = screenHooks(raw.hooks, client.avoid, { needBrackets: thin, numberSources: sources });
    passes.push({ raw, kept: screened.kept });
    const problems = adaptationProblems(raw, screened);
    if (problems.length === 0 || round === 2) {
      if (problems.length && round === 2) onNote(`  the second pass still had ${problems.length} problem${problems.length === 1 ? "" : "s"}; keeping the hooks that passed`);
      break;
    }
    onNote(`  ${screened.kept.length} of ${raw.hooks.length} hooks passed the checks, asking again for the rest`);
    retry = problems;
  }

  if (passes.length === 0) throw new Error("No usable hooks came back at all. Run the command again.");
  const dropped: { text: string; reasons: string[] }[] = [];
  for (const pass of passes) {
    const screened = screenHooks(pass.raw.hooks, client.avoid, { needBrackets: thin, numberSources: sources });
    for (const d of screened.dropped) if (!dropped.some((x) => x.text === d.text)) dropped.push(d);
  }
  return { adaptation: finalizeAdaptation(passes, thin, sources), dropped, model };
}

function printHooks(a: Adaptation, dropped: { text: string; reasons: string[] }[], client: ClientProfile): void {
  heading(`${a.hooks.length} hook${a.hooks.length === 1 ? "" : "s"} for ${client.name}`);
  if (a.hooks.length < MIN_HOOKS) {
    say(`  Only ${a.hooks.length} of the ${HOOKS_REQUESTED} asked for survived the checks. What got dropped is below.`);
    say("");
  }
  a.hooks.forEach((h, i) => {
    say(`  ${i + 1}. ${h.text}${i === a.pick ? "   <- the pick" : ""}`);
    if (h.why) say(`     ${h.why}`);
  });
  if (a.pick_reason) {
    say("");
    say(`  Why that one: ${a.pick_reason}`);
  }
  if (a.on_screen_text) say(`  On screen, first 2 seconds: ${a.on_screen_text}`);
  if (a.how_to_shoot_it) {
    say("");
    say(`  How to shoot it: ${a.how_to_shoot_it}`);
  }
  if (a.shot_list.length) {
    say("");
    say("  Shots to get:");
    for (const s of a.shot_list) say(`    ${s}`);
  }
  if (a.caption_hook) say(`\n  Caption opens: ${a.caption_hook}`);
  if (a.make_it_sound_like_you) {
    say("");
    say(`  ${a.make_it_sound_like_you}`);
  }
  if (dropped.length) {
    say("");
    say("  Thrown away, and why:");
    for (const d of dropped) say(`    "${d.text}": ${d.reasons.join("; ")}`);
  }
}
