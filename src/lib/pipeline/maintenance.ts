/**
 * Cold-path maintenance — keeps derived data in sync without relying on hot-
 * path webhooks. Runs nightly via /api/cron/maintenance.
 *
 * Steps (all idempotent):
 *   1. Link any unlinked transactions to their closed_won deals
 *   2. Recompute payment totals for every client with a deal or tx
 *   3. Flag closed_won deals that have no transactions linked (or unflag if
 *      they now do)
 *   4. (Optional) rebuild changed knowledge_doc dossiers
 *
 * Each step is best-effort and reports its own counts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types.generated";
import { linkTransactionToDeal, recomputeClientPaymentTotals } from "./post-payment";

type SB = SupabaseClient<Database>;

export type MaintenanceReport = {
  agency_id: string;
  ran_at: string;
  link_unlinked_tx: { scanned: number; linked: number; errors: string[] };
  recompute_clients: { scanned: number; updated: number; errors: string[] };
  flag_orphans: { scanned: number; flagged: number; cleared: number; errors: string[] };
  duration_ms: number;
};

export async function runMaintenance(sb: SB, agencyId: string): Promise<MaintenanceReport> {
  const t0 = Date.now();
  const report: MaintenanceReport = {
    agency_id: agencyId,
    ran_at: new Date().toISOString(),
    link_unlinked_tx: { scanned: 0, linked: 0, errors: [] },
    recompute_clients: { scanned: 0, updated: 0, errors: [] },
    flag_orphans: { scanned: 0, flagged: 0, cleared: 0, errors: [] },
    duration_ms: 0,
  };

  // --- 1. Link unlinked transactions ---
  try {
    const { data: txs } = await sb.from("transactions").select("id,metadata").eq("agency_id", agencyId);
    report.link_unlinked_tx.scanned = txs?.length ?? 0;
    for (const t of txs ?? []) {
      const meta = (t.metadata as Record<string, unknown> | null) ?? {};
      if (meta.deal_id) continue;
      const r = await linkTransactionToDeal(sb, agencyId, t.id);
      if (r.linked) report.link_unlinked_tx.linked++;
    }
  } catch (e) {
    report.link_unlinked_tx.errors.push(e instanceof Error ? e.message : "unknown");
  }

  // --- 2. Recompute client payment totals ---
  try {
    // Only clients that have at least one deal OR tx — others have nothing to recompute.
    const [{ data: dealClients }, { data: txClients }] = await Promise.all([
      sb.from("deals").select("client_id").eq("agency_id", agencyId).not("client_id", "is", null),
      sb.from("transactions").select("client_id").eq("agency_id", agencyId).not("client_id", "is", null),
    ]);
    const ids = new Set<string>([
      ...((dealClients ?? []).map(d => d.client_id!).filter(Boolean)),
      ...((txClients ?? []).map(t => t.client_id!).filter(Boolean)),
    ]);
    report.recompute_clients.scanned = ids.size;
    for (const id of ids) {
      try {
        await recomputeClientPaymentTotals(sb, agencyId, id);
        report.recompute_clients.updated++;
      } catch (e) {
        report.recompute_clients.errors.push(`${id}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
  } catch (e) {
    report.recompute_clients.errors.push(e instanceof Error ? e.message : "unknown");
  }

  // --- 3. Flag orphan closed_won deals ---
  try {
    const [{ data: deals }, { data: txs2 }] = await Promise.all([
      sb.from("deals").select("id,stage,data").eq("agency_id", agencyId).eq("stage", "closed_won"),
      sb.from("transactions").select("metadata").eq("agency_id", agencyId),
    ]);
    const dealCash = new Map<string, number>();
    for (const t of txs2 ?? []) {
      const meta = (t.metadata as Record<string, unknown> | null) ?? {};
      const did = meta.deal_id as string | undefined;
      if (did) dealCash.set(did, (dealCash.get(did) ?? 0) + 1);
    }
    report.flag_orphans.scanned = (deals ?? []).length;
    for (const d of deals ?? []) {
      const isOrphan = !dealCash.has(d.id);
      const data = ({ ...((d.data as Record<string, unknown>) ?? {}) }) as Record<string, unknown>;
      const wasFlagged = !!data.needs_review;
      if (isOrphan && !wasFlagged) {
        data.needs_review = true;
        data.review_reason = "Closed-won deal has no FanBasis transactions linked. Either paid via another rail or a payment is missing.";
        await sb.from("deals").update({ data: data as unknown as Json }).eq("id", d.id);
        report.flag_orphans.flagged++;
      } else if (!isOrphan && wasFlagged) {
        delete data.needs_review;
        delete data.review_reason;
        await sb.from("deals").update({ data: data as unknown as Json }).eq("id", d.id);
        report.flag_orphans.cleared++;
      }
    }
  } catch (e) {
    report.flag_orphans.errors.push(e instanceof Error ? e.message : "unknown");
  }

  report.duration_ms = Date.now() - t0;
  return report;
}
