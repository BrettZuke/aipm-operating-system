/**
 * House style, and the feedback entry the writer reads back.
 *
 * These three things sit together because they are all about what a script looks like by the time
 * a human sees it. `clean` is the guard that runs on every piece of model output before it reaches
 * the board: a model emits em dashes, arrows, curly quotes and stage directions no matter what the
 * prompt says, so house style is enforced in code rather than asked for in words.
 *
 * `feedbackEntry` is the other end of the same loop. Binning a script writes one bullet into the
 * knowledge doc named by FEEDBACK_DOC, and the writer reads the newest entries before it picks an
 * angle and again before it writes. The entry has to carry enough for the model to know what to
 * avoid (the subject, the pattern, the actual hook) with the reason in the operator's own words.
 */

/** The knowledge doc rejections are written into. Create it at /knowledge with this exact title. */
export const FEEDBACK_DOC = "Script Feedback";

export function clean(text: string): string {
  return (text ?? "")
    // Unicode lookalikes for plain ASCII. A faster model started returning non-breaking hyphens
    // (U+2011) and curly quotes, which LOOK like normal punctuation on screen and slip past a
    // dash check entirely: "cold‑call", "seven‑minute". Normalised before anything else
    // so every rule below only ever sees ASCII.
    .replace(/[‐‑‒⁃−]/g, "-")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[    ]/g, " ")
    // Stage directions a model adds unasked. The ON SCREEN field was removed precisely because it
    // restated the hook; this is the same noise wearing a different hat.
    .replace(/\[\s*on[- ]?screen\s*:[^\]]*\]/gi, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*[←-⇿➔➡]\s*/g, " to ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    // Doubled words. "an an ad problem" reached a board once: invisible when you read for meaning,
    // glaring when you read it aloud, which is exactly how a script gets used.
    .replace(/\b(\w+)(\s+)\1\b/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export const sanitize = clean;

/** One bullet per rejection, so the reader can take the newest N without parsing. */
export function feedbackEntry(
  card: { title: string; hook: string | null; platform: string | null; notes: string | null },
  reason: string,
  today: Date,
): string {
  const notes = card.notes ?? "";
  const subject = notes.match(/^Subject:\s*(.+)$/m)?.[1]?.trim();
  const pattern = notes.match(/^Pattern:\s*(.+)$/m)?.[1]?.trim();
  const what = [
    card.platform === "yt" ? "YouTube piece" : "reel",
    subject ? `about ${subject}` : null,
    pattern ? `running ${pattern}` : null,
  ].filter(Boolean).join(" ");
  const hook = sanitize(card.hook || card.title).slice(0, 180);
  return [
    `- ${today.toISOString().slice(0, 10)}, a ${what}.`,
    `  Hook was: "${hook}"`,
    `  Binned it and said: ${sanitize(reason).slice(0, 500)}`,
  ].join("\n");
}
