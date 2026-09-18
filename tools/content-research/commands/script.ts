// The full script, built on one chosen hook.

import { profileIsThin } from "../lib/adaptation";
import { analyzePost } from "../lib/analyze";
import { heading, logRun, printCalls, resolvePost, say, type Args } from "../lib/cli";
import { askJson } from "../lib/llm";
import { coerceScript, scriptMarkdown, scriptProblems, scriptPrompt, type ScriptDraft } from "../lib/scriptwriter";
import { postId, readBreakdown, readHooks, readProfile, writeBreakdown, writeHooks, writeScript } from "../lib/store";
import { sourceVideoFor, writeHooksFor } from "./hooks";

export async function scriptCommand(args: Args): Promise<void> {
  const [slug, which] = args.positional;
  if (!slug || !which) {
    say("Give a client and which standout:");
    say("  npx tsx research.ts script clearpath-coaching 1");
    say('  npx tsx research.ts script clearpath-coaching 1 --hook "the exact hook you want"');
    return;
  }
  const client = readProfile(slug);
  const post = resolvePost(slug, which);
  const id = postId(post);
  const calls: { label: string; provider: string; model: string; ms: number }[] = [];

  let stored = readBreakdown(slug, id);
  if (!stored) {
    say("This one has not been broken down yet, so that happens first.");
    const analysis = await analyzePost(post, (line) => say(line));
    calls.push(...analysis.calls);
    stored = { post_url: post.url, creator: post.creator, breakdown: analysis.breakdown, model: analysis.model, at: new Date().toISOString(), transcript: analysis.transcript };
    writeBreakdown(slug, id, stored);
    say("");
  }

  let hooks = readHooks(slug, id);
  if (!hooks) {
    say("No hooks written for this one yet, so that happens first.");
    const result = await writeHooksFor(client, post, stored.breakdown, calls, (line) => say(line));
    hooks = { post_url: post.url, creator: post.creator, adaptation: result.adaptation, dropped: result.dropped, model: result.model, at: new Date().toISOString() };
    writeHooks(slug, id, hooks);
    say("");
  }

  const chosen = typeof args.flags.hook === "string" ? args.flags.hook.trim() : hooks.adaptation.hooks[hooks.adaptation.pick]?.text;
  if (!chosen) {
    say("There is no hook to build on. Run the hooks command first:");
    say(`  npx tsx research.ts hooks ${slug} ${which}`);
    return;
  }

  const video = sourceVideoFor(post);
  const thin = profileIsThin(client);
  const longForm = post.platform === "youtube" && post.kind !== "short";

  heading(`Writing ${client.name}'s script`);
  say(`  Hook: ${chosen}`);
  if (thin) say("  The client profile is thin, so anything the tool cannot know stays in [brackets].");

  let draft: ScriptDraft | null = null;
  let problems: string[] = [];
  let model = "unknown";
  let retry: string[] | null = null;

  for (let round = 1; round <= 2; round++) {
    const prompt = scriptPrompt({
      hook: chosen,
      breakdown: stored.breakdown,
      video,
      client,
      thin,
      onScreen: hooks.adaptation.on_screen_text,
      shotList: hooks.adaptation.shot_list,
      retry,
    });
    const answer = await askJson(prompt, { label: round === 1 ? "script" : "script, second pass", temperature: 0.7 });
    calls.push({ label: round === 1 ? "script" : "script, second pass", provider: answer.provider, model: answer.model, ms: answer.ms });
    model = `${answer.provider}:${answer.model}`;
    const candidate = coerceScript(answer.json, chosen);
    if (!candidate) {
      retry = ['Your answer had no "script" in it. Return the keys asked for, as one JSON object.'];
      continue;
    }
    const found = scriptProblems(candidate, client, longForm);
    if (found.length === 0) {
      draft = candidate;
      problems = [];
      break;
    }
    // Keep the better of the two attempts rather than throwing the second one away.
    if (!draft || found.length < problems.length) {
      draft = candidate;
      problems = found;
    }
    if (round === 1) {
      say(`  ${found.length} check${found.length === 1 ? "" : "s"} failed, asking for a fix`);
      retry = found;
    }
  }

  if (!draft) throw new Error("No usable script came back. Run the command again.");

  const at = new Date();
  const markdown = scriptMarkdown({ draft, client, video, breakdown: stored.breakdown, problems, model, at });
  const file = writeScript(slug, id, markdown, {
    post_url: post.url,
    creator: post.creator,
    hook: draft.hook,
    on_screen: draft.on_screen,
    script: draft.script,
    cta: draft.cta,
    caption: draft.caption,
    shot_list: draft.shot_list,
    problems,
    model,
    at: at.toISOString(),
  });
  logRun(slug, `script ${id}`, 0, calls, problems.length ? `${problems.length} checks still failing` : null);

  say("");
  say(markdown);
  say(`Saved to ${file}`);
  if (problems.length) {
    say("");
    say(`${problems.length} check${problems.length === 1 ? " is" : "s are"} still failing, listed in the file. Fix those before it is filmed.`);
  }
  printCalls(calls);
  say("");
  say(`Next: npx tsx research.ts score ${slug} ${file}`);
}
