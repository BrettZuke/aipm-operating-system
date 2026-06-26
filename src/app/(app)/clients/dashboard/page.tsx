import { TrendingUp, Users, BarChart2 } from "lucide-react";
import { getAuthContext, getActiveAgencyTemplate } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { formatCurrency } from "@/lib/utils";
import { StatCard, Section, EmptyPanel } from "../../dashboard/tabs";
import { ClientTabs } from "@/components/ui/client-tabs";

type ClientRow = { id: string; name: string; status: string | null; mrr: number | null; total_pending: number | null; created_at: string; data: unknown };

export const dynamic = "force-dynamic";

type View = "average" | "all" | "highest" | "lowest";

const VIEWS = [
  { key: "average",  label: "Average"     },
  { key: "all",      label: "All clients" },
  { key: "highest",  label: "Highest"     },
  { key: "lowest",   label: "Lowest"      },
];

export default async function ClientDashboardPage({ searchParams }: { searchParams: Promise<{ view?: View }> }) {
  const { view = "all" } = await searchParams;
  const { supabase, agencyId } = await getAuthContext();
  // Coach-only portfolio tool: revenue here comes from FanBasis/transactions, which creator tenants
  // (e.g. Stripe or Whop) don't populate — they'd see a misleading $0. Send them to their
  // own dashboard, which shows their real revenue.
  const { template } = await getActiveAgencyTemplate();
  if (template !== "coach") redirect("/dashboard");

  const [clients, { data: transactions }, { data: calls }] = await Promise.all([
    fetchAllPages<ClientRow>((from, to) =>
      supabase.from("clients").select("id,name,status,mrr,total_pending,created_at,data").eq("agency_id", agencyId!).range(from, to),
    ),
    supabase.from("transactions").select("amount,kind,occurred_at,client_id").eq("agency_id", agencyId!),
    supabase.from("calls").select("id,outcome").eq("agency_id", agencyId!).eq("outcome", "booked"),
  ]);

  const allClients = clients;
  const txList = transactions ?? [];

  const active = allClients.filter(c => c.status === "active");
  const churned = allClients.filter(c => c.status === "churned");
  const newThisMonth = allClients.filter(c => {
    const created = new Date(c.created_at);
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    return created >= startOfMonth;
  });

  // Per-client lifetime revenue from the synced FanBasis block (the coach's source of truth: the nightly
  // FanBasis API sync stamps data.fanbasis.lifetime onto each payer). Stripe/Supabase tenants leave
  // it absent, so they keep the transactions-ledger math below.
  const fbLifetime = (c: ClientRow) =>
    Number((c.data as { fanbasis?: { lifetime?: number } } | null)?.fanbasis?.lifetime ?? 0);
  const fanbasisTotal = allClients.reduce((s, c) => s + fbLifetime(c), 0);
  const hasFanbasis = fanbasisTotal > 0;
  const fanbasisBuyers = allClients.filter(c => fbLifetime(c) > 0).length;

  const payments = txList.filter(t => t.kind === "payment");
  const refunds = txList.filter(t => t.kind === "refund");
  const txNet = payments.reduce((s, t) => s + Number(t.amount ?? 0), 0)
              - refunds.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  // Prefer FanBasis lifetime (real paid revenue) when present; else fall back to the ledger.
  const netRevenue = hasFanbasis ? fanbasisTotal : txNet;
  const cashCollected = hasFanbasis ? fanbasisTotal : payments.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const totalPending = allClients.reduce((s, c) => s + Number(c.total_pending ?? 0), 0);
  const totalMrr = active.reduce((s, c) => s + Number(c.mrr ?? 0), 0);
  const arr = totalMrr * 12;
  const arpu = active.length > 0 ? totalMrr / active.length : 0;
  const totalTransactions = hasFanbasis ? fanbasisBuyers : txList.length;
  const recurringRevenue = totalMrr;
  const payingClients = hasFanbasis ? fanbasisBuyers : active.length;
  const revenuePerClient = payingClients > 0 ? netRevenue / payingClients : 0;
  const conversionRate = (calls?.length ?? 0) > 0 ? (active.length / (calls?.length ?? 1)) * 100 : 0;
  const churnRate = allClients.length > 0 ? (churned.length / allClients.length) * 100 : 0;

  // Rank by revenue: FanBasis lifetime when present, else MRR.
  const revOf = (c: ClientRow) => (hasFanbasis ? fbLifetime(c) : Number(c.mrr ?? 0));
  const sortedByRevenue = [...allClients].sort((a, b) => revOf(b) - revOf(a));
  const filteredClients =
    view === "highest" ? sortedByRevenue.slice(0, Math.max(1, Math.ceil(sortedByRevenue.length / 4)))
    : view === "lowest" ? sortedByRevenue.slice(-Math.max(1, Math.ceil(sortedByRevenue.length / 4)))
    : view === "average" ? (sortedByRevenue.length > 4
        ? sortedByRevenue.slice(Math.floor(sortedByRevenue.length / 4), -Math.floor(sortedByRevenue.length / 4))
        : sortedByRevenue)
    : sortedByRevenue;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">CLIENTS · DASHBOARD</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Portfolio performance</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{active.length} active · {formatCurrency(netRevenue)} revenue · {formatCurrency(totalMrr)} MRR</p>
        </div>
        <PeriodSelector />
      </div>

      <ClientTabs
        tabs={VIEWS}
        initialTab={view}
        panels={Object.fromEntries(VIEWS.map(v => [v.key, (
          <PortfolioView
            key={v.key}
            clients={filteredClients}
            netRevenue={netRevenue}
            cashCollected={cashCollected}
            totalMrr={totalMrr}
            arr={arr}
            arpu={arpu}
            totalPending={totalPending}
            recurringRevenue={recurringRevenue}
            totalTransactions={totalTransactions}
            revenuePerClient={revenuePerClient}
            hasFanbasis={hasFanbasis}
            customerCount={hasFanbasis ? fanbasisBuyers : allClients.length}
            activeCount={active.length}
            newThisMonth={newThisMonth.length}
            churnedCount={churned.length}
            conversionRate={conversionRate}
            churnRate={churnRate}
            bookedCalls={calls?.length ?? 0}
          />
        )]))}
      />
    </div>
  );
}

type Client = { id: string; name: string; status: string | null; mrr: number | null; total_pending: number | null; created_at: string; data: unknown };

function PortfolioView(props: {
  clients: Client[];
  netRevenue: number; cashCollected: number; totalMrr: number; arr: number; arpu: number;
  totalPending: number; recurringRevenue: number; totalTransactions: number;
  revenuePerClient: number; hasFanbasis: boolean; customerCount: number;
  activeCount: number; newThisMonth: number; churnedCount: number;
  conversionRate: number; churnRate: number; bookedCalls: number;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Net revenue" value={formatCurrency(props.netRevenue)} sub="Payments – refunds" accent />
        <StatCard label="Cash collected" value={formatCurrency(props.cashCollected)} />
        <StatCard label="Booked appointments" value={String(props.bookedCalls)} />
        <StatCard label="Paid ads" value="—" sub="Wire ad accounts" />
        <StatCard label="Active accounts" value={String(props.activeCount)} />
        <StatCard label="Closed purchases" value={String(props.totalTransactions)} />
      </div>

      <Section num="01" title="Revenue & Financials" sub="The money side of the portfolio.">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Net revenue" value={formatCurrency(props.netRevenue)} accent />
          <StatCard label="ARR" value={formatCurrency(props.arr)} sub="MRR × 12" />
          <StatCard label="ARPU" value={formatCurrency(props.arpu)} sub="Per active client" />
          <StatCard label="Cash collected" value={formatCurrency(props.cashCollected)} />
          <StatCard label="Pending" value={formatCurrency(props.totalPending)} sub="Awaiting collection" />
          <StatCard label="Avg client value" value={formatCurrency(props.arpu)} />
          <StatCard label="Recurring revenue" value={formatCurrency(props.recurringRevenue)} sub="MRR sum" />
          <StatCard label="Total transactions" value={String(props.totalTransactions)} />
        </div>
      </Section>

      <Section num="02" title="Revenue mix" sub="Where the dollars are coming from.">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Revenue trend</div>
            <EmptyPanel icon={TrendingUp} title="Need 30+ days" sub="Trend appears once enough history accrues." />
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="text-sm font-semibold text-[#F5F5F7] mb-3">By traffic source</div>
            <EmptyPanel icon={BarChart2} title="No source attribution" sub="Tag clients with how they found you." />
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="text-sm font-semibold text-[#F5F5F7] mb-3">By funnel / offer</div>
            <EmptyPanel icon={BarChart2} title="No offer split" sub="Tag transactions with offer/funnel." />
          </div>
        </div>
      </Section>

      <Section num="03" title="Customers" sub="Who's in, who's just joined, who's gone.">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total customers" value={String(props.customerCount)} sub={props.hasFanbasis ? "Paid customers" : undefined} />
          <StatCard label="Active customers" value={String(props.activeCount)} />
          <StatCard label="New customers" value={String(props.newThisMonth)} sub="This month" />
          <StatCard label="Revenue / client" value={props.revenuePerClient > 0 ? formatCurrency(props.revenuePerClient) : "—"} />
          <StatCard label="Churned" value={String(props.churnedCount)} />
          <StatCard label="Churn rate" value={`${props.churnRate.toFixed(1)}%`} />
          <StatCard label="Conversion rate" value={`${props.conversionRate.toFixed(1)}%`} sub="Calls → active" />
          <StatCard label="Onboarding rate" value="—" sub="Time-to-first-value" />
        </div>
      </Section>

      <Section num="04" title="Active client accounts" sub="Net flow over time.">
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <EmptyPanel icon={Users} title="Need 30+ days" sub="Active client trend chart populates as clients onboard and churn." />
        </div>
      </Section>

      <Section num="05" title="Clients" sub={`${props.clients.length} in this view${props.clients.length > 100 ? " (showing 100 most relevant)" : ""}`}>
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Pending</th>
                <th className="px-4 py-3">Onboarded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
              {props.clients.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-[#6B7280]">No clients in this view.</td></tr>
              ) : props.clients.slice(0, 100).map(c => (
                <tr key={c.id} className="hover:bg-[#0C0C10]/40">
                  <td className="px-4 py-3 font-medium text-[#F5F5F7]">{c.name}</td>
                  <td className="px-4 py-3 text-[#9CA3AF] capitalize">{c.status ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#F5F5F7]">{formatCurrency(props.hasFanbasis ? Number((c.data as { fanbasis?: { lifetime?: number } } | null)?.fanbasis?.lifetime ?? 0) : Number(c.mrr ?? 0))}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#9CA3AF]">{formatCurrency(Number(c.total_pending ?? 0))}</td>
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

function PeriodSelector() {
  return (
    <div className="flex rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-0.5 text-xs">
      {["7d", "30d", "90d", "YTD", "All"].map((p, i) => (
        <button
          key={p}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            i === 1 ? "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]" : "text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"
          }`}
        >{p}</button>
      ))}
    </div>
  );
}
