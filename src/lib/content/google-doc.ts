// Pure, dependency-free logic for delivering an approved script into a connected Google Doc.
// Ported from the proven AW appender (execution/append_md_to_gdoc_tab.py): the same "build a text
// block, then a set of Docs batchUpdate requests that style ranges within it" shape, but typed and
// unit-tested here (vitest coverage counts src/lib/**). The live Google I/O lives in the sibling
// server module google-doc-append.ts; everything in THIS file is a pure function so the request
// math can be tested without a network call or a service account.
//
// Doc-tab lesson carried over from the Python tool: a tab id copied from a shared URL is NOT
// reliably the target tab, so the append targets the document's FIRST (default) tab, or the plain
// body on a classic doc, and never trusts a tab id pasted by the user.

export const APPROVED_SCRIPTS_HEADING = "Approved Scripts";

// The editable content the board hands to the Doc: only these three fields are written.
export interface DocScriptCard {
  title: string;
  hook: string | null;
  script: string | null;
}

// A style span, offset relative to the START of the inserted text block (0-based). The compose
// step (buildAppendRequests) shifts these by the live insert index before they hit the API.
export type DocStyleOp =
  | { kind: "heading2" | "heading3"; start: number; end: number }
  | { kind: "bold"; start: number; end: number };

export interface DocBlock {
  text: string;
  ops: DocStyleOp[];
}

// A single Docs API request. Typed loosely on purpose so this module stays free of the heavy
// googleapis types; the server module casts it at the batchUpdate boundary.
export type DocsRequest = Record<string, unknown>;

const DOC_ID_RE = /\/document\/d\/([a-zA-Z0-9_-]+)/;
const SHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
const FOLDER_ID_RE = /\/folders\/([a-zA-Z0-9_-]+)/;
const FOLDER_QUERY_RE = /[?&]id=([a-zA-Z0-9_-]+)/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{20,}$/;

// Accept either a full Google Docs URL or a bare document id and return the id. Returns null for
// anything that is not a plausible Doc reference, so the settings action can reject a bad paste.
export function extractGoogleDocId(input: string): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(DOC_ID_RE);
  if (m) return m[1];
  if (BARE_ID_RE.test(s)) return s;
  return null;
}

// A Google Sheets URL (docs.google.com/spreadsheets/d/<id>) or a bare id. Rejects a Docs URL so a
// link pasted into the wrong field is caught, not silently mis-stored.
export function extractGoogleSheetId(input: string): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(SHEET_ID_RE);
  if (m) return m[1];
  if (BARE_ID_RE.test(s) && !s.includes("/")) return s;
  return null;
}

// A Google Drive folder URL (drive.google.com/drive/folders/<id>, or an open?id=<id> link) or a
// bare id. Rejects a file URL so a Doc/Sheet link in the folder field is caught.
export function extractGoogleFolderId(input: string): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(FOLDER_ID_RE) ?? s.match(FOLDER_QUERY_RE);
  if (m) return m[1];
  if (BARE_ID_RE.test(s) && !s.includes("/")) return s;
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Deterministic, timezone-independent stamp for the "Approved …" line. Formatted in UTC so the
// exact same server ISO string always renders the exact same words (tests never flake on TZ).
export function formatApprovedAt(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "Approved";
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `Approved ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} at ${hh}:${mm} UTC`;
}

// Does the doc already carry the "Approved Scripts" section? Passed the doc's plain text; used to
// write the section heading exactly once (first append) instead of on every card.
export function docHasApprovedSection(fullText: string): boolean {
  return (fullText ?? "").includes(APPROVED_SCRIPTS_HEADING);
}

type Line = { text: string; block?: "heading2" | "heading3"; bold?: [number, number][] };

// Assemble ordered lines into one text block plus range-relative style ops, joining lines with a
// single newline (each becomes its own paragraph) and shifting every op by the running offset.
function assemble(lines: Line[], lead: string): DocBlock {
  const ops: DocStyleOp[] = [];
  const parts: string[] = [];
  let offset = lead.length; // the lead separator carries no styling
  lines.forEach((ln, i) => {
    const start = offset;
    parts.push(ln.text);
    if (ln.block) ops.push({ kind: ln.block, start, end: start + ln.text.length });
    for (const [bs, be] of ln.bold ?? []) ops.push({ kind: "bold", start: start + bs, end: start + be });
    offset += ln.text.length;
    if (i < lines.length - 1) offset += 1; // the "\n" that joins this line to the next
  });
  return { text: lead + parts.join("\n"), ops };
}

// Build the text + style ops for one approved card. Order (per the spec): the "Approved Scripts"
// section heading (only when the doc does not already have it), the card title as a heading, the
// hook, the full script, then the timestamp line. `lead` is a separator (e.g. "\n") prepended when
// the doc already has content so the new block starts on its own paragraph rather than merging
// with the previous last line.
export function buildApprovedScriptBlock(
  card: DocScriptCard,
  at: string,
  opts: { withSectionHeading: boolean; lead?: string },
): DocBlock {
  const lines: Line[] = [];
  if (opts.withSectionHeading) lines.push({ text: APPROVED_SCRIPTS_HEADING, block: "heading2" });
  lines.push({ text: card.title, block: "heading3" });
  const hook = (card.hook ?? "").trim();
  if (hook) lines.push({ text: `Hook: ${hook}`, bold: [[0, 5]] }); // bold the "Hook:" label
  const script = (card.script ?? "").trim();
  if (script) lines.push({ text: script }); // full script, internal newlines become paragraphs
  lines.push({ text: formatApprovedAt(at), bold: [[0, 8]] }); // bold "Approved"
  return assemble(lines, opts.lead ?? "");
}

// Compose the Docs batchUpdate requests: one insertText at the live index, then the style ops
// shifted by that index. When tabId is null the doc is a classic single-body doc and tabId is
// omitted from every range (the API then operates on the default body). Mirrors the Python
// build_append_requests, including the `end <= start` guard.
export function buildAppendRequests(params: {
  tabId: string | null;
  insertIndex: number;
  block: DocBlock;
}): DocsRequest[] {
  const { tabId, insertIndex, block } = params;
  const location = tabId ? { tabId, index: insertIndex } : { index: insertIndex };
  const reqs: DocsRequest[] = [{ insertText: { location, text: block.text } }];
  for (const op of block.ops) {
    const s = op.start + insertIndex;
    const e = op.end + insertIndex;
    if (e <= s) continue;
    const range = tabId ? { startIndex: s, endIndex: e, tabId } : { startIndex: s, endIndex: e };
    if (op.kind === "heading2" || op.kind === "heading3") {
      reqs.push({
        updateParagraphStyle: {
          range,
          paragraphStyle: { namedStyleType: op.kind === "heading2" ? "HEADING_2" : "HEADING_3" },
          fields: "namedStyleType",
        },
      });
    } else {
      reqs.push({ updateTextStyle: { range, textStyle: { bold: true }, fields: "bold" } });
    }
  }
  return reqs;
}
