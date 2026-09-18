// Turning a filed script back into something you can film from.
//
// A card's script column is one text blob with labelled parts, because that is what survives being
// copied into a phone, a doc, or a teleprompter. The filming view needs those parts separately: the
// hook has to be the biggest thing on screen, the shot list has to be a list, and the spoken words
// have to sit in reading-sized chunks. So the blob is parsed back apart here, in a pure function
// that is tested, rather than with regexes scattered through a component.
//
// Both writers produce the same labels: the cloud agent (src/lib/agents/content-machine.ts) and the
// older command-line scripter. Anything unlabelled is treated as spoken script, which is the safe
// default: a stray line shows up in the words rather than vanishing.

export interface FilmScript {
  id: string;
  title: string;
  platform: string | null;
  format: string | null;
  /** Which part of the proof inventory this came from, recorded by the agent on the card. */
  subject: string | null;
  source: string | null;
  /** YouTube only: the published title, which is not the same as the board title. */
  videoTitle: string | null;
  thumbnail: string | null;
  thumbnailProps: string | null;
  hook: string;
  onScreen: string | null;
  /** The spoken words, split into the beats they were written in. */
  beats: string[];
  cta: string | null;
  shots: string[];
}

const LABELS = [
  ["TITLE:", "videoTitle"],
  ["THUMBNAIL PROPS:", "thumbnailProps"],
  ["THUMBNAIL:", "thumbnail"],
  ["HOOK:", "hook"],
  ["ON SCREEN:", "onScreen"],
  ["CTA:", "cta"],
  ["SHOT LIST:", "shots"],
] as const;

type Field = (typeof LABELS)[number][1];

/** THUMBNAIL PROPS must be tested before THUMBNAIL, or the longer label never matches. */
function labelAt(line: string): { field: Field; rest: string } | null {
  const upper = line.toUpperCase();
  for (const [label, field] of LABELS) {
    if (upper.startsWith(label)) return { field, rest: line.slice(label.length).trim() };
  }
  return null;
}

export function parseFilmScript(card: {
  id: string;
  title: string;
  platform: string | null;
  format: string | null;
  script: string | null;
  notes: string | null;
  source: string | null;
}): FilmScript {
  const parts: Record<string, string[]> = {};
  const spoken: string[] = [];
  let current: Field | null = null;

  for (const raw of (card.script ?? "").split("\n")) {
    const line = raw.trimEnd();
    const hit = labelAt(line.trim());
    if (hit) {
      current = hit.field;
      (parts[current] ??= []).push(hit.rest);
      continue;
    }
    // A blank line ends a single-line label (hook, cta) but not the shot list, whose entries
    // continue over many lines. The blank still has to reach the spoken body, because that is what
    // separates one beat from the next: swallowing it here collapsed a whole script into one
    // paragraph, which is precisely the thing that makes it unreadable while talking.
    if (!line.trim()) {
      if (current === "shots") continue;
      current = null;
      spoken.push("");
      continue;
    }
    if (current === "shots") {
      (parts.shots ??= []).push(line.trim());
      continue;
    }
    if (current === null) spoken.push(line);
    else (parts[current] ??= []).push(line.trim());
  }

  const one = (field: Field): string | null => {
    const v = (parts[field] ?? []).filter(Boolean).join(" ").trim();
    return v || null;
  };

  return {
    id: card.id,
    title: card.title,
    platform: card.platform,
    format: card.format,
    source: card.source,
    subject: card.notes?.match(/^Subject:\s*(.+)$/m)?.[1]?.trim() ?? null,
    videoTitle: one("videoTitle"),
    thumbnail: one("thumbnail"),
    thumbnailProps: one("thumbnailProps"),
    hook: one("hook") ?? "",
    onScreen: one("onScreen"),
    cta: one("cta"),
    // Beats are the paragraphs as written: blank lines separate them, which is how the script was
    // asked for and how it is spoken. The hook is dropped from the front, because scripts are
    // written with the hook AS their opening line and it is already the biggest thing on the page:
    // left in, the first thing you read while recording is the same sentence twice.
    beats: withoutTrailingCta(
      withoutLeadingHook(
        spoken
          .join("\n")
          .split(/\n{2,}/)
          .map((b) => b.trim())
          .filter(Boolean),
        one("hook") ?? "",
      ),
      one("cta") ?? "",
    ),
    shots: (parts.shots ?? [])
      .map((s) => s.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean),
  };
}

/** Loose comparison, so punctuation or casing differences between the hook line and the script's
    opening line do not leave the duplicate on screen. */
const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

function withoutLeadingHook(beats: string[], hook: string): string[] {
  if (!hook || beats.length === 0) return beats;
  const [first, ...rest] = beats;
  const lines = first.split("\n");
  if (bare(lines[0]) !== bare(hook)) return beats;
  const remainder = lines.slice(1).join("\n").trim();
  return remainder ? [remainder, ...rest] : rest;
}

/** The mirror of the hook problem, at the other end: the ask is written as the script's closing
    line and also shown in its own block, so it reads twice while recording. */
function withoutTrailingCta(beats: string[], cta: string): string[] {
  if (!cta || beats.length === 0) return beats;
  const rest = beats.slice(0, -1);
  const last = beats[beats.length - 1];
  const lines = last.split("\n");
  if (bare(lines[lines.length - 1]) !== bare(cta)) return beats;
  const remainder = lines.slice(0, -1).join("\n").trim();
  return remainder ? [...rest, remainder] : rest;
}

/**
 * One beat broken into the lines you actually say.
 *
 * Not every script arrives with line breaks between beats: the weaker fallback model writes a
 * single 130-word paragraph, and nine of the first nineteen cards came out that way. A wall of text
 * is unreadable when you are talking to a camera at the same time, so each sentence gets its own
 * line here, which is how a teleprompter presents words. Written beats are still kept apart, so a
 * script that DID come with structure keeps it.
 */
export function toLines(beat: string): string[] {
  return beat
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z"'“‘])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Roughly how long the spoken words take out loud, at a natural 150 words a minute. Shown so a
    reel that has quietly become two minutes long is obvious before it is filmed, not after. */
export function speakingSeconds(beats: string[]): number {
  const words = beats.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.round((words / 150) * 60);
}

export function readingLength(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
