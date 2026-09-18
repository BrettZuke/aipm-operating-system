// Where a client's work lives on disk. One folder per client, plain JSON and markdown, no database.
//
// clients/<slug>/
//   profile.md              who they help, what they sell, what they can show, how they talk, what to avoid
//   creators.json           the accounts you are watching for them
//   posts.json              every post read, with its numbers worked out
//   runs.json               what each command spent and which model answered
//   breakdowns/<id>.json    why one post worked
//   hooks/<id>.json         six hooks in the client's voice
//   scripts/<id>.md         the full script
//   reports/<date>.md       the report you send
//
// You can open any of it in a text editor. That is deliberate: nothing here is locked away in a
// format only this tool can read.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TOOL_DIR } from "./env";
import type { Adaptation, Breakdown, ClientProfile, Creator, RunRecord, ScoredPost } from "./types";

export const CLIENTS_DIR = path.join(TOOL_DIR, "clients");

/** A client name turned into a folder name: lowercase, letters, numbers and dashes. */
export function toSlug(name: string): string {
  const slug = (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "client";
}

export function clientDir(slug: string): string {
  return path.join(CLIENTS_DIR, toSlug(slug));
}

export function clientExists(slug: string): boolean {
  return existsSync(path.join(clientDir(slug), "profile.md"));
}

export function listClients(): string[] {
  if (!existsSync(CLIENTS_DIR)) return [];
  return readdirSync(CLIENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(CLIENTS_DIR, d.name, "profile.md")))
    .map((d) => d.name)
    .sort();
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (e) {
    throw new Error(`${file} is not readable as JSON any more (${e instanceof Error ? e.message : String(e)}). Open it in a text editor and fix it, or delete it and run the command again.`);
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// ------------------------------------------------------------------ the client profile

export const PROFILE_HEADINGS = [
  "Who they help",
  "What they sell",
  "What they can show on camera",
  "How they talk",
  "Phrases to avoid",
] as const;

/** The empty profile a new client starts with. The guidance sits in comments, so a section nobody
    has answered reads as empty rather than as the instructions being the client's own words. */
export function blankProfile(name: string): string {
  return `# ${name}

<!-- Fill this in with the client's OWN answers, under each heading, replacing nothing but the
comments. Everything the hooks and scripts say about this business comes from here and nowhere
else. A blank section is better than a guess: the tool writes [brackets] where a fact is missing,
and a guess becomes a lie with their name on it. -->

## Who they help
<!-- Who exactly is the customer. Not "coaches" but "one to one fitness coaches who already have six
clients and cannot take a seventh without dropping a session". -->

## What they sell
<!-- The actual thing, the price range if they are happy for it to be public, and what makes them
the obvious choice. -->

## What they can show on camera
<!-- The work itself, the screen, the whiteboard, a client message, a before and after, the moment it
clicks for someone, the thing that goes wrong. Anything a phone or a screen recorder can be pointed
at. This is where hooks come from, so the longer this list is the better every hook gets. -->

## How they talk
<!-- How the owner actually speaks. Paste two or three real sentences from a voice note, a review
reply, or a message they sent you. Words they use, words they never use. -->

## Phrases to avoid
<!-- One per line, starting with a dash. Anything they hate hearing about their own work, any
competitor name, any claim they cannot back up. -->
`;
}

/** Pull the sections out of a profile file. Headings that are missing come back empty. Done by
    walking the lines rather than with a clever pattern, so an odd character in a heading cannot
    break it. */
export function parseProfile(slug: string, markdown: string): ClientProfile {
  const sections = new Map<string, string[]>();
  let name = slug;
  let current: string | null = null;
  // Comments hold the guidance in a blank profile, so they are never read as the client's answers.
  const withoutComments = (markdown ?? "").replace(/<!--[\s\S]*?-->/g, "");
  for (const line of withoutComments.split(/\r?\n/)) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1) {
      name = h1[1].trim();
      current = null;
      continue;
    }
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      current = h2[1].trim().toLowerCase();
      sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
  }
  const section = (heading: string): string => (sections.get(heading.toLowerCase()) ?? []).join("\n").trim();
  const avoidText = section("Phrases to avoid");
  return {
    slug: toSlug(slug),
    name,
    who_they_help: section("Who they help"),
    what_they_sell: section("What they sell"),
    proof: section("What they can show on camera"),
    how_they_talk: section("How they talk"),
    avoid: avoidText
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((l) => l.length > 0 && l.length < 120),
    source: "local",
  };
}

export function readProfile(slug: string): ClientProfile {
  const file = path.join(clientDir(slug), "profile.md");
  if (!existsSync(file)) {
    throw new Error(`There is no client called "${slug}" yet. Make one with: npx tsx research.ts client add "Their Business Name"`);
  }
  return parseProfile(slug, readFileSync(file, "utf8"));
}

export function writeProfile(slug: string, markdown: string): string {
  const file = path.join(clientDir(slug), "profile.md");
  ensureDir(path.dirname(file));
  writeFileSync(file, markdown, "utf8");
  return file;
}

export function profilePath(slug: string): string {
  return path.join(clientDir(slug), "profile.md");
}

// ------------------------------------------------------------------ creators, posts, runs

export function readCreators(slug: string): Creator[] {
  return readJson<Creator[]>(path.join(clientDir(slug), "creators.json"), []);
}

export function writeCreators(slug: string, creators: Creator[]): void {
  writeJson(path.join(clientDir(slug), "creators.json"), creators);
}

export function readPosts(slug: string): ScoredPost[] {
  return readJson<ScoredPost[]>(path.join(clientDir(slug), "posts.json"), []);
}

export function writePosts(slug: string, posts: ScoredPost[]): void {
  writeJson(path.join(clientDir(slug), "posts.json"), posts);
}

/** Merge newly scraped posts into what is already stored, keeping one row per post and letting the
    newer numbers win. */
export function mergePosts(existing: ScoredPost[], incoming: ScoredPost[]): ScoredPost[] {
  const byKey = new Map(existing.map((p) => [`${p.platform}:${p.external_id}`, p]));
  for (const p of incoming) byKey.set(`${p.platform}:${p.external_id}`, p);
  return [...byKey.values()];
}

/** How each creator was measured in the last scan, kept so the report says the same thing the scan
    said rather than quietly recomputing it later. */
export function readGroups(slug: string): GroupRecord[] {
  return readJson<GroupRecord[]>(path.join(clientDir(slug), "baselines.json"), []);
}

export interface GroupRecord {
  creator: string;
  group: string;
  [key: string]: unknown;
}

/** Merge what this scan measured into what is already on record, one row per creator and group. A
    scan that only covered one creator must not wipe how the others were measured. */
export function mergeGroups(existing: GroupRecord[], incoming: GroupRecord[]): GroupRecord[] {
  const byKey = new Map(existing.map((g) => [`${g.creator}|${g.group}`, g]));
  // A creator whose groups changed shape (Shorts split out from long videos) would otherwise keep
  // the stale combined row alongside the new ones, so every row for a creator in this scan goes.
  for (const creator of new Set(incoming.map((g) => g.creator))) {
    for (const key of [...byKey.keys()]) if (key.startsWith(`${creator}|`)) byKey.delete(key);
  }
  for (const g of incoming) byKey.set(`${g.creator}|${g.group}`, g);
  return [...byKey.values()];
}

export function writeGroups(slug: string, groups: GroupRecord[]): void {
  writeJson(path.join(clientDir(slug), "baselines.json"), mergeGroups(readGroups(slug), groups));
}

export function readRuns(slug: string): RunRecord[] {
  return readJson<RunRecord[]>(path.join(clientDir(slug), "runs.json"), []);
}

export function appendRun(slug: string, record: RunRecord): void {
  const runs = readRuns(slug);
  runs.push(record);
  writeJson(path.join(clientDir(slug), "runs.json"), runs.slice(-200));
}

/** Everything spent with Apify on this client, ever. */
export function totalApifyUsd(slug: string): number {
  return Math.round(readRuns(slug).reduce((sum, r) => sum + (r.apify_usd || 0), 0) * 1e6) / 1e6;
}

// ------------------------------------------------------------------ breakdowns, hooks, scripts

export interface StoredBreakdown {
  post_url: string;
  creator: string;
  breakdown: Breakdown;
  model: string;
  at: string;
  transcript: string | null;
}

export function breakdownFile(slug: string, postId: string): string {
  return path.join(clientDir(slug), "breakdowns", `${postId}.json`);
}

export function readBreakdown(slug: string, postId: string): StoredBreakdown | null {
  return readJson<StoredBreakdown | null>(breakdownFile(slug, postId), null);
}

export function writeBreakdown(slug: string, postId: string, value: StoredBreakdown): string {
  const file = breakdownFile(slug, postId);
  writeJson(file, value);
  return file;
}

export function allBreakdowns(slug: string): StoredBreakdown[] {
  const dir = path.join(clientDir(slug), "breakdowns");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<StoredBreakdown | null>(path.join(dir, f), null))
    .filter((b): b is StoredBreakdown => b !== null);
}

export interface StoredHooks {
  post_url: string;
  creator: string;
  adaptation: Adaptation;
  dropped: { text: string; reasons: string[] }[];
  model: string;
  at: string;
}

export function hooksFile(slug: string, postId: string): string {
  return path.join(clientDir(slug), "hooks", `${postId}.json`);
}

export function readHooks(slug: string, postId: string): StoredHooks | null {
  return readJson<StoredHooks | null>(hooksFile(slug, postId), null);
}

export function writeHooks(slug: string, postId: string, value: StoredHooks): string {
  const file = hooksFile(slug, postId);
  writeJson(file, value);
  return file;
}

export function allHooks(slug: string): { postId: string; stored: StoredHooks }[] {
  const dir = path.join(clientDir(slug), "hooks");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ postId: f.replace(/\.json$/, ""), stored: readJson<StoredHooks | null>(path.join(dir, f), null) }))
    .filter((x): x is { postId: string; stored: StoredHooks } => x.stored !== null);
}

export function scriptFile(slug: string, postId: string): string {
  return path.join(clientDir(slug), "scripts", `${postId}.md`);
}

/** The script's parts as they were written, next to the markdown. The markdown is for a human to
    read; this is so anything else (the dashboard sync) never has to parse prose back apart. */
export interface StoredScript {
  post_url: string;
  creator: string;
  hook: string;
  on_screen: string | null;
  script: string;
  cta: string;
  caption: string | null;
  shot_list: string[];
  problems: string[];
  model: string;
  at: string;
}

export function writeScript(slug: string, postId: string, markdown: string, parts: StoredScript): string {
  const file = scriptFile(slug, postId);
  ensureDir(path.dirname(file));
  writeFileSync(file, markdown, "utf8");
  writeJson(path.join(clientDir(slug), "scripts", `${postId}.json`), parts);
  return file;
}

export function allScripts(slug: string): { postId: string; markdown: string; parts: StoredScript | null }[] {
  const dir = path.join(clientDir(slug), "scripts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const postId = f.replace(/\.md$/, "");
      return {
        postId,
        markdown: readFileSync(path.join(dir, f), "utf8"),
        parts: readJson<StoredScript | null>(path.join(dir, `${postId}.json`), null),
      };
    });
}

export function writeReport(slug: string, markdown: string, stamp = new Date()): string {
  const file = path.join(clientDir(slug), "reports", `${stamp.toISOString().slice(0, 10)}.md`);
  ensureDir(path.dirname(file));
  writeFileSync(file, markdown, "utf8");
  return file;
}

/** A post id that is safe as a filename and stable across runs. */
export function postId(post: { platform: string; external_id: string }): string {
  return `${post.platform === "youtube" ? "yt" : "ig"}-${post.external_id.replace(/[^A-Za-z0-9_-]/g, "")}`;
}
