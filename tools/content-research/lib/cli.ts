// Small helpers every command shares: reading the flags, printing, asking a question, and turning
// "the third one in the report" into the actual post.

import { createInterface } from "node:readline/promises";
import { reportOrder } from "./report";
import { postId, readPosts } from "./store";
import type { RunRecord, ScoredPost } from "./types";
import { appendRun } from "./store";

export interface Args {
  positional: string[];
  flags: Record<string, string | true>;
}

/** Split the command line into plain words and --flags. A flag takes the next word as its value
    unless that word is another flag. */
export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [name, inline] = a.slice(2).split(/=(.*)/s);
      if (inline !== undefined) {
        flags[name] = inline;
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        flags[name] = argv[++i];
      } else {
        flags[name] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

export function say(line = ""): void {
  console.log(line);
}

export function heading(line: string): void {
  console.log(`\n${line}`);
  console.log("-".repeat(Math.min(line.length, 72)));
}

export function money(usd: number): string {
  return `${usd.toFixed(4)} US dollars`;
}

/** Ask the person a question. Returns the empty string when nobody is there to answer, so a command
    run by a script never hangs waiting. */
export async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function confirm(question: string): Promise<boolean> {
  const answer = (await ask(`${question} (y/n) `)).toLowerCase();
  return answer === "y" || answer === "yes";
}

/** Find the post the student meant: a number from the report, a full url, or a post id. */
export function resolvePost(slug: string, which: string): ScoredPost {
  const posts = readPosts(slug);
  if (posts.length === 0) {
    throw new Error(`No posts have been read for "${slug}" yet. Run: npx tsx research.ts scan ${slug}`);
  }
  const trimmed = (which ?? "").trim();
  if (/^\d+$/.test(trimmed)) {
    const { posts: ranked } = reportOrder(posts);
    const index = Number(trimmed) - 1;
    const found = ranked[index];
    if (!found) {
      throw new Error(`There is no post number ${trimmed} in the report. The last one listed ${ranked.length}. Run: npx tsx research.ts report ${slug}`);
    }
    return found;
  }
  const byUrl = posts.find((p) => p.url === trimmed || p.url === trimmed.replace(/\?.*$/, "").replace(/\/?$/, "/"));
  if (byUrl) return byUrl;
  const byId = posts.find((p) => postId(p) === trimmed || p.external_id === trimmed);
  if (byId) return byId;
  throw new Error(
    `"${which}" does not match any post that has been read for ${slug}. Use the number from the report (1, 2, 3), or the full link to the post.`,
  );
}

/** Write one line into the client's run log, so every spend and every model is on the record. */
export function logRun(slug: string, command: string, apifyUsd: number, calls: RunRecord["ai_calls"], note: string | null = null): void {
  appendRun(slug, { at: new Date().toISOString(), command, apify_usd: Math.round(apifyUsd * 1e6) / 1e6, ai_calls: calls, note });
}

/** Print who answered each AI call, so it is never a mystery which model wrote something. */
export function printCalls(calls: RunRecord["ai_calls"]): void {
  if (calls.length === 0) return;
  say("");
  say("Who answered:");
  for (const c of calls) say(`  ${c.label}: ${c.provider} (${c.model}) in ${(c.ms / 1000).toFixed(1)}s`);
}
