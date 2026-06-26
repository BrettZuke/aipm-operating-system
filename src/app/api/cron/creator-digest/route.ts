/**
 * Creator daily digest — the creator-style (Stripe + GA4 + Kit) workspaces.
 *
 * Posts a morning summary to Slack for every agency on the 'creator' dashboard template:
 *   • Yesterday: sales, new revenue, refunds/cancellations, top source
 *   • Now: MRR, active subs, past-due payments ($ at risk), next-30-day charges
 *   • This month: revenue vs goal + on-pace projection
 *   • Yesterday's traffic (GA4 sessions + top source) and Kit opt-ins / checkout starts
 *
 * Runs daily at 07:00 UTC (09:00 Poland / 08:00 UK) per vercel.json.
 * Auth: CRON_SECRET — Vercel cron sends it automatically as `Authorization: Bearer <secret>`.
 *
 * Scope:   env CREATOR_DIGEST_AGENCY_ID (one workspace) or ALL dashboard_template='creator'.
 * Channel: SLACK_CREATOR_DIGEST_CHANNEL ?? SLACK_DAILY_DIGEST_CHANNEL ?? SLACK_WINS_CHANNEL.
 *
 * GET /api/cron/creator-digest
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { creatorSettingsFromRaw, type RawSettings } from "@/lib/creator/settings";
import { fetchStripeSnapshot, fetchStripeSchedule } from "@/lib/creator/stripe";
import { fetchGa4Snapshot, type Ga4Snapshot } from "@/lib/creator/ga4";
import { fetchKitSnapshot, type KitSnapshot } from "@/lib/creator/kit";
import { parseRange } from "@/lib/creator/range";
import { alertOps } from "@/lib/ops-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A Slack target that's a user ID (Uxxxx) must be turned into a DM channel via conversations.open
// before posting; real channel names/IDs pass straight through. Lets the digest DM one person.
async function resolveSlackTarget(tok: string, target: string): Promise<string> {
  if (/^U[A-Z0-9]+$/.test(target)) {
    const r = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ users: target }),
    });
    const d = await r.json();
    if (d.ok && d.channel?.id) return d.channel.id as string;
  }
  return target;
}

function money(n: number, cur: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (cur || "USD").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString("en-US")} ${(cur || "").toUpperCase()}`.trim();
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "Supabase admin not configured" }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Which creator workspaces to digest. Default = all of them; override to one via env.
  const only = process.env.CREATOR_DIGEST_AGENCY_ID;
  let agencyQuery = sb.from("agencies").select("id,name").eq("dashboard_template", "creator");
  if (only) agencyQuery = agencyQuery.eq("id", only);
  const { data: agencies } = await agencyQuery;

  const slackTok  = process.env.SLACK_BOT_TOKEN;
  const slackChan = process.env.SLACK_CREATOR_DIGEST_CHANNEL ?? process.env.SLACK_DAILY_DIGEST_CHANNEL ?? process.env.SLACK_WINS_CHANNEL ?? "#general";

  const yRange = parseRange({ range: "yesterday" });
  const mRange = parseRange({ range: "mtd" });
  const dateLabel = new Date(yRange.from + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  const results: Array<Record<string, unknown>> = [];

  for (const agency of agencies ?? []) {
    try {
      const { data: row } = await sb.from("agency_settings").select("data").eq("agency_id", agency.id).maybeSingle();
      const settings = creatorSettingsFromRaw((row?.data ?? {}) as RawSettings);
      if (!settings.stripeKey) { results.push({ agency: agency.name, skipped: "no stripe key" }); continue; }

      const [snapY, snapM, sched] = await Promise.all([
        fetchStripeSnapshot({ key: settings.stripeKey, range: yRange }),
        fetchStripeSnapshot({ key: settings.stripeKey, range: mRange }),
        fetchStripeSchedule({ key: settings.stripeKey }),
      ]);

      // Traffic + email are best-effort: if GA4/Kit aren't configured or error, the digest still posts.
      let ga4: Ga4Snapshot | null = null;
      if (settings.ga4PropertyId) {
        try {
          ga4 = await fetchGa4Snapshot({ propertyId: settings.ga4PropertyId, range: yRange, salesPagePath: settings.salesPagePath });
        } catch { /* skip traffic line */ }
      }
      let kit: KitSnapshot | null = null;
      if (settings.kitApiSecret) {
        try {
          kit = await fetchKitSnapshot({ secret: settings.kitApiSecret, range: yRange, webinarTagId: settings.webinarRegistrantTagId, checkoutTagIds: settings.checkoutTagIds, optInTagIds: settings.optInTagIds });
        } catch { /* skip email line */ }
      }

      const cur = snapY.currency || sched.currency || "usd";
      const failedAtRisk = sched.rows.filter((r) => r.failed).reduce((s, r) => s + r.amount, 0);

      // Month pace = run-rate so far this month, extrapolated to the full month.
      const now = new Date();
      const dayOfMonth = now.getUTCDate();
      const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      const pace = dayOfMonth > 0 ? (snapM.revenueNet / dayOfMonth) * daysInMonth : 0;
      const goalPct = settings.revenueGoalUsd > 0 ? Math.round((snapM.revenueNet / settings.revenueGoalUsd) * 100) : 0;

      const topSrc = (snapY.byUtmSource ?? [])
        .filter((s) => s.count > 0)
        .slice(0, 3)
        .map((s) => `${s.key === "(untagged)" ? "untagged" : s.key} (${s.count})`)
        .join(" · ") || "—";

      const lines: string[] = [];
      lines.push(`*📊 ${agency.name} — daily numbers* · ${dateLabel}`);
      lines.push("");
      lines.push("*Yesterday*");
      lines.push(`💰 Sales: *${snapY.salesCount}*  ·  ${money(snapY.newOrderRevenue, cur)} new revenue`);
      if (snapY.refunds > 0) lines.push(`↩️ Refunds: ${money(snapY.refunds, cur)}`);
      if (snapY.canceledInRange > 0) lines.push(`🔻 Cancellations: ${snapY.canceledInRange}`);
      lines.push(`🧭 Top source: ${topSrc}`);
      lines.push("");
      lines.push("*Now*");
      lines.push(`📈 MRR: *${money(sched.mrr || snapY.mrr, cur)}*  ·  ${sched.activeCount} active subs`);
      if (sched.pastDueCount > 0) lines.push(`⚠️ Past-due: *${sched.pastDueCount}* sub${sched.pastDueCount === 1 ? "" : "s"}  ·  ${money(failedAtRisk, cur)} at risk`);
      lines.push(`📅 Next 30 days: ${sched.next30dCount} charges · ${money(sched.next30dAmount, cur)}`);
      lines.push("");
      lines.push("*This month*");
      lines.push(`🎯 ${money(snapM.revenueNet, cur)} / ${money(settings.revenueGoalUsd, cur)} goal (${goalPct}%)  ·  on pace for ~${money(pace, cur)}`);

      if (ga4 || kit) {
        lines.push("");
        lines.push("*Traffic (yesterday)*");
        if (ga4) {
          const top = (ga4.utmSources ?? [])[0];
          lines.push(`👀 ${ga4.sessions.toLocaleString("en-US")} sessions${top ? ` · top: ${top.label}` : ""}`);
        }
        if (kit) {
          const parts: string[] = [];
          if (kit.checkoutStarted != null) parts.push(`${kit.checkoutStarted} checkout starts`);
          if (kit.optIns != null) parts.push(`${kit.optIns} opt-ins`);
          if (parts.length) lines.push(`🛒 ${parts.join(" · ")}`);
        }
      }

      lines.push("");
      lines.push("<https://your-app.example.com/dashboard|Open dashboard>");

      const text = lines.join("\n");

      let posted = false;
      let slackError: string | undefined;
      if (slackTok && slackChan) {
        const dest = await resolveSlackTarget(slackTok, slackChan);
        const r = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${slackTok}`, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ channel: dest, text, unfurl_links: false }),
        });
        const d = await r.json();
        posted = !!d.ok;
        if (!d.ok) slackError = d.error;
      }

      results.push({
        agency: agency.name,
        sales_yesterday: snapY.salesCount,
        revenue_yesterday: snapY.newOrderRevenue,
        mrr: sched.mrr,
        past_due: sched.pastDueCount,
        slack_posted: posted,
        slack_error: slackError,
      });
    } catch (e) {
      results.push({ agency: agency.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const failed = results.filter(r => r.error);
  if (failed.length) {
    await alertOps(`creator-digest: ${failed.length} workspace(s) failed`, failed.map(r => `${r.agency}: ${r.error}`).join("\n"));
    return NextResponse.json({ ok: false, date: yRange.from, channel: slackChan, workspaces: results }, { status: 500 });
  }
  return NextResponse.json({ ok: true, date: yRange.from, channel: slackChan, workspaces: results });
}
