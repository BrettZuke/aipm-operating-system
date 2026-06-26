import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Edge runtime = near-zero cold start, so the click bounces to Instagram fast.
export const runtime = "edge";

/**
 * DM-click tracker (Instagram DM funnel).
 *
 * An email CTA links here (instead of straight to Instagram) with the subscriber's email merged
 * in by your email tool:
 *   https://your-app.example.com/api/dm-click?to=creator&e={{ subscriber.email_address }}
 * We log (agency, email, campaign, time) then 302 to the real Instagram DM. The dashboard later
 * matches these clickers to buyers by email inside the attribution window, so a sale that closes
 * days later in the DM still gets credited to the email, and you own the click data outright.
 *
 * Public endpoint (the link lives in outbound email): no secret. Guarded by a fixed target map
 * (so it is NOT an open redirect) and email validation. Referrer is stripped so the email-bearing
 * URL never leaks to Instagram. Logging is best-effort and never blocks the redirect.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// `to` code -> fixed destination + owning agency. Add a line per creator (keeps this an allow-list,
// never an open redirect). Codes are short and readable; the destination is server-controlled.
const TARGETS: Record<string, { agencyId: string; url: string }> = {
  creator: {
    agencyId: process.env.DM_CLICK_AGENCY_ID ?? "",
    url: "https://ig.me/m/your_handle",
  },
};

const DEFAULT_URL = "https://www.instagram.com/your_handle/";

function redirect(to: string): NextResponse {
  const res = NextResponse.redirect(to, 302);
  res.headers.set("Referrer-Policy", "no-referrer"); // don't leak the email-bearing URL onward
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const target = TARGETS[(sp.get("to") ?? "").trim().toLowerCase()];
  const dest = target?.url ?? DEFAULT_URL;

  // Whatever happens with logging, the human must land in the DM. Resolve the destination first.
  const email = (sp.get("e") ?? "").trim().toLowerCase();
  const campaign = (sp.get("c") ?? "dm").trim().slice(0, 60) || "dm";

  // Only log a real, identifiable click (email merged in + a known target). An unrendered merge tag
  // ("{{ subscriber.email_address }}") or anonymous click just redirects, silently unlogged.
  if (target && email && EMAIL_RE.test(email)) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      // Log AFTER the redirect is sent — the click is never held up by the DB round-trip.
      after(async () => {
        try {
          const supabase = createClient(url, key, { auth: { persistSession: false } });
          await supabase.from("dm_link_clicks").insert({
            agency_id: target.agencyId,
            email,
            campaign,
          });
        } catch {
          // best-effort: a logging failure must never strand the click
        }
      });
    }
  }

  return redirect(dest);
}
