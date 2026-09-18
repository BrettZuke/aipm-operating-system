// Writing the full script from a chosen hook.
//
// The script is allowed to borrow the source video's MECHANISM and nothing else. Every fact in it has
// to come from the client profile. The guards run after the model answers, and a script that claims a
// result, promises a personal reply, uses a banned phrase, invents a figure or forgets the ask gets
// sent back once with the offending lines quoted.

import { fillerHits, fillerProblem } from "./filler";
import { bannedPhrasesUsed, hookWords, HOOK_MAX_WORDS, missingCta, overpromises, sanitize, tooLong, unsupportedNumbers, unverifiableClaims } from "./guards";
import { BANNED_LINE, REGISTER } from "./breakdown";
import { profileSources, type SourceVideo } from "./adaptation";
import type { Breakdown, ClientProfile } from "./types";

export const REEL_WORD_TARGET = "75 to 100 words";
export const SCRIPT_WORD_LIMIT = 150;

export interface ScriptDraft {
  hook: string;
  on_screen: string | null;
  script: string;
  cta: string;
  caption: string | null;
  shot_list: string[];
}

function clientFacts(p: ClientProfile, thin: boolean): string {
  if (thin) {
    return `THE CLIENT
Their profile is nearly empty. Write the script with [BRACKETS] wherever a real detail belongs: the
trade, the job, the customer, the price, the result. Never fill a bracket in with a guess, not even a
plausible one. A guessed detail about a real business is a lie published in their name.`;
  }
  return `THE CLIENT, FROM THEIR OWN PROFILE
This is the ONLY set of facts you have about them. Anything not written here is unknown to you.

WHO THEY HELP
${p.who_they_help || "(not filled in)"}

WHAT THEY SELL
${p.what_they_sell || "(not filled in)"}

WHAT THEY CAN SHOW ON CAMERA
${p.proof || "(not filled in)"}

HOW THEY TALK
${p.how_they_talk || "(not filled in)"}${p.avoid.length ? `\n\nPHRASES THEY NEVER USE\n${p.avoid.map((a) => `- ${a}`).join("\n")}` : ""}`;
}

export function scriptPrompt(args: {
  hook: string;
  breakdown: Breakdown;
  video: SourceVideo;
  client: ClientProfile;
  thin: boolean;
  onScreen: string | null;
  shotList: string[];
  retry: string[] | null;
}): string {
  const { breakdown: b } = args;
  const longForm = args.video.platform === "youtube" && args.video.kind !== "short";
  const shape = longForm
    ? `Write the spoken opening of a YouTube video in full (the first 30 seconds decide everything), then the
body as beats. About 200 to 260 words in total.`
    : `Write an Instagram reel: about 30 seconds of speech, ${REEL_WORD_TARGET}. A 130 word script is an email
read aloud and it will not get filmed. Contractions throughout. Fragments are fine.`;
  const retry = args.retry?.length ? `\nYOUR LAST ANSWER FAILED THESE CHECKS. Fix every one.\n${args.retry.map((p) => `- ${p}`).join("\n")}\n` : "";
  return `You are writing one short video script for a real client. Their agency found a video that
beat its creator's normal numbers, picked a hook, and now wants the rest of the script.

THE HOOK THEY CHOSE. Use it word for word as the first line, and open the spoken script with it.
"${args.hook}"

THE MECHANISM IT BORROWS (from ${args.video.creatorName}, ${args.video.performance})
${[b.hook_type ? `Hook type: ${b.hook_type}` : null, b.pattern_you_can_use ? `The pattern: ${b.pattern_you_can_use}` : null, b.why_it_holds_attention ? `Why the original held attention: ${b.why_it_holds_attention}` : null, b.beats.length ? `How the original was ordered:\n${b.beats.map((x) => `  ${x}`).join("\n")}` : null].filter(Boolean).join("\n")}
Borrow the shape only. Never borrow its topic, its claims or its numbers.

${clientFacts(args.client, args.thin)}
${args.onScreen ? `\nWORDS ALREADY CHOSEN FOR THE SCREEN IN THE FIRST 2 SECONDS: "${args.onScreen}"` : ""}
${args.shotList.length ? `\nSHOTS ALREADY PLANNED\n${args.shotList.map((s) => `- ${s}`).join("\n")}` : ""}

WRITE
${shape}
1. "hook": the chosen hook, word for word, unchanged.
2. "script": the whole thing said out loud, one sentence per line, starting with the hook. Every fact in it
   comes from the client profile above. Never invent a number, a customer, a price, a date or a result.
   Never put I, we, my or our next to a number, even a true one: it reads as a claim nobody can check.
3. "cta": one clear thing to do at the end, said in their own words. Never promise a personal reply, and
   never promise a result you cannot control.
4. "on_screen": the words on screen in the first 2 seconds, 8 words or fewer.
5. "caption": the caption, two or three short lines, first line under 12 words. No hashtags.
6. "shot_list": 3 to 7 shots, each one thing a phone can actually be pointed at.

HOW IT SOUNDS
${REGISTER}
Words their customers already use. ${BANNED_LINE}
No emoji, no dashes of any kind.
${retry}
Return STRICT JSON, ONE object with the keys "hook", "script", "cta", "on_screen", "caption", "shot_list".
Output JSON only. No prose, no code fences.`;
}

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = sanitize(v).trim();
  return t ? t.slice(0, max) : null;
};

export function coerceScript(raw: unknown, hook: string): ScriptDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const script = cleanText(r.script, 4_000);
  if (!script) return null;
  return {
    hook: cleanText(r.hook, 200) ?? hook,
    on_screen: cleanText(r.on_screen, 80),
    script,
    cta: cleanText(r.cta, 300) ?? "",
    caption: cleanText(r.caption, 600),
    shot_list: (Array.isArray(r.shot_list) ? r.shot_list : []).map((s) => cleanText(s, 160)).filter((s): s is string => s !== null).slice(0, 7),
  };
}

/** Everything wrong with a script, in the words the model gets sent back. Empty means it passes. */
export function scriptProblems(draft: ScriptDraft, client: ClientProfile, longForm: boolean): string[] {
  const problems: string[] = [];
  const sources = [...profileSources(client), draft.hook];
  const whole = [draft.hook, draft.script, draft.cta, draft.caption, ...draft.shot_list].filter(Boolean).join("\n");

  const claims = unverifiableClaims(whole);
  if (claims.length) {
    problems.push(`It claims a result nobody can check: ${claims.map((c) => `"${c}"`).join(", ")}. Say what they did, and let the screen show any number.`);
  }
  const promises = overpromises(whole);
  if (promises.length) problems.push(`It promises a personal reply (${promises.join(", ")}). Nobody can keep that promise, so take it out.`);
  const banned = bannedPhrasesUsed(whole, client.avoid);
  if (banned.length) problems.push(`It uses ${banned.map((b) => `"${b}"`).join(", ")}, which this client never says. Rewrite those lines.`);
  const invented = unsupportedNumbers([draft.script, draft.cta, ...draft.shot_list].join("\n"), sources);
  if (invented.length) {
    problems.push(`It uses figures that are not in the client profile: ${invented.map((f) => `"${f}"`).join(", ")}. Remove each one, or say it without a number. Do not swap in a different number.`);
  }
  if (missingCta(draft.cta)) problems.push("There is no real call to action. End with one clear thing to do.");
  const long = longForm ? null : tooLong(draft.script, SCRIPT_WORD_LIMIT);
  if (long) problems.push(`The script is ${long} spoken words, over ${SCRIPT_WORD_LIMIT}. Cut it back to about 100.`);
  if (hookWords(draft.hook) > HOOK_MAX_WORDS) {
    problems.push(`The hook is ${hookWords(draft.hook)} words. A hook is said in under 3 seconds, ${HOOK_MAX_WORDS} words or fewer.`);
  }
  const filler = fillerProblem([...fillerHits(draft.script), ...fillerHits(draft.cta), ...fillerHits(draft.caption)]);
  if (filler) problems.push(filler);
  return problems;
}
