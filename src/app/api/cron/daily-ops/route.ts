/**
 * Consolidated nightly ops cron.
 *
 * Vercel Hobby allows only 2 cron jobs (daily granularity), so this route packs
 * the data-integrity + watchdog work into one slot by invoking the maintenance
 * and self-discover handlers internally (both CRON_SECRET-gated; each alerts on
 * its own failures via alertOps). Scheduled in vercel.json next to creator-digest.
 *
 * NOTE: Hobby also caps function duration at 60s. At the current single-agency
 * scale maintenance + self-discover finish well under that; if the data grows
 * past the 60s budget, split these onto separate crons (requires Vercel Pro).
 *
 * GET /api/cron/daily-ops
 */
import { NextRequest, NextResponse } from "next/server";
import { alertOps } from "@/lib/ops-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Step = { name: string; status: number; ok: boolean; error?: string; body?: unknown };

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const base = req.nextUrl.origin;
  const headers = { Authorization: `Bearer ${secret}` };

  async function run(name: string, path: string): Promise<Step> {
    try {
      // Cap each sub-route at 25s. Two steps × 25s = 50s, inside Hobby's 60s wall.
      // Without this an unreachable/hung sub-route would block until the platform
      // kills the function mid-await — and the kill skips the catch below, so the
      // "unreachable" alert would never fire. The timeout turns a hang into a
      // catchable AbortError that DOES alert.
      const res = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(25_000) });
      const body = await res.json().catch(() => ({}));
      return { name, status: res.status, ok: res.ok && body?.ok !== false, body };
    } catch (e) {
      return { name, status: 0, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Sequential: maintenance reconciles derived data, then self-discover audits it.
  const steps: Step[] = [];
  steps.push(await run("maintenance", "/api/cron/maintenance"));
  steps.push(await run("self-discover", "/api/cron/self-discover"));

  // The sub-routes alert on their own logic failures; alert here only for the gap
  // they can't cover themselves — being unreachable (i.e. they never ran).
  const unreachable = steps.filter(s => s.status === 0);
  if (unreachable.length) {
    await alertOps(`daily-ops: ${unreachable.length} step(s) unreachable`,
      unreachable.map(s => `${s.name}: ${s.error ?? "no response"}`).join("\n"));
  }

  const ok = steps.every(s => s.ok);
  return NextResponse.json({ ok, ran_at: new Date().toISOString(), steps }, ok ? undefined : { status: 500 });
}
