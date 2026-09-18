// "Make it yours": turning a standout video's mechanism into hooks your client could actually say.
//
// Everything that matters is checked in code, because a prompt does not hold. A hook is said in under
// three seconds (15 words or fewer). It never claims a result nobody can check. It never promises a
// personal reply. It never uses a phrase the client's profile bans. And the facts come only from the
// client profile: if the profile is thin, the hooks come back with [BRACKETS] where the client's own
// details go, and a note saying exactly what to ask them for.
//
// That last rule is the whole point. A made-up "we have served 400 families since 2009" on a real
// business's Instagram is a lie with their name on it, published by them, because of you.

import { fillerHits, fillerProblem, stripFiller } from "./filler";
import { bannedPhrasesUsed, hookWords, HOOK_MAX_WORDS, overpromises, sanitize, unsupportedNumbers, unverifiableClaims } from "./guards";
import { BANNED_LINE, REGISTER } from "./breakdown";
import type { Adaptation, Breakdown, ClientProfile, Metric, Platform, PostKind } from "./types";

export { HOOK_MAX_WORDS };
export const HOOKS_REQUESTED = 6;
export const MIN_HOOKS = 3;
/** Models latch onto the source video's opening and hand back six hooks all starting the same way.
    More than this many sharing their first three words sends the answer back. */
export const MAX_SHARED_OPENING = 2;
const SHOTS_MAX = 7;

export const THIN_PROFILE_NOTE =
  "This client profile is too thin to write real hooks from, so these keep the video's pattern with [brackets] where their own details go. " +
  "Ask the client three things and put the answers in their profile: who exactly they help, what they actually sell, and what they can show on camera " +
  "(the work itself, the screen, the before and after, the moment it clicks for someone). Then run hooks again and the brackets become their real story.";

export interface SourceVideo {
  creatorName: string;
  platform: Platform;
  kind: PostKind;
  url: string;
  metric: Metric | null;
  multiple: number | null;
  /** The performance sentence the breakdown used, word for word. */
  performance: string;
}

function surface(v: Pick<SourceVideo, "platform" | "kind">): string {
  if (v.platform === "youtube") return v.kind === "short" ? "YouTube Short" : "YouTube video";
  return v.kind === "carousel" ? "Instagram carousel" : "Instagram reel";
}

function videoSection(b: Breakdown, v: SourceVideo): string {
  const lines = [
    `Creator: ${v.creatorName} (${surface(v)}). ${v.performance}`,
    b.title ? `What it is: ${b.title}` : null,
    b.hook.spoken ? `Its hook, said: "${b.hook.spoken}"` : null,
    b.hook.on_screen ? `Its hook, on screen: "${b.hook.on_screen}"` : null,
    b.hook.caption ? `Its caption opens: "${b.hook.caption}"` : null,
    b.hook_type || b.hook_template ? `Hook type: ${b.hook_type ?? "Other"}. Template: ${b.hook_template ?? "none"}` : null,
    b.angle ? `Angle: ${b.angle}` : null,
    b.format ? `Format: ${b.format}` : null,
    b.beats.length ? `Beats:\n${b.beats.map((x) => `  ${x}`).join("\n")}` : null,
    b.why_it_holds_attention ? `Why it holds attention: ${b.why_it_holds_attention}` : null,
    b.pattern_you_can_use ? `The pattern: ${b.pattern_you_can_use}` : null,
    b.ask ? `Its ask: "${b.ask}"` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

/** True when the profile has too little in it to write an honest hook from. */
export function profileIsThin(p: ClientProfile): boolean {
  const filled = [p.who_they_help, p.what_they_sell, p.proof].filter((f) => (f ?? "").trim().length >= 15);
  return filled.length < 2;
}

/** Everything the model is allowed to treat as a fact about the client. Used both in the prompt and
    as the list a number in a hook has to appear in. */
export function profileSources(p: ClientProfile): string[] {
  return [p.who_they_help, p.what_they_sell, p.proof, p.how_they_talk].filter((s) => (s ?? "").trim().length > 0);
}

function clientSection(p: ClientProfile, thin: boolean): string {
  if (thin) {
    return `THE CLIENT
Their profile is nearly empty, so you know almost nothing about them: not what they do, what they sell,
who they serve or what results they have. Keep the video's mechanism and bracket every specific: the work,
the offer, the customer, the result. For example "The first [thing] I bought with money from [the business]
was not for me." A good hook here reads like the video's template with its subject taken out. Every hook
keeps at least one [BRACKET]. Never fill a bracket in yourself, not even with an example or a number: a
filled-in guess is a claim about a real business that you cannot back up.`;
  }
  const parts = [
    p.who_they_help && `WHO THEY HELP\n${p.who_they_help}`,
    p.what_they_sell && `WHAT THEY SELL\n${p.what_they_sell}`,
    p.proof && `WHAT THEY CAN SHOW ON CAMERA\n${p.proof}`,
    p.how_they_talk && `HOW THEY TALK (match this rhythm and these words)\n${p.how_they_talk}`,
    p.avoid.length ? `PHRASES THEY NEVER USE (do not write any of these)\n${p.avoid.map((a) => `- ${a}`).join("\n")}` : null,
  ].filter(Boolean);
  return `THE CLIENT, FROM THEIR OWN PROFILE
This profile is the ONLY set of facts you have about them. Anything not written here is unknown.

${parts.join("\n\n")}`;
}

export function adaptPrompt(args: { breakdown: Breakdown; video: SourceVideo; client: ClientProfile; thin: boolean; retry: string[] | null }): string {
  const { breakdown: b, thin } = args;
  const mechanism = [b.hook_type, b.pattern_you_can_use].filter(Boolean).join(": ") || "the video's hook and structure";
  const material = thin
    ? "while keeping [BRACKETS] where their real detail goes"
    : "on something specific from THE CLIENT section: the job they do, the thing that goes wrong, the tool, the customer. Name the real thing, never the category";
  const retry = args.retry?.length
    ? `\nYOUR LAST ANSWER FAILED THESE CHECKS. Fix every one.\n${args.retry.map((p) => `- ${p}`).join("\n")}\n`
    : "";
  return `You are a short-form content strategist writing for ONE business. Their agency found a video that
beat its creator's normal numbers, and they want their own version: the same mechanism, run on their own
real material. Your answer is the starting point they film from.

THE VIDEO THEY FOUND (borrow its mechanism, never its content or its claims)
${videoSection(b, args.video)}

${clientSection(args.client, thin)}

WRITE
1. "hooks": exactly ${HOOKS_REQUESTED}. A hook is only the opening line they SAY in the first 3 seconds, never the ask.
   Count the words: aim for 12 or fewer, and ${HOOK_MAX_WORDS} is the hard limit (a longer hook is thrown away).
   Each runs the video's mechanism (${mechanism}) ${material}.
2. The ${HOOKS_REQUESTED} hooks are genuinely different: different material, or a different way in. Never one line reworded.
   At most ${MAX_SHARED_OPENING} hooks may start with the same first three words, so vary the way in: the payoff first, a
   specific scene or object, a mistake they made, a claim that cuts against the usual advice, a question with stakes,
   a callout of exactly who it is for.
3. Each hook has "why": one short sentence saying what it borrows from the video and which real detail carries
   it${thin ? " (or which bracket the client fills in)" : ", quoting their profile"}.
4. Never invent a number, a result, a customer, a name or a claim. Never put I, we, my or our next to a number,
   even a real one from their profile: "my client got 11 calls in a week" reads as a claim nobody can check.
   Name the real thing and let the screen show the number. Never promise a personal reply.
5. "pick": the index (0 to ${HOOKS_REQUESTED - 1}) of the hook most likely to stop THEIR customers scrolling. "pick_reason": one
   sentence pointing at the words in that hook that do it.
6. "on_screen_text": the words on screen in the first 2 seconds, 8 words or fewer, not a copy of the hook.
7. "how_to_shoot_it": two or three short sentences in the order they are filmed${thin ? "" : ", naming their real setting, van, workshop or tools from the profile"}. Like:
   "Open on the finished job. Cut back to what it looked like at 7am. End on the customer's face."
8. "shot_list": 3 to ${SHOTS_MAX} shots, each one thing they can actually point a phone at.
9. "make_it_sound_like_you": ${thin ? "null." : "which real thing from their profile to use and where it goes in the video, quoting the profile. Never invented."}
10. "caption_hook": the first line of the caption, 12 words or fewer.

HOW IT SOUNDS
${REGISTER}
Contractions. Words their customers already use. ${BANNED_LINE}
No emoji, no dashes of any kind, no hashtags.
${retry}
Return STRICT JSON, ONE object with these keys: "hooks" (a list of ${HOOKS_REQUESTED} objects, each with "text" and "why"),
"pick", "pick_reason", "on_screen_text", "how_to_shoot_it", "shot_list", "make_it_sound_like_you", "caption_hook".
Output JSON only. No prose, no code fences.`;
}

// ------------------------------------------------------------------ making the answer safe

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = sanitize(v).replace(/\s*\n\s*/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

export interface RawAdaptation {
  hooks: { text: string; why: string }[];
  pick: number;
  pick_reason: string | null;
  on_screen_text: string | null;
  how_to_shoot_it: string | null;
  shot_list: string[];
  make_it_sound_like_you: string | null;
  caption_hook: string | null;
}

/** A model answer turned into hooks and a plan. Hooks may arrive as strings or as objects. Null when
    the answer is not an object. Hooks are cleaned here but not judged; screenHooks does that. */
export function coerceAdaptation(raw: unknown): RawAdaptation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const hooks = (Array.isArray(r.hooks) ? r.hooks : [])
    .map((h) => (typeof h === "string" ? { text: h, why: "" } : h && typeof h === "object" ? (h as { text?: unknown; why?: unknown }) : null))
    .filter((h): h is { text?: unknown; why?: unknown } => h !== null)
    .map((h) => ({ text: cleanText(h.text, 200) ?? "", why: cleanText(h.why, 300) ?? "" }))
    .slice(0, 10);
  const pick = Number(r.pick);
  return {
    hooks,
    pick: Number.isInteger(pick) && pick >= 0 ? pick : 0,
    pick_reason: cleanText(r.pick_reason, 300),
    on_screen_text: cleanText(r.on_screen_text, 80),
    how_to_shoot_it: cleanText(r.how_to_shoot_it, 600),
    shot_list: (Array.isArray(r.shot_list) ? r.shot_list : []).map((s) => cleanText(s, 160)).filter((s): s is string => s !== null).slice(0, SHOTS_MAX),
    make_it_sound_like_you: cleanText(r.make_it_sound_like_you, 700),
    caption_hook: cleanText(r.caption_hook, 160),
  };
}

export interface DroppedHook {
  text: string;
  reasons: string[];
}

const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9[\] ]/g, "").replace(/\s+/g, " ").trim();

/** Keep the hooks that pass every rule, and say exactly why each other one was thrown away. With a
    thin profile every hook must keep a [BRACKET]: a hook with the blank already filled in made that
    detail up about a real business. */
export function screenHooks(
  hooks: { text: string; why: string }[],
  banned: string[] | null = null,
  opts: { needBrackets?: boolean; numberSources?: string[] } = {},
): { kept: { text: string; why: string }[]; dropped: DroppedHook[] } {
  const kept: { text: string; why: string }[] = [];
  const dropped: DroppedHook[] = [];
  for (const h of hooks) {
    const reasons: string[] = [];
    const words = hookWords(h.text);
    if (!h.text) reasons.push("it is empty");
    if (h.text && opts.needBrackets && !/\[[^\]]+\]/.test(h.text)) reasons.push("it fills in a detail you cannot know; keep a [BRACKET] where the client's own detail goes");
    const invented = unsupportedNumbers(h.text, opts.numberSources ?? []);
    if (invented.length) reasons.push(`it uses ${invented.map((n) => `"${n}"`).join(", ")}, which is not in the client profile`);
    if (words > HOOK_MAX_WORDS) reasons.push(`it is ${words} words, and a hook is said in under 3 seconds (${HOOK_MAX_WORDS} words or fewer)`);
    if (unverifiableClaims(h.text).length) reasons.push("it claims a result nobody can check, and you do not know their results");
    const promises = overpromises(h.text);
    if (promises.length) reasons.push(`it promises a personal reply (${promises.join(", ")})`);
    const banHits = bannedPhrasesUsed(h.text, banned);
    if (banHits.length) reasons.push(`it uses a phrase this client never says (${banHits.map((b) => `"${b}"`).join(", ")})`);
    const filler = fillerHits(h.text);
    if (filler.length) reasons.push(`it uses filler (${filler.map((f) => `"${f.phrase}"`).join(", ")})`);
    if (!reasons.length && kept.some((k) => bare(k.text) === bare(h.text))) reasons.push("it repeats another hook");
    if (reasons.length) dropped.push({ text: h.text, reasons });
    else kept.push(h);
  }
  return { kept, dropped };
}

/** The openings (first three words) used by more than MAX_SHARED_OPENING hooks, with their counts. */
export function repeatedOpenings(hooks: { text: string }[]): { opening: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const h of hooks) {
    const opening = bare(h.text).split(" ").slice(0, 3).join(" ");
    if (opening) counts.set(opening, (counts.get(opening) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n > MAX_SHARED_OPENING).map(([opening, count]) => ({ opening, count }));
}

/** What a second pass has to fix: too few hooks survived, they all open the same way, or the plan is
    written in filler. */
export function adaptationProblems(a: RawAdaptation, screened: { kept: { text: string; why: string }[]; dropped: DroppedHook[] }): string[] {
  const problems: string[] = [];
  for (const r of repeatedOpenings(screened.kept)) {
    problems.push(`${r.count} hooks start with "${r.opening}". At most ${MAX_SHARED_OPENING} may share an opening; rewrite the others with a different way in.`);
  }
  if (screened.kept.length < MIN_HOOKS && screened.dropped.length === 0) {
    problems.push(`Your answer had no usable hooks. Return "hooks" as a list of ${HOOKS_REQUESTED} objects, each with "text" and "why".`);
  } else if (screened.kept.length < MIN_HOOKS) {
    problems.push(
      `Only ${screened.kept.length} of your hooks passed. These were dropped:\n` +
        screened.dropped.map((d) => `  "${d.text}": ${d.reasons.join("; ")}`).join("\n"),
    );
  }
  const filler = fillerProblem([
    ...fillerHits(a.pick_reason),
    ...fillerHits(a.how_to_shoot_it),
    ...fillerHits(a.make_it_sound_like_you),
    ...a.shot_list.flatMap((s) => fillerHits(s)),
    ...screened.kept.flatMap((h) => fillerHits(h.why)),
  ]);
  if (filler) problems.push(filler);
  return problems;
}

/** The set of hooks to save, from one or two passes: the pass with more survivors leads (the second
    on a tie, because it was told what failed), topped up from the other pass to six, then every
    leftover filler sentence removed. */
export function finalizeAdaptation(
  passes: { raw: RawAdaptation; kept: { text: string; why: string }[] }[],
  thin: boolean,
  numberSources: string[] = [],
): Adaptation {
  const ordered = [...passes].sort((a, b) => b.kept.length - a.kept.length || passes.indexOf(b) - passes.indexOf(a));
  const lead = ordered[0];
  const hooks: { text: string; why: string }[] = [];
  for (const pass of ordered) {
    for (const h of pass.kept) {
      if (hooks.length < HOOKS_REQUESTED && !hooks.some((x) => bare(x.text) === bare(h.text))) hooks.push(h);
    }
  }
  const pickedText = lead.raw.hooks[lead.raw.pick]?.text ?? null;
  const pickIndex = pickedText ? hooks.findIndex((h) => bare(h.text) === bare(pickedText)) : -1;
  const other = ordered[1]?.raw;
  const field = <K extends "on_screen_text" | "how_to_shoot_it" | "make_it_sound_like_you" | "caption_hook">(k: K) => lead.raw[k] ?? other?.[k] ?? null;
  const strip = (v: string | null) => (v ? stripFiller(v) || null : null);
  // On-screen text and the caption line are short enough that an invented figure is the whole line.
  const sourced = (v: string | null) => (v && unsupportedNumbers(v, numberSources).length === 0 ? v : null);
  return {
    hooks: hooks.map((h) => ({ text: h.text, why: stripFiller(h.why) })),
    pick: pickIndex >= 0 ? pickIndex : 0,
    pick_reason: pickIndex >= 0 ? strip(lead.raw.pick_reason) : null,
    on_screen_text: sourced(strip(field("on_screen_text"))),
    how_to_shoot_it: strip(field("how_to_shoot_it")),
    shot_list: (lead.raw.shot_list.length ? lead.raw.shot_list : other?.shot_list ?? []).filter((s) => fillerHits(s).length === 0),
    make_it_sound_like_you: thin ? THIN_PROFILE_NOTE : strip(field("make_it_sound_like_you")),
    caption_hook: sourced(strip(field("caption_hook"))),
  };
}

export function cardFormat(v: Pick<SourceVideo, "platform" | "kind">): "reel" | "short" | "long_form" {
  if (v.platform === "youtube") return v.kind === "short" ? "short" : "long_form";
  return "reel";
}
