import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { notifyDealClosed } from "@/lib/integrations/slack";
import { webhookError } from "@/lib/webhook-error";

/**
 * Typeform → POST → this endpoint
 *
 * Handles two of the coach's forms:
 *   - RHuLfVyL  → [Closer] Post Call Form  → creates calls + deals + transactions
 *   - LZVnS6sR  → your agency Onboarding → creates client w/ market research data
 *
 * Auth: Typeform signs each payload with HMAC-SHA256 using TYPEFORM_WEBHOOK_SECRET.
 */

const FORM_ID_POST_CALL  = "RHuLfVyL";
const FORM_ID_ONBOARDING = "LZVnS6sR";

// Note: Typeform contact_info fields split into sub-fields in actual responses.
// IDs below match what comes back in submissions.
const POST_CALL_FIELDS = {
  // Contact info sub-fields
  leadName:       "kmiDXJdDlcS0",
  leadEmail:      "3fMQ76TlXlSj",
  leadPhone:      "1xEbO78j7BYh",
  // Rest
  closerName:     "OOJO5M4Goy7S",
  outcome:        "Io4WHtq2sJ40",
  gap:            "7rBwqD3yxLVY",
  objection:      "mD5Qr9xMoMBK",
  struggled:      "ErEw4nLM6Ree",
  improvement:    "qbviLx1TZtZb",
  marketingFeedback: "4AM82qE5iRNd",
  presentedOffer: "j8Gq4ZvxXd0h",
  cashCollected:  "Y17fo4OBi4Gk",
  contractValue:  "9a3b0MttXLes",
  callLink:       "X6thFWkTO2PU",
  followUpScript: "tpfakZz3CNUr",
  notes:          "qK4AoDueErUq",
};

const ONBOARDING_FIELDS = {
  firstName:       "mFq5Nab84RDg",
  lastName:        "JGzjQgfbaHPS",
  firstTouchPoint: "TwLoUQjuJsZc",
  whyMe:           "SRftHUXtwjFN",
  timeToWork:      "ERnzgohza1SM",
  whenSold:        "eFgwhO2X6FWZ",
  vsCompetitors:   "XHgncGa2OsMG",
  improveJoinEarlier: "MJIWlFaHrsRD",
  finalDecision:   "mLwSMfr5krEL",
  contentPieces:   "10F9XTH3BxU2",
  convictionScale: "8Q6LcmKK7XTw",
  fears:           "FmTzZrMriop3",
  hesitations:     "jeLZ9AgSbcje",
  wouldJoinSooner: "m4T2YZud02hi",
  wouldPayMore:    "WndpBmHAXwvd",
  whatMakesPayMore:"c2yoc9Td1KL2",
  traitsOfMine:    "3XbZoZC9CLkb",
  anythingElse:    "B581TzdIVbka",
};

// Outcome → call outcome enum mapping
const OUTCOME_MAP: Record<string, string> = {
  "PIF":                  "won",
  "Financed via Fanbasis":"won",
  "Financed In House":    "won",
  "Put Deposit":          "won",
  "Booked Follow Up":     "callback",
  "No Close":             "lost",
  "Financially DQ'd":     "lost",
  "No Show":              "no_show",
};

// Closer name → email lookup (configurable via env or DB later)
const CLOSER_EMAIL_MAP: Record<string, string> = {
  // Map each closer's display name to their email (or load from DB).
  "Example Closer": "closer@example.com",
};

// Test/false submissions to ignore
const BLOCKLIST_LEAD_EMAILS = new Set([
  "test@example.com",
]);

type TypeformAnswer = {
  field: { id: string; type: string };
  type: string;
  text?: string;
  choice?: { label: string };
  choices?: { labels: string[] };
  number?: number;
  boolean?: boolean;
  email?: string;
  phone_number?: string;
  url?: string;
  date?: string;
};

type TypeformPayload = {
  event_id: string;
  event_type: "form_response";
  form_response: {
    form_id: string;
    token: string;
    submitted_at: string;
    definition: { id: string; title: string };
    answers?: TypeformAnswer[];
  };
};

function findAnswer(answers: TypeformAnswer[] | undefined, fieldId: string): TypeformAnswer | undefined {
  return answers?.find(a => a.field.id === fieldId);
}

function answerText(a: TypeformAnswer | undefined): string | null {
  if (!a) return null;
  if (a.text) return a.text;
  if (a.choice) return a.choice.label;
  if (a.choices) return a.choices.labels.join(", ");
  if (a.email) return a.email;
  if (a.phone_number) return a.phone_number;
  if (a.url) return a.url;
  if (a.date) return a.date;
  if (typeof a.number === "number") return String(a.number);
  if (typeof a.boolean === "boolean") return a.boolean ? "yes" : "no";
  return null;
}

function answerNumber(a: TypeformAnswer | undefined): number | null {
  if (!a) return null;
  if (typeof a.number === "number") return a.number;
  if (a.text) { const n = Number(a.text); return Number.isNaN(n) ? null : n; }
  return null;
}

function answerBool(a: TypeformAnswer | undefined): boolean {
  if (!a) return false;
  if (typeof a.boolean === "boolean") return a.boolean;
  if (a.text) return ["yes","y","true","1"].includes(a.text.toLowerCase());
  if (a.choice) return ["yes","y"].includes(a.choice.label.toLowerCase());
  return false;
}

// Verify Typeform's HMAC signature (Typeform-Signature header)
function verifyTypeformSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const provided = signatureHeader.slice(prefix.length);
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  // Typeform uses base64 — compare with timing-safe equal
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.TYPEFORM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "TYPEFORM_WEBHOOK_SECRET not configured" }, { status: 500 });

  // Read raw body for signature verification
  const rawBody = await req.text();
  const sig = req.headers.get("typeform-signature");

  if (!verifyTypeformSignature(rawBody, sig, secret)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let payload: TypeformPayload;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  if (payload.event_type !== "form_response") {
    return NextResponse.json({ ok: true, action: "ignored", reason: "not a form_response event" });
  }

  const agencyId = process.env.FANBASIS_TARGET_AGENCY_ID;
  if (!agencyId) return NextResponse.json({ ok: false, error: "Target agency not configured" }, { status: 500 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const formId = payload.form_response.form_id;

  if (formId === FORM_ID_POST_CALL) {
    return handlePostCall(supabase, agencyId, payload);
  }
  if (formId === FORM_ID_ONBOARDING) {
    return handleOnboarding(supabase, agencyId, payload);
  }

  return NextResponse.json({ ok: true, action: "ignored", reason: `Unknown form: ${formId}` });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function handlePostCall(supabase: Sb, agencyId: string, payload: TypeformPayload) {
  const a = payload.form_response.answers ?? [];

  // Lead contact info — sub-fields, not parent contact_info
  const leadName  = answerText(findAnswer(a, POST_CALL_FIELDS.leadName));
  const leadEmail = answerText(findAnswer(a, POST_CALL_FIELDS.leadEmail));
  const leadPhone = answerText(findAnswer(a, POST_CALL_FIELDS.leadPhone));

  // Skip test/false submissions early
  if (leadEmail && BLOCKLIST_LEAD_EMAILS.has(leadEmail.toLowerCase())) {
    return NextResponse.json({ ok: true, action: "skipped_blocklist", email: leadEmail });
  }

  const closerLabel = answerText(findAnswer(a, POST_CALL_FIELDS.closerName));
  const closerEmail = closerLabel ? CLOSER_EMAIL_MAP[closerLabel] : null;

  const outcomeLabel = answerText(findAnswer(a, POST_CALL_FIELDS.outcome));
  const outcome = outcomeLabel ? OUTCOME_MAP[outcomeLabel] ?? "held" : "held";

  const cashCollected = answerNumber(findAnswer(a, POST_CALL_FIELDS.cashCollected)) ?? 0;
  const contractValue = answerNumber(findAnswer(a, POST_CALL_FIELDS.contractValue)) ?? 0;
  const presentedOffer = answerBool(findAnswer(a, POST_CALL_FIELDS.presentedOffer));

  // 1. Resolve closer member
  let memberId: string | null = null;
  if (closerEmail) {
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("email", closerEmail.toLowerCase()).maybeSingle();
    if (profile) {
      const { data: membership } = await supabase
        .from("agency_members").select("user_id")
        .eq("agency_id", agencyId).eq("user_id", profile.id).eq("status", "active").maybeSingle();
      if (membership) memberId = profile.id;
    }
  }

  // 2. Resolve / create the lead as a client
  let clientId: string | null = null;
  if (leadEmail) {
    const email = leadEmail.toLowerCase();
    const { data: existing } = await supabase
      .from("clients").select("id").eq("agency_id", agencyId).eq("email", email).maybeSingle();
    if (existing) {
      clientId = existing.id;
    } else {
      const { data: newClient } = await supabase
        .from("clients")
        .insert({
          agency_id: agencyId,
          name: leadName ?? email,
          email,
          status: outcome === "won" ? "active" : "lead",
          data: { phone: leadPhone, source: "closer_post_call_form" },
        })
        .select("id").single();
      clientId = newClient?.id ?? null;
    }
  }

  // 3. Insert the call
  const callDate = payload.form_response.submitted_at ? new Date(payload.form_response.submitted_at).toISOString() : new Date().toISOString();

  // Idempotency: Typeform re-delivers the same submission on timeout/retry. Skip if we've already
  // logged this form_response token (also backstopped by the DB unique index on agency_id+external_id).
  const { data: dupeCall } = await supabase
    .from("calls").select("id").eq("agency_id", agencyId).eq("external_id", payload.form_response.token).maybeSingle();
  if (dupeCall) {
    return NextResponse.json({ ok: true, action: "skipped_duplicate", call_id: dupeCall.id });
  }

  const { data: call, error: callError } = await supabase
    .from("calls")
    .insert({
      agency_id: agencyId,
      member_id: memberId,
      client_id: clientId,
      outcome,
      occurred_at: callDate,
      duration_sec: 0,
      notes: answerText(findAnswer(a, POST_CALL_FIELDS.notes)) ?? null,
      external_id: payload.form_response.token,
      data: {
        source: "closer_post_call_form",
        outcome_label: outcomeLabel,
        closer_name: closerLabel,
        gap: answerText(findAnswer(a, POST_CALL_FIELDS.gap)),
        objection: answerText(findAnswer(a, POST_CALL_FIELDS.objection)),
        struggled: answerText(findAnswer(a, POST_CALL_FIELDS.struggled)),
        improvement: answerText(findAnswer(a, POST_CALL_FIELDS.improvement)),
        marketing_feedback: answerText(findAnswer(a, POST_CALL_FIELDS.marketingFeedback)),
        presented_offer: presentedOffer,
        cash_collected: cashCollected,
        contract_value: contractValue,
        call_link: answerText(findAnswer(a, POST_CALL_FIELDS.callLink)),
        follow_up_script: answerText(findAnswer(a, POST_CALL_FIELDS.followUpScript)),
        typeform_token: payload.form_response.token,
      },
    })
    .select("id").single();

  if (callError) {
    // Concurrent re-delivery already inserted this submission — treat as an idempotent no-op.
    if (callError.code === "23505") {
      const { data: raced } = await supabase
        .from("calls").select("id").eq("agency_id", agencyId).eq("external_id", payload.form_response.token).maybeSingle();
      return NextResponse.json({ ok: true, action: "skipped_duplicate", call_id: raced?.id ?? null });
    }
    return webhookError("Call insert failed", callError, { extra: { raw_payload_form_id: payload.form_response.form_id } });
  }

  // 4. Insert deal if offer was presented + value > 0
  let dealId: string | null = null;
  if (presentedOffer && contractValue > 0) {
    const stage = outcome === "won" ? "closed_won"
                : outcome === "lost" ? "closed_lost"
                : outcome === "callback" ? "negotiation"
                : "proposal";
    const { data: deal } = await supabase
      .from("deals")
      .insert({
        agency_id: agencyId,
        client_id: clientId,
        owner_id: memberId,
        name: leadName ?? leadEmail ?? "New deal",
        stage,
        amount: contractValue,
        closed_at: ["closed_won", "closed_lost"].includes(stage) ? callDate : null,
        data: { outcome_label: outcomeLabel, cash_collected: cashCollected },
      })
      .select("id").single();
    dealId = deal?.id ?? null;
  }

  // NOTE: No transaction created here. FanBasis is the source of truth for cash.
  // The closer's reported cash_collected lives on the deal/call for context.

  // 5. Slack: post a "deal closed" message on win. Best-effort (don't fail the
  //    webhook if Slack 404s the channel). The FanBasis flow will fire its own
  //    "💰 payment received" message later when money actually lands.
  let slackPosted = false;
  if (outcome === "won" && contractValue > 0 && process.env.SLACK_WINS_CHANNEL) {
    try {
      const r = await notifyDealClosed({
        channel: process.env.SLACK_WINS_CHANNEL,
        clientName: leadName ?? leadEmail ?? "Unknown",
        amount: contractValue,
        closer: closerLabel ?? undefined,
        description: outcomeLabel ?? undefined,
      });
      slackPosted = r.ok;
    } catch { /* swallow */ }
  }

  return NextResponse.json({
    ok: true,
    form: "post-call",
    call_id: call.id,
    client_id: clientId,
    deal_id: dealId,
    member_resolved: !!memberId,
    slack_posted: slackPosted,
  });
}

async function handleOnboarding(supabase: Sb, agencyId: string, payload: TypeformPayload) {
  const a = payload.form_response.answers ?? [];

  // Onboarding form: first + last name only — no email
  const firstName = answerText(findAnswer(a, ONBOARDING_FIELDS.firstName)) ?? "";
  const lastName  = answerText(findAnswer(a, ONBOARDING_FIELDS.lastName))  ?? "";
  const name = (firstName + " " + lastName).trim() || "Anonymous";

  // Capture EVERY answer keyed by our friendly name
  const research: Record<string, unknown> = {};
  for (const [key, fieldId] of Object.entries(ONBOARDING_FIELDS)) {
    if (key === "firstName" || key === "lastName") continue;
    research[key] = answerText(findAnswer(a, fieldId));
  }
  research.conviction_scale = answerNumber(findAnswer(a, ONBOARDING_FIELDS.convictionScale));
  research.typeform_token = payload.form_response.token;
  research.submitted_at = payload.form_response.submitted_at;

  // Dedupe by typeform_token (form has no email)
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("data->>typeform_token", payload.form_response.token)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, form: "onboarding", client_id: existing.id, action: "skipped_duplicate" });
  }

  const { data: newClient, error } = await supabase
    .from("clients")
    .insert({
      agency_id: agencyId,
      name,
      email: null,
      status: "active",
      data: { market_research: research, source: "example_onboarding", typeform_token: payload.form_response.token },
    })
    .select("id").single();

  if (error) return webhookError("Client insert failed", error);
  return NextResponse.json({ ok: true, form: "onboarding", client_id: newClient.id });
}

// Health check
export async function GET() {
  const configured = !!(process.env.TYPEFORM_WEBHOOK_SECRET && process.env.FANBASIS_TARGET_AGENCY_ID);
  return NextResponse.json({
    ok: true,
    endpoint: "typeform-webhook",
    configured,
    forms: {
      post_call:  FORM_ID_POST_CALL,
      onboarding: FORM_ID_ONBOARDING,
    },
    method: "POST",
    auth: "Header Typeform-Signature (HMAC-SHA256 base64)",
  });
}
