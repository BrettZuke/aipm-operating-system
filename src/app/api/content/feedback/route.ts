/**
 * One-click script feedback from the daily email.
 *
 * The owner reads their scripts in their inbox. Without this the verdict lives only in their head:
 * the good one gets recorded, the bad ones are forgotten, and the machine pitches the same rejected
 * angles the next morning. Every click here is training data for the strategist.
 *
 * GET  /api/content/feedback?card=<uuid>&v=accepted|rejected|revise&t=<hmac>
 *      Records the verdict and returns a confirmation page. No login: the HMAC is the credential.
 * POST same URL with form field `reason`
 *      Attaches an optional sentence to the verdict just recorded.
 *
 * Deliberately GET for the first click, because an email client will only ever issue a GET on a
 * link. That makes it reachable by link prefetchers, so every action is idempotent (one row per
 * card, upserted) and the confirmation page offers the other two verdicts, making any accidental
 * click a single click to correct rather than something the reader has to go hunting for.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyFeedback, signFeedback, type FeedbackVerdict } from "@/lib/content/feedback-token";
import { appendFeedbackDoc, verdictEntry } from "@/lib/content/feedback-doc";

export const dynamic = "force-dynamic";

const VERDICT_COPY: Record<FeedbackVerdict, { title: string; sub: string; accent: string }> = {
  accepted: {
    title: "Queued to record",
    sub: "Moved to the To record column on your board.",
    accent: "#1E7A46",
  },
  rejected: {
    title: "Marked not for you",
    sub: "Removed from your board. The strategist will stop pitching this angle.",
    accent: "#8A4B3C",
  },
  revise: {
    title: "Marked for a rewrite",
    sub: "Moved back to Unscripted with your note. Tell it what to fix and the next pass will use that.",
    accent: "#8A6D2F",
  },
};

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

function page(opts: {
  cardId: string;
  verdict: FeedbackVerdict;
  title: string;
  reasonSaved?: boolean;
}): NextResponse {
  const copy = VERDICT_COPY[opts.verdict];
  // Links for the OTHER two verdicts, so a misclick is one click to fix.
  const others = (["accepted", "rejected", "revise"] as FeedbackVerdict[])
    .filter((v) => v !== opts.verdict)
    .map(
      (v) =>
        `<a href="/api/content/feedback?card=${opts.cardId}&v=${v}&t=${signFeedback(opts.cardId, v)}"
            style="color:#4C5247;text-decoration:underline;font-size:14px;margin:0 10px;">
           ${v === "accepted" ? "Actually, I'll record it" : v === "rejected" ? "Actually, not for me" : "Actually, needs a rewrite"}
         </a>`,
    )
    .join("");

  const reasonBox = opts.reasonSaved
    ? `<p style="color:#1E7A46;font-size:15px;margin:18px 0 0 0;">Saved. That goes to the strategist.</p>`
    : `<form method="POST" action="/api/content/feedback?card=${opts.cardId}&v=${opts.verdict}&t=${signFeedback(opts.cardId, opts.verdict)}"
             style="margin:22px 0 0 0;">
         <label style="display:block;font-size:13px;color:#4C5247;margin-bottom:6px;">
           Anything to add? Optional.
         </label>
         <textarea name="reason" rows="3" placeholder="e.g. hook is weak, wrong angle, not how I talk"
           style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #E4DDCD;border-radius:8px;
                  font-family:inherit;font-size:14px;background:#FCFAF3;color:#1E211C;resize:vertical;"></textarea>
         <button type="submit"
           style="margin-top:10px;background:#1E7A46;color:#FCFAF3;border:0;padding:10px 20px;
                  border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;">Save</button>
       </form>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${copy.title}</title></head>
<body style="margin:0;background:#F6F1E7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <div style="background:#FCFAF3;border:1px solid #E4DDCD;border-radius:14px;padding:28px;">
      <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${copy.accent};font-weight:700;">
        ${copy.title}
      </div>
      <div style="font-size:21px;font-weight:700;color:#1E211C;margin:8px 0 6px 0;line-height:1.3;">
        ${opts.title}
      </div>
      <div style="font-size:15px;color:#4C5247;">${copy.sub}</div>
      ${reasonBox}
    </div>
    <div style="text-align:center;margin-top:18px;">${others}</div>
    <div style="text-align:center;margin-top:22px;">
      <a href="/content?tab=board" style="color:#1E7A46;font-size:14px;">Open the board</a>
    </div>
  </div>
</body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function fail(message: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1"><title>Link problem</title></head>
     <body style="margin:0;background:#F6F1E7;font-family:-apple-system,sans-serif;">
       <div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
         <div style="font-size:19px;color:#1E211C;font-weight:600;">${message}</div>
         <p style="color:#4C5247;font-size:15px;">Open the board and set it there instead.</p>
         <a href="/content?tab=board" style="color:#1E7A46;">Open the board</a>
       </div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function record(req: NextRequest, reason: string | null): Promise<NextResponse> {
  const url = new URL(req.url);
  const cardId = url.searchParams.get("card") ?? "";
  const verdict = url.searchParams.get("v") ?? "";
  const token = url.searchParams.get("t");

  if (!cardId || !verifyFeedback(cardId, verdict, token)) {
    return fail("That link is not valid.", 403);
  }

  const sb = admin();
  // The card is the source of truth for which workspace this belongs to. Never trust an agency id
  // from the URL: that would let a valid token for one card write a row into another tenant.
  const { data: card } = await sb
    .from("content_cards")
    .select("id, agency_id, title, hook, platform, stage, notes")
    .eq("id", cardId)
    .maybeSingle();

  if (!card) return fail("That script no longer exists.", 404);

  const c = card as {
    id: string; agency_id: string; title: string | null;
    hook: string | null; platform: string | null; stage: string; notes: string | null;
  };

  const row: Record<string, unknown> = {
    agency_id: c.agency_id,
    card_id: c.id,
    verdict,
    card_title: c.title,
    card_hook: c.hook,
    card_platform: c.platform,
    source: "email",
  };
  if (reason !== null) row.reason = reason;

  const { error } = await sb
    .from("content_feedback")
    .upsert(row, { onConflict: "agency_id,card_id" });
  if (error) return fail("Could not save that.", 500);

  // The verdict also goes into the Brain document the writer reads. Without this the click is
  // recorded and never seen again, which is what used to happen to every verdict sent from an
  // inbox. Written after the row so a doc failure cannot lose the verdict itself, and not fatal:
  // the operator's click still counts even if the lesson could not be appended.
  const docErr = await appendFeedbackDoc(
    sb,
    c.agency_id,
    verdictEntry(c, verdict as FeedbackVerdict, reason, new Date()),
    "email-feedback-button",
    c.id,
  );
  if (docErr) console.error(`[content-feedback] could not teach the writer: ${docErr}`);

  // Each verdict now MOVES the card, not just records an opinion. Before this only "accepted" did
  // anything, so a binned script sat in 'scripted' forever and the board filled with pieces the
  // operator had already said no to. Guarded on stage: a card already filming or posted has moved
  // past this decision and must not be dragged backwards by a stale link in an old email.
  if (c.stage === "scripted") {
    if (verdict === "accepted") {
      await sb.from("content_cards").update({ stage: "to_record" }).eq("id", c.id);
    } else if (verdict === "rejected") {
      // Deleted, not archived. The lesson is already saved to the Brain above, which is the part
      // worth keeping; the script itself is dead and leaving it on the board is just clutter.
      await sb.from("content_cards").delete().eq("id", c.id).eq("agency_id", c.agency_id);
    } else if (verdict === "revise") {
      // Back to unscripted with the note attached, so it is visibly waiting to be redone rather
      // than sitting among finished work. The reason is in the Brain either way, so the next
      // write of this subject is informed even if this card is never picked up again.
      const note = reason?.trim() ? `\n\nNeeds a rewrite: ${reason.trim()}` : "\n\nNeeds a rewrite.";
      await sb.from("content_cards")
        .update({ stage: "unscripted", notes: `${c.notes ?? ""}${note}` })
        .eq("id", c.id).eq("agency_id", c.agency_id);
    }
  }

  return page({
    cardId: c.id,
    verdict: verdict as FeedbackVerdict,
    title: c.title ?? "This script",
    reasonSaved: reason !== null && reason.length > 0,
  });
}

export async function GET(req: NextRequest) {
  return record(req, null);
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const reason = (form?.get("reason") ?? "").toString().trim().slice(0, 2000);
  return record(req, reason);
}
