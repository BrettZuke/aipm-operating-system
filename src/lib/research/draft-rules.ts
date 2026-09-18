// Scoring a draft before it goes out.
//
// The model scores six parts out of ten, but CODE decides the total and code caps it at 60 when the
// draft has no call to action or claims a result nobody can check. Whatever the model thought of it.
// That cap is the point: a nice-sounding script with an invented number is not a 90, it is a problem.

import { fillerHits, fillerProblem, stripFiller } from "./filler";
import { hookWords, HOOK_MAX_WORDS, missingCta, overpromises, sanitize, spokenWords, tooLong, unsupportedNumbers, unverifiableClaims } from "./guards";
import { BANNED_LINE, REGISTER } from "./breakdown";
import type { DraftPartKey, DraftReport } from "./types";

export type DraftFormat = "reel" | "short" | "long";

export const PART_ORDER: DraftPartKey[] = ["hook", "clarity", "value", "pacing", "ask", "fit"];
export const PART_LABELS: Record<DraftPartKey, string> = {
  hook: "Hook, first 3 seconds",
  clarity: "Clear single idea",
  value: "Payoff for the viewer",
  pacing: "Pacing and length",
  ask: "Call to action",
  fit: "Matches what works in this niche",
};
export const PART_WEIGHTS: Record<DraftPartKey, number> = { hook: 0.3, clarity: 0.15, value: 0.2, pacing: 0.15, ask: 0.1, fit: 0.1 };
export const HARD_FAIL_CAP = 60;
/** A reel or a Short longer than this in spoken words is an email read aloud. */
export const SHORT_FORM_WORD_LIMIT = 150;
const FAST_WPS = 3.5;
const SLOW_WPS = 1.8;

// How people actually ask, including the way a British trade says it. "Give us a callout" was read
// as no ask at all on a real script, which capped a decent draft at 60 for no reason.
const ASK =
  /\b(comment|follow|save|share|subscribe|dm|message (?:me|us)|text (?:me|us)|email (?:me|us)|click|tap|link in (?:my |the )?bio|download|join|book (?:us|in|a)|grab|sign up|register|apply|check out|tell me|let me know|drop (?:a|your|us)|reply|send (?:me|us)|head to|go to|visit|get in touch|call (?:us|me|now|out)|callout|give us a (?:call|ring|shout|bell)|ring (?:us|me)|turn on notifications)\b/i;

function lines(text: string): string[] {
  return (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

function splitSentences(text: string): string[] {
  return (text ?? "").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** The line that asks the viewer to do something, looked for in the last three lines (or the last
    three sentences of a one-paragraph draft), plus anything shown on screen. Null when there is none. */
export function findAsk(spoken: string, onScreen: string[] = []): string | null {
  const tail = lines(spoken).length >= 3 ? lines(spoken).slice(-3) : splitSentences(spoken).slice(-3);
  const said = [...tail].reverse().find((l) => ASK.test(l));
  if (said) return said;
  return onScreen.find((l) => ASK.test(l)) ?? null;
}

export interface DraftChecks {
  spokenWords: number;
  durationS: number | null;
  wordsPerSecond: number | null;
  firstSentence: string | null;
  firstSentenceWords: number;
  cta: string | null;
  claims: string[];
  promises: string[];
  overLength: number | null;
  /** One sentence per hard failure. Any at all caps the score at HARD_FAIL_CAP. */
  hardFails: string[];
}

/** Everything code can say about a draft without asking a model anything. */
export function draftChecks(args: { spoken: string; hook?: string | null; title?: string | null; format: DraftFormat; durationS?: number | null; onScreen?: string[] }): DraftChecks {
  const spoken = args.spoken ?? "";
  const words = spokenWords(spoken);
  const first = (args.hook ?? "").trim() || splitSentences(spoken)[0] || null;
  const duration = args.durationS && args.durationS > 0 ? args.durationS : null;
  const cta = findAsk(spoken, args.onScreen ?? []);
  const claims = unverifiableClaims([args.hook, args.title, spoken].filter(Boolean).join("\n"));
  const hardFails: string[] = [];
  if (missingCta(cta)) hardFails.push("There is no call to action: nothing in the last lines asks the viewer to do anything.");
  if (claims.length) hardFails.push(`It claims a result nobody can check: ${claims.map((c) => `"${c}"`).join(", ")}.`);
  return {
    spokenWords: words,
    durationS: duration,
    wordsPerSecond: duration && words > 0 ? Math.round((words / duration) * 10) / 10 : null,
    firstSentence: first,
    firstSentenceWords: first ? hookWords(first) : 0,
    cta,
    claims,
    promises: overpromises(spoken),
    overLength: args.format === "long" ? null : tooLong(spoken, SHORT_FORM_WORD_LIMIT),
    hardFails,
  };
}

/** The checks written out as facts for the prompt, one line each. */
export function checksForPrompt(c: DraftChecks, format: DraftFormat): string {
  const out = [
    `Spoken words: ${c.spokenWords}${c.durationS ? ` in ${Math.round(c.durationS)} seconds (${c.wordsPerSecond} words a second${c.wordsPerSecond && c.wordsPerSecond > FAST_WPS ? ", fast" : c.wordsPerSecond && c.wordsPerSecond < SLOW_WPS ? ", slow" : ""})` : `, about ${Math.round((c.spokenWords / 150) * 60)} seconds at a normal pace`}.`,
    c.firstSentence ? `First sentence: ${c.firstSentenceWords} words ("${c.firstSentence.slice(0, 200)}"). A hook is said in under 3 seconds, ${HOOK_MAX_WORDS} words or fewer.` : "There is no first sentence to judge.",
    c.cta ? `Call to action found: "${c.cta.slice(0, 200)}".` : "Call to action: none found in the last lines.",
  ];
  if (c.claims.length) out.push(`Claims a result nobody can check: ${c.claims.map((x) => `"${x}"`).join(", ")}.`);
  if (c.promises.length) out.push(`Promises a personal reply: ${c.promises.join(", ")}.`);
  if (c.overLength) out.push(`Too long for a ${format === "short" ? "Short" : "reel"}: ${c.overLength} spoken words, over ${SHORT_FORM_WORD_LIMIT}.`);
  return out.map((l) => `- ${l}`).join("\n");
}

/** The weighted average of the part scores turned into a number out of 100, capped when a hard check
    failed. Hook is worth 30 percent because the hook is most of the job. */
export function finalScore(parts: { key: DraftPartKey; score: number }[], hardFail: boolean): number {
  const present = parts.filter((p) => PART_WEIGHTS[p.key] !== undefined);
  const weight = present.reduce((sum, p) => sum + PART_WEIGHTS[p.key], 0);
  if (weight === 0) return 0;
  const average = present.reduce((sum, p) => sum + PART_WEIGHTS[p.key] * Math.max(0, Math.min(10, p.score)), 0) / weight;
  const score = Math.round(average * 10);
  return hardFail ? Math.min(score, HARD_FAIL_CAP) : score;
}

export interface NichePattern {
  creator: string;
  multiple: number | null;
  hookType: string | null;
  hookTemplate: string | null;
  pattern: string | null;
}

export interface DraftPromptArgs {
  format: DraftFormat;
  title: string | null;
  hook: string | null;
  /** The script, or a timestamped transcript when the draft is a video. */
  words: string | null;
  checks: DraftChecks;
  niche: NichePattern[];
  mode: "script" | "watched" | "transcript";
  retry: string[] | null;
}

const FORMAT_NAME: Record<DraftFormat, string> = { reel: "Instagram reel", short: "YouTube Short", long: "long YouTube video" };

function nicheSection(niche: NichePattern[]): string {
  if (niche.length === 0) {
    return `WHAT WORKS IN THIS NICHE RIGHT NOW
No standout videos have been broken down for this client yet, so judge "fit" on short-form basics and
say so in its note.`;
  }
  return `WHAT WORKS IN THIS NICHE RIGHT NOW
From the standout videos broken down for this client (each beat its own creator's normal numbers):
${niche.map((n) => `- ${n.creator}${n.multiple != null ? `, ${n.multiple}x` : ""}: ${n.hookType ?? "Other"} hook, template "${n.hookTemplate ?? "none"}". Pattern: ${n.pattern ?? "none"}`).join("\n")}`;
}

export function draftPrompt(a: DraftPromptArgs): string {
  const numbered = (a.words ?? "").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim()).map((l, i) => `${i + 1}: ${l}`).join("\n");
  const draft =
    a.mode === "watched"
      ? `The attached video is the draft. Watch all of it: every word said, every piece of text on screen, the
cuts and the pace.${a.words ? `\nWhat it says, with the second each line starts:\n${a.words}` : ""}`
      : a.mode === "transcript"
        ? `You cannot see this video. You have what it says, with the second each line starts. Judge the words
and the pace only, and never describe visuals.\n${a.words ?? ""}`
        : `Script, line by line:\n${numbered}`;
  const evidence =
    a.mode === "script"
      ? `Every "note" quotes the exact line it is about, in double quotes, and says what that line does or fails to do.
   Like this: "Line 1 "So today I want to talk about" spends four seconds before the point arrives."`
      : `Every "note" quotes the exact words said or shown, in double quotes, and gives the second they happen.
   Like this: "At 0:03 "So the second a call is missed" runs on past 0:08, so the point arrives late."`;
  const extraKeys =
    a.mode === "watched"
      ? `\n  "spoken": everything said in the video, word for word, or "" when nothing is said\n  "on_screen_text": a list of every piece of text shown on screen, in order`
      : "";
  const retry = a.retry?.length ? `\nYOUR LAST ANSWER FAILED THESE CHECKS. Fix every one.\n${a.retry.map((p) => `- ${p}`).join("\n")}\n` : "";
  return `You are a short-form video editor scoring a draft before it is posted. Be specific and tough. The
person will fix exactly what you point at, so point at lines, never at vibes.

THE DRAFT
Format: ${FORMAT_NAME[a.format]}
Title: ${a.title ?? "(none)"}
Hook as written: ${a.hook ? `"${a.hook}"` : "(not given; it is the first line)"}
${draft}

WHAT THE CHECKS IN CODE FOUND (facts; do not argue with them)
${checksForPrompt(a.checks, a.format)}

${nicheSection(a.niche)}

SCORE SIX PARTS, EACH A WHOLE NUMBER FROM 0 TO 10
  hook: does the first sentence make someone stay, in under 3 seconds (a payoff shown, a gap opened, a specific picture)?
  clarity: is it one idea a viewer could repeat in a sentence?
  value: does the viewer get something they can use or feel by the end?
  pacing: is every line needed, and is the length right for the format?
  ask: is there one clear action at the end?
  fit: does it use a hook type or pattern from the niche list above?
10 means nothing to fix. 7 means it works with one clear fix. 4 means it needs rework. Most drafts land 4 to 7.

RULES
1. ${evidence}
2. Every "fix" is the change itself: a rewritten line or a cut, not advice. Not "make it punchier" but: cut
   "So basically what I want to say is" and open on "I lost a customer over one missed call".
3. Never invent facts about the business, never add a number they did not say, never promise a result.
4. ${REGISTER}
5. ${BANNED_LINE} No emoji, no dashes of any kind.
${retry}
Return STRICT JSON, ONE object with these keys:
  "verdict": one line, the single most important thing to change
  "parts": a list of 6 objects, one per key above, each with "key", "score", "note", "fix"
  "line_fixes": 2 to 5 objects, each with "line" (copied exactly from the draft), "problem", "rewrite"
  "hook_rewrites": 3 new hooks for this draft, each ${HOOK_MAX_WORDS} words or fewer, built only from what the draft says${extraKeys}
Output JSON only. No prose, no code fences.`;
}

// ------------------------------------------------------------------ making the answer safe

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = sanitize(v).replace(/\s*\n\s*/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

const bareLine = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** A note pointing at "line 1" or "0:04" is referring to the draft, not making a claim about the
    business. Those references come out before any figure is judged, because blanking a good fix for
    saying "line 1" is worse than the problem it was guarding against. */
export function withoutReferences(text: string): string {
  return (text ?? "")
    .replace(/\blines?\s+\d+(?:\s*(?:,|and|to|-)\s*\d+)*/gi, " line ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ");
}

/** True when a quoted line really is in the draft, ignoring punctuation and case. */
export function lineInDraft(line: string, draft: string): boolean {
  const l = bareLine(line);
  return l.length >= 8 && bareLine(draft).includes(l);
}

export interface RawReport {
  verdict: string | null;
  parts: DraftReport["parts"];
  line_fixes: DraftReport["line_fixes"];
  hook_rewrites: string[];
  /** Watched videos only: what the model heard and saw. */
  spoken: string | null;
  onScreen: string[];
}

/** A model answer turned into a report: parts keyed and labelled by code, scores clamped to a whole
    0 to 10, line fixes kept only when the line really is in the draft, and hook rewrites that break
    the hook rules thrown away. Null when the answer is not an object. */
export function coerceReport(raw: unknown, draftText: string | null): RawReport | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const parts: DraftReport["parts"] = [];
  for (const item of Array.isArray(r.parts) ? r.parts : []) {
    const p = (item ?? {}) as Record<string, unknown>;
    const key = PART_ORDER.find((k) => k === String(p.key ?? "").toLowerCase().trim());
    const score = Number(p.score);
    if (!key || parts.some((x) => x.key === key) || !Number.isFinite(score)) continue;
    parts.push({ key, label: PART_LABELS[key], score: Math.max(0, Math.min(10, Math.round(score))), note: cleanText(p.note, 500) ?? "", fix: cleanText(p.fix, 500) ?? "" });
  }
  parts.sort((a, b) => PART_ORDER.indexOf(a.key) - PART_ORDER.indexOf(b.key));
  // A rewrite may not bring in a figure the draft never had. Without the draft's words there is
  // nothing to check against, so that check needs draftText.
  const invents = (text: string) => draftText !== null && unsupportedNumbers(withoutReferences(text), [draftText]).length > 0;
  const lineFixes = (Array.isArray(r.line_fixes) ? r.line_fixes : [])
    .map((item) => {
      const f = (item ?? {}) as Record<string, unknown>;
      // Transcript lines arrive with their "[0:03]" stamps; the line itself is what gets fixed.
      const line = (cleanText(f.line, 400) ?? "").replace(/\[\d{1,2}:\d{2}\]\s*/g, "").trim();
      return { line, problem: cleanText(f.problem, 300) ?? "", rewrite: cleanText(f.rewrite, 400) ?? "" };
    })
    .filter((f) => f.line && f.rewrite && (draftText === null || lineInDraft(f.line, draftText)) && !invents(f.rewrite))
    .slice(0, 5);
  const hookRewrites = (Array.isArray(r.hook_rewrites) ? r.hook_rewrites : [])
    .map((h) => cleanText(h, 200))
    .filter((h): h is string => !!h && hookWords(h) <= HOOK_MAX_WORDS && unverifiableClaims(h).length === 0 && overpromises(h).length === 0 && fillerHits(h).length === 0 && !invents(h))
    .slice(0, 3);
  return {
    verdict: cleanText(r.verdict, 300),
    parts,
    line_fixes: lineFixes,
    hook_rewrites: hookRewrites,
    spoken: typeof r.spoken === "string" ? sanitize(r.spoken).trim() || null : null,
    onScreen: Array.isArray(r.on_screen_text) ? r.on_screen_text.map((t) => cleanText(t, 200)).filter((t): t is string => !!t) : [],
  };
}

const HAS_QUOTE = /"[^"]{2,}"/;
const HAS_TIME = /\b\d{1,2}:\d{2}\b/;

/** How much of a report actually points at the draft: notes that quote it, line fixes, and hook
    rewrites. Two passes can carry the same number of problems while one of them is visibly thinner,
    because every vague note is counted as one problem between them, so this breaks the tie. */
export function reportEvidence(r: RawReport): number {
  return r.parts.filter((p) => HAS_QUOTE.test(p.note) || HAS_TIME.test(p.note)).length + r.line_fixes.length + r.hook_rewrites.length;
}

/** What a second pass has to fix. Empty means the report can be saved as it is. */
export function reportProblems(r: RawReport, mode: DraftPromptArgs["mode"], draftText: string | null = null): string[] {
  const problems: string[] = [];
  const missing = PART_ORDER.filter((k) => !r.parts.some((p) => p.key === k));
  if (missing.length) problems.push(`These parts are missing: ${missing.join(", ")}. Score all six.`);
  const vague = r.parts.filter((p) => !(HAS_QUOTE.test(p.note) || (mode !== "script" && HAS_TIME.test(p.note))));
  if (vague.length) {
    problems.push(
      `These notes do not quote the draft: ${vague.map((p) => `${p.key} ("${p.note.slice(0, 120)}")`).join("; ")}. Quote the exact line in double quotes${mode === "script" ? "" : " with its second"}.`,
    );
  }
  if (!r.verdict) problems.push("The verdict is empty. Say the single most important change in one line.");
  if (draftText !== null) {
    const invented = r.parts.filter((p) => unsupportedNumbers(withoutReferences(p.fix), [draftText]).length > 0);
    if (invented.length) {
      problems.push(`These fixes add a number the draft never said: ${invented.map((p) => `${p.key} ("${p.fix.slice(0, 120)}")`).join("; ")}. Fix the words without inventing a figure.`);
    }
  }
  if (r.hook_rewrites.length < 3) problems.push(`Only ${r.hook_rewrites.length} hook rewrites passed. Write 3, each ${HOOK_MAX_WORDS} words or fewer, with no invented numbers or results.`);
  const filler = fillerProblem([
    ...fillerHits(r.verdict),
    ...r.parts.flatMap((p) => [...fillerHits(p.note), ...fillerHits(p.fix)]),
    ...r.line_fixes.flatMap((f) => fillerHits(f.problem)),
  ]);
  if (filler) problems.push(filler);
  return problems;
}

/** The report to save: the better of one or two passes (fewer problems wins, the second on a tie),
    leftover filler removed, any fix that still invents a figure removed with it, and the score
    decided in code.
    A fix reading "Saving you thousands versus a new boiler" survived two passes on a real run. A
    suggestion carrying a number nobody can back up is worse than no suggestion, so it goes. */
export function finalizeReport(passes: { report: RawReport; problems: string[] }[], checks: DraftChecks, draftText: string | null = null): DraftReport {
  const best = [...passes].sort(
    (a, b) => a.problems.length - b.problems.length || reportEvidence(b.report) - reportEvidence(a.report) || passes.indexOf(b) - passes.indexOf(a),
  )[0].report;
  const invents = (text: string) => draftText !== null && unsupportedNumbers(withoutReferences(text), [draftText]).length > 0;
  const parts = best.parts.map((p) => ({ ...p, note: stripFiller(p.note), fix: invents(p.fix) ? "" : stripFiller(p.fix) }));
  const verdict = best.verdict ? stripFiller(best.verdict) : "";
  return {
    score: finalScore(parts, checks.hardFails.length > 0),
    verdict: verdict || (checks.hardFails[0] ?? ""),
    parts,
    line_fixes: best.line_fixes.filter((f) => !invents(f.rewrite)).map((f) => ({ ...f, problem: stripFiller(f.problem) })),
    hook_rewrites: best.hook_rewrites,
  };
}
