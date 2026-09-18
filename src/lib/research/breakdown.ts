// Why a standout post worked: the questions the model is asked, and the checking that happens to its
// answer before anything is saved.
//
// These prompts exist to stop the failure every AI breakdown falls into: sentences that sound like
// analysis and point at nothing. "A relatable hook with high energy" is worth nothing to a client.
// Every statement has to name something you could go and check in that exact video, and when it does
// not, the answer gets sent back with the offending sentence quoted.
//
// Nothing here talks to the internet, so every rule is unit tested.

import { BANNED_FILLER, fillerHits, fillerProblem, stripFiller } from "./filler";
import { sanitize } from "./guards";
import type { Breakdown, BreakdownSource, Metric, Platform, PostKind } from "./types";

/** How much of a long YouTube video is attached. Enough to judge the opening and the setup. */
export const YOUTUBE_CLIP_S = 120;

export const HOOK_TYPES = [
  "Contrarian",
  "Story",
  "Listicle",
  "Tutorial",
  "Proof or result",
  "Transformation",
  "Comparison",
  "Warning",
  "Question",
  "Viewer callout",
  "Tool reveal",
  "Behind the scenes",
  "News",
  "POV or meme",
  "Other",
] as const;

export interface BreakdownContext {
  creatorName: string;
  platform: Platform;
  kind: PostKind;
  caption: string | null;
  description: string | null;
  durationS: number | null;
  views: number | null;
  metric: Metric | null;
  score: number | null;
  baseline: number | null;
  multiple: number | null;
  postedAt: string | null;
}

export type BreakdownInput =
  | { kind: "video"; clipped: boolean }
  | { kind: "slides"; count: number }
  | { kind: "transcript"; transcript: string }
  | { kind: "caption" };

export const SOURCE_OF: Record<BreakdownInput["kind"], BreakdownSource> = {
  video: "watched",
  slides: "watched",
  transcript: "transcript",
  caption: "caption",
};

export const REGISTER = `Plain English. Short sentences. Write the way a sharp editor talks to a creator, like these two:
  "The first frame gives you the outcome. The personal stakes make you stay for the reaction."
  "Lead with the payoff. Then tell the story that made it possible."`;

export const BANNED_LINE = `Never use these words or phrases: ${BANNED_FILLER.join(", ")}. They point at nothing. Say the concrete thing instead.`;

const number = (n: number) => Math.round(n).toLocaleString("en-US");

export function performanceLine(ctx: Pick<BreakdownContext, "metric" | "score" | "baseline" | "multiple" | "views">): string {
  if (ctx.multiple != null && ctx.baseline != null && ctx.score != null) {
    const what = ctx.metric === "engagement" ? "Engagement (likes plus comments)" : "Views";
    return `${what}: ${number(ctx.score)}, which is ${ctx.multiple}x this creator's normal of ${number(ctx.baseline)}.`;
  }
  if (ctx.views != null) return `Views: ${number(ctx.views)}. This creator has no normal worked out yet, so there is no multiple.`;
  return "No view count is available.";
}

function surface(ctx: Pick<BreakdownContext, "platform" | "kind">): string {
  if (ctx.platform === "youtube") return ctx.kind === "short" ? "YouTube Short" : "YouTube video";
  return ctx.kind === "carousel" ? "Instagram carousel" : ctx.kind === "image" ? "Instagram image post" : "Instagram reel";
}

function videoFacts(ctx: BreakdownContext, input: BreakdownInput): string {
  const lines = [`Creator: ${ctx.creatorName}`, `Platform: ${surface(ctx)}`, performanceLine(ctx)];
  if (ctx.durationS) lines.push(`Length: ${Math.round(ctx.durationS)} seconds`);
  if (input.kind === "video" && input.clipped) lines.push(`Only the first ${YOUTUBE_CLIP_S / 60} minutes are attached, so describe how it opens and what it sets up.`);
  if (ctx.postedAt) lines.push(`Posted: ${ctx.postedAt.slice(0, 10)}`);
  if (ctx.platform === "youtube") {
    lines.push(`Title: ${ctx.caption ?? "(none)"}`);
    if (ctx.description) lines.push(`Description (first part):\n${ctx.description.slice(0, 1_500)}`);
  } else {
    lines.push(`Caption:\n${(ctx.caption ?? "(no caption)").slice(0, 1_500)}`);
  }
  return lines.join("\n");
}

const WATCH = `HOW YOU WATCH IT
Watch the whole attached video before you write anything. Listen to every word, read every piece of
text on screen, and notice every cut, zoom, prop, location and sound.`;

const TRANSCRIPT_RULES = `HOW YOU READ IT
You cannot see this video. You have a transcript of what is said, with the second each line starts.
  - "hook.on_screen" is null. Never describe a visual, a demo, an edit, text on screen or the setting,
    not even as a guess: "shows the tool working" is something you cannot know.
  - "beats" group the lines into 4 to 8 beats in your own words, each starting with the second it
    starts. Never copy transcript lines as beats.
  - "format" is what the words alone tell you, such as 'Spoken tool announcement', never a visual format.
  - "creative_choices" are about the words only (sentence length, how fast the points come, where the
    turn happens, where the ask sits), and each one quotes the words it is about.`;

const CAPTION_RULES = `HOW YOU READ IT
You cannot see or hear this video. You only have the words above and the numbers.
  - "hook.spoken" and "hook.on_screen" are null.
  - "beats" is an empty list.
  - "creative_choices" are about the caption only (its first line, its length, its ask), or an empty list.
  - "why_it_holds_attention" quotes the caption and says what the numbers show. Never pretend to know
    what happens in the video.`;

const SLIDE_RULES = (count: number) => `HOW YOU LOOK AT IT
The ${count} attached images are the post's slides in order. The first one is the cover.
  - "hook.spoken" is null. "hook.on_screen" is the text on the cover, word for word.
  - "beats" are one line per slide, each starting "Slide 1:", "Slide 2:" and so on.
  - Point at slides by number ("slide 3") where a video would use seconds.`;

function evidenceRule(input: BreakdownInput): string {
  if (input.kind === "slides") return `Quote the exact words in double quotes, name the exact thing in the image ("a screenshot of a booking calendar with three columns", not "visuals"), and say which slide it is on.`;
  if (input.kind === "caption") return "Quote the exact words of the caption in double quotes. Say what the numbers show. Never describe the video itself.";
  if (input.kind === "transcript") return "Quote the exact words in double quotes and give the second they are said (0:04).";
  return `Quote the exact words in double quotes, name the exact thing on screen ("a laptop showing a booking calendar", not "visuals"), and give the second it happens (0:04).`;
}

const KEYS = (input: BreakdownInput) => `Return STRICT JSON, ONE object with these keys:
  "title": what this video is, at most 8 words, the way a friend would describe it ('One video, half the calls'),
      never a category or a hook type
  "hook": an object with three keys
      "spoken": the first sentence said out loud, word for word, or null when nothing is said in the first 3 seconds
      "on_screen": the text hook on screen in the first 2 seconds, word for word, or null when there is none.
          Captions that only repeat the words being said are not a text hook: use null for those
      "caption": the first line of the caption (the title on YouTube), word for word, or null
  "hook_type": exactly one of ${HOOK_TYPES.join(", ")}
  "hook_template": the hook with its specifics swapped for [BRACKETS] so anyone can reuse it. For example
      'Bought my dad a car at 24' becomes 'Bought my [person] a [big purchase] at [age]'
  "angle": one sentence, the specific claim or story the whole piece is built on
  "format": what the viewer sees, in a few words, such as 'Talking head with screen recording'
  "beats": ${input.kind === "caption" ? "an empty list" : input.kind === "slides" ? "one line per slide, 'Slide 1: ...'" : "4 to 8 lines, one per beat, each starting with its timestamp: '0:00 he holds up the invoice and says ...'"}
  "creative_choices": 3 to 6 short lines, each naming one choice and where it happens, such as 'Hard cut to
      a close-up of the invoice at 0:05' or 'Captions in yellow, two words at a time'
  "why_it_holds_attention": two or three short sentences. First what the opening gives the viewer (a payoff, a
      question, a picture), then the exact moment that keeps them, with the words quoted and the second it happens
  "pattern_you_can_use": one or two short sentences written as an instruction another creator can follow in a
      different trade, the structure and not this video's topic, like 'Lead with the payoff. Then tell the story that made it possible.'
  "ask": the call to action word for word (said, on screen, or in the caption), or null when there is none
Output the JSON only. No prose, no code fences.`;

/** The whole set of instructions for one route. The video or the pictures go before it. */
export function breakdownPrompt(ctx: BreakdownContext, input: BreakdownInput): string {
  const how =
    input.kind === "video" ? WATCH : input.kind === "slides" ? SLIDE_RULES(input.count) : input.kind === "transcript" ? TRANSCRIPT_RULES : CAPTION_RULES;
  const transcript = input.kind === "transcript" ? `\n\nTRANSCRIPT\n${input.transcript}` : "";
  return `You are a short-form video strategist. This ${surface(ctx)} beat its creator's normal numbers. A
creator who wants to make their own version needs to know exactly what it does and why people kept
watching. Your breakdown is the whole brief they get.

THE POST
${videoFacts(ctx, input)}${transcript}

${how}

RULES FOR EVERY SENTENCE YOU WRITE
1. Point at something in THIS post (every field except pattern_you_can_use, which is the reusable
   instruction). ${evidenceRule(input)}
2. ${REGISTER}
   Keep every sentence under 20 words.
3. ${BANNED_LINE} Not "a relatable opener" but: he says "I wasted two years on this" before the first cut.
4. Only use what is in the post, the words above and the numbers. If you cannot see or hear something,
   leave it out. Never guess a number, a name or a result.
5. No emoji. No dashes of any kind. No markdown.

${KEYS(input)}`;
}

const TIMESTAMP_START = /^\d{1,2}:\d{2}\b/;
const HAS_QUOTE = /"[^"]{2,}"/;
const HAS_TIME = /\b\d{1,2}:\d{2}\b/;
const HAS_SLIDE = /\bslides?\s+\d+/i;

// ------------------------------------------------------------------ making the answer safe

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = sanitize(v).replace(/\s*\n\s*/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

const cleanList = (v: unknown, maxItems: number, max: number): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => cleanText(x, max))
        .filter((x): x is string => x !== null)
        .slice(0, maxItems)
    : [];

export function normalizeHookType(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  // Joining words carry nothing: "Proof/Result" is "Proof or result", "Behind-the-scenes" the same.
  const key = (s: string) => s.toLowerCase().replace(/\b(?:or|and|the|a)\b/g, "").replace(/[^a-z]/g, "");
  const k = key(v);
  return (
    HOOK_TYPES.find((t) => key(t) === k) ??
    HOOK_TYPES.find((t) => t !== "Other" && (k.includes(key(t)) || key(t).includes(k))) ??
    "Other"
  );
}

function wordsMax(text: string | null, max: number): string | null {
  if (!text) return null;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > max ? words.slice(0, max).join(" ").replace(/[,;:]$/, "") : text;
}

// Words that describe what the viewer SEES. A breakdown made without watching cannot know them.
const VISUAL_FORMAT = /talking head|screen|camera|b-?roll|overlay|graphic|visual|split|animation|footage|green ?screen|close-?up|on-?screen/i;

/** A format worked out from a transcript or a caption, kept only when it does not claim to know what
    is on screen. */
export function unseenFormat(format: string | null): string | null {
  return format && !VISUAL_FORMAT.test(format) ? format : null;
}

/** The choices a route is allowed to have noticed.
 *
 * A caption-only breakdown came back with "Close-up of hose swap at 0:10" and "Text overlay of cost
 * savings at 0:30", neither of which anybody could know from a caption. The prompt already forbids
 * it and the model did it anyway, which is the whole reason these rules are also in code. Anything
 * describing what is on screen goes, and for a caption so does anything with a timestamp, because a
 * caption has no timeline to put one on. */
export function unseenChoices(choices: string[], source: BreakdownSource): string[] {
  if (source === "watched") return choices;
  return choices.filter((c) => !VISUAL_FORMAT.test(c) && !(source === "caption" && HAS_TIME.test(c)));
}

/** A model answer turned into a breakdown: every string cleaned and cut to length, missing fields
    null or empty, and the fields a route cannot honestly know forced to null. Null when the answer
    is not an object at all. */
export function coerceBreakdown(raw: unknown, source: BreakdownSource): Breakdown | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const hook = (r.hook && typeof r.hook === "object" ? r.hook : {}) as Record<string, unknown>;
  return {
    title: wordsMax(cleanText(r.title, 80), 8),
    hook: {
      spoken: source === "caption" ? null : cleanText(hook.spoken, 300),
      on_screen: source === "watched" ? cleanText(hook.on_screen, 300) : null,
      caption: cleanText(hook.caption, 300),
    },
    hook_type: normalizeHookType(r.hook_type),
    hook_template: cleanText(r.hook_template, 300),
    angle: cleanText(r.angle, 300),
    format: source === "watched" ? cleanText(r.format, 120) : unseenFormat(cleanText(r.format, 120)),
    beats: source === "caption" ? [] : cleanList(r.beats, 10, 240),
    creative_choices: unseenChoices(cleanList(r.creative_choices, 8, 220), source),
    why_it_holds_attention: cleanText(r.why_it_holds_attention, 700),
    pattern_you_can_use: cleanText(r.pattern_you_can_use, 400),
    ask: cleanText(r.ask, 300),
    source,
  };
}

// ------------------------------------------------------------------ checks

export interface BreakdownProblem {
  field: string;
  message: string;
  /** False when only watching the video again could fix it. */
  fixableInText: boolean;
}

/** The fields a text-only repair may rewrite. Quotes and timestamps elsewhere are never touched. */
export const REPAIRABLE = ["title", "angle", "format", "creative_choices", "why_it_holds_attention", "pattern_you_can_use", "hook_template"] as const;
const ANALYSIS_TEXT = ["title", "angle", "format", "why_it_holds_attention", "pattern_you_can_use"] as const;

/** Everything wrong with a breakdown that a second pass should fix. Empty means it can be saved. */
export function breakdownProblems(b: Breakdown, input: BreakdownInput["kind"]): BreakdownProblem[] {
  const problems: BreakdownProblem[] = [];
  const hits = [
    ...ANALYSIS_TEXT.flatMap((f) => fillerHits(b[f])),
    ...b.creative_choices.flatMap((c) => fillerHits(c)),
    ...b.beats.flatMap((c) => fillerHits(c)),
  ];
  const filler = fillerProblem(hits);
  if (filler) problems.push({ field: "filler", message: filler, fixableInText: true });

  if (!b.why_it_holds_attention) {
    problems.push({ field: "why_it_holds_attention", message: "why_it_holds_attention is empty. Write two or three short sentences naming the moment that makes people stay, with the words quoted.", fixableInText: true });
  } else {
    const evidence =
      input === "slides" ? HAS_QUOTE.test(b.why_it_holds_attention) || HAS_SLIDE.test(b.why_it_holds_attention)
      : input === "caption" ? HAS_QUOTE.test(b.why_it_holds_attention)
      : HAS_QUOTE.test(b.why_it_holds_attention) || HAS_TIME.test(b.why_it_holds_attention);
    if (!evidence) {
      problems.push({
        field: "why_it_holds_attention",
        message: `why_it_holds_attention points at nothing you can check: "${b.why_it_holds_attention}". Quote the exact words in double quotes${input === "caption" ? "" : input === "slides" ? " or name the slide" : " or give the second it happens"}.`,
        fixableInText: true,
      });
    }
  }
  if (!b.pattern_you_can_use) {
    problems.push({ field: "pattern_you_can_use", message: "pattern_you_can_use is empty. Write one or two short sentences as an instruction another creator can follow.", fixableInText: true });
  }
  if (b.hook_template && !/\[[^\]]+\]/.test(b.hook_template)) {
    problems.push({ field: "hook_template", message: `hook_template has no [BRACKETS]: "${b.hook_template}". Swap the specifics for bracketed slots.`, fixableInText: true });
  }
  if (input === "video" || input === "transcript") {
    const stamped = b.beats.filter((beat) => TIMESTAMP_START.test(beat)).length;
    if (b.beats.length < 2 || stamped < Math.ceil(b.beats.length / 2)) {
      problems.push({ field: "beats", message: "beats need 4 to 8 lines, each starting with its timestamp (0:00, 0:04).", fixableInText: false });
    }
  }
  return problems;
}

/** The second pass when the checks fail: text only, so it may reword but cannot invent. */
export function breakdownRepairPrompt(b: Breakdown, problems: BreakdownProblem[]): string {
  const fixable = problems.filter((p) => p.fixableInText);
  return `Below is a breakdown of a short-form video, as JSON. It fails some checks. Fix ONLY what the
problems name. Keep every quote, timestamp, name and fact exactly as it is, and never add a detail that
is not already somewhere in the JSON: you cannot see the video, so anything new would be invented.

THE PROBLEMS
${fixable.map((p) => `- ${p.message}`).join("\n")}
${b.source === "watched" ? "" : "\nThis breakdown was made without seeing the video, so never mention a visual, a demo, an edit or the setting.\n"}

THE BREAKDOWN
${JSON.stringify(b, null, 1)}

${REGISTER}
${BANNED_LINE}
No emoji, no dashes of any kind.

Return STRICT JSON with only the keys you changed, from this list: ${REPAIRABLE.join(", ")}. Output JSON only.`;
}

/** Apply a text repair: only the repairable fields, and only values that are usable. */
export function mergeRepair(b: Breakdown, repaired: unknown): Breakdown {
  if (!repaired || typeof repaired !== "object" || Array.isArray(repaired)) return b;
  const r = repaired as Record<string, unknown>;
  const next = { ...b } as Breakdown;
  for (const field of REPAIRABLE) {
    if (!(field in r)) continue;
    if (field === "creative_choices") {
      const list = unseenChoices(cleanList(r[field], 8, 220), b.source);
      if (list.length) next.creative_choices = list;
      continue;
    }
    const text = cleanText(r[field], field === "why_it_holds_attention" ? 700 : field === "format" ? 120 : field === "title" ? 80 : 400);
    if (text) next[field] = field === "title" ? wordsMax(text, 8) : text;
  }
  return next;
}

/** The last pass before saving: any sentence still using filler is removed, so nothing saved ever
    calls a video relatable without showing why. */
export function finalizeBreakdown(b: Breakdown): Breakdown {
  const strip = (v: string | null) => {
    if (!v) return v;
    const t = stripFiller(v);
    return t ? t : null;
  };
  return {
    ...b,
    title: b.title && fillerHits(b.title).length ? null : b.title,
    angle: strip(b.angle),
    format: strip(b.format),
    why_it_holds_attention: strip(b.why_it_holds_attention),
    pattern_you_can_use: strip(b.pattern_you_can_use),
    beats: b.beats.filter((x) => fillerHits(x).length === 0),
    creative_choices: b.creative_choices.filter((x) => fillerHits(x).length === 0),
  };
}
