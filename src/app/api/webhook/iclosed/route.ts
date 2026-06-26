import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { webhookError } from "@/lib/webhook-error";
import { createClient } from "@supabase/supabase-js";

/**
 * iClosed → POST → this endpoint
 *
 * iClosed fires webhooks for: booking_created, booking_canceled, booking_rescheduled,
 * call_completed, no_show, etc. We map each event to a row in `calls`.
 *
 * Setup in iClosed dashboard:
 *   Settings → Webhooks → Add new
 *   URL: https://yourhost/api/webhook/iclosed
 *   Secret: <ICLOSED_WEBHOOK_SECRET from .env>
 *   Events: All booking events
 */

type ICLOSEDEvent = {
  event: "booking_created" | "booking_canceled" | "booking_rescheduled" | "call_completed" | "no_show" | string;
  data: {
    booking_id?: string;
    invitee?: { name?: string; email?: string; phone?: string };
    scheduled_at?: string;     // ISO datetime
    event_type?: { name?: string; duration?: number };
    cancellation_reason?: string;
    closer?: { email?: string; name?: string };
    call_outcome?: string;
    [k: string]: unknown;
  };
};

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature.replace(/^sha256=/, ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const OUTCOME_MAP: Record<string, string> = {
  booking_created: "booked",
  call_completed: "held",
  no_show: "no_show",
  booking_canceled: "rescheduled",
  booking_rescheduled: "rescheduled",
};

export async function POST(req: NextRequest) {
  const secret = process.env.ICLOSED_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "ICLOSED_WEBHOOK_SECRET not configured" }, { status: 500 });

  const rawBody = await req.text();
  const sig = req.headers.get("x-iclosed-signature") ?? req.headers.get("x-signature");

  // Allow either signed (production) or token-based (dev) auth
  const token = req.headers.get("x-webhook-token") ?? new URL(req.url).searchParams.get("token");
  const sigOk = sig ? verifySignature(rawBody, sig, secret) : false;
  const tokenOk = token === secret;

  if (!sigOk && !tokenOk) {
    return NextResponse.json({ ok: false, error: "Invalid signature/token" }, { status: 401 });
  }

  let payload: ICLOSEDEvent;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const agencyId = process.env.FANBASIS_TARGET_AGENCY_ID;
  if (!agencyId) return NextResponse.json({ ok: false, error: "Target agency not configured" }, { status: 500 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const event = payload.event;
  const d = payload.data ?? {};
  const inviteeEmail = d.invitee?.email?.toLowerCase().trim() ?? null;
  const inviteeName  = d.invitee?.name ?? inviteeEmail ?? "Lead";
  const inviteePhone = d.invitee?.phone ?? null;
  const scheduledAt  = d.scheduled_at ? new Date(d.scheduled_at).toISOString() : new Date().toISOString();
  const bookingId    = d.booking_id ?? `iclosed-${crypto.randomBytes(8).toString("hex")}`;
  const outcome      = OUTCOME_MAP[event] ?? d.call_outcome ?? "booked";

  // 1. Find/create client
  let clientId: string | null = null;
  if (inviteeEmail) {
    const { data: existing } = await supabase
      .from("clients").select("id").eq("agency_id", agencyId).eq("email", inviteeEmail).maybeSingle();
    if (existing) clientId = existing.id;
    else {
      const { data: newClient } = await supabase.from("clients").insert({
        agency_id: agencyId,
        name: inviteeName,
        email: inviteeEmail,
        status: "lead",
        data: { phone: inviteePhone, source: "iclosed" },
      }).select("id").single();
      clientId = newClient?.id ?? null;
    }
  }

  // 2. Resolve closer if provided — but only attribute the call to them if they're
  // an active member of THIS agency. A bare global email lookup could attach a
  // same-email user from another tenant, corrupting commission/quota data and
  // leaking their profile id. Mirrors the Typeform post-call handler. (Wave 1 / C2.)
  let memberId: string | null = null;
  if (d.closer?.email) {
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("email", d.closer.email.toLowerCase()).maybeSingle();
    if (profile) {
      const { data: membership } = await supabase
        .from("agency_members").select("user_id")
        .eq("agency_id", agencyId).eq("user_id", profile.id).eq("status", "active").maybeSingle();
      if (membership) memberId = profile.id;
    }
  }

  // 2b. Booked-call attribution: we decorate iclosed.io links with UTM, so if iClosed forwards
  // it on the booking we tie this lead's email to its source (booked calls attribute too).
  // Best-effort + idempotent (record_lead_attribution preserves first-touch).
  const utm = {
    source: String(d.utm_source ?? ""),
    medium: String(d.utm_medium ?? ""),
    campaign: String(d.utm_campaign ?? ""),
    content: String(d.utm_content ?? ""),
    term: String(d.utm_term ?? ""),
  };
  if (inviteeEmail && utm.source) {
    await supabase.rpc("record_lead_attribution", {
      p_agency: agencyId, p_email: inviteeEmail,
      p_source: utm.source, p_medium: utm.medium, p_campaign: utm.campaign,
      p_content: utm.content, p_term: utm.term, p_landing: "", p_referrer: "iclosed",
    }).then(() => {}, () => {});
  }

  // 3. Upsert call (use booking_id as external_id)
  const { data: existingCall } = await supabase
    .from("calls").select("id").eq("agency_id", agencyId).eq("external_id", bookingId).maybeSingle();

  if (existingCall) {
    await supabase.from("calls").update({
      outcome,
      occurred_at: scheduledAt,
      data: { iclosed_event: event, ...d },
    }).eq("id", existingCall.id);
    return NextResponse.json({ ok: true, action: "updated", call_id: existingCall.id, event });
  }

  const { data: call, error } = await supabase.from("calls").insert({
    agency_id: agencyId,
    member_id: memberId,
    client_id: clientId,
    outcome,
    occurred_at: scheduledAt,
    duration_sec: (d.event_type?.duration ?? 30) * 60,
    external_id: bookingId,
    notes: d.cancellation_reason ?? null,
    data: { iclosed_event: event, source: "iclosed", ...d },
  }).select("id").single();

  if (error) {
    // Concurrent re-delivery beat us to the insert (unique index on (agency_id, external_id)).
    // Apply this event to the row that won, so the latest outcome still lands — no 500, no dupe.
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("calls").select("id").eq("agency_id", agencyId).eq("external_id", bookingId).maybeSingle();
      if (raced) {
        await supabase.from("calls").update({
          outcome,
          occurred_at: scheduledAt,
          data: { iclosed_event: event, ...d },
        }).eq("id", raced.id);
        return NextResponse.json({ ok: true, action: "updated", call_id: raced.id, event });
      }
    }
    return webhookError("Internal error processing event", error);
  }
  return NextResponse.json({ ok: true, action: "created", call_id: call.id, event });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "iclosed-webhook",
    configured: !!process.env.ICLOSED_WEBHOOK_SECRET,
    auth: "Header X-iClosed-Signature (HMAC-SHA256 hex) or ?token=",
  });
}
