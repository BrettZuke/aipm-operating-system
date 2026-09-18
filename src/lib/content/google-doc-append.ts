// Server-side Google Docs delivery for approved scripts. This is the ONLY place that talks to the
// Google Docs API; all of the request math is pure and unit-tested in google-doc.ts. Authenticates
// as the same service account the dashboard already uses for GA4 (GOOGLE_SERVICE_ACCOUNT_JSON), so
// no new secret is introduced. That SA cannot CREATE docs (Drive quota); it can only edit a doc a
// customer has explicitly shared edit-access with it, which is exactly the connect flow in Settings.
//
// Contract: this function NEVER throws. Every failure path (no SA configured, no doc connected,
// doc not shared, API error) returns a typed result so the caller can record it and show a small
// non-blocking notice. A move into Filming must never be blocked by a Doc problem.

import type { docs_v1 } from "googleapis";
import {
  buildApprovedScriptBlock,
  buildAppendRequests,
  docHasApprovedSection,
  type DocScriptCard,
} from "./google-doc";

export type AppendResult = { ok: true } | { ok: false; error: string };

// The analytics/Docs service account's email. NOT a secret: it exists to be shared, so the
// Settings UI surfaces it for the customer to grant the Doc to. Null only if the env is unset or
// malformed, in which case the UI falls back to "ask us for the email" copy.
export function googleServiceAccountEmail(): string | null {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    return (JSON.parse(raw) as { client_email?: string }).client_email ?? null;
  } catch {
    return null;
  }
}

function serviceAccountCreds(): { client_email: string; private_key: string } | null {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    const c = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!c.client_email || !c.private_key) return null;
    // Env-stored keys carry literal \n; the JWT signer needs real newlines (mirrors ga4.ts).
    return { client_email: c.client_email, private_key: c.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

// Concatenate every text run in a body's structural content, so we can check for the section
// heading without a second API call.
function bodyText(content: docs_v1.Schema$StructuralElement[] | undefined): string {
  let out = "";
  for (const el of content ?? []) {
    for (const pe of el.paragraph?.elements ?? []) {
      out += pe.textRun?.content ?? "";
    }
  }
  return out;
}

// The last structural element's endIndex is the position just past the body's final newline; we
// insert one char before it (Docs reserves index 0/1), matching the Python appender's tab_end - 1.
function bodyEndIndex(content: docs_v1.Schema$StructuralElement[] | undefined): number {
  const last = (content ?? [])[(content?.length ?? 0) - 1];
  const end = last?.endIndex ?? 2;
  return Math.max(1, end - 1);
}

// Depth-first search for the first tab that actually carries body content. Doc "tabs" are a newer
// feature; a classic doc has none. The URL's ?tab= id is deliberately ignored (a shared-URL tab id
// is not reliably the target tab), so we always take the document's first real tab, or the plain body.
function firstDocumentTab(tabs: docs_v1.Schema$Tab[] | undefined): docs_v1.Schema$Tab | null {
  for (const t of tabs ?? []) {
    if (t.documentTab?.body?.content) return t;
    const child = firstDocumentTab(t.childTabs);
    if (child) return child;
  }
  return null;
}

/**
 * Append one approved script to the end of the connected Doc, under an "Approved Scripts" section.
 * `dryRun` builds and validates everything (auth, doc fetch, request math) but skips the mutating
 * batchUpdate, used to prove the pipeline against a real doc without writing to it.
 */
export async function appendScriptToDoc(args: {
  docId: string;
  card: DocScriptCard;
  at: string;
  dryRun?: boolean;
}): Promise<AppendResult> {
  const creds = serviceAccountCreds();
  if (!creds) return { ok: false, error: "Google is not configured on the server yet." };
  if (!args.docId) return { ok: false, error: "No Google Doc is connected for this workspace." };

  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/documents"],
    });
    const docs = google.docs({ version: "v1", auth });

    const doc = await docs.documents.get({ documentId: args.docId, includeTabsContent: true });
    const tab = firstDocumentTab(doc.data.tabs);
    const content = tab ? tab.documentTab?.body?.content : doc.data.body?.content;
    const tabId = tab?.tabProperties?.tabId ?? null;

    const insertIndex = bodyEndIndex(content);
    const hasContent = insertIndex > 1;
    const block = buildApprovedScriptBlock(args.card, args.at, {
      withSectionHeading: !docHasApprovedSection(bodyText(content)),
      lead: hasContent ? "\n" : "",
    });
    const requests = buildAppendRequests({ tabId, insertIndex, block });

    if (args.dryRun) return { ok: true };

    await docs.documents.batchUpdate({
      documentId: args.docId,
      requestBody: { requests: requests as docs_v1.Schema$Request[] },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyDocsError(e) };
  }
}

// Turn a Google API error into copy an operator can act on. The two common cases are a doc that was
// never shared with the service account (403/404) and a plain connectivity/API error.
function friendlyDocsError(e: unknown): string {
  const status =
    (e as { status?: number; code?: number; response?: { status?: number } })?.status ??
    (e as { code?: number })?.code ??
    (e as { response?: { status?: number } })?.response?.status ??
    0;
  if (status === 403 || status === 404) {
    return "Settoku can't open that Doc. Share it with edit access to the service account email in Settings, then try again.";
  }
  const msg = e instanceof Error ? e.message : "Could not reach Google Docs.";
  return `Couldn't send to the Doc: ${msg.slice(0, 140)}`;
}
