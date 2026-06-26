/**
 * Weekly performance report — Vercel cron entrypoint.
 *
 * Runs every Monday at 08:00 UTC (09:00 BST / 04:00 ET) per vercel.json.
 *
 * Computes the same report and saves it
 * as a knowledge_doc keyed on metadata.window_start. Re-running is safe.
 *
 * Auth: requires CRON_SECRET in env. Vercel sends it as
 *   Authorization: Bearer <CRON_SECRET>
 *
 * GET /api/cron/weekly-report
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const AGENCY_ID = process.env.FANBASIS_TARGET_AGENCY_ID;

function startOfWeekUTC(d: Date) {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = r.getUTCDay(); // 0=Sun
  const monday = (day + 6) % 7;
  r.setUTCDate(r.getUTCDate() - monday);
  return r;
}
const fmt$ = (n: number) => "$" + Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct = (n: number, d: number) => d ? ((n / d) * 100).toFixed(1) + "%" : "0.0%";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!AGENCY_ID) return NextResponse.json({ ok: false, error: "FANBASIS_TARGET_AGENCY_ID not set" }, { status: 500 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const now = new Date();
  const thisWeekStart = startOfWeekUTC(now);
  const thisWeekEnd = new Date(thisWeekStart); thisWeekEnd.setUTCDate(thisWeekEnd.getUTCDate() + 7);
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const lastWeekEnd = thisWeekStart;
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  const [{ data: txs }, { data: calls }, { data: deals }, { data: members }] = await Promise.all([
    sb.from("transactions").select("amount,kind,occurred_at,member_id").eq("agency_id", AGENCY_ID),
    sb.from("calls").select("member_id,outcome,occurred_at,data").eq("agency_id", AGENCY_ID),
    sb.from("deals").select("amount,stage,closed_at,name").eq("agency_id", AGENCY_ID),
    sb.from("agency_members").select("user_id").eq("agency_id", AGENCY_ID),
  ]);
  // Closer-name lookup scoped to THIS agency's members only — never a global
  // profiles read, which would pull every tenant's users. (Wave 1 / C2.)
  const memberIds = (members ?? []).map(m => m.user_id);
  const { data: profiles } = await sb.from("profiles").select("id,full_name").in("id", memberIds);
  const profById = new Map((profiles ?? []).map(p => [p.id, p]));

  const inWindow = (iso: string | null, start: Date, end: Date) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= start.getTime() && t < end.getTime();
  };
  const sum = <T extends Record<string, unknown>>(arr: T[], k: keyof T) => arr.reduce((s, r) => s + Number(r[k] ?? 0), 0);

  const txThis = (txs ?? []).filter(t => inWindow(t.occurred_at as string, thisWeekStart, thisWeekEnd));
  const txLast = (txs ?? []).filter(t => inWindow(t.occurred_at as string, lastWeekStart, lastWeekEnd));
  const callsThis = (calls ?? []).filter(c => inWindow(c.occurred_at as string, thisWeekStart, thisWeekEnd));
  const callsLast = (calls ?? []).filter(c => inWindow(c.occurred_at as string, lastWeekStart, lastWeekEnd));
  const dealsThis = (deals ?? []).filter(d => d.stage === "closed_won" && inWindow(d.closed_at as string, thisWeekStart, thisWeekEnd));
  const dealsLast = (deals ?? []).filter(d => d.stage === "closed_won" && inWindow(d.closed_at as string, lastWeekStart, lastWeekEnd));

  // Refunds/chargebacks are stored as positive amounts — subtract them so "cash collected"
  // nets out instead of being inflated by money that went back out.
  const signedCash = (rows: typeof txThis) =>
    rows.reduce((s, t) => {
      const amt = Number(t.amount ?? 0);
      return s + (t.kind === "refund" || t.kind === "chargeback" ? -amt : amt);
    }, 0);
  const cashThis = signedCash(txThis), cashLast = signedCash(txLast);
  const contractThis = sum(dealsThis as Record<string, unknown>[], "amount"), contractLast = sum(dealsLast as Record<string, unknown>[], "amount");
  const wonThis = callsThis.filter(c => c.outcome === "won").length;
  const heldThis = callsThis.length;
  const wonLast = callsLast.filter(c => c.outcome === "won").length;
  const heldLast = callsLast.length;

  const closerStats: Record<string, { calls: number; won: number; lost: number; cash: number; value: number }> = {};
  for (const c of callsThis) {
    const key = c.member_id ?? `name:${(c.data as { closer_name?: string })?.closer_name ?? "Unattributed"}`;
    closerStats[key] = closerStats[key] ?? { calls: 0, won: 0, lost: 0, cash: 0, value: 0 };
    closerStats[key].calls++;
    if (c.outcome === "won") closerStats[key].won++;
    if (c.outcome === "lost") closerStats[key].lost++;
    closerStats[key].cash  += Number((c.data as { cash_collected?: number })?.cash_collected ?? 0);
    closerStats[key].value += Number((c.data as { contract_value?: number })?.contract_value ?? 0);
  }
  const closerName = (k: string) => k.startsWith("name:") ? k.slice(5) : (profById.get(k)?.full_name ?? k.slice(0, 8));

  const arrow = (n: number, prev: number) => n > prev ? "▲" : n < prev ? "▼" : "→";
  const delta = (n: number, prev: number) => `${arrow(n, prev)} vs $${prev.toLocaleString("en-US", { maximumFractionDigits: 0 })} last week`;

  const lines: string[] = [];
  lines.push(`# Weekly performance report`);
  lines.push(`**Window:** ${fmtDate(thisWeekStart)} → ${fmtDate(new Date(thisWeekEnd.getTime() - 1))}`);
  lines.push(`**Generated:** ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC (cron)`);
  lines.push("");
  lines.push(`## Topline`);
  lines.push(`- Cash collected: **${fmt$(cashThis)}** ${delta(cashThis, cashLast)}`);
  lines.push(`- Contract value: **${fmt$(contractThis)}** ${delta(contractThis, contractLast)}`);
  lines.push(`- Deals closed: **${dealsThis.length}** (last week: ${dealsLast.length})`);
  lines.push(`- Calls held: **${heldThis}** | won: ${wonThis} | close rate: ${pct(wonThis, heldThis)}`);
  lines.push("");

  if (Object.keys(closerStats).length > 0) {
    lines.push(`## Closer leaderboard`);
    const rows = Object.entries(closerStats).map(([k, s]) => ({ name: closerName(k), ...s, closeRate: s.calls ? (s.won / s.calls * 100).toFixed(1) + "%" : "—" })).sort((a, b) => b.cash - a.cash);
    lines.push(`| Closer | Calls | Won | Cash | Contract |`);
    lines.push(`|---|---:|---:|---:|---:|`);
    for (const r of rows) lines.push(`| ${r.name} | ${r.calls} | ${r.won} | ${fmt$(r.cash)} | ${fmt$(r.value)} |`);
    lines.push("");
  }

  const body = lines.join("\n");
  const windowKey = fmtDate(thisWeekStart);
  const meta = { window_start: windowKey, window_end: fmtDate(thisWeekEnd), generated_at: new Date().toISOString(), source: "vercel_cron" };

  const { data: existing } = await sb.from("knowledge_docs")
    .select("id").eq("agency_id", AGENCY_ID).eq("source_type", "weekly_report")
    .eq("metadata->>window_start", windowKey).maybeSingle();
  if (existing) {
    await sb.from("knowledge_docs").update({ title: `Weekly report — ${windowKey}`, content_text: body, metadata: meta, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await sb.from("knowledge_docs").insert({ agency_id: AGENCY_ID, title: `Weekly report — ${windowKey}`, source_type: "weekly_report", content_text: body, metadata: meta });
  }

  // Optional: post to Slack #wins if SLACK_BOT_TOKEN + SLACK_WEEKLY_REPORT_CHANNEL set
  const slackChan = process.env.SLACK_WEEKLY_REPORT_CHANNEL;
  const slackTok  = process.env.SLACK_BOT_TOKEN;
  if (slackTok && slackChan) {
    const summary = `*Weekly report — ${windowKey}*\n• Cash: ${fmt$(cashThis)} ${arrow(cashThis, cashLast)}\n• Deals closed: ${dealsThis.length}\n• Calls: ${heldThis} held, ${wonThis} won (${pct(wonThis, heldThis)})\n\nFull report in Knowledge Library → Documents.`;
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${slackTok}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: slackChan, text: summary }),
    });
  }

  return NextResponse.json({
    ok: true,
    window: { start: windowKey, end: fmtDate(thisWeekEnd) },
    cash_this_week: cashThis,
    deals_this_week: dealsThis.length,
    calls_held: heldThis,
    posted_to_slack: !!(slackTok && slackChan),
  });
}
