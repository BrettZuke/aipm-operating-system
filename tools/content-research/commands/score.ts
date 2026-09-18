// Scoring a draft out of 100 before it goes out.
//
// The checks in code run first and they decide the total. A draft with no call to action, or one that
// claims a result nobody can check, is capped at 60 however good the rest of it is.

import { existsSync, readFileSync } from "node:fs";
import { heading, logRun, printCalls, say, type Args } from "../lib/cli";
import { coerceReport, draftChecks, draftPrompt, finalizeReport, reportProblems, type DraftFormat, type NichePattern } from "../lib/draft-rules";
import { askJson } from "../lib/llm";
import { allBreakdowns, readPosts, readProfile } from "../lib/store";
import { rankOutliers } from "../lib/report";

/** Pull the words a script actually says out of a saved script file, leaving the headings behind. */
export function spokenFromMarkdown(markdown: string): { hook: string | null; spoken: string; title: string | null } {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((l) => l.startsWith("# "))?.slice(2).trim() ?? null;
  const out: string[] = [];
  let inScript = false;
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      inScript = /^##\s+Script\b/i.test(line);
      continue;
    }
    if (inScript && line.trim()) out.push(line.trim());
  }
  // A plain draft with no "## Script" heading is treated as all script.
  const spoken = out.length ? out.join("\n") : lines.filter((l) => l.trim() && !l.startsWith("#")).join("\n");
  const hook = spoken.split("\n")[0] ?? null;
  return { hook, spoken, title };
}

/** The patterns this client's own standouts used, so "fit" is judged against their niche. */
export function nicheFrom(slug: string): NichePattern[] {
  const posts = new Map(readPosts(slug).map((p) => [p.url, p]));
  return allBreakdowns(slug)
    .map((b) => ({ b, post: posts.get(b.post_url) }))
    .filter((x) => x.post)
    .sort((a, b) => (b.post?.strength ?? 0) - (a.post?.strength ?? 0))
    .slice(0, 5)
    .map(({ b, post }) => ({
      creator: b.creator,
      multiple: post?.multiple ?? null,
      hookType: b.breakdown.hook_type,
      hookTemplate: b.breakdown.hook_template,
      pattern: b.breakdown.pattern_you_can_use,
    }));
}

export async function scoreCommand(args: Args): Promise<void> {
  const [slug, target] = args.positional;
  const inlineText = typeof args.flags.text === "string" ? args.flags.text : null;
  if (!slug || (!target && !inlineText)) {
    say("Give a client and a draft, either a file or some text:");
    say("  npx tsx research.ts score clearpath-coaching clients/clearpath-coaching/scripts/ig-ABC123.md");
    say('  npx tsx research.ts score clearpath-coaching --text "the whole script, in quotes"');
    return;
  }
  const client = readProfile(slug);

  let markdown: string;
  if (inlineText) {
    markdown = inlineText;
  } else if (existsSync(target)) {
    markdown = readFileSync(target, "utf8");
  } else {
    say(`There is no file at ${target}. Check the path, or use --text "..." instead.`);
    return;
  }

  const { hook, spoken, title } = spokenFromMarkdown(markdown);
  if (spoken.trim().length < 20) {
    say("That draft is too short to score. Paste the whole script.");
    return;
  }
  const format: DraftFormat = args.flags.format === "short" ? "short" : args.flags.format === "long" ? "long" : "reel";
  const checks = draftChecks({ spoken, hook, title, format });
  const niche = nicheFrom(slug);

  heading(`Scoring a draft for ${client.name}`);
  say(`  ${checks.spokenWords} spoken words, about ${Math.round((checks.spokenWords / 150) * 60)} seconds.`);
  say(`  Hook: ${checks.firstSentenceWords} words.`);
  say(`  Call to action: ${checks.cta ? `"${checks.cta.slice(0, 60)}"` : "none found"}`);
  for (const f of checks.hardFails) say(`  FAILS: ${f}`);
  if (niche.length === 0) {
    say(`  No standouts have been broken down for ${client.name} yet, so "fit" is judged on the basics.`);
  }
  say("");

  const calls: { label: string; provider: string; model: string; ms: number }[] = [];
  const passes: { report: ReturnType<typeof coerceReport>; problems: string[] }[] = [];
  let retry: string[] | null = null;

  for (let round = 1; round <= 2; round++) {
    const prompt = draftPrompt({ format, title, hook, words: spoken, checks, niche, mode: "script", retry });
    const answer = await askJson(prompt, { label: round === 1 ? "score" : "score, second pass", temperature: 0.3 });
    calls.push({ label: round === 1 ? "score" : "score, second pass", provider: answer.provider, model: answer.model, ms: answer.ms });
    const report = coerceReport(answer.json, spoken);
    if (!report) {
      retry = ["Your answer was not a JSON object with the keys asked for. Return exactly those keys."];
      continue;
    }
    const problems = reportProblems(report, "script", spoken);
    passes.push({ report, problems });
    if (problems.length === 0) break;
    if (round === 1) {
      say(`  ${problems.length} thing${problems.length === 1 ? "" : "s"} to tighten in the scoring itself, asking again`);
      retry = problems;
    }
  }

  const usable = passes.filter((p): p is { report: NonNullable<ReturnType<typeof coerceReport>>; problems: string[] } => p.report !== null);
  if (usable.length === 0) throw new Error("No usable score came back. Run the command again.");
  const final = finalizeReport(usable, checks, spoken);
  logRun(slug, "score", 0, calls, `scored ${final.score}`);

  heading(`${final.score} out of 100`);
  say(`  ${final.verdict}`);
  say("");
  for (const p of final.parts) {
    say(`  ${String(p.score).padStart(2)}/10  ${p.label}`);
    if (p.note) say(`         ${p.note}`);
    if (p.fix) say(`         Fix: ${p.fix}`);
  }
  if (checks.hardFails.length) {
    say("");
    say(`  Capped at 60 because: ${checks.hardFails.join(" ")}`);
  }
  if (final.line_fixes.length) {
    say("");
    say("  Line by line:");
    for (const f of final.line_fixes) {
      say(`    "${f.line}"`);
      say(`      ${f.problem}`);
      say(`      becomes: ${f.rewrite}`);
    }
  }
  if (final.hook_rewrites.length) {
    say("");
    say("  Other hooks it could open with:");
    for (const h of final.hook_rewrites) say(`    ${h}`);
  }
  printCalls(calls);
}
