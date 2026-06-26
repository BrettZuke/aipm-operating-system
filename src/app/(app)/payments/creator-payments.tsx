import { Wallet, AlertCircle, Clock, Users, CalendarClock } from "lucide-react";
import { fetchStripeSchedule, type StripeSchedule, type ScheduleRow } from "@/lib/creator/stripe";
import { loadCreatorSettings } from "@/lib/creator/settings";
import { fmtMoney, fmtInt } from "@/lib/creator/format";

const PANEL = "rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0E0E12]";

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: "rgba(0,211,147,0.15)", color: "#00D393", label: "Active" },
  trialing: { bg: "rgba(0,131,255,0.15)", color: "#0083FF", label: "Trial" },
  past_due: { bg: "rgba(255,100,102,0.15)", color: "#FF6466", label: "Past due" },
  unpaid: { bg: "rgba(255,100,102,0.15)", color: "#FF6466", label: "Unpaid" },
  incomplete: { bg: "rgba(248,175,0,0.15)", color: "#F8AF00", label: "Incomplete" },
  paused: { bg: "rgba(255,255,255,0.06)", color: "#9CA3AF", label: "Paused" },
};

function intervalLabel(interval: string, count: number): string {
  if (count === 1) return `/ ${interval}`;
  return `every ${count} ${interval}s`;
}

function whenLabel(epoch: number | null, failed: boolean): { text: string; tone: string } {
  if (failed) return { text: "Retrying", tone: "#FF6466" };
  if (!epoch) return { text: "—", tone: "#6B7280" };
  const days = Math.round((epoch * 1000 - Date.now()) / 86400000);
  const date = new Date(epoch * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (days < 0) return { text: `${date} (overdue)`, tone: "#FF6466" };
  if (days === 0) return { text: `${date} (today)`, tone: "#F8AF00" };
  if (days <= 7) return { text: `${date} (in ${days}d)`, tone: "#F8AF00" };
  return { text: `${date} (in ${days}d)`, tone: "#9CA3AF" };
}

/**
 * Payment schedule for creator-template tenants (e.g. the creator). Built from their Stripe
 * subscriptions: each customer's next charge date + amount, with past-due / failed
 * subscriptions surfaced first. Replaces the coach-tenant Google-Sheet payment plan view.
 */
export async function CreatorPayments({
  agencyId,
  workspaceName,
}: {
  agencyId: string;
  workspaceName: string;
}) {
  const settings = await loadCreatorSettings(agencyId);

  if (!settings.stripeKey) {
    return (
      <div className="space-y-6">
        <Header workspaceName={workspaceName} subtitle="Connect Stripe to see upcoming subscription payments." />
        <div className={`${PANEL} p-12 text-center`}>
          <p className="text-[#9CA3AF]">Connect Stripe to see your payment schedule.</p>
          <a href="/settings/integrations" className="mt-3 inline-block text-sm font-medium" style={{ color: "#0083FF" }}>
            Go to integrations →
          </a>
        </div>
      </div>
    );
  }

  let schedule: StripeSchedule | null = null;
  let error: string | null = null;
  try {
    schedule = await fetchStripeSchedule({ key: settings.stripeKey });
  } catch (e) {
    error = e instanceof Error ? e.message : "Stripe fetch failed";
  }

  const currency = (schedule?.currency ?? "usd").toUpperCase();
  const rows = schedule?.rows ?? [];
  const failedRows = rows.filter((r) => r.failed);
  const liveRows = rows.filter((r) => !r.failed);

  return (
    <div className="space-y-6">
      <Header
        workspaceName={workspaceName}
        subtitle={`${fmtInt(schedule?.activeCount ?? 0)} active subscriptions · renews automatically via Stripe`}
      />

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ border: "1px solid rgba(248,175,0,0.3)", background: "rgba(248,175,0,0.08)", color: "#F8AF00" }}>
          Couldn&apos;t load Stripe: {error}
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Users} iconColor="#0083FF" label="Active subscribers" value={fmtInt(schedule?.activeCount ?? 0)} sub="recurring" />
        <Stat icon={Wallet} iconColor="#00D393" label="MRR" value={fmtMoney(schedule?.mrr ?? 0, currency)} sub="monthly run-rate" />
        <Stat icon={CalendarClock} iconColor="#F8AF00" label="Next 30 days" value={fmtMoney(schedule?.next30dAmount ?? 0, currency)} sub={`${fmtInt(schedule?.next30dCount ?? 0)} charges due`} />
        <Stat icon={AlertCircle} iconColor="#FF6466" label="Past due / failed" value={fmtInt(schedule?.pastDueCount ?? 0)} sub="need attention" tone={(schedule?.pastDueCount ?? 0) > 0 ? "bad" : "default"} />
      </div>

      {/* Failed / past-due — surfaced first */}
      {failedRows.length > 0 && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-red-500/20">
            <AlertCircle className="size-4 text-[#FF6466]" />
            <span className="text-sm font-semibold text-[#F5F5F7]">Failed payments · {failedRows.length}</span>
            <span className="text-xs text-[#9CA3AF]">Stripe is retrying these — reach out if they keep failing.</span>
          </div>
          <ScheduleTable rows={failedRows} currency={currency} />
        </div>
      )}

      {/* Upcoming */}
      <div className={`${PANEL} overflow-hidden`}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[rgba(255,255,255,0.07)]">
          <Clock className="size-4 text-[#9CA3AF]" />
          <span className="text-sm font-semibold text-[#F5F5F7]">Upcoming payments</span>
          <span className="text-xs text-[#6B7280]">soonest first</span>
        </div>
        {liveRows.length === 0 ? (
          <div className="p-12 text-center text-[#6B7280]">No active subscriptions yet.</div>
        ) : (
          <ScheduleTable rows={liveRows} currency={currency} />
        )}
      </div>

      <div className="text-xs text-[#6B7280]">
        Live from Stripe{schedule ? ` · fetched ${new Date(schedule.fetchedAt).toLocaleTimeString("en-GB")}` : ""}. Most customers pay monthly; yearly plans show a once-a-year charge.
      </div>
    </div>
  );
}

function ScheduleTable({ rows, currency }: { rows: ScheduleRow[]; currency: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.07)] text-left text-[10px] uppercase tracking-wider text-[#6B7280]">
            <th className="px-5 py-3 font-medium">Customer</th>
            <th className="px-5 py-3 font-medium">Plan</th>
            <th className="px-5 py-3 font-medium">Next charge</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
          {rows.map((r) => {
            const ss = STATUS_STYLE[r.status] ?? { bg: "rgba(255,255,255,0.06)", color: "#9CA3AF", label: r.status };
            const rowCurrency = (r.currency || currency).toUpperCase();
            const when = whenLabel(r.nextChargeEpoch, r.failed);
            return (
              <tr key={r.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                <td className="px-5 py-3">
                  <div className="text-[#F5F5F7]">{r.customerName ?? r.customerEmail ?? "—"}</div>
                  {r.customerName && r.customerEmail && <div className="text-xs text-[#6B7280]">{r.customerEmail}</div>}
                </td>
                <td className="px-5 py-3 text-[#9CA3AF] whitespace-nowrap">
                  {fmtMoney(r.amount, rowCurrency)} <span className="text-[#6B7280]">{intervalLabel(r.interval, r.intervalCount)}</span>
                </td>
                <td className="px-5 py-3 whitespace-nowrap" style={{ color: when.tone }}>{when.text}</td>
                <td className="px-5 py-3">
                  <span className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ background: ss.bg, color: ss.color }}>{ss.label}</span>
                  {r.cancelAtPeriodEnd && <span className="ml-1.5 rounded px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ background: "rgba(248,175,0,0.15)", color: "#F8AF00" }}>Ending</span>}
                </td>
                <td className="px-5 py-3 text-right font-mono tabular-nums text-[#F5F5F7]">{fmtMoney(r.amount, rowCurrency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Header({ workspaceName, subtitle }: { workspaceName: string; subtitle: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">FINANCE · LIVE FROM STRIPE</div>
        <h1 className="mt-2 text-3xl font-bold flex items-center gap-2 text-[#F5F5F7]" style={{ fontFamily: "var(--font-playfair),Georgia,serif" }}>
          <Wallet size={26} style={{ color: "#F8AF00" }} />Payment Schedule
        </h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">{workspaceName} · {subtitle}</p>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, iconColor, label, value, sub, tone = "default" }: { icon: typeof Wallet; iconColor: string; label: string; value: string; sub?: string; tone?: "default" | "bad" }) {
  return (
    <div className={`${PANEL} p-5`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold">
        <Icon className="size-4" style={{ color: iconColor }} />{label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: tone === "bad" ? "#FF6466" : "#F5F5F7" }}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[#6B7280]">{sub}</div>}
    </div>
  );
}
