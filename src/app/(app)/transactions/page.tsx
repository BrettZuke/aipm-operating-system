import { Repeat, TrendingUp, BarChart2 } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransactionRowActions } from "./transaction-row-actions";
import { CreatorTransactions } from "./creator-transactions";
import { fanbasisEnabledFor, fanbasisEnrichedCustomers } from "@/lib/coach/fanbasis";
import { StatCard, Section, EmptyPanel } from "../dashboard/tabs";

export const dynamic = "force-dynamic";

const KIND_VARIANT: Record<string, "primary" | "warning" | "danger" | "muted"> = {
  payment: "primary",
  refund: "warning",
  chargeback: "danger",
  adjustment: "muted",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const { supabase, agencyId } = await getAuthContext();

  // Creator-template tenants (e.g. the creator) read their live Stripe ledger, not the Supabase one.
  const { data: agencyRow } = await supabase
    .from("agencies")
    .select("name, dashboard_template")
    .eq("id", agencyId!)
    .maybeSingle<{ name: string; dashboard_template: string }>();
  if (agencyRow?.dashboard_template === "creator") {
    return <CreatorTransactions agencyId={agencyId!} workspaceName={agencyRow.name ?? "Workspace"} searchParams={sp} />;
  }

  // Coach/agency path: Supabase finance ledger, scoped to the active workspace (was leaking
  // every tenant's transactions — the table is agency-scoped, the query wasn't).
  const { data: clients } = await supabase.from("clients").select("id,name").eq("agency_id", agencyId!).order("name");
  const clientMap = new Map((clients ?? []).map(c => [c.id, c.name]));

  // the coach (coach on FanBasis) has no real Supabase ledger — his payments live in FanBasis. Build the
  // ledger from the FanBasis API so net revenue matches the dashboard, not the ~12 stray manual rows.
  // Other coach tenants keep the Supabase finance ledger.
  type TxRow = { id: string; client_id: string | null; client_name?: string | null; amount: number; currency: string | null; kind: string | null; description: string | null; occurred_at: string | null };
  const onFanbasis = fanbasisEnabledFor(agencyId);
  let txList: TxRow[];
  if (onFanbasis) {
    const customers = await fanbasisEnrichedCustomers().catch(() => []);
    txList = customers
      .filter(c => c.revenue > 0)
      .sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""))
      .map((c, i) => ({
        id: `fb-${i}`,
        client_id: null,
        client_name: c.name ?? c.email ?? "FanBasis customer",
        amount: c.revenue,
        currency: "USD",
        kind: "payment",
        description: c.multi ? `${c.section} · ${c.transactions} payments` : c.section,
        occurred_at: c.day ? `${c.day}T00:00:00Z` : null,
      }));
  } else {
    const { data: transactions, error: txError } = await supabase
      .from("transactions").select("id,client_id,amount,currency,kind,description,occurred_at")
      .eq("agency_id", agencyId!).order("occurred_at", { ascending: false }).limit(200);
    if (txError) {
      return <div className="rounded-md border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-300">Failed to load: {txError.message}</div>;
    }
    txList = (transactions ?? []).map(t => ({ ...t, client_name: null }));
  }
  const payments = txList.filter(t => t.kind === "payment");
  const refunds = txList.filter(t => t.kind === "refund" || t.kind === "chargeback");
  const totalRevenue = payments.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const totalRefunds = refunds.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const netRevenue = totalRevenue - totalRefunds;
  const pending = txList.filter(t => t.kind === "adjustment").reduce((s, t) => s + Number(t.amount ?? 0), 0);

  // Pre-compute daily cash flow for chart (last 30 days)
  const dailyPayments: number[] = [];
  const dailyRefunds: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    dailyPayments.push(payments.filter(t => t.occurred_at && new Date(t.occurred_at).toDateString() === ds).reduce((s, t) => s + Number(t.amount ?? 0), 0));
    dailyRefunds.push(refunds.filter(t => t.occurred_at && new Date(t.occurred_at).toDateString() === ds).reduce((s, t) => s + Number(t.amount ?? 0), 0));
  }
  const maxDay = Math.max(1, ...dailyPayments, ...dailyRefunds);

  // Breakdown by type
  const byType = Object.entries(
    txList.reduce((acc, t) => { acc[t.kind ?? "payment"] = (acc[t.kind ?? "payment"] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">MONEY · LEDGER</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Transactions</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            {onFanbasis ? "FanBasis payments" : "Workspace finance ledger"} — {txList.length} transactions · {formatCurrency(netRevenue)} net
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.10)] px-3 py-2 text-sm text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.06)]">
            Export CSV
          </button>
          <TransactionFormDialog mode="create" clients={clients ?? []} />
        </div>
      </header>

      {/* 4-card stat strip */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Net revenue" value={formatCurrency(netRevenue)} sub="Payments – refunds – chargebacks" accent />
        <StatCard label="Pending" value={formatCurrency(pending)} sub="0 transactions" />
        <StatCard label="Refunds + chargebacks" value={formatCurrency(totalRefunds)} sub={`${refunds.length} this period`} />
        <StatCard label="Payouts" value="—" sub="0 batches" />
      </div>

      {/* 01 · Cash flow · last 30 days */}
      <Section num="01" title="Cash flow · last 30 days" sub="Daily-collected, with prior-30 reference.">
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          {txList.length === 0 ? (
            <EmptyPanel icon={TrendingUp} title="No transactions yet" sub="Record payments, refunds, and adjustments to track revenue." />
          ) : (
            <>
              <div className="flex items-end gap-0.5 h-32">
                {dailyPayments.map((p, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end gap-px h-full">
                    {dailyRefunds[i] > 0 && <div className="w-full rounded-sm bg-red-500/60" style={{ height: `${(dailyRefunds[i] / maxDay) * 100}%`, minHeight: 2 }} />}
                    {p > 0 && <div className="w-full rounded-sm bg-[rgba(0,131,255,0.6)]" style={{ height: `${(p / maxDay) * 100}%`, minHeight: 2 }} />}
                    {p === 0 && dailyRefunds[i] === 0 && <div className="w-full rounded-sm bg-[rgba(255,255,255,0.04)]" style={{ height: "8%" }} />}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-[#9CA3AF]">
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm inline-block bg-[rgba(0,131,255,0.6)]" />Payments in</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm inline-block bg-red-500/60" />Refunds + chargebacks</span>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* 02 · Breakdown */}
      <Section num="02" title="Breakdown" sub="By type and by source.">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="text-sm font-semibold text-[#F5F5F7] mb-3">All transactions · by type</div>
            {byType.length === 0 ? (
              <div className="text-sm text-[#9CA3AF] text-center py-6">No transactions yet.</div>
            ) : (
              <div className="space-y-3">
                {byType.map(([kind, count]) => {
                  const pct = txList.length > 0 ? (count / txList.length) * 100 : 0;
                  return (
                    <div key={kind} className="flex items-center gap-3">
                      <div className="w-20 text-xs text-[#9CA3AF] text-right shrink-0 capitalize">{kind}</div>
                      <div className="flex-1 h-4 rounded bg-[rgba(255,255,255,0.06)] overflow-hidden">
                        <div className="h-full rounded bg-[rgba(0,131,255,0.5)]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-8 text-right text-xs font-semibold text-[#F5F5F7] tabular-nums">{count}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Payments only · revenue attribution</div>
            <EmptyPanel icon={BarChart2} title="No source attribution" sub="Tag transactions with a source or UTM to see breakdown." />
          </div>
        </div>
      </Section>

      {/* 03 · Ledger */}
      <Section num="03" title="Ledger" sub={`${txList.length} transactions · 0 watching · net: ${formatCurrency(netRevenue)}`}>
        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select className="h-8 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-2.5 text-xs text-[#F5F5F7] focus:outline-none">
            <option>TYPE · All types</option>
            <option>Payment</option>
            <option>Refund</option>
            <option>Chargeback</option>
            <option>Adjustment</option>
          </select>
          <select className="h-8 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-2.5 text-xs text-[#F5F5F7] focus:outline-none">
            <option>STATUS · All statuses</option>
          </select>
          <select className="h-8 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-2.5 text-xs text-[#F5F5F7] focus:outline-none">
            <option>SOURCE · All sources</option>
          </select>
          <select className="h-8 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-2.5 text-xs text-[#F5F5F7] focus:outline-none">
            <option>CLIENT · All clients</option>
            {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {txList.length === 0 ? (
          <EmptyState icon={Repeat} title="No transactions yet" description="Record payments, refunds, and adjustments to track revenue."
            action={<TransactionFormDialog mode="create" clients={clients ?? []} />} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
                {txList.map(t => (
                  <tr key={t.id} className="hover:bg-[#0C0C10]/40">
                    <td className="px-4 py-3 text-[rgba(245,245,247,0.8)]">{formatDateTime(t.occurred_at)}</td>
                    <td className="px-4 py-3"><Badge variant={KIND_VARIANT[t.kind ?? "payment"] ?? "default"}>{t.kind ?? "payment"}</Badge></td>
                    <td className="px-4 py-3 text-[rgba(245,245,247,0.8)]">{t.client_name ?? (t.client_id ? clientMap.get(t.client_id) ?? "—" : "—")}</td>
                    <td className="px-4 py-3 text-[#9CA3AF]">{t.description ?? "—"}</td>
                    <td className={`px-4 py-3 text-right font-mono ${t.kind === "refund" || t.kind === "chargeback" ? "text-red-400" : "text-[#F5F5F7]"}`}>
                      {formatCurrency(Number(t.amount ?? 0), t.currency ?? "USD")}
                    </td>
                    <td className="px-2 py-3"><TransactionRowActions transaction={t} clients={clients ?? []} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
