import { fetchFanbasisRevenue, fanbasisEnabledFor, fanbasisLifetimeStats, type OfferRow } from "@/lib/coach/fanbasis";
import { fetchAttribution, type SourceRow } from "@/lib/coach/attribution";
import { loadCoachConfig, fetchDanTraffic } from "@/lib/coach/funnel-traffic";
import { danKitEnabledFor, fetchDanKit, type DanKitSnapshot } from "@/lib/coach/kit";
import { fetchPipelineProbes } from "@/lib/coach/data-health";
import { fetchIclosedBookings, iclosedEnabledFor } from "@/lib/coach/iclosed";
import {
  salesSheetIdFor, getStudents, getCloser, getPaymentSchedule, getFanbasisEvents,
  computeSalesMetrics, getStudentLifecycle, parseDDMMYYYY, num,
} from "@/lib/sheets-data";
import type { DateRange } from "@/lib/creator/range";
import { parseRange, labelForRange } from "@/lib/creator/range";
import { AnalyticsSelector } from "@/components/coach/analytics-selector";
import { KpiCard, PendingKpi } from "@/components/creator-dashboard/kpi-card";
import { BarList, SessionsSparkline, UtmDonut, RevenueChart } from "@/components/creator-dashboard/charts";
import { Funnel } from "@/components/creator-dashboard/funnel";
import { ProgressBar } from "@/components/creator-dashboard/progress-bar";
import { fmtInt, fmtMoney, fmtPct, fmtDuration, fmtPath, fmtReferrer, fmtUtmSource } from "@/lib/creator/format";

// the coach's analytics. Mirrors the creator's CreatorDashboard section-for-section (same components, same
// layout) so the two client dashboards are identical to navigate, but wired to the coach's sources:
//   Revenue / offers      -> FanBasis (live API)
//   Subscriptions / MRR   -> the coach Sales sheet (Payment Schedule = renewals, late/failed flagged)
//   Opt-ins               -> on-page email submits (GA4 generate_lead) + Kit list (when keyed)
//   Traffic / funnel / scroll-depth -> GA4 (scoped to the selected funnel)
// A single funnel selector + timeline scopes every section. Gated to the coach upstream in page.tsx.

// Lifetime revenue goal for the progress bar (the coach high-ticket). Mirrors the creator's revenue-goal bar.
const REVENUE_GOAL = 50000;

type SheetMetrics = ReturnType<typeof computeSalesMetrics>;
interface SheetBundle { metrics: SheetMetrics; schedule: Record<string, unknown>[]; students: Record<string, unknown>[]; events: Record<string, unknown>[] }

// ── Data health (trust panel) ──
type Health = "ok" | "warn" | "down";
interface HealthRow { source: string; status: Health; detail: string; fresh: string | null }
const HEALTH_COLOR: Record<Health, string> = { ok: "#00D393", warn: "#F8AF00", down: "#FF6466" };

// Relative "time since" for freshness chips. Server-rendered at request time.
function ago(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 0) return "just now";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Map a funnel name to its FanBasis offer section so picking a funnel also scopes revenue.
function offerForFunnel(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  if (n.includes("retreat")) return "Example Event";
  if (n.includes("society")) return "the Membership";
  if (n.includes("example") || n.includes("partner")) return "your agency";
  if (n.includes("webinar") || n.includes("masterclass")) return "Webinar";
  return undefined;
}

async function loadSheet(agencyId: string): Promise<SheetBundle | null> {
  const sheetId = salesSheetIdFor(agencyId);
  if (!sheetId) return null;
  const [students, closer, schedule, events] = await Promise.all([
    getStudents(sheetId),
    getCloser(sheetId),
    getPaymentSchedule(sheetId),
    getFanbasisEvents(sheetId),
  ]);
  return { metrics: computeSalesMetrics(closer, students, schedule), schedule, students, events };
}

// Funnel step ratios must land in 0–100%. Above 100% means the numerator and denominator come
// from sources that disagree (FanBasis buyers vs adblock-undercounted GA4 visitors) — show "—".
function stepRatio(numer: number | null | undefined, den: number | null | undefined): number | null {
  if (numer == null || !den || den <= 0 || numer < 0) return null;
  const r = numer / den;
  return r <= 1.0001 ? r : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{title}</div>
      {children}
    </section>
  );
}
function Panel({ title, badge, children }: { title?: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{title}</div>
          {badge && (
            <span className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF]">{badge}</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown";
}
function curSymbol(code: string): string {
  const c = (code || "").toUpperCase();
  return c === "EUR" ? "€" : c === "GBP" ? "£" : c === "USD" ? "$" : (c ? c + " " : "$");
}

function OfferBars({ rows }: { rows: OfferRow[] }) {
  if (!rows.length) return <div className="text-xs text-[#6B7280]">No sales in this range yet.</div>;
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.section} className="relative">
          <div className="absolute inset-y-0 left-0 rounded bg-[#00D393]/15" style={{ width: `${(r.revenue / max) * 100}%` }} aria-hidden />
          <div className="relative flex items-center justify-between px-2.5 py-1.5 text-sm">
            <span className="truncate text-[#F5F5F7]" title={r.section}>{r.section}</span>
            <span className="ml-2 font-mono text-xs tabular-nums text-[#9CA3AF]">
              {r.customers} {r.customers === 1 ? "buyer" : "buyers"} · {fmtMoney(r.revenue, "USD")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Revenue by source/campaign/content — FanBasis sales joined to captured UTM by email.
function AttributionBars({ rows, empty }: { rows: SourceRow[]; empty: string }) {
  const real = rows.filter((r) => r.revenue > 0);
  if (!real.length) return <div className="text-xs text-[#6B7280]">{empty}</div>;
  const max = Math.max(...real.map((r) => r.revenue), 1);
  return (
    <div className="space-y-1.5">
      {real.slice(0, 10).map((r) => {
        const label = r.key === "(untagged)" ? "Untagged / direct" : r.key;
        return (
          <div key={r.key} className="relative">
            <div className="absolute inset-y-0 left-0 rounded bg-[#00D393]/15" style={{ width: `${(r.revenue / max) * 100}%` }} aria-hidden />
            <div className="relative flex items-center justify-between px-2.5 py-1.5 text-sm">
              <span className="truncate text-[#F5F5F7]" title={r.key}>{label}</span>
              <span className="ml-2 font-mono text-xs tabular-nums text-[#9CA3AF]">
                {r.count} {r.count === 1 ? "sale" : "sales"} · {fmtMoney(r.revenue, "USD")}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Content leaderboard — each individual piece (utm_content: a specific email/video/reel) with
// visitors (GA4) joined to sales + revenue (FanBasis via email). "Which piece actually sells."
function ContentLeaderboard({ visitors, revenue }: { visitors: ReadonlyArray<{ label: string; sessions: number }>; revenue: SourceRow[] }) {
  const SKIP = new Set(["", "(not set)", "(direct)", "(organic)", "(referral)", "(none)", "(untagged)"]);
  const map = new Map<string, { piece: string; visitors: number; sales: number; revenue: number }>();
  for (const v of visitors) {
    const k = (v.label || "").trim();
    if (SKIP.has(k.toLowerCase())) continue;
    const cell = map.get(k.toLowerCase()) ?? { piece: k, visitors: 0, sales: 0, revenue: 0 };
    cell.visitors += v.sessions;
    map.set(k.toLowerCase(), cell);
  }
  for (const r of revenue) {
    const k = (r.key || "").trim();
    if (SKIP.has(k.toLowerCase())) continue;
    const cell = map.get(k.toLowerCase()) ?? { piece: k, visitors: 0, sales: 0, revenue: 0 };
    cell.sales += r.count;
    cell.revenue += r.revenue;
    map.set(k.toLowerCase(), cell);
  }
  const rows = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.visitors - a.visitors).slice(0, 20);
  if (!rows.length) {
    return <div className="text-xs text-[#6B7280]">No tagged content pieces yet. Give each email / video / reel its own <span className="font-mono text-[#9CA3AF]">content</span> tag in the Links tab and they rank here by revenue.</div>;
  }
  const maxRev = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[1.6fr_0.8fr_0.6fr_0.9fr] gap-x-3 border-b border-white/10 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
          <div>Content piece</div><div className="text-right">Visitors</div><div className="text-right">Sales</div><div className="text-right">Revenue</div>
        </div>
        {rows.map((r) => (
          <div key={r.piece} className="relative border-b border-white/5">
            <div className="absolute inset-y-0 left-0 rounded bg-[#00D393]/10" style={{ width: `${(r.revenue / maxRev) * 100}%` }} aria-hidden />
            <div className="relative grid grid-cols-[1.6fr_0.8fr_0.6fr_0.9fr] items-center gap-x-3 py-2 text-sm">
              <div className="truncate text-[#F5F5F7]" title={r.piece}>{r.piece}</div>
              <div className="text-right font-mono tabular-nums text-[#9CA3AF]">{fmtInt(r.visitors)}</div>
              <div className="text-right font-mono tabular-nums text-[#F5F5F7]">{r.sales || "—"}</div>
              <div className="text-right font-mono tabular-nums text-[#00D393]">{r.revenue ? fmtMoney(r.revenue, "USD") : "—"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// "How far down the page people get" — same idea as the creator's PageScrollMap, but thumbnail-less
// (the coach's pages differ per funnel). Each row = a section, bar length + colour = how many reach it,
// ▼ marks the biggest drop-offs.
function PageScrollMap({ steps }: { steps: ReadonlyArray<{ label: string; sessions: number }> }) {
  const top = steps.length ? Math.max(...steps.map((s) => s.sessions)) : 0;
  if (top <= 0) {
    return <div className="text-xs text-[#6B7280]">No scroll-depth data yet (events populate 24–48h after launch).</div>;
  }
  const heat = (frac: number) => (frac >= 0.75 ? "#00D393" : frac >= 0.5 ? "#84cc16" : frac >= 0.3 ? "#F8AF00" : "#FF6466");
  const shadow = { textShadow: "0 1px 3px rgba(0,0,0,0.65)" };
  return (
    <div>
      {steps.map((s, i) => {
        const frac = top > 0 ? s.sessions / top : 0;
        const prev = i > 0 ? steps[i - 1].sessions : null;
        const drop = prev && prev > 0 ? Math.max(0, 1 - s.sessions / prev) : null;
        const bigDrop = drop !== null && drop >= 0.3;
        return (
          <div key={s.label}>
            {bigDrop && (
              <div className="flex items-center gap-1.5 py-1 text-[10px] font-semibold text-[#FF6466]">
                <span>▼</span><span>{fmtPct(drop as number, 0)} drop-off here</span>
              </div>
            )}
            <div className="flex items-center gap-3 py-1.5">
              <div className="relative h-11 flex-1 overflow-hidden rounded-md" style={{ background: "rgba(255,255,255,0.045)" }}>
                <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, Math.max(6, frac * 100))}%`, background: heat(frac), opacity: 0.85 }} aria-hidden />
                <div className="relative flex h-full items-center justify-between px-3">
                  <span className="text-[13px] font-semibold text-white" style={shadow}>{s.label}</span>
                  <span className="font-mono text-[11px] font-semibold text-white" style={shadow}>{fmtInt(s.sessions)} · {fmtPct(frac, 0)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div className="mt-2 text-[10px] leading-relaxed text-[#6B7280]">
        Each row is a section of the page, top to bottom. Bar length + colour = how many people scroll that far. ▼ marks the biggest drop-offs. Pick a funnel up top to see it for one funnel.
      </div>
    </div>
  );
}

// ─── Subscriptions & payment plans (each member's installment plan, late/failed flagged) ───
type SubStatus = "failed" | "late" | "paid" | "active";
interface SubRow {
  name: string;
  plan: string;
  made: number;
  total: number | null;
  balance: number;
  next: { date: string; amount: number; currency: string } | null;
  lateCount: number;
  status: SubStatus;
}
function buildSubscriptions(students: Record<string, unknown>[], schedule: Record<string, unknown>[]): SubRow[] {
  const str = (v: unknown) => String(v ?? "").trim();
  const out: SubRow[] = students
    .filter((s) => str(s["Email"]))
    .map((s) => {
      const email = str(s["Email"]).toLowerCase();
      const mine = schedule.filter((r) => str(r["Student Email"]).toLowerCase() === email);
      const late = mine.filter((r) => str(r["Status"]) === "Late" || num(r["Days Late"]) > 0);
      const upcoming = mine
        .filter((r) => str(r["Status"]) === "Pending" || str(r["Status"]) === "Late")
        .map((r) => ({ d: parseDDMMYYYY(str(r["Due Date"])), date: str(r["Due Date"]), amount: num(r["Amount"]), currency: str(r["Currency"]) || "USD" }))
        .filter((r) => r.d)
        .sort((a, b) => (a.d as Date).getTime() - (b.d as Date).getTime());
      const lifecycle = getStudentLifecycle(str(s["Notes"]));
      const remainingRaw = str(s["Payments Remaining"]);
      const made = num(s["Payments Made"]);
      const remaining = /^\d+$/.test(remainingRaw) ? Number(remainingRaw) : null;
      const balance = num(s["Balance Owed"]);
      const sStatus = str(s["Status"]).toLowerCase();
      const status: SubStatus =
        lifecycle === "unconfirmed" ? "failed"
        : late.length > 0 ? "late"
        : sStatus.includes("paid in full") || sStatus === "graduated" || (balance <= 0 && upcoming.length === 0) ? "paid"
        : "active";
      return {
        name: str(s["Name"]) || str(s["Email"]),
        plan: str(s["Plan"]).replace("Financed via Fanbasis", "Fanbasis").replace("Financed In House", "In House"),
        made,
        total: remaining != null ? made + remaining : null,
        balance,
        next: upcoming[0] ? { date: upcoming[0].date, amount: upcoming[0].amount, currency: upcoming[0].currency } : null,
        lateCount: late.length,
        status,
      };
    });
  const rank: Record<SubStatus, number> = { failed: 0, late: 1, active: 2, paid: 3 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || (a.next?.date ?? "z").localeCompare(b.next?.date ?? "z"));
}
function StatusPill({ status, lateCount }: { status: SubStatus; lateCount: number }) {
  const map: Record<SubStatus, { text: string; cls: string }> = {
    failed: { text: "Failed payment", cls: "border-[#FF6466]/40 bg-[#FF6466]/10 text-[#FF6466]" },
    late: { text: lateCount > 1 ? `${lateCount} late` : "Late", cls: "border-[#FF6466]/40 bg-[#FF6466]/10 text-[#FF6466]" },
    paid: { text: "Paid in full", cls: "border-[#00D393]/30 bg-[#00D393]/10 text-[#00D393]" },
    active: { text: "On track", cls: "border-[rgba(255,255,255,0.10)] bg-white/5 text-[#9CA3AF]" },
  };
  const m = map[status];
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.cls}`}>{m.text}</span>;
}
function SubscriptionsTable({ rows }: { rows: SubRow[] }) {
  if (!rows.length) return <div className="text-xs text-[#6B7280]">No payment plans on file yet.</div>;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[1.4fr_1fr_0.7fr_1.1fr_1fr] gap-x-3 border-b border-white/10 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
          <div>Member</div><div>Plan</div><div className="text-right">Progress</div><div className="text-right">Next payment</div><div className="text-right">Status</div>
        </div>
        {rows.map((r) => {
          const flag = r.status === "late" || r.status === "failed";
          return (
            <div key={r.name} className={`grid grid-cols-[1.4fr_1fr_0.7fr_1.1fr_1fr] items-center gap-x-3 border-b border-white/5 py-2 text-sm ${flag ? "bg-[#FF6466]/[0.04]" : ""}`}>
              <div className="truncate text-[#F5F5F7]" title={r.name}>{r.name}</div>
              <div className="truncate text-[#9CA3AF]" title={r.plan}>{r.plan || "—"}</div>
              <div className="text-right font-mono tabular-nums text-[#9CA3AF]">{r.total != null ? `${r.made}/${r.total}` : (r.made || "—")}</div>
              <div className="text-right font-mono tabular-nums text-[#F5F5F7]">
                {r.next ? <>{r.next.date} <span className="text-[#6B7280]">· {curSymbol(r.next.currency)}{fmtInt(r.next.amount)}</span></> : <span className="text-[#6B7280]">—</span>}
              </div>
              <div className="flex justify-end"><StatusPill status={r.status} lateCount={r.lateCount} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Recurring FanBasis subscriptions, from the captured webhook events in the sheet ───
// The FanBasis pull API has no subscription status, but FanBasis already posts events
// (payment.succeeded / payment.failed / subscription.renewed / cancelled) into the
// "FanBasis Raw Events" tab via Make. We group by Subscription ID, take the latest event per
// sub, and flag failures — so renew/fail tracks automatically with zero FanBasis access.
type FbSubStatus = "active" | "failed" | "cancelled";
interface FbSubRow { buyer: string; subId: string; lastDate: string; amount: number; currency: string; status: FbSubStatus }
interface FbSubSummary { rows: FbSubRow[]; active: number; failed: number; failedAmount: number; renewedInRange: number; hasReal: boolean }
function summarizeFanbasisSubs(events: Record<string, unknown>[], range: DateRange): FbSubSummary {
  const str = (v: unknown) => String(v ?? "").trim();
  // Drop the setup/audit rows used while wiring the webhook (Audit Test … / *_upstream / test_*).
  const isSetupRow = (e: Record<string, unknown>) =>
    /test|audit|upstream/i.test(`${str(e["Buyer Name"])} ${str(e["Buyer Email"])} ${str(e["Payment ID"])} ${str(e["Subscription ID"])}`);
  const real = events.filter((e) => str(e["Subscription ID"]) && !isSetupRow(e));
  const bySub = new Map<string, Record<string, unknown>[]>();
  for (const e of real) {
    const id = str(e["Subscription ID"]);
    const arr = bySub.get(id) ?? [];
    arr.push(e);
    bySub.set(id, arr);
  }
  const rows: FbSubRow[] = [];
  let renewedInRange = 0;
  for (const [id, evs] of bySub) {
    evs.sort((a, b) => str(a["Received At"]).localeCompare(str(b["Received At"])));
    const latest = evs[evs.length - 1];
    const blob = `${str(latest["Subscription Status"])} ${str(latest["Event Type"])}`.toLowerCase();
    const status: FbSubStatus = /fail|past_due|declin|unpaid/.test(blob) ? "failed" : /cancel/.test(blob) ? "cancelled" : "active";
    rows.push({
      buyer: str(latest["Buyer Name"]) || str(latest["Buyer Email"]) || "Unknown",
      subId: id,
      lastDate: str(latest["Received At"]).slice(0, 10),
      amount: num(latest["Amount (raw)"]),
      currency: str(latest["Currency"]) || "USD",
      status,
    });
    for (const e of evs) {
      const d = str(e["Received At"]).slice(0, 10);
      const t = `${str(e["Event Type"])} ${str(e["Subscription Status"])}`.toLowerCase();
      if (d >= range.from && d <= range.to && /succeed|renew|paid|active/.test(t)) renewedInRange += 1;
    }
  }
  const rank: Record<FbSubStatus, number> = { failed: 0, cancelled: 1, active: 2 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.lastDate.localeCompare(a.lastDate));
  return {
    rows,
    active: rows.filter((r) => r.status === "active").length,
    failed: rows.filter((r) => r.status === "failed").length,
    failedAmount: rows.filter((r) => r.status === "failed").reduce((s, r) => s + r.amount, 0),
    renewedInRange,
    hasReal: rows.length > 0,
  };
}
function FbStatusPill({ status }: { status: FbSubStatus }) {
  const map: Record<FbSubStatus, { text: string; cls: string }> = {
    failed: { text: "Payment failed", cls: "border-[#FF6466]/40 bg-[#FF6466]/10 text-[#FF6466]" },
    cancelled: { text: "Cancelled", cls: "border-[#F8AF00]/30 bg-[#F8AF00]/10 text-[#F8AF00]" },
    active: { text: "Active", cls: "border-[#00D393]/30 bg-[#00D393]/10 text-[#00D393]" },
  };
  const m = map[status];
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.cls}`}>{m.text}</span>;
}
function FanbasisSubsPanel({ fb }: { fb: FbSubSummary }) {
  if (!fb.hasReal) {
    return (
      <div className="text-[11px] leading-relaxed text-[#6B7280]">
        No live FanBasis subscription events captured yet. Renewals and failed payments appear here automatically as FanBasis posts them into the &ldquo;FanBasis Raw Events&rdquo; capture (only setup/test events present so far). The FanBasis API itself does not expose subscription status, so this event feed is the source.
      </div>
    );
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <div><span className="font-mono text-lg text-[#00D393]">{fmtInt(fb.active)}</span> <span className="text-xs text-[#6B7280]">active</span></div>
        <div><span className="font-mono text-lg text-[#F5F5F7]">{fmtInt(fb.renewedInRange)}</span> <span className="text-xs text-[#6B7280]">renewed in range</span></div>
        <div><span className="font-mono text-lg text-[#FF6466]">{fmtInt(fb.failed)}</span> <span className="text-xs text-[#6B7280]">failed{fb.failedAmount > 0 ? ` · ${fmtMoney(fb.failedAmount, "USD")}` : ""}</span></div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-[1.4fr_1fr_0.9fr_1fr] gap-x-3 border-b border-white/10 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
            <div>Subscriber</div><div>Last event</div><div className="text-right">Amount</div><div className="text-right">Status</div>
          </div>
          {fb.rows.map((r) => {
            const flag = r.status === "failed";
            return (
              <div key={r.subId} className={`grid grid-cols-[1.4fr_1fr_0.9fr_1fr] items-center gap-x-3 border-b border-white/5 py-2 text-sm ${flag ? "bg-[#FF6466]/[0.04]" : ""}`}>
                <div className="truncate text-[#F5F5F7]" title={`${r.buyer} · ${r.subId}`}>{r.buyer}</div>
                <div className="font-mono text-xs text-[#9CA3AF]">{r.lastDate || "—"}</div>
                <div className="text-right font-mono tabular-nums text-[#F5F5F7]">{r.amount ? `${curSymbol(r.currency)}${fmtInt(r.amount)}` : "—"}</div>
                <div className="flex justify-end"><FbStatusPill status={r.status} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Data health: one row per pipe feeding this page, with freshness + overall coverage ───
function DataHealthPanel({
  overall, rows, coverage, leadsCaptured,
}: { overall: Health; rows: HealthRow[]; coverage: number | null; leadsCaptured: number }) {
  const headline =
    overall === "ok" ? "All pipes reporting"
    : overall === "warn" ? "Reporting · a couple pipes need a nudge"
    : "A core data source is down";
  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: HEALTH_COLOR[overall] }} aria-hidden />
            <span className="relative inline-flex size-2.5 rounded-full" style={{ background: HEALTH_COLOR[overall] }} aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[#F5F5F7]">{headline}</span>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg tabular-nums text-[#F5F5F7]">{coverage === null ? "—" : fmtPct(coverage, 0)}</div>
          <div className="text-[10px] uppercase tracking-wider text-[#6B7280]">revenue attributed · {fmtInt(leadsCaptured)} leads captured</div>
        </div>
      </div>
      <div className="-mx-2">
        {rows.map((r) => (
          <div key={r.source} className="flex items-center gap-3 rounded-md px-2 py-2 odd:bg-white/[0.018]">
            <span className="size-2 shrink-0 rounded-full" style={{ background: HEALTH_COLOR[r.status] }} aria-hidden />
            <span className="w-40 shrink-0 truncate text-sm font-medium text-[#F5F5F7]">{r.source}</span>
            <span className="flex-1 truncate text-xs text-[#9CA3AF]" title={r.detail}>{r.detail}</span>
            {r.fresh && <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#6B7280]">{r.fresh}</span>}
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
        Green = flowing, amber = needs a nudge (not broken), red = down. Freshness is the last time each pipe received data. GA4 runs 24–48h behind by design, so its numbers always lag the others slightly.
      </div>
    </Panel>
  );
}

export async function CoachAnalytics({
  agencyId,
  firstName,
  searchParams,
}: {
  agencyId: string;
  firstName: string | null;
  searchParams: { [k: string]: string | string[] | undefined };
}) {
  const cfg = await loadCoachConfig(agencyId);
  // Default to a 12-month window so the page isn't empty (sales/sessions predate 7 days).
  const range = parseRange(typeof searchParams.range === "string" ? searchParams : { ...searchParams, range: "12m" });
  const funnelKey = typeof searchParams.funnel === "string" ? searchParams.funnel : "";
  const funnel = cfg.funnels.find((f) => f.key === funnelKey);
  const offer = offerForFunnel(funnel?.name);

  // Funnel scope for GA4 (on-domain step paths of the selected funnel; whole site when "All").
  const scopePaths = funnel
    ? (funnel.steps.filter((s) => s.path && !s.offsite).map((s) => s.path!) as string[])
    : undefined;

  const [rev, traffic, sheet, kit, attr, probes, fbLife, ic] = await Promise.all([
    fanbasisEnabledFor(agencyId) ? fetchFanbasisRevenue({ range, offer }).catch(() => null) : Promise.resolve(null),
    cfg.ga4PropertyId
      ? fetchDanTraffic({ propertyId: cfg.ga4PropertyId, range, scopePaths, steps: funnel?.steps ?? [] }).catch(() => null)
      : Promise.resolve(null),
    loadSheet(agencyId).catch(() => null),
    danKitEnabledFor(agencyId) ? fetchDanKit({ range }).catch(() => null as DanKitSnapshot | null) : Promise.resolve(null),
    fanbasisEnabledFor(agencyId) ? fetchAttribution({ agencyId, range, offer }).catch(() => null) : Promise.resolve(null),
    fetchPipelineProbes(agencyId).catch(() => null),
    fanbasisEnabledFor(agencyId) ? fanbasisLifetimeStats().catch(() => null) : Promise.resolve(null),
    iclosedEnabledFor(agencyId) ? fetchIclosedBookings(range).catch(() => null) : Promise.resolve(null),
  ]);
  // Share of in-range revenue we can tie to a source (rest = bought cold / before tracking).
  const attrPct = attr && attr.taggedRevenue + attr.untaggedRevenue > 0
    ? attr.taggedRevenue / (attr.taggedRevenue + attr.untaggedRevenue)
    : null;

  const m = sheet?.metrics ?? null;
  const scopeLabel = funnel ? funnel.name : "All funnels & offers";
  const onDomainSteps = (traffic?.steps ?? []).filter((s) => !s.offsite && s.path);
  const offsiteSteps = (traffic?.steps ?? []).filter((s) => s.offsite);
  const boughtForFunnel = rev && offer ? rev.byOffer.find((o) => o.section === offer)?.customers ?? 0 : null;

  // Funnel KPI math (scoped). Bought = funnel buyers when a funnel is picked, else all buyers.
  const visits = traffic?.visitors ?? null;
  const started = traffic?.beginCheckout ?? null;
  const bought = funnel ? boughtForFunnel : (rev?.customerCount ?? null);
  const startedToBuy = stepRatio(bought, started);
  const visitToBuy = stepRatio(bought, visits);
  const cartAbandoned = started != null && bought != null ? Math.max(0, started - bought) : null;
  const abandonRate = started != null && started > 0 && bought != null ? Math.max(0, 1 - bought / started) : null;

  // LTV across ALL FanBasis buyers (every offer), not just financed students in the sheet.
  // Falls back to the sheet only when FanBasis is unavailable for this tenant.
  const ltv = fbLife && fbLife.customers > 0
    ? fbLife.ltv
    : (m && m.studentsCount > 0 ? m.totalCash / m.studentsCount : null);
  const optInRate = stepRatio(traffic?.generateLead, visits);
  const subs = sheet ? buildSubscriptions(sheet.students, sheet.schedule) : [];
  const fbSubs = summarizeFanbasisSubs(sheet?.events ?? [], range);

  // ── Data health: an independent freshness/coverage read on every pipe feeding this page,
  // so the first thing on the page answers "can I trust these numbers". ──
  const healthRows: HealthRow[] = [
    {
      source: "FanBasis (revenue)",
      status: rev ? "ok" : "down",
      detail: rev ? `Live API · ${fmtInt(rev.customerCount)} buyers feeding revenue in range` : "API unreachable, revenue may be stale",
      fresh: rev ? ago(rev.fetchedAt) : null,
    },
    {
      source: "GA4 (traffic)",
      status: traffic ? (traffic.sessions > 0 ? "ok" : "warn") : "down",
      detail: traffic ? `${fmtInt(traffic.sessions)} sessions · ${fmtInt(traffic.visitors)} visitors in range` : "Not reporting",
      fresh: null,
    },
    {
      source: "the coach Sales sheet",
      status: sheet ? "ok" : "down",
      detail: sheet
        ? `${fmtInt(sheet.students.length)} members · ${fmtInt(sheet.schedule.length)} payment rows · ${fmtInt(m?.totalBooked ?? 0)} calls logged`
        : "Sheet unreachable",
      fresh: null,
    },
    {
      source: "UTM capture",
      status: probes && probes.leadsCaptured > 0 ? "ok" : "warn",
      detail: probes && probes.leadsCaptured > 0
        ? `${fmtInt(probes.leadsCaptured)} leads captured · ${fmtInt(probes.leadsWithSource)} carry a source`
        : "No opt-in attribution captured yet",
      fresh: probes ? ago(probes.lastCaptureAt) : null,
    },
    {
      source: "FanBasis subscriptions",
      status: fbSubs.hasReal ? "ok" : "warn",
      detail: fbSubs.hasReal
        ? `${fmtInt(fbSubs.active)} active · ${fmtInt(fbSubs.failed)} failed · renew/fail events live`
        : "Only setup/test events so far, renew/fail feed not live yet",
      fresh: null,
    },
    {
      source: "Kit (email)",
      status: kit ? "ok" : "warn",
      detail: kit ? `${fmtInt(kit.totalSubscribers)} subscribers on the list` : "Needs a valid the coach Kit secret",
      fresh: null,
    },
    {
      source: "iClosed bookings",
      status: ic || (probes && probes.iclosedCalls > 0) ? "ok" : "warn",
      detail: ic
        ? `Live API · ${fmtInt(ic.booked)} booked in range · ${fmtInt(ic.totalAllTime)} on record`
        : probes && probes.iclosedCalls > 0
        ? `${fmtInt(probes.iclosedCalls)} bookings received via webhook`
        : "Webhook not on yet, booked calls come from the Closer log",
      fresh: ic ? ago(ic.fetchedAt) : probes && probes.iclosedCalls > 0 ? ago(probes.lastIclosedAt) : null,
    },
  ];
  const healthOverall: Health = healthRows.some((r) => r.status === "down")
    ? "down"
    : healthRows.some((r) => r.status === "warn")
    ? "warn"
    : "ok";

  return (
    <div className="space-y-8">
      {/* Header — same shape as the creator's, plus the funnel filter */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#F5F5F7]" style={{ fontFamily: "var(--font-settoku-display)" }}>
            {firstName ? `Hey ${firstName}` : "Analytics"} <span className="text-[#9CA3AF]">·</span> {scopeLabel}
          </h2>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            {labelForRange(range)} ({range.from} → {range.to}) · vs prior {range.prevFrom} → {range.prevTo}
          </p>
        </div>
        <AnalyticsSelector funnels={cfg.funnels.map((f) => ({ key: f.key, name: f.name }))} funnel={funnelKey} range={range.preset} />
      </div>

      {/* ───────── Data health (trust panel) ───────── */}
      <Section title="Data health">
        <DataHealthPanel overall={healthOverall} rows={healthRows} coverage={attrPct} leadsCaptured={probes?.leadsCaptured ?? 0} />
      </Section>

      {/* ───────── Revenue ───────── */}
      <Section title="Revenue">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {rev ? (
            <KpiCard label="Revenue" value={fmtMoney(rev.totalRevenue, "USD")} hint="FanBasis, paid in range"
              current={rev.totalRevenue} prior={rev.totalRevenuePrior} source="FanBasis" />
          ) : (
            <PendingKpi label="Revenue" pendingOn="FanBasis" hint="paid revenue in range" />
          )}
          {m ? (
            <KpiCard label="Next 30 days" value={fmtMoney(m.nextMonthProjection, "USD")} hint="scheduled payments due (renewals)" source="Sheet" />
          ) : (
            <PendingKpi label="Next 30 days" pendingOn="Sheet" hint="upcoming scheduled payments" />
          )}
          {rev ? (
            <KpiCard label="Buyers" value={fmtInt(rev.customerCount)} hint="customers who paid"
              current={rev.customerCount} prior={rev.customerCountPrior} source="FanBasis" />
          ) : (
            <PendingKpi label="Buyers" pendingOn="FanBasis" hint="paying customers in range" />
          )}
          {rev ? (
            <KpiCard label="Avg order" value={rev.aov ? fmtMoney(rev.aov, "USD") : "—"} hint="revenue ÷ buyers" source="FanBasis" />
          ) : (
            <PendingKpi label="Avg order" pendingOn="FanBasis" hint="revenue ÷ buyers" />
          )}
        </div>
        <Panel>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Revenue goal (in range)</div>
            {!rev && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-400">Pending FanBasis</span>}
          </div>
          <ProgressBar value={rev?.totalRevenue ?? 0} target={REVENUE_GOAL} format={(n) => fmtMoney(n, "USD")} />
        </Panel>
        <Panel title="Revenue over time" badge="FanBasis">
          {rev ? <RevenueChart points={rev.byDay} currency="USD" /> : <div className="text-xs text-[#6B7280]">Waiting for FanBasis.</div>}
        </Panel>
      </Section>

      {/* ───────── Sales funnel (scoped to selected funnel) ───────── */}
      <Section title="Sales funnel">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {traffic ? (
            <KpiCard label="Visitors" value={fmtInt(traffic.visitors)} hint="unique people in funnel"
              current={traffic.visitors} prior={traffic.visitorsPrior} source="GA4" />
          ) : (
            <PendingKpi label="Visitors" pendingOn="GA4" hint="unique visitors" />
          )}
          {traffic ? (
            <KpiCard label="Started checkout" value={fmtInt(traffic.beginCheckout)} hint="begin_checkout (clicked to pay)"
              current={traffic.beginCheckout} prior={traffic.beginCheckoutPrior} source="GA4" />
          ) : (
            <PendingKpi label="Started checkout" pendingOn="GA4" hint="begin_checkout clicks" />
          )}
          {bought != null ? (
            <KpiCard label="Bought" value={fmtInt(bought)} accent="good" hint={funnel ? "buyers of this offer" : "all buyers in range"} source="FanBasis" />
          ) : (
            <PendingKpi label="Bought" pendingOn="FanBasis" hint="buyers in range" />
          )}
          <KpiCard label="Visitor → buy" value={visitToBuy === null ? "—" : fmtPct(visitToBuy, 2)}
            hint="buyers ÷ visitors" source="Blended" sourceTone={visitToBuy === null ? "pending" : "ok"} />
        </div>
        <Panel>
          {funnel && onDomainSteps.length > 0 ? (
            <>
              <Funnel steps={[...onDomainSteps.map((s) => ({ label: s.label, value: s.users })), { label: "Bought", value: boughtForFunnel }]} />
              {offsiteSteps.length > 0 && (
                <div className="mt-4 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-[#6B7280]">
                  Off-site steps (tracked at the provider, no GA4 pageview):{" "}
                  {offsiteSteps.map((s, i) => (
                    <span key={i} className="text-[#9CA3AF]">{s.label} ({s.offsite === "iclosed" ? "iClosed" : s.offsite === "kit" ? "Kit" : s.offsite}){i < offsiteSteps.length - 1 ? " · " : ""}</span>
                  ))}
                </div>
              )}
              <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
                Unique visitors per step from GA4 (directional), then buyers from FanBasis. Started → buy {startedToBuy === null ? "—" : fmtPct(startedToBuy, 1)}. Pick a different funnel up top.
              </div>
            </>
          ) : (
            <div className="text-sm text-[#9CA3AF]">
              Pick a funnel up top (Webinar, Launch, Bundle) to see its step-by-step drop-off.
              {traffic && (
                <div className="mt-4"><BarList rows={traffic.topPaths.map((r) => ({ ...r, label: fmtPath(r.label) }))} /></div>
              )}
            </div>
          )}
        </Panel>
      </Section>

      {/* ───────── Calls & close rate ───────── */}
      <Section title="Calls & close rate">
        {m ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Booked calls" value={fmtInt(m.totalBooked)} hint="logged calls (incl. no-shows)" source="Closer log" />
              <KpiCard label="Show rate" value={fmtPct(m.showRate, 0)} hint={`${fmtInt(m.totalLive)} held ÷ ${fmtInt(m.totalBooked)} booked`} source="Closer log" />
              <KpiCard label="Closed" value={fmtInt(m.totalClosed)} accent="good" hint="PIF / financed / deposit" source="Closer log" />
              <KpiCard label="No-shows" value={fmtInt(m.totalNoShow)} inverse accent={m.totalNoShow > 0 ? "warn" : "default"} hint="booked, didn't attend" source="Closer log" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Close rate" value={fmtPct(m.closeRate, 0)} accent="good" hint={`closed ÷ held · ${fmtPct(m.bookedCloseRate, 0)} of booked`} source="Closer log" />
              <KpiCard label="Cash collected" value={fmtMoney(m.callsCashCollected, "USD")} hint="taken on calls" source="Closer log" />
              <KpiCard label="Cash / booked call" value={fmtMoney(m.cashPerBookedCall_collected, "USD")} hint="cash ÷ booked call" source="Closer log" />
              <KpiCard label="Cash / held call" value={fmtMoney(m.cashPerHeldCall_collected, "USD")} hint="cash ÷ call held" source="Closer log" />
            </div>
            <div className="text-[11px] leading-relaxed text-[#6B7280]">
              From your closers&rsquo; post-call form — every booked call (including no-shows). Close rate = closed ÷ held; cash per booked call = cash collected ÷ all bookings, so no-shows and lost calls drag it down (that&rsquo;s the point).
            </div>
          </>
        ) : (
          <Panel><div className="text-xs text-[#6B7280]">Waiting for the Closer sheet.</div></Panel>
        )}
        {ic && (
          <Panel title="Calls booked (iClosed)" badge="Live API">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div><div className="font-mono text-xl text-[#F5F5F7]">{fmtInt(ic.booked)}</div><div className="mt-0.5 text-xs text-[#6B7280]">booked in range</div></div>
              <div><div className="font-mono text-xl text-[#FF6466]">{fmtInt(ic.cancelled)}</div><div className="mt-0.5 text-xs text-[#6B7280]">cancelled</div></div>
              <div><div className="font-mono text-xl text-[#00D393]">{fmtInt(ic.won)}</div><div className="mt-0.5 text-xs text-[#6B7280]">won</div></div>
              <div><div className="font-mono text-xl text-[#F5F5F7]">{ic.held > 0 ? fmtPct(ic.closeRate, 0) : "n/a"}</div><div className="mt-0.5 text-xs text-[#6B7280]">close rate (won &divide; held)</div></div>
            </div>
            {ic.byDay.length > 1 && <div className="mt-4"><SessionsSparkline points={ic.byDay} /></div>}
            <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
              Live from iClosed: every booked strategy call, with cancellations and outcomes (won / no-sale). Revenue stays on FanBasis, so these calls are not counted as sales here. {fmtInt(ic.totalAllTime)} calls on record.
            </div>
          </Panel>
        )}
      </Section>

      {/* ───────── Subscriptions & payment plans (each plan tracked, late/failed flagged) ───────── */}
      <Section title="Subscriptions & payment plans">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {m ? (
            <KpiCard label="Active members" value={fmtInt(m.activeStudents)} hint={`${fmtInt(m.graduatedStudents)} graduated`} source="Sheet" />
          ) : (
            <PendingKpi label="Active members" pendingOn="Sheet" hint="active paying members" />
          )}
          {m ? (
            <KpiCard label="Due next 30 days" value={fmtMoney(m.nextMonthProjection, "USD")} hint="scheduled renewals (incl. EUR plans)" source="Sheet" />
          ) : (
            <PendingKpi label="Due next 30 days" pendingOn="Sheet" hint="scheduled renewals" />
          )}
          {m ? (
            <KpiCard label="Late payments" value={fmtInt(m.lateCount)} accent={m.lateCount > 0 ? "bad" : "default"} inverse
              hint={m.lateCount > 0 ? `${fmtMoney(m.lateAmount, "USD")} overdue` : "none overdue"} source="Sheet" />
          ) : (
            <PendingKpi label="Late payments" pendingOn="Sheet" hint="overdue scheduled payments" />
          )}
          {m ? (
            <KpiCard label="Failed payments" value={fmtInt(m.unconfirmedCount)} accent={m.unconfirmedCount > 0 ? "bad" : "default"} inverse
              hint={m.unconfirmedCount > 0 ? `${fmtMoney(m.unconfirmedAmount, "USD")} stuck` : "none flagged"} source="Sheet" />
          ) : (
            <PendingKpi label="Failed payments" pendingOn="Sheet" hint="ACH/card failures flagged" />
          )}
        </div>
        <Panel title="Recurring subscriptions (FanBasis)" badge="Live events">
          <FanbasisSubsPanel fb={fbSubs} />
        </Panel>
        <Panel title="Payment plans — next payment & status" badge="Sheet">
          <SubscriptionsTable rows={subs} />
          <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
            Financed plans, one row per member. <span className="text-[#FF6466]">Late</span> = a scheduled payment is overdue; <span className="text-[#FF6466]">Failed payment</span> = an ACH/card failure flagged in the sheet. Recurring FanBasis subscriptions (your recurring offers) show in the panel above as their renew/fail events arrive.
          </div>
        </Panel>
      </Section>

      {/* ───────── Audience & retention ───────── */}
      <Section title="Audience & retention">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {m ? (
            <KpiCard label="Active members" value={fmtInt(m.activeStudents)} hint={`${fmtInt(m.graduatedStudents)} graduated`} source="Sheet" />
          ) : (
            <PendingKpi label="Active members" pendingOn="Sheet" hint="active paying members" />
          )}
          {rev ? (
            <KpiCard label="Repeat buyers" value={fmtInt(rev.multiPayCustomers)} hint="paid more than once (renewed)" source="FanBasis" />
          ) : (
            <PendingKpi label="Repeat buyers" pendingOn="FanBasis" hint="paid more than once" />
          )}
          {traffic ? (
            <KpiCard label="Opt-ins (on-page)" value={fmtInt(traffic.generateLead)} hint="email forms submitted"
              current={traffic.generateLead} prior={traffic.generateLeadPrior} source="GA4" />
          ) : (
            <PendingKpi label="Opt-ins (on-page)" pendingOn="GA4" hint="email form submits" />
          )}
          {kit ? (
            <KpiCard label="Kit list" value={fmtInt(kit.totalSubscribers)}
              hint={`${fmtInt(kit.newSubscribers)}${kit.newApprox ? "+" : ""} new in range`}
              current={kit.newApprox ? undefined : kit.newSubscribers}
              prior={kit.newApprox ? undefined : kit.newSubscribersPrior} source="Kit" />
          ) : (
            <PendingKpi label="Kit list" pendingOn="Kit key" hint="needs a valid the coach Kit secret (key on file returns 401)" />
          )}
          <KpiCard label="Opt-in rate" value={optInRate === null ? "—" : fmtPct(optInRate, 1)}
            hint="on-page opt-ins ÷ visitors" source="GA4" sourceTone={optInRate === null ? "pending" : "ok"} />
          {ltv !== null ? (
            <KpiCard label="LTV" value={fmtMoney(ltv, "USD")}
              hint={fbLife ? "avg lifetime spend per buyer" : "avg cash per member"}
              source={fbLife ? "FanBasis" : "Sheet"} />
          ) : (
            <PendingKpi label="LTV" pendingOn="FanBasis" hint="avg lifetime spend per buyer" />
          )}
          {m ? (
            <KpiCard label="Delinquency" value={fmtPct(m.churnRate, 1)} inverse hint="members with a late payment" source="Sheet" />
          ) : (
            <PendingKpi label="Delinquency" pendingOn="Sheet" hint="late-payment rate (≈ churn risk)" />
          )}
          {m ? (
            <KpiCard label="Refunds" value={fmtInt(m.refundedStudents)} inverse hint="members refunded" source="Sheet" />
          ) : (
            <PendingKpi label="Refunds" pendingOn="Sheet" hint="refunded members" />
          )}
        </div>
      </Section>

      {/* ───────── Traffic & audience ───────── */}
      {traffic ? (
        <Section title="Traffic & audience">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <KpiCard label="Sessions" value={fmtInt(traffic.sessions)} hint="visits in range"
              current={traffic.sessions} prior={traffic.sessionsPrior} source="GA4" />
            <KpiCard label="Avg. time on page" value={fmtDuration(traffic.avgEngagementSec)} hint="engaged time / session" source="GA4" />
            <div className="md:col-span-2"><Panel><SessionsSparkline points={traffic.trend} /></Panel></div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Panel title="Device"><BarList rows={traffic.devices.map((r) => ({ ...r, label: cap(r.label) }))} /></Panel>
            <Panel title="Top countries"><BarList rows={traffic.countries} /></Panel>
            <Panel title="Top sources"><BarList rows={traffic.sources.map((r) => ({ ...r, label: fmtReferrer(r.label) }))} /></Panel>
            <Panel title="Top pages"><BarList rows={traffic.topPaths.map((r) => ({ ...r, label: fmtPath(r.label) }))} /></Panel>
          </div>
          <Panel title="How far down the page people get">
            <PageScrollMap steps={traffic.sectionFunnel} />
          </Panel>
          <Panel title="Cart abandonment">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div><span className="font-mono text-xl text-[#F5F5F7]">{started !== null ? fmtInt(started) : "—"}</span> <span className="text-xs text-[#6B7280]">started</span></div>
              <div><span className="font-mono text-xl text-[#00D393]">{bought !== null ? fmtInt(bought) : "—"}</span> <span className="text-xs text-[#6B7280]">bought</span></div>
              <div><span className="font-mono text-xl text-[#FF6466]">{cartAbandoned !== null ? fmtInt(cartAbandoned) : "—"}</span> <span className="text-xs text-[#6B7280]">abandoned</span></div>
              <div><span className="font-mono text-xl text-[#F8AF00]">{abandonRate !== null ? fmtPct(abandonRate, 0) : "—"}</span> <span className="text-xs text-[#6B7280]">abandon rate</span></div>
            </div>
            <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
              Started is GA4 begin_checkout (clicked through to pay, directional); bought is exact from FanBasis. FanBasis hosts checkout off-domain, so the gap also includes people who finished paying on FanBasis without an on-page purchase event.
            </div>
          </Panel>
        </Section>
      ) : (
        <Section title="Traffic & audience"><Panel><div className="text-xs text-[#6B7280]">Waiting for GA4.</div></Panel></Section>
      )}

      {/* ───────── Attribution ───────── */}
      <Section title="Attribution">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Panel title="Traffic by source" badge="GA4">
            {traffic ? (
              <UtmDonut data={traffic.sources.slice(0, 8).map((r) => ({ label: fmtUtmSource(r.label), value: r.sessions }))} />
            ) : (
              <div className="text-xs text-[#6B7280]">Waiting for GA4.</div>
            )}
          </Panel>
          <Panel title="Revenue by source" badge="FanBasis × UTM">
            {attr ? (
              <>
                <AttributionBars rows={attr.bySource} empty="No tagged sales in range yet. As tagged links bring buyers, revenue by source fills in here." />
                <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
                  {attrPct !== null
                    ? `${fmtPct(attrPct, 0)} of in-range revenue tied to a source (${fmtInt(attr.taggedBuyers)}/${fmtInt(attr.totalBuyers)} buyers). The rest bought cold or before UTM capture went live.`
                    : "Each FanBasis sale joined to the source we captured at opt-in (by email)."}
                </div>
              </>
            ) : (
              <div className="text-xs text-[#6B7280]">Waiting for FanBasis.</div>
            )}
          </Panel>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Panel title="Revenue by offer" badge="FanBasis">
            {rev ? <OfferBars rows={rev.byOffer} /> : <div className="text-xs text-[#6B7280]">Waiting for FanBasis.</div>}
          </Panel>
          <Panel title="Revenue by campaign / content" badge="FanBasis × UTM">
            {attr ? (
              <AttributionBars rows={attr.byCampaign.length ? attr.byCampaign : attr.byContent} empty="No tagged-campaign sales in range yet." />
            ) : (
              <div className="text-xs text-[#6B7280]">Waiting for FanBasis.</div>
            )}
          </Panel>
        </div>
        {traffic && traffic.utmCampaigns.length > 0 && (
          <Panel title="Content / campaigns — visitors" badge="GA4">
            <BarList rows={traffic.utmCampaigns.filter((c) => c.label && !["(not set)", "(organic)", "(direct)", "(referral)"].includes(c.label.toLowerCase())).slice(0, 12)} />
            <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
              Visitors per tagged campaign from GA4 (traffic side). Revenue per source/campaign above is the sales side, joined by email.
            </div>
          </Panel>
        )}
      </Section>

      {/* ───────── Content performance (per-piece leaderboard) ───────── */}
      <Section title="Content performance">
        <Panel title="What each piece sells" badge="GA4 × FanBasis">
          <ContentLeaderboard visitors={traffic?.utmContents ?? []} revenue={attr?.byContent ?? []} />
          <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
            Each individual email, video, or reel (its <span className="font-mono">content</span> tag): visitors from GA4, sales + revenue from FanBasis joined by email. Tag pieces in the <strong className="text-[#9CA3AF]">Links</strong> tab so they rank here.
          </div>
        </Panel>
      </Section>

      <div className="text-xs text-[#6B7280]">
        {scopeLabel} · revenue + offers live from FanBasis · subscriptions/retention from the coach Sales sheet · traffic + scroll-depth + opt-ins from GA4
        {rev ? ` · fetched ${new Date(rev.fetchedAt).toLocaleTimeString("en-GB")}` : ""} · cache 5 min · filter top right.
      </div>
    </div>
  );
}
