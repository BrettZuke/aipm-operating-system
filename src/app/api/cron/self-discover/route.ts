/**
 * Self-discovery cron — runs audits and writes findings into the improvements
 * queue. Idempotent (the unique index on (agency_id, source, title) for open
 * items prevents duplicate entries).
 *
 * Audits performed:
 *   1. Webhook freshness — any source that's stale → security/perf finding
 *   2. Outstanding-balance growth — clients accumulating debt → data_quality
 *   3. Orphan deals (closed_won, no transactions) → data_quality
 *   4. Calls without notes — closer compliance → data_quality
 *   5. Active clients without phone — SMS coverage gap → data_quality
 *   6. Unattributed calls — tx with no client_id → data_quality
 *
 * Auth: requires CRON_SECRET in Authorization: Bearer.
 *
 * GET /api/cron/self-discover
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { alertOps } from "@/lib/ops-alert";
import type { Database } from "@/lib/supabase/types.generated";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const AGENCY_ID = process.env.FANBASIS_TARGET_AGENCY_ID;

type Finding = {
  title: string;
  description?: string;
  kind: "bug" | "tech_debt" | "security" | "perf" | "data_quality";
  priority: number;
  evidence?: string;
  files_touched?: string[];
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!AGENCY_ID) return NextResponse.json({ ok: false, error: "FANBASIS_TARGET_AGENCY_ID not set" }, { status: 500 });

  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const findings: Finding[] = [];

  // --- 1. Webhook freshness ---
  try {
    const baseUrl = req.nextUrl.origin;
    const res = await fetch(`${baseUrl}/api/health/webhooks`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (res.ok) {
      const data = await res.json();
      for (const s of (data.sources ?? []) as Array<{ name: string; status: string; minutes_since: number | null }>) {
        if (s.status === "stale") {
          findings.push({
            title: `Webhook source stale: ${s.name}`,
            description: `The ${s.name} webhook hasn't received data in ${Math.round((s.minutes_since ?? 0) / 60)} hours. This is past the staleness threshold — either the source is silent or our endpoint is broken.`,
            kind: "data_quality",
            priority: 2,
            evidence: JSON.stringify(s, null, 2),
            files_touched: [`src/app/api/webhook/`],
          });
        }
      }
    }
  } catch (e) {
    findings.push({
      title: "Health endpoint unreachable",
      description: "Couldn't fetch /api/health/webhooks during self-discovery.",
      kind: "bug",
      priority: 1,
      evidence: e instanceof Error ? e.message : String(e),
    });
  }

  // --- 2. Outstanding balances ---
  const { data: clientsAll } = await sb
    .from("clients").select("id,name,data").eq("agency_id", AGENCY_ID);
  const owing = (clientsAll ?? []).filter(c => Number((c.data as Record<string, unknown> | null)?.outstanding_balance ?? 0) > 0);
  if (owing.length >= 3) {
    const total = owing.reduce((s, c) => s + Number((c.data as Record<string, unknown> | null)?.outstanding_balance ?? 0), 0);
    findings.push({
      title: `${owing.length} clients owe a combined $${total.toFixed(0)}`,
      description: "Worth surfacing in a Slack reminder or auto-send a follow-up message.",
      kind: "data_quality",
      priority: 3,
      evidence: owing.slice(0, 10).map(c => `${c.name}: $${(c.data as Record<string, unknown> | null)?.outstanding_balance}`).join("\n"),
    });
  }

  // --- 3. Orphan closed-won deals ---
  const { data: deals } = await sb.from("deals").select("id,name,amount,data").eq("agency_id", AGENCY_ID).eq("stage", "closed_won");
  const orphans = (deals ?? []).filter(d => (d.data as Record<string, unknown> | null)?.needs_review);
  if (orphans.length > 0) {
    findings.push({
      title: `${orphans.length} closed-won deals flagged for review`,
      description: "These deals were closed but have no FanBasis transactions linked. Either the client paid via another rail (Stripe / wire / cash) or we missed a payment.",
      kind: "data_quality",
      priority: 3,
      evidence: orphans.map(d => `${d.name} ($${d.amount})`).join("\n"),
    });
  }

  // --- 4. Calls without notes ---
  const { data: calls } = await sb.from("calls").select("id,outcome,notes").eq("agency_id", AGENCY_ID);
  const noNotes = (calls ?? []).filter(c => !c.notes && c.outcome !== "no_show");
  if (noNotes.length >= 5) {
    findings.push({
      title: `${noNotes.length} calls have no notes`,
      description: "Closers are skipping the post-call form. Coaching feedback is missing for these. Worth a Slack nudge or making the form mandatory in the workflow.",
      kind: "data_quality",
      priority: 4,
    });
  }

  // --- 5. Active clients without phone ---
  const activeNoPhone = (clientsAll ?? []).filter(c => {
    if (c.id === undefined) return false;
    return false; // need status in select
  });
  // Re-query with status — the previous query didn't select status, so re-do
  const { data: actives } = await sb.from("clients").select("id,name,email,data,status").eq("agency_id", AGENCY_ID).eq("status", "active");
  const noPhone = (actives ?? []).filter(c => !((c.data as Record<string, unknown> | null)?.phone));
  if (noPhone.length >= 3) {
    findings.push({
      title: `${noPhone.length} active clients have no phone number`,
      description: "SMS reminders + webinar reminders won't reach them. Worth a quick capture flow — Typeform or a 1-tap link in their next email.",
      kind: "data_quality",
      priority: 4,
      evidence: noPhone.slice(0, 10).map(c => `${c.name} <${c.email}>`).join("\n"),
    });
  }

  // --- 6. Unattributed transactions ---
  const { data: txs } = await sb.from("transactions").select("id,amount,client_id,external_id").eq("agency_id", AGENCY_ID).is("client_id", null);
  if ((txs?.length ?? 0) > 0) {
    findings.push({
      title: `${txs!.length} transactions have no client_id`,
      description: "These transactions came in but couldn't be matched to a client (probably new email not in clients yet). They're not counted in lifetime revenue per client.",
      kind: "data_quality",
      priority: 3,
      evidence: txs!.slice(0, 10).map(t => `$${t.amount} · ext=${t.external_id}`).join("\n"),
    });
  }

  // --- Insert findings (idempotent via unique index) ---
  let inserted = 0, deduped = 0;
  const insertErrors: string[] = [];
  for (const f of findings) {
    const { error } = await sb.from("improvements").insert({
      agency_id: AGENCY_ID,
      title: f.title,
      description: f.description ?? null,
      kind: f.kind,
      priority: f.priority,
      evidence: f.evidence ?? null,
      files_touched: f.files_touched ?? [],
      source: "self_discover",
    });
    if (error?.code === "23505") deduped++;
    else if (error) insertErrors.push(`${f.title}: ${error.message}`);
    else inserted++;
  }

  if (insertErrors.length) {
    await alertOps(`self-discover: ${insertErrors.length} insert error(s)`, insertErrors.join("\n"));
  }
  return NextResponse.json({
    ok: insertErrors.length === 0,
    checked_at: new Date().toISOString(),
    findings_count: findings.length,
    inserted,
    deduped,
    insert_errors: insertErrors,
    findings: findings.map(f => ({ title: f.title, kind: f.kind, priority: f.priority })),
  }, insertErrors.length ? { status: 500 } : undefined);
}
