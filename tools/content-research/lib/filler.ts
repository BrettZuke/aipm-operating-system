// The words that make an AI breakdown useless: they sound like analysis and point at nothing.
// "A relatable hook with high energy" could be said about any video ever made, so a client reading
// it learns nothing and a student repeating it sounds like they did not watch.
//
// A banned word is excused only when the same sentence goes on to show the concrete thing: a quote
// in double quotes or a timestamp after it. Anything else is filler and gets sent back.

export const BANNED_FILLER = [
  "engaging",
  "captivating",
  "strong hook",
  "resonates",
  "value-packed",
  "high energy",
  "relatable",
  "compelling",
  "attention-grabbing",
  "grabs attention",
  "scroll-stopping",
  "eye-catching",
  "impactful",
  "high-value",
  "powerful",
  "game-changing",
  "seamless",
] as const;

const PATTERNS: { phrase: string; re: RegExp }[] = [
  { phrase: "engaging", re: /\bengaging\b/i },
  { phrase: "captivating", re: /\bcaptivat(?:ing|es|ed)\b/i },
  { phrase: "strong hook", re: /\bstrong hooks?\b/i },
  { phrase: "resonates", re: /\bresonat(?:es|e|ed|ing)\b/i },
  { phrase: "value-packed", re: /\bvalue[- ]packed\b/i },
  { phrase: "high energy", re: /\bhigh[- ]energy\b/i },
  { phrase: "relatable", re: /\brelatable\b/i },
  { phrase: "compelling", re: /\bcompelling\b/i },
  { phrase: "attention-grabbing", re: /\battention[- ]grabbing\b/i },
  { phrase: "grabs attention", re: /\bgrab(?:s|bed|bing)?\s+(?:[\w']+\s+){0,2}attention\b/i },
  { phrase: "scroll-stopping", re: /\bscroll[- ]stopping\b/i },
  { phrase: "eye-catching", re: /\beye[- ]catching\b/i },
  { phrase: "impactful", re: /\bimpactful\b/i },
  { phrase: "high-value", re: /\bhigh[- ]value\b/i },
  { phrase: "powerful", re: /\bpowerful\b/i },
  { phrase: "game-changing", re: /\bgame[- ]chang(?:ing|er)\b/i },
  { phrase: "seamless", re: /\bseamless(?:ly)?\b/i },
];

const EVIDENCE = /"[^"]{2,}"|\b\d{1,2}:\d{2}\b/;

export interface FillerHit {
  phrase: string;
  sentence: string;
}

function sentences(text: string): string[] {
  return (text ?? "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The banned phrases a sentence uses without a quote or a timestamp after them. A word inside a
    quote is the creator's own words being reported, so it never counts. */
function hitsIn(sentence: string): string[] {
  const quoted = [...sentence.matchAll(/"[^"]*"/g)].map((q) => [q.index ?? 0, (q.index ?? 0) + q[0].length] as const);
  const out: string[] = [];
  for (const { phrase, re } of PATTERNS) {
    for (const m of sentence.matchAll(new RegExp(re.source, "gi"))) {
      const at = m.index ?? 0;
      if (quoted.some(([start, end]) => at > start && at < end)) continue;
      if (!EVIDENCE.test(sentence.slice(at + m[0].length))) {
        out.push(phrase);
        break;
      }
    }
  }
  return out;
}

/** Every filler use in a piece of text, one entry per phrase per sentence. */
export function fillerHits(text: string | null | undefined): FillerHit[] {
  const out: FillerHit[] = [];
  for (const sentence of sentences(text ?? "")) {
    for (const phrase of hitsIn(sentence)) out.push({ phrase, sentence: sentence.slice(0, 200) });
  }
  return out;
}

/** The text with every sentence that uses filler removed, so nothing saved ever calls a video
    relatable without showing why. */
export function stripFiller(text: string): string {
  return (text ?? "")
    .split("\n")
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter((s) => hitsIn(s).length === 0)
        .join(" ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

/** A re-prompt instruction quoting the offending sentences, or null when there are none. */
export function fillerProblem(hits: FillerHit[]): string | null {
  if (hits.length === 0) return null;
  const unique = [...new Map(hits.map((h) => [`${h.phrase}|${h.sentence}`, h])).values()].slice(0, 8);
  return (
    "These sentences use filler words that point at nothing:\n" +
    unique.map((h) => `  "${h.sentence}" (uses "${h.phrase}")`).join("\n") +
    "\nRewrite each one to say the concrete thing instead: quote the exact words, name the exact visual, or give the second it happens."
  );
}
