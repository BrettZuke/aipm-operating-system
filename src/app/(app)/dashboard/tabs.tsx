import { BarChart2, Activity, ArrowUp, ArrowDown, Minus, AlertTriangle, Users, TrendingUp, Heart } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// ── Shared primitives ─────────────────────────────────────────────────────────

export function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4 stat-card"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: accent ? "rgba(0,131,255,0.2)" : "rgba(255,255,255,0.07)",
        boxShadow: accent ? "0 0 32px rgba(0,131,255,0.06)" : undefined,
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">{label}</div>
      <div
        className="mt-3 text-2xl font-bold text-[#F5F5F7]"
        style={accent ? {
          background: "linear-gradient(135deg, #F5F5F7 50%, #0083FF)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        } : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[#6B7280]">{sub}</div>}
    </div>
  );
}

export function Section({ num, title, sub, children, action }: {
  num?: string; title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          {num && <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{num}</div>}
          <div className="text-base font-semibold text-[#F5F5F7]">{title}</div>
          {sub && <div className="mt-0.5 text-xs text-[#9CA3AF]">{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyPanel({ icon: Icon, title, sub }: {
  icon: React.ComponentType<{ className?: string }>; title: string; sub: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] mb-3">
        <Icon className="size-5 text-[#6B7280]" />
      </div>
      <div className="text-sm font-medium text-[#9CA3AF]">{title}</div>
      <div className="mt-1 max-w-sm text-xs text-[#6B7280]">{sub}</div>
    </div>
  );
}

export function NotWiredCallout({ items }: { items: string[] }) {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="size-4 text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Not yet wired</span>
      </div>
      <ul className="space-y-1 text-xs text-[#9CA3AF]">
        {items.map(item => <li key={item}>· {item}</li>)}
      </ul>
    </div>
  );
}

// ── Tab data shape ────────────────────────────────────────────────────────────

export type DashboardData = {
  totalMrr: number;
  totalRevenue: number;
  cashCollected: number;       // FROM transactions — actual money in (FanBasis source of truth)
  totalContractValue: number;  // FROM deals.amount where stage=closed_won — what was sold
  pendingRevenue: number;
  activeClients: number;
  totalClients: number;
  dealsClosed: number;
  callCount: number;
  closeRate: number;
  recentTx: Array<{ id: string; amount: number | null; kind: string; occurred_at: string; description: string | null; client_id: string | null }>;
  clients: Array<{ id: string; name: string; status: string | null; mrr: number | null; total_pending: number | null; created_at: string }>;
  deals: Array<{ id: string; stage: string; amount: number | null }>;
  goals: Array<{ id: string; name: string; target_value: number | null; current_value: number | null }>;
  teamCount: number;
};

// ── 1. Overview ───────────────────────────────────────────────────────────────

export function OverviewTab({ d }: { d: DashboardData }) {
  const collectionRate = d.totalContractValue > 0
    ? (d.cashCollected / d.totalContractValue) * 100
    : 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Cash collected" value={formatCurrency(d.cashCollected)} sub="actual money in (FanBasis)" accent />
        <StatCard label="Contract value" value={formatCurrency(d.totalContractValue)} sub={`${d.dealsClosed} closed-won deals`} />
        <StatCard label="Collection rate" value={d.totalContractValue > 0 ? `${collectionRate.toFixed(0)}%` : "—"} sub="cash / contract value" />
        <StatCard label="Active clients" value={String(d.activeClients)} sub={`${d.totalClients} total`} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="mb-3 text-sm font-semibold text-[#F5F5F7]">30-day revenue</div>
          {d.totalRevenue === 0 ? (
            <EmptyPanel icon={BarChart2} title="No revenue data yet" sub="Your first sale lands here once completed payments start syncing." />
          ) : (
            <div className="flex items-end gap-1 h-32">
              {d.recentTx.filter(t => t.kind === "payment").slice(0, 30).map(t => (
                <div key={t.id} className="flex-1 rounded-sm bg-[rgba(0,131,255,0.6)]"
                  style={{ height: `${Math.max(10, Math.min(100, (Number(t.amount) / 1000) * 10))}%` }} />
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="mb-3">
            <div className="text-sm font-semibold text-[#F5F5F7]">Live activity</div>
            <div className="mt-0.5 text-xs text-[#9CA3AF]">Read-time across the agency</div>
          </div>
          <EmptyPanel icon={Activity} title="No activity yet" sub="Payments, refunds, and client events stream here." />
        </div>
      </div>
    </div>
  );
}

// ── 2. Revenue ────────────────────────────────────────────────────────────────

export function RevenueTab({ d }: { d: DashboardData }) {
  const arr = d.totalMrr * 12;
  const avgClientValue = d.activeClients > 0 ? d.totalMrr / d.activeClients : 0;
  const outstanding = d.totalContractValue - d.cashCollected;
  const collectionRate = d.totalContractValue > 0 ? (d.cashCollected / d.totalContractValue) * 100 : 0;
  return (
    <div className="space-y-5">
      <Section num="02" title="Revenue & Financials" sub="Money in, money out, and what it leaves you with.">
        {/* Row 1 — the two that matter most */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="Cash collected" value={formatCurrency(d.cashCollected)} sub="Actual money in · FanBasis source of truth" accent />
          <StatCard label="Contract value" value={formatCurrency(d.totalContractValue)} sub={`${d.dealsClosed} closed-won deals · what was sold`} />
        </div>
        {/* Row 2 — context */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Outstanding" value={formatCurrency(outstanding)} sub="Sold but not collected yet" />
          <StatCard label="Collection rate" value={d.totalContractValue > 0 ? `${collectionRate.toFixed(0)}%` : "—"} sub="Cash / contract value" />
          <StatCard label="MRR" value={formatCurrency(d.totalMrr)} sub="Recurring" />
          <StatCard label="ARR" value={formatCurrency(arr)} sub="MRR × 12" />
          <StatCard label="Pending revenue" value={formatCurrency(d.pendingRevenue)} sub="On clients" />
          <StatCard label="Avg client value" value={formatCurrency(avgClientValue)} sub="Per active client" />
          <StatCard label="LTV / churn" value="—" sub="Wire churn to compute" />
          <StatCard label="Profit margin" value="—" sub="Wire COGS to compute" />
        </div>
      </Section>

      <Section num="03" title="Revenue by service" sub="What's driving the number.">
        <EmptyPanel icon={BarChart2} title="No service breakdown yet" sub="Tag transactions with a service to see contribution by line." />
      </Section>

      <Section num="04" title="Revenue by channel" sub="Where the money came from.">
        <EmptyPanel icon={BarChart2} title="No channel attribution yet" sub="Wire UTM tags or set source on each transaction." />
      </Section>

      <NotWiredCallout items={[
        "Stripe transfers wired check (verify deposits land in the right bank)",
        "Refund reasons + cohort tagging",
        "Multi-currency reconciliation",
        "Affiliate payouts ledger",
        "Per-client COGS allocation",
      ]} />
    </div>
  );
}

// ── 3. Trends ─────────────────────────────────────────────────────────────────

export function TrendsTab({ d: _d }: { d: DashboardData }) {
  return (
    <div className="space-y-5">
      <Section num="02" title="Agency Trends" sub="Multi-line view of the metrics that matter.">
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="mb-3 flex items-center gap-2">
            {["Revenue", "Profit", "Outreach", "Clients"].map((label, i) => (
              <button key={label}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === 0
                    ? "border-[rgba(0,131,255,0.3)] bg-[rgba(0,131,255,0.1)] text-[#F5F5F7]"
                    : "border-[rgba(255,255,255,0.08)] bg-transparent text-[#9CA3AF] hover:text-[#F5F5F7]"
                }`}
              >{label}</button>
            ))}
          </div>
          <EmptyPanel icon={TrendingUp} title="No trend data yet" sub="Once 30+ days of history accrue, lines will plot here." />
        </div>
      </Section>
    </div>
  );
}

// ── 4. Clients ────────────────────────────────────────────────────────────────

export function ClientsTab({ d }: { d: DashboardData }) {
  const churned = d.clients.filter(c => c.status === "churned").length;
  const paused = d.clients.filter(c => c.status === "paused").length;
  const avgValue = d.activeClients > 0 ? d.totalMrr / d.activeClients : 0;
  const topClientMrr = d.clients.reduce((max, c) => Math.max(max, Number(c.mrr ?? 0)), 0);
  const concentration = d.totalMrr > 0 ? (topClientMrr / d.totalMrr) * 100 : 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Active clients" value={String(d.activeClients)} accent />
        <StatCard label="Avg client value" value={formatCurrency(avgValue)} sub="MRR / client" />
        <StatCard label="Top client revenue" value={formatCurrency(topClientMrr)} sub="Highest MRR" />
        <StatCard label="Concentration risk" value={`${concentration.toFixed(0)}%`} sub="Top client share of MRR" />
        <StatCard label="Onboarded" value={String(d.activeClients)} />
        <StatCard label="Paused / at risk" value={String(paused)} />
        <StatCard label="Churned" value={String(churned)} />
        <StatCard label="NPS" value="—" sub="Survey not connected" />
      </div>

      <Section num="03" title="Clients" sub={`Everyone you serve, ranked by revenue.${d.clients.length > 100 ? ` (Showing the 100 most recent of ${d.clients.length})` : ""}`}>
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total revenue</th>
                <th className="px-4 py-3 text-right">Cash collected</th>
                <th className="px-4 py-3 text-right">Pending</th>
                <th className="px-4 py-3">Last EOD</th>
                <th className="px-4 py-3">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
              {d.clients.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-[#6B7280]">No clients yet — add your first to populate this table.</td></tr>
              ) : d.clients.slice(0, 100).map(c => (
                <tr key={c.id} className="hover:bg-[#0C0C10]/40">
                  <td className="px-4 py-3 font-medium text-[#F5F5F7]">{c.name}</td>
                  <td className="px-4 py-3 text-[#9CA3AF] capitalize">{c.status ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#F5F5F7]">{formatCurrency(Number(c.mrr ?? 0))}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#F5F5F7]">—</td>
                  <td className="px-4 py-3 text-right font-mono text-[#9CA3AF]">{formatCurrency(Number(c.total_pending ?? 0))}</td>
                  <td className="px-4 py-3 text-xs text-[#6B7280]">—</td>
                  <td className="px-4 py-3 text-xs text-[#6B7280]">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ── 5. Pipeline ───────────────────────────────────────────────────────────────

export function PipelineTab({ d }: { d: DashboardData }) {
  const openDeals = d.deals.filter(deal => !["closed_won", "closed_lost"].includes(deal.stage));
  const pipelineValue = openDeals.reduce((s, deal) => s + Number(deal.amount ?? 0), 0);
  const avgDealSize = openDeals.length > 0 ? pipelineValue / openDeals.length : 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Pipeline value" value={formatCurrency(pipelineValue)} sub={`${openDeals.length} open deals`} accent />
        <StatCard label="Booked calls" value={String(d.callCount)} sub="All-time" />
        <StatCard label="Show rate" value="—" sub="Wire call outcomes" />
        <StatCard label="Close rate" value={`${d.closeRate.toFixed(1)}%`} sub={`${d.dealsClosed} won`} />
        <StatCard label="Avg deal size" value={formatCurrency(avgDealSize)} sub="Open pipeline" />
        <StatCard label="Stalled deals" value="—" sub="Wire age threshold" />
      </div>

      <Section num="04" title="Funnel · last 30 days" sub="Lead → call → offer → close.">
        <EmptyPanel icon={TrendingUp} title="No funnel data yet" sub="Once leads, calls, and deals start flowing, this chart populates." />
      </Section>
    </div>
  );
}

// ── 6. Outreach ───────────────────────────────────────────────────────────────

export function OutreachTab({ d: _d }: { d: DashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Outbound sent" value="—" sub="DMs + dials + emails" />
        <StatCard label="Reply rate" value="—" sub="Replies / sent" />
        <StatCard label="Booked / reply" value="—" sub="Conversion to meeting" />
        <StatCard label="Avg lead score" value="—" sub="Setter-tagged" />
        <StatCard label="By channel" value="—" sub="DM / email / dial split" />
        <StatCard label="Reply rate by source" value="—" sub="Where it converts" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Top setters</div>
          <EmptyPanel icon={Users} title="No setter data yet" sub="Once setters log activity in EOD reports, they appear here." />
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Channel coverage</div>
          <EmptyPanel icon={BarChart2} title="No channel data yet" sub="Tag DMs, emails, and dials by channel to see coverage." />
        </div>
      </div>
    </div>
  );
}

// ── 7. Ads ────────────────────────────────────────────────────────────────────

export function AdsTab({ d: _d }: { d: DashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Ad spend (all-time)" value="—" />
        <StatCard label="Cost per lead" value="—" />
        <StatCard label="Cost per book" value="—" />
        <StatCard label="Cost per show" value="—" />
        <StatCard label="Leads" value="—" />
        <StatCard label="CTR avg" value="—" />
        <StatCard label="ROAS" value="—" sub="Revenue / spend" />
        <StatCard label="Active campaigns" value="—" />
      </div>

      <Section num="06" title="Spend by platform" sub="Where the budget went.">
        <EmptyPanel icon={BarChart2} title="No ad accounts connected" sub="Connect Meta, Google, TikTok, YouTube, or LinkedIn from Settings → Integrations." />
      </Section>
    </div>
  );
}

// ── 8. Referrals ──────────────────────────────────────────────────────────────

export function ReferralsTab({ d: _d }: { d: DashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total signups" value="0" sub="Referred clients" />
        <StatCard label="Total paid referrals" value="0" />
        <StatCard label="Pending payouts" value="$0" />
        <StatCard label="Granted payouts" value="$0" />
        <StatCard label="NPS (referrers)" value="—" />
        <StatCard label="Conversion rate" value="—" sub="Click → signup" />
      </div>

      <NotWiredCallout items={[
        "Referral attribution table (link → signup → revenue)",
        "Partner payout export (Stripe Connect / manual)",
        "Second-tier referral program",
        "Per-referral NPS tag",
      ]} />
    </div>
  );
}

// ── 9. Team ───────────────────────────────────────────────────────────────────

export function TeamTab({ d }: { d: DashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Team members" value={String(d.teamCount)} sub="Active" accent />
        <StatCard label="Task completion" value="—" sub="% on-time" />
        <StatCard label="Tasks completed" value="—" sub="Last 7 days" />
        <StatCard label="Goals discovered" value={`${d.goals.length}`} sub="Goals tracked" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Top 5 setters</div>
          <EmptyPanel icon={Users} title="No setter data" sub="Wire EOD reports." />
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Top 5 closers</div>
          <EmptyPanel icon={Users} title="No closer data" sub="Wire calls + deals." />
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Top 5 by revenue</div>
          <EmptyPanel icon={TrendingUp} title="No revenue attribution" sub="Tag transactions by member." />
        </div>
      </div>

      <Section num="08" title="Goals in motion" sub={`${d.goals.length} active`}>
        {d.goals.length === 0 ? (
          <EmptyPanel icon={TrendingUp} title="No goals set" sub="Go to /goals → New goal to set a target." />
        ) : (
          <div className="space-y-2">
            {d.goals.slice(0, 5).map(g => {
              const pct = g.target_value && Number(g.target_value) > 0
                ? Math.min(100, (Number(g.current_value ?? 0) / Number(g.target_value)) * 100) : 0;
              return (
                <div key={g.id} className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#F5F5F7]">{g.name}</span>
                    <span className="text-xs text-[#9CA3AF]">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                    <div className="h-full rounded-full bg-[#0083FF]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section num="08b" title="Team execution" sub="Member-level activity rollup.">
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Tasks</th>
                <th className="px-4 py-3 text-right">Deals</th>
                <th className="px-4 py-3 text-right">EOD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-[#6B7280]">No team members yet — invite from /team.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ── 10. CS (Customer Success) ─────────────────────────────────────────────────

export function CSTab({ d: _d }: { d: DashboardData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="NPS" value="—" sub="Survey not connected" accent />
        <StatCard label="Health score (avg)" value="—" sub="Across active clients" />
        <StatCard label="Time-to-first-value" value="—" sub="Onboarding speed" />
        <StatCard label="Retention" value="—" sub="Trailing 90d" />
        <StatCard label="Time-to-respond" value="—" sub="Inbound message latency" />
        <StatCard label="Logo retention" value="—" sub="% retained quarterly" />
      </div>

      <NotWiredCallout items={[
        "NPS survey integration (Typeform / Delighted)",
        "Health score formula (engagement + revenue + tenure)",
        "First-value milestone tracking",
        "Response-time SLA monitoring",
      ]} />
    </div>
  );
}
