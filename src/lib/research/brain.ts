// What Research knows about the client: one document in their Brain, and nothing else.
//
// Everything a hook or a script says about the business comes from here. If the document is thin,
// the hooks come back with [brackets] where the client's own detail belongs and a note saying
// exactly what to ask them for, because a guessed detail about a real business is a lie published
// in their name.
//
// The document is an ordinary Brain document called "Client profile", so the student can read it,
// write it and correct it at /knowledge like anything else. The parsing is pure, so the shape of
// that document is pinned by tests rather than by hope.

import type { SupabaseClient } from "@supabase/supabase-js";
import { profileIsThin, profileSources } from "./adaptation";
import type { ClientProfile } from "./types";

// Re-exported so everything about the Client profile is reached through this one module, while the
// two rules themselves stay next to the prompt that depends on them.
export { profileIsThin, profileSources };

/** The title Research looks for. Anything starting with this counts, so "Client profile: Northgate
    Plumbing" and a plain "Client profile" both work. */
export const PROFILE_DOC_PREFIX = "Client profile";

export const PROFILE_HEADINGS = [
  "Who they help",
  "What they sell",
  "What they can show on camera",
  "How they talk",
  "Phrases to avoid",
] as const;

/** A prompt only gets this many characters of the profile, so the first free model (which allows
    8,000 tokens a minute) can always take it. */
export const PROFILE_BUDGET_CHARS = 6_000;

export function emptyProfile(name: string): ClientProfile {
  return { name, who_they_help: "", what_they_sell: "", proof: "", how_they_talk: "", avoid: [], source: "empty" };
}

/** Pull the sections out of a profile document. Missing headings come back empty. Done by walking
    the lines rather than with one clever pattern, so an odd character in a heading cannot break it. */
export function parseClientProfile(markdown: string, fallbackName: string): ClientProfile {
  const sections = new Map<string, string[]>();
  let name = fallbackName;
  let current: string | null = null;
  // Comments hold the guidance in a blank profile, so they are never read as the client's answers.
  const withoutComments = (markdown ?? "").replace(/<!--[\s\S]*?-->/g, "");
  for (const line of withoutComments.split(/\r?\n/)) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1) {
      name = h1[1].trim().replace(/^client profile\s*[:-]\s*/i, "").trim() || fallbackName;
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
  const profile: ClientProfile = {
    name,
    who_they_help: section("Who they help"),
    what_they_sell: section("What they sell"),
    proof: section("What they can show on camera"),
    how_they_talk: section("How they talk"),
    avoid: avoidText
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((l) => l.length > 0 && l.length < 120),
    source: "brain",
  };
  return hasAnything(profile) ? profile : { ...emptyProfile(name), name };
}

function hasAnything(p: ClientProfile): boolean {
  return [p.who_they_help, p.what_they_sell, p.proof, p.how_they_talk].some((s) => s.trim().length > 0) || p.avoid.length > 0;
}

/** Cut text to at most max characters at a line or word boundary, never mid-word. */
export function cutAt(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const line = slice.lastIndexOf("\n");
  if (line > max * 0.6) return slice.slice(0, line).trimEnd();
  const space = slice.lastIndexOf(" ");
  return (space > 0 ? slice.slice(0, space) : slice).trimEnd();
}

// What the client can show on camera matters most for a hook, then who they help, then what they
// sell, then how they talk. Whatever a short section leaves unused goes to the others in that order.
const SHARES: [keyof Pick<ClientProfile, "who_they_help" | "what_they_sell" | "proof" | "how_they_talk">, number][] = [
  ["proof", 2_200],
  ["who_they_help", 1_500],
  ["what_they_sell", 1_300],
  ["how_they_talk", 1_000],
];
const TOP_UP = SHARES.map(([key]) => key);

/** The profile trimmed to a budget, so a prompt is always a size the first free model can take.
    Pure and predictable, so the same profile always produces the same prompt. */
export function trimProfile(p: ClientProfile, budget = PROFILE_BUDGET_CHARS): ClientProfile {
  const scale = budget / SHARES.reduce((sum, [, share]) => sum + share, 0);
  const limit = new Map(SHARES.map(([key, share]) => [key, Math.min(p[key].length, Math.floor(share * scale))]));
  let spare = budget - [...limit.values()].reduce((sum, n) => sum + n, 0);
  for (const key of TOP_UP) {
    if (spare <= 0) break;
    const extra = Math.min(spare, p[key].length - limit.get(key)!);
    limit.set(key, limit.get(key)! + extra);
    spare -= extra;
  }
  return {
    ...p,
    who_they_help: cutAt(p.who_they_help, limit.get("who_they_help")!),
    what_they_sell: cutAt(p.what_they_sell, limit.get("what_they_sell")!),
    proof: cutAt(p.proof, limit.get("proof")!),
    how_they_talk: cutAt(p.how_they_talk, limit.get("how_they_talk")!),
  };
}

/** The workspace's Client profile document, or an empty profile named after the workspace when
    there is none. Nothing else in the Brain is read: a hook built on anything else is invented. */
export async function loadClientProfile(sb: SupabaseClient, agencyId: string): Promise<ClientProfile> {
  const [docs, workspace] = await Promise.all([
    sb
      .from("knowledge_docs")
      .select("title,content_text,updated_at")
      .eq("agency_id", agencyId)
      .ilike("title", `${PROFILE_DOC_PREFIX}%`)
      .order("updated_at", { ascending: false })
      .limit(1),
    sb.from("agencies").select("name").eq("id", agencyId).maybeSingle(),
  ]);
  if (docs.error) throw new Error(`Reading the Client profile failed: ${docs.error.message}`);
  if (workspace.error) throw new Error(`Reading the workspace failed: ${workspace.error.message}`);
  const name = ((workspace.data as { name?: string } | null)?.name ?? "").trim() || "this client";
  const text = ((docs.data ?? [])[0] as { content_text?: string | null } | undefined)?.content_text?.trim();
  if (!text) return emptyProfile(name);
  return trimProfile(parseClientProfile(text.startsWith("#") ? text : `# ${name}\n\n${text}`, name));
}

/** The document a student starts from. The guidance sits in comments, so a section nobody has
    answered reads as empty rather than as the instructions being the client's own words. Left
    unedited, this whole document says nothing about the client, which is the honest answer. */
export function blankProfileDoc(name: string): string {
  return `# Client profile: ${name}

<!-- Fill this in with the client's OWN answers, under each heading, replacing nothing but these
comments. Everything the hooks and scripts say about this business comes from here and nowhere
else. A blank section is better than a guess: Research writes [brackets] where a fact is missing,
and a guess becomes a claim with their name on it. -->

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
reply or a message they sent you. Words they use, words they never use. -->

## Phrases to avoid
<!-- One per line, starting with a dash. Anything they hate hearing about their own work, any
competitor name, any claim they cannot back up. -->
`;
}
