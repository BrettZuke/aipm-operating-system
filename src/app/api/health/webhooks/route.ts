/**
 * Webhook health check.
 *
 * Returns last-received timestamp per source, computed from the most recent row
 * in each source-of-truth table. Hit it periodically to detect when an upstream
 * webhook (Typeform / FanBasis / iClosed) has gone silent.
 *
 * GET /api/health/webhooks
 *
 * Response:
 *   {
 *     "checked_at": "2026-05-07T...",
 *     "sources": [
 *       { "name": "typeform_post_call", "last_at": "...", "minutes_since": 720, "status": "warn" },
 *       ...
 *     ]
 *   }
 *
 * status:
 *   ok    — received within the freshness window for that source
 *   warn  — past freshness window but within stale window
 *   stale — past stale window (likely broken)
 *   never — no data ever received
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkEnv } from "@/lib/env-check";

export const dynamic = "force-dynamic";

// Per-source freshness expectations (in hours). Tuned for our actual cadence.
const SOURCES = [
  // Closer post-call form: ~daily during the week
  { name: "typeform_post_call",     table: "calls",        col: "occurred_at",  filter: { source: "closer_post_call_form" }, freshHours: 36, staleHours: 168 },
  // Onboarding form: only when someone signs up
  { name: "typeform_onboarding",    table: "clients",      col: "created_at",   filter: { source: "example_onboarding" },        freshHours: 168, staleHours: 720 },
  // Waitlist: drip during launches
  { name: "typeform_waitlist",      table: "clients",      col: "created_at",   filter: { source: "example_waitlist" },          freshHours: 168, staleHours: 720 },
  // Market research: occasional
  { name: "typeform_market_research", table: "clients",    col: "created_at",   filter: { source: "market_research_form" },   freshHours: 720, staleHours: 2160 },
  // FanBasis transactions: at least one per active week
  { name: "fanbasis_payments",      table: "transactions", col: "occurred_at",  filter: { metadata_source: "fanbasis" },      freshHours: 168, staleHours: 720 },
  // iClosed bookings: ~daily
  { name: "iclosed_bookings",       table: "calls",        col: "occurred_at",  filter: { source: "iclosed" },                freshHours: 36, staleHours: 168 },
];

type SourceStatus = "ok" | "warn" | "stale" | "never";

export async function GET(req: Request) {
  // Auth: this exposes per-source business cadence — gate it behind CRON_SECRET
  // (same bearer the crons use). Internal callers (self-discover, quality-harness)
  // pass the header; external/anonymous callers get 401.
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const now = Date.now();
  const results = await Promise.all(SOURCES.map(async (s) => {
    let q = sb.from(s.table).select(`${s.col}`).order(s.col, { ascending: false }).limit(1);
    if (s.filter.source) q = q.eq("data->>source", s.filter.source);
    if (s.filter.metadata_source) q = q.eq("metadata->>source", s.filter.metadata_source);
    const { data, error } = await q;

    if (error) return { name: s.name, last_at: null, minutes_since: null, status: "never" as SourceStatus, error: error.message };
    const latest = data?.[0]?.[s.col as keyof typeof data[0]] as string | undefined;
    if (!latest) return { name: s.name, last_at: null, minutes_since: null, status: "never" as SourceStatus };

    const ageMs = now - new Date(latest).getTime();
    const minutesSince = Math.round(ageMs / 60000);
    const ageHours = ageMs / 3600000;
    const status: SourceStatus = ageHours <= s.freshHours ? "ok"
                              : ageHours <= s.staleHours ? "warn"
                              : "stale";
    return { name: s.name, last_at: latest, minutes_since: minutesSince, status };
  }));

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    sources: results,
    summary: {
      ok: results.filter(r => r.status === "ok").length,
      warn: results.filter(r => r.status === "warn").length,
      stale: results.filter(r => r.status === "stale").length,
      never: results.filter(r => r.status === "never").length,
    },
    // Config visibility (M7): surfaces missing critical env vars (non-throwing) so a
    // wiped secret is caught here rather than as silently-broken behaviour.
    env: checkEnv(),
  });
}
