/**
 * Daily digest — Vercel cron entrypoint.
 *
 * Runs Mon-Fri at 17:00 UTC (= 18:00 BST / 13:00 ET) per vercel.json.
 *
 * Posts to Slack: today's calls, deals closed, cash collected, who submitted
 * EOD vs who didn't.
 *
 * Auth: requires CRON_SECRET in env. Vercel sends it as Authorization: Bearer.
 *
 * Configurable env:
 *   - SLACK_DAILY_DIGEST_CHANNEL  (defaults to "#general" if unset — recommend "#wins" or a dedicated digest channel)
 *
 * GET /api/cron/daily-digest
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const AGENCY_ID = process.env.FANBASIS_TARGET_AGENCY_ID;
const fmt$ = (n: number) => "$" + Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!AGENCY_ID) return NextResponse.json({ ok: false, error: "FANBASIS_TARGET_AGENCY_ID not set" }, { status: 500 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  // "Today" window: 00:00 UTC → now (so the digest captures the full day-so-far,
  // even if cron fires before EOD elsewhere).
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();   todayEnd.setUTCHours(23, 59, 59, 999);

  const [{ data: calls }, { data: deals }, { data: txs }, { data: eods }, { data: members }] = await Promise.all([
    sb.from("calls").select("id,member_id,outcome,occurred_at,data").eq("agency_id", AGENCY_ID)
      .gte("occurred_at", todayStart.toISOString()).lte("occurred_at", todayEnd.toISOString()),
    sb.from("deals").select("id,name,amount,stage,closed_at").eq("agency_id", AGENCY_ID).eq("stage", "closed_won")
      .gte("closed_at", todayStart.toISOString()).lte("closed_at", todayEnd.toISOString()),
    sb.from("transactions").select("amount,kind,occurred_at").eq("agency_id", AGENCY_ID)
      .gte("occurred_at", todayStart.toISOString()).lte("occurred_at", todayEnd.toISOString()),
    sb.from("eod_reports").select("member_id,responses,submitted_at").eq("agency_id", AGENCY_ID)
      .gte("submitted_at", todayStart.toISOString()).lte("submitted_at", todayEnd.toISOString()),
    sb.from("agency_members").select("user_id,role").eq("agency_id", AGENCY_ID).eq("status", "active"),
  ]);
  // Profiles scoped to THIS agency's members only — never a global profiles read,
  // which would leak every tenant's names/emails into this digest. (Wave 1 / C2.)
  const memberIds = (members ?? []).map(m => m.user_id);
  const { data: profiles } = await sb.from("profiles").select("id,full_name,email").in("id", memberIds);
  const profById = new Map((profiles ?? []).map(p => [p.id, p]));

  const dealsAmount = (deals ?? []).reduce((s, d) => s + Number(d.amount ?? 0), 0);
  // Payments in, refunds AND chargebacks out (both stored positive). Chargebacks were
  // previously ignored, overstating the day's cash whenever one occurred.
  const cashAmount = (txs ?? []).reduce((s, t) => {
    const amt = Number(t.amount ?? 0);
    if (t.kind === "refund" || t.kind === "chargeback") return s - amt;
    if (t.kind === "payment") return s + amt;
    return s;
  }, 0);
  const heldCount = (calls ?? []).length;
  const wonCount = (calls ?? []).filter(c => c.outcome === "won").length;

  // EOD compliance — who submitted vs who's missing
  const submittedBy = new Set((eods ?? []).map(e => e.member_id).filter(Boolean));
  const submitters = (members ?? []).filter(m => submittedBy.has(m.user_id))
    .map(m => profById.get(m.user_id)?.full_name ?? profById.get(m.user_id)?.email ?? m.user_id.slice(0,8));
  const missing = (members ?? []).filter(m => !submittedBy.has(m.user_id) && m.role !== "owner")
    .map(m => profById.get(m.user_id)?.full_name ?? profById.get(m.user_id)?.email ?? m.user_id.slice(0,8));

  const wins = (deals ?? []).map(d => `• ${d.name ?? "Deal"} — ${fmt$(Number(d.amount ?? 0))}`).join("\n") || "_no closes today_";
  const ymd = todayStart.toISOString().slice(0, 10);
  const text = [
    `*EOD digest — ${ymd}*`,
    ``,
    `💰  Cash collected: *${fmt$(cashAmount)}*`,
    `🏆  Deals closed: *${(deals ?? []).length}* (${fmt$(dealsAmount)})`,
    `📞  Calls: *${heldCount} held*, ${wonCount} won`,
    ``,
    `*Today's wins:*`,
    wins,
    ``,
    `*EOD reports:*`,
    `✓ submitted: ${submitters.length ? submitters.join(", ") : "—"}`,
    `✗ missing: ${missing.length ? missing.join(", ") : "all in"}`,
  ].join("\n");

  // Post to Slack
  const slackTok  = process.env.SLACK_BOT_TOKEN;
  const slackChan = process.env.SLACK_DAILY_DIGEST_CHANNEL ?? "#general";
  let slackPosted = false, slackError: string | undefined;
  if (slackTok) {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${slackTok}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: slackChan, text }),
    });
    const data = await r.json();
    slackPosted = !!data.ok;
    if (!data.ok) slackError = data.error;
  }

  return NextResponse.json({
    ok: true,
    date: ymd,
    cash: cashAmount,
    deals_closed: (deals ?? []).length,
    calls_held: heldCount,
    calls_won: wonCount,
    eod_submitted_by: submitters,
    eod_missing: missing,
    slack: { posted: slackPosted, channel: slackChan, error: slackError },
  });
}
