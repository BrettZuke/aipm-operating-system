/**
 * Webinar SMS reminder cron.
 *
 * Runs every 15 min. Finds webinars whose start time falls in any active
 * reminder window (T-25h..T-23h, T-90m..T-30m, T-25m..T-5m, T-2m..T+5m) and
 * fires SMS to registrations that haven't been notified yet for that window.
 *
 * Idempotent — sent_*_at timestamps prevent double-sends.
 *
 * Auth: requires CRON_SECRET. Vercel sends Authorization: Bearer.
 *
 * GET /api/cron/webinar-reminders
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types.generated";
import { processWebinarReminders, type WebinarRow } from "@/lib/webinar/reminders";
import { alertOps } from "@/lib/ops-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Scope every query to the configured tenant. Without this the service-role
// client reads webinars across ALL agencies → reminders would SMS another
// tenant's registrants with their private join links. (Wave 1 / C2.)
const AGENCY_ID = process.env.FANBASIS_TARGET_AGENCY_ID;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!AGENCY_ID) return NextResponse.json({ ok: false, error: "FANBASIS_TARGET_AGENCY_ID not set" }, { status: 500 });

  const sb = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Fetch webinars whose start time is within the next 25h or up to 5min past.
  // (Wider window catches all 4 reminder kinds.)
  const now = Date.now();
  const earliest = new Date(now - 5 * 60 * 1000).toISOString();
  const latest = new Date(now + 25 * 3600 * 1000).toISOString();

  let webinars: WebinarRow[] = [];
  try {
    const { data, error } = await sb.from("webinars").select("*")
      .eq("agency_id", AGENCY_ID)
      .gte("starts_at", earliest).lte("starts_at", latest);
    if (error) throw error;
    webinars = (data as WebinarRow[]) ?? [];
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const msg = err?.message ?? (e instanceof Error ? e.message : JSON.stringify(e));
    // 42P01 = undefined_table: the webinars migration (20260507000002) isn't
    // applied yet. That's an expected pre-launch state, so report a clean no-op.
    if (err?.code === "42P01") {
      return NextResponse.json({ ok: true, processed: 0, note: "webinars table not present yet — apply migration 20260507000002" });
    }
    // Anything else (outage, permissions, network) means reminders may be silently
    // missed. This cron sends time-critical SMS, so it must fail loud — not return
    // ok:true. Alert ops and surface a 500 so a green status can't mask a miss.
    await alertOps("webinar-reminders: webinars query failed", `${err?.code ?? "?"}: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const summary: Array<{ webinar: { id: string; title: string; starts_at: string }; result: ReturnType<typeof processWebinarReminders> extends Promise<infer T> ? T : never }> = [];
  for (const w of webinars) {
    const result = await processWebinarReminders(sb, w);
    summary.push({ webinar: { id: w.id, title: w.title, starts_at: w.starts_at }, result });
  }

  return NextResponse.json({
    ok: true,
    checked_at: new Date().toISOString(),
    processed: webinars.length,
    summary,
  });
}
