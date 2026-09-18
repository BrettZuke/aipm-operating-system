/**
 * The one place a verdict on a script becomes something the writer will actually read.
 *
 * There are two feedback surfaces and they used to disagree about what feedback was for. The
 * Record tab wrote rejections into a Brain document, which the writer reads before choosing an
 * angle and again before writing. The email buttons wrote a row into `content_feedback`, which
 * nothing reads at all, so every verdict clicked from an inbox was recorded and then ignored.
 *
 * That matters more the moment a second operator arrives: someone who gets their scripts as a
 * weekly email and rarely opens the app, for whom the email buttons are the ONLY way to teach the
 * machine. Both surfaces now append here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { FEEDBACK_DOC } from "./house-style";

const INTRO = [
  `# ${FEEDBACK_DOC}`,
  "",
  "Every verdict on a script, in the operator's own words. The writer reads the newest of these",
  "before choosing an angle and again before writing, so this file is how taste reaches the",
  "machine. Edit or delete anything here that no longer reflects what is wanted.",
  "",
].join("\n");

/**
 * Append one entry, creating the document on first use.
 *
 * Returns an error string rather than throwing, because both callers are user-facing actions that
 * should report a problem rather than lose the click.
 */
export async function appendFeedbackDoc(
  sb: SupabaseClient,
  agencyId: string,
  entry: string,
  writtenBy: string,
  /** Drop any earlier entry for this card before appending. The email flow records a verdict on
      the first click and the typed reason a moment later, which without this leaves two entries
      for one script: the bare verdict and then the useful one. The writer only reads the newest
      handful, so a duplicate costs real memory. */
  replaceCardId?: string,
  attempt = 1,
): Promise<string | null> {
  const line = entry.trim();
  if (!line) return "Nothing to record";

  const { data: doc, error: readErr } = await sb
    .from("knowledge_docs").select("id, content_text")
    .eq("agency_id", agencyId).eq("title", FEEDBACK_DOC).maybeSingle();
  if (readErr) return readErr.message;

  let existing = (doc as { content_text: string | null } | null)?.content_text ?? "";
  const before = existing;
  if (replaceCardId && existing) {
    existing = existing
      .split("\n")
      .filter((l) => !l.includes(cardMarker(replaceCardId)))
      .join("\n");
  }
  const content = `${(existing || INTRO).replace(/\s+$/, "")}\n\n${line}\n`;

  // Compare-and-set on the text we read. Four verdicts clicked in a row, each followed by a typed
  // reason, is eight read-modify-writes on ONE row: two overlapped and one silently overwrote the
  // other, losing a note the operator had taken the trouble to write. If the row moved under us,
  // read it again and re-apply rather than clobbering whatever arrived in between.
  const saved = doc
    ? await sb.from("knowledge_docs").update({ content_text: content })
        .eq("id", (doc as { id: string }).id).eq("agency_id", agencyId)
        .eq("content_text", before).select("id")
    : await sb.from("knowledge_docs").insert({
        agency_id: agencyId,
        title: FEEDBACK_DOC,
        source_type: "content_strategy",
        content_text: content,
        metadata: { written_by: writtenBy },
      });
  if (saved.error) return saved.error.message;
  // A zero-row update means someone else wrote between our read and our write. One retry is
  // enough: the second read includes their entry, so both survive.
  if (Array.isArray(saved.data) && saved.data.length === 0 && doc && attempt < 2) {
    return appendFeedbackDoc(sb, agencyId, entry, writtenBy, replaceCardId, attempt + 1);
  }
  return null;
}

/** A hidden anchor so an entry can be found and replaced later without matching on its prose. */
export function cardMarker(cardId: string): string {
  return `<!--card:${cardId}-->`;
}

/**
 * One line describing what was decided about a script.
 *
 * An accepted script is recorded too, not just a rejected one. Only ever being told what to avoid
 * teaches a writer to be cautious rather than good, and the operator clicking "I'll record this"
 * is the strongest signal available about what actually works.
 */
export function verdictEntry(
  card: { id?: string; title: string | null; hook: string | null; platform: string | null; notes?: string | null },
  verdict: "accepted" | "rejected" | "revise",
  reason: string | null,
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

  const verb = verdict === "accepted"
    ? "KEEPING"
    : verdict === "revise"
      ? "WANTS A REWRITE OF"
      : "BINNED";
  const date = today.toISOString().slice(0, 10);
  const hook = (card.hook ?? card.title ?? "").trim();
  const because = reason?.trim() ? ` Reason: "${reason.trim()}"` : "";
  const anchor = card.id ? ` ${cardMarker(card.id)}` : "";
  return `- [${date}] ${verb} a ${what}. Hook was "${hook}".${because}${anchor}`;
}
