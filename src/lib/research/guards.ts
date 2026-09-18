// The rules that are checked in code rather than asked for in a prompt.
//
// Every one of these exists because a model ignored the instruction at least once. A prompt is a
// request; this file is the part that holds. Ported from the command line research tool, so the
// dashboard gets the version that has already been argued with.

/** Unicode lookalikes, stage directions, dashes and emoji out. Everything written by a model goes
    through this before it is saved or shown. */
export function sanitize(text: string): string {
  return (text ?? "")
    .replace(/[\u2010\u2011\u2012\u2043\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u00A0\u2007\u202F\u2009]/g, " ")
    .replace(/\[\s*on[- ]?screen\s*:[^\]]*\]/gi, "")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\b(\w+)(\s+)\1\b/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const METRIC = "(?:views?|followers?|subscribers?|clients?|customers?|leads?|sales|revenue|mrr|months?|days?|weeks?)";
/** Quantities written as words slip past a digit-only pattern: "hundreds of new customers" is
    exactly as uncheckable as "400 customers". */
const QUANTITY = "(?:\\d[\\d,.]*\\s*(?:\\+\\s*)?(?:k|m|million|billion|x)?|hundreds of thousands|hundreds|thousands|dozens|millions|countless)";

const BRAG = new RegExp(`\\b(?:i|we|my|our)\\b[^.!?\\n]{0,60}?\\b${QUANTITY}\\s+(?:of\\s+)?[\\w\\s]{0,20}?${METRIC}`, "i");
const VAGUE_BRAG = /\b(?:i|we)\b[^.!?\n]{0,40}?\b(?:hundreds|thousands|dozens|millions|countless)\b/i;
const CURRENCY = /\b(?:i|we|my|our)\b[^.!?\n]{0,60}?[$\u00A3\u20AC]\s?\d/i;
const OVERPROMISE = /\b(personally|myself|i(?:'| wi)?ll (?:reply|respond|dm you back)|reply to everyone|every single (?:comment|dm))\b/i;

/** A figure inside quotation marks is being REPORTED, not claimed, so a script that tells the story
    of somebody else's claim is allowed to repeat the number. */
const QUOTED = /["'\u201C\u2018][^"'\u201D\u2019]{0,200}["'\u201D\u2019]/g;

/** Sentences claiming a result about the client that nobody can check. An empty array means clean.
    This is the guard that stops a student posting a number their client never gave them. */
export function unverifiableClaims(text: string): string[] {
  const hits: string[] = [];
  for (const sentence of (text ?? "").split(/(?<=[.!?])\s+|\n/)) {
    const s = sentence.trim();
    if (!s) continue;
    const unquoted = s.replace(QUOTED, " ");
    if (BRAG.test(unquoted) || CURRENCY.test(unquoted) || VAGUE_BRAG.test(unquoted)) hits.push(s.slice(0, 120));
  }
  return hits;
}

/** Promises of a personal reply. Your client will not answer every comment, so the video must not
    say they will. */
export function overpromises(text: string): string[] {
  const m = (text ?? "").match(new RegExp(OVERPROMISE.source, "gi"));
  return m ? [...new Set(m)] : [];
}

/** Words in the spoken body, ignoring the labelled scaffolding around it. */
export function spokenWords(script: string): number {
  const body = String(script ?? "")
    .split(/^SHOT LIST/im)[0]
    .replace(/^(HOOK|ON SCREEN|CTA|TITLE|CAPTION|THUMBNAIL[A-Z_ ]*):.*$/gim, " ");
  return body.split(/\s+/).filter(Boolean).length;
}

/** Scripts too long to be a reel anybody would actually film. Returns the word count when it is
    over the limit, null when it is fine. */
export function tooLong(script: string, limit = 150): number | null {
  const n = spokenWords(script);
  return n > limit ? n : null;
}

/** A script with no ask earns nothing. */
export function missingCta(cta: string | null | undefined): boolean {
  return (cta ?? "").trim().length < 10;
}

/** The phrases this client never says, as written in their profile. Matched on the words, with the
    apostrophe shape ignored, because a model uses a curly one about half the time. */
export function bannedPhrasesUsed(text: string, banned: string[] | null | undefined): string[] {
  if (!banned?.length) return [];
  const hay = String(text ?? "").replace(/[\u2019\u2018`]/g, "'");
  const hits: string[] = [];
  for (const raw of banned) {
    const phrase = String(raw ?? "").trim();
    if (!phrase) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['\u2019\u2018`]/g, "'");
    const left = /^\w/.test(phrase) ? "\\b" : "";
    const right = /\w$/.test(phrase) ? "\\b" : "";
    if (new RegExp(`${left}${escaped}${right}`, "i").test(hay)) hits.push(phrase);
  }
  return hits;
}

// Numbers written as words. Every hook in a real run came back saying "thirty thousand pounds",
// borrowed from the video it was copying, about a business whose profile has no such figure in it.
// A digit-only check waved all six through, so quantities spelled out are checked the same way.
const COUNT_WORD =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a|an|couple|few|several|many|tens|dozens|\\d[\\d,.]*)";
const SCALE_WORD = "(?:hundred|thousand|million|billion)";
const MAGNITUDE = new RegExp(`\\b(?:${COUNT_WORD}\\s+(?:of\\s+)?)?${SCALE_WORD}s?\\b`, "gi");

const tidy = (phrase: string) => phrase.toLowerCase().replace(/\s+/g, " ").replace(/s\b/g, "").trim();

/** Every quantity in a piece of text, as digits and as words. */
function quantitiesIn(text: string): { digits: string[]; magnitudes: string[] } {
  const flat = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  return {
    digits: flat.match(/\d+(?:\.\d+)?/g) ?? [],
    magnitudes: (flat.match(MAGNITUDE) ?? []).map(tidy),
  };
}

/** The numbers in a piece of text that none of the sources contain, so a hook or a script cannot
    carry a figure the client never gave you. Digits and quantities written as words both count.
    A number inside [brackets] is a slot to fill in, not a claim, so it is left alone. */
export function unsupportedNumbers(text: string, sources: string[]): string[] {
  const known = quantitiesIn(sources.join(" "));
  const knownDigits = new Set(known.digits);
  const knownMagnitudes = new Set(known.magnitudes);
  // "[amount] thousand" is one slot to fill in, so the scale word goes with the bracket.
  const withoutSlots = text.replace(new RegExp(`\\[[^\\]]*\\]\\s*(?:of\\s+)?${SCALE_WORD}s?`, "gi"), " ").replace(/\[[^\]]*\]/g, " ");
  const used = quantitiesIn(withoutSlots);
  const outDigits = used.digits.filter((n) => !knownDigits.has(n));
  const outMagnitudes = [...new Set(used.magnitudes)].filter((m) => !knownMagnitudes.has(m));
  return [...new Set([...outDigits, ...outMagnitudes])];
}

/** Words in a hook. Brackets count as a word, because a bracket is a slot the student fills. */
export function hookWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9[\]]/.test(w)).length;
}

export const HOOK_MAX_WORDS = 15;
