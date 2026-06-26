/**
 * Nightly maintenance cron.
 *
 * Runs every day at 03:00 UTC (= 04:00 BST / 23:00 ET).
 *
 * Calls runMaintenance() to:
 *   1. Link any unlinked transactions to their closed_won deals
 *   2. Recompute payment totals for every client with a deal or tx
 *   3. Flag orphan closed_won deals (or unflag if they now have a payment)
 *
 * Auth: requires CRON_SECRET in env. Vercel sends Authorization: Bearer.
 *
 * GET /api/cron/maintenance
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runMaintenance } from "@/lib/pipeline/maintenance";
import { syncFanbasisCustomers, fanbasisEnabledFor } from "@/lib/coach/fanbasis";
import { alertOps } from "@/lib/ops-alert";
import type { Database } from "@/lib/supabase/types.generated";

export const dynamic = "force-dynamic";
// Bump max duration — recompute step iterates all clients with deals/tx, can be slow.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const agencyId = process.env.FANBASIS_TARGET_AGENCY_ID;
  if (!agencyId) return NextResponse.json({ ok: false, error: "FANBASIS_TARGET_AGENCY_ID not set" }, { status: 500 });

  try {
    const sb = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    const report = await runMaintenance(sb, agencyId);

    // Sync FanBasis payers onto the clients table as tracked customers (the coach's workspace only).
    const customerSync = fanbasisEnabledFor(agencyId)
      ? await syncFanbasisCustomers(sb, agencyId)
      : null;

    const errors = [
      ...report.link_unlinked_tx.errors,
      ...report.recompute_clients.errors,
      ...report.flag_orphans.errors,
      ...(customerSync?.errors ?? []),
    ];
    if (errors.length) {
      await alertOps(`maintenance: ${errors.length} step error(s)`, errors.join("\n"));
      return NextResponse.json({ ok: false, report, customerSync }, { status: 500 });
    }
    return NextResponse.json({ ok: true, report, customerSync });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await alertOps("maintenance cron threw", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
