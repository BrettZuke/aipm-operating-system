import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Lead attribution capture (the coach / example.com).
 *
 * dbz-insights.js beacons { email, utm_* , landing_path, referrer } here on every opt-in
 * submit. We store first-touch UTM per email (record_lead_attribution preserves first touch),
 * and Settoku later joins FanBasis buyers → this table by email to attribute revenue by source.
 *
 * Public beacon endpoint: no secret (the page is public), guarded by email validation + a fixed
 * agency scope. CORS open so example.com (and its Vercel domains) can POST cross-origin.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Access-Control-Max-Age", "86400");
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const agencyId = process.env.FANBASIS_TARGET_AGENCY_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!agencyId || !url || !key) {
    return cors(NextResponse.json({ ok: false, error: "not configured" }, { status: 500 }));
  }

  // Accept JSON or sendBeacon's text/plain body.
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return cors(NextResponse.json({ ok: false, error: "bad body" }, { status: 400 }));
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  // No email = nothing to key a future sale on (e.g. an anonymous CTA click). Accept silently.
  if (!email || !EMAIL_RE.test(email)) {
    return cors(NextResponse.json({ ok: true, stored: false }));
  }

  const str = (v: unknown) => (v == null ? "" : String(v).slice(0, 200));
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.rpc("record_lead_attribution", {
    p_agency: agencyId,
    p_email: email,
    p_source: str(body.utm_source),
    p_medium: str(body.utm_medium),
    p_campaign: str(body.utm_campaign),
    p_content: str(body.utm_content),
    p_term: str(body.utm_term),
    p_landing: str(body.landing_path),
    p_referrer: str(body.referrer),
  });

  if (error) {
    return cors(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
  }
  return cors(NextResponse.json({ ok: true, stored: true }));
}

// Health check
export async function GET() {
  return cors(NextResponse.json({
    ok: true,
    endpoint: "lead-attribution",
    configured: !!(process.env.FANBASIS_TARGET_AGENCY_ID && process.env.SUPABASE_SERVICE_ROLE_KEY),
    method: "POST { email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_path, referrer }",
  }));
}
