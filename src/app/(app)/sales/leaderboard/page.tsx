import Link from "next/link";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { formatCurrency } from "@/lib/utils";
import { StatCard, Section } from "../../dashboard/tabs";
import { ClientTabs } from "@/components/ui/client-tabs";

export const dynamic = "force-dynamic";

type Period = "week" | "lastweek" | "month" | "alltime";

const PERIODS = [
  { key: "week"     as const, label: "This week"  },
  { key: "lastweek" as const, label: "Last week"  },
  { key: "month"    as const, label: "This month" },
  { key: "alltime"  as const, label: "All time"   },
];

function periodWindow(period: Period): { from: Date; to: Date } | null {
  const now = new Date();
  if (period === "alltime") return null;
  if (period === "month") {
    const from = new Date(now); from.setUTCDate(1); from.setUTCHours(0, 0, 0, 0);
    return { from, to: now };
  }
  // Mon-anchored week
  const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = startOfWeek.getUTCDay();
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - ((day + 6) % 7));
  if (period === "week") return { from: startOfWeek, to: now };
  // last week
  const lwStart = new Date(startOfWeek); lwStart.setUTCDate(lwStart.getUTCDate() - 7);
  return { from: lwStart, to: startOfWeek };
}

type CallRow = {
  id: string;
  member_id: string | null;
  outcome: string | null;
  occurred_at: string;
  data: { closer_name?: string; cash_collected?: number; contract_value?: number; outcome_label?: string } | null;
};

type ProfileRow = { id: string; full_name: string | null; email: string };

function getNameForKey(key: string, profById: Map<string, ProfileRow>) {
  if (key.startsWith("name:")) return key.slice(5);
  return profById.get(key)?.full_name ?? profById.get(key)?.email ?? "Unknown";
}

type CloserStats = {
  key: string;
  name: string;
  calls: number;
  won: number;
  lost: number;
  noShow: number;
  callback: number;
  held: number;            // calls minus no_show
  cashCollected: number;
  contractValue: number;
  closeRate: number;       // won / held
  showRate: number;        // held / calls
  avgDealSize: number;
};

function buildStats(calls: CallRow[], profById: Map<string, ProfileRow>): CloserStats[] {
  const buckets = new Map<string, CloserStats>();
  for (const c of calls) {
    const key = c.member_id ?? `name:${c.data?.closer_name ?? "Unattributed"}`;
    let s = buckets.get(key);
    if (!s) {
      s = {
        key, name: getNameForKey(key, profById),
        calls: 0, won: 0, lost: 0, noShow: 0, callback: 0, held: 0,
        cashCollected: 0, contractValue: 0, closeRate: 0, showRate: 0, avgDealSize: 0,
      };
      buckets.set(key, s);
    }
    s.calls++;
    if (c.outcome === "won") s.won++;
    else if (c.outcome === "lost") s.lost++;
    else if (c.outcome === "no_show") s.noShow++;
    else if (c.outcome === "callback") s.callback++;
    s.cashCollected += Number(c.data?.cash_collected ?? 0);
    s.contractValue += Number(c.data?.contract_value ?? 0);
  }
  const rows = Array.from(buckets.values());
  for (const s of rows) {
    s.held = s.calls - s.noShow;
    s.closeRate = s.held > 0 ? (s.won / s.held) * 100 : 0;
    s.showRate = s.calls > 0 ? (s.held / s.calls) * 100 : 0;
    s.avgDealSize = s.won > 0 ? s.contractValue / s.won : 0;
  }
  return rows.sort((a, b) => b.cashCollected - a.cashCollected);
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: Period }> }) {
  const { period = "month" } = await searchParams;
  const { supabase, agencyId } = await getAuthContext();

  // Pull all calls (paginated, in case > 1000)
  const calls = await fetchAllPages<CallRow>((from, to) =>
    supabase
      .from("calls")
      .select("id,member_id,outcome,occurred_at,data")
      .eq("agency_id", agencyId!)
      .order("occurred_at", { ascending: false })
      .range(from, to) as unknown as Promise<{ data: CallRow[] | null; error: { message: string } | null }>,
  );

  const { data: profilesRaw } = await supabase.from("profiles").select("id,full_name,email");
  const profById = new Map<string, ProfileRow>((profilesRaw ?? []).map(p => [p.id, p as ProfileRow]));

  // Filter to current period
  const currentWindow = periodWindow(period);
  const filteredCurrent = currentWindow
    ? calls.filter(c => {
        const t = new Date(c.occurred_at).getTime();
        return t >= currentWindow.from.getTime() && t < currentWindow.to.getTime();
      })
    : calls;

  // For deltas: also fetch the prior period (same length immediately before)
  let priorWindow: { from: Date; to: Date } | null = null;
  if (currentWindow) {
    const span = currentWindow.to.getTime() - currentWindow.from.getTime();
    priorWindow = { from: new Date(currentWindow.from.getTime() - span), to: currentWindow.from };
  }
  const filteredPrior = priorWindow
    ? calls.filter(c => {
        const t = new Date(c.occurred_at).getTime();
        return t >= priorWindow!.from.getTime() && t < priorWindow!.to.getTime();
      })
    : [];

  const current = buildStats(filteredCurrent, profById);
  const prior = buildStats(filteredPrior, profById);
  const priorByKey = new Map(prior.map(p => [p.key, p]));

  // Toplines
  const totalCash = current.reduce((s, r) => s + r.cashCollected, 0);
  const totalContract = current.reduce((s, r) => s + r.contractValue, 0);
  const totalCalls = current.reduce((s, r) => s + r.calls, 0);
  const totalHeld = current.reduce((s, r) => s + r.held, 0);
  const totalWon = current.reduce((s, r) => s + r.won, 0);
  const overallCloseRate = totalHeld > 0 ? (totalWon / totalHeld) * 100 : 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SALES · TEAM</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Closer leaderboard</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Who&apos;s winning and where coaching is needed.</p>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Cash collected" value={formatCurrency(totalCash)} sub={`${PERIODS.find(p => p.key === period)?.label}`} accent />
        <StatCard label="Contract value" value={formatCurrency(totalContract)} sub={`${current.reduce((s, r) => s + r.won, 0)} wins`} />
        <StatCard label="Calls" value={String(totalCalls)} sub={`${totalHeld} held / ${totalCalls - totalHeld} no-show`} />
        <StatCard label="Close rate" value={`${overallCloseRate.toFixed(1)}%`} sub={`${totalWon} of ${totalHeld} held`} />
      </div>

      <ClientTabs
        tabs={PERIODS}
        initialTab={period}
        panels={Object.fromEntries(PERIODS.map(p => [p.key, (
          <LeaderboardTable key={p.key} rows={current} priorByKey={priorByKey} />
        )]))}
      />
    </div>
  );
}

function LeaderboardTable({ rows, priorByKey }: { rows: CloserStats[]; priorByKey: Map<string, CloserStats> }) {
  if (rows.length === 0) {
    return (
      <Section title="No calls in this period" sub="Once closers run calls, they'll appear here ranked by cash collected.">
        <div />
      </Section>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
            <th className="px-4 py-3 w-10">#</th>
            <th className="px-4 py-3">Closer</th>
            <th className="px-4 py-3 text-right">Calls</th>
            <th className="px-4 py-3 text-right">Held</th>
            <th className="px-4 py-3 text-right">Won</th>
            <th className="px-4 py-3 text-right">Lost</th>
            <th className="px-4 py-3 text-right">Show rate</th>
            <th className="px-4 py-3 text-right">Close rate</th>
            <th className="px-4 py-3 text-right">Cash collected</th>
            <th className="px-4 py-3 text-right">Contract value</th>
            <th className="px-4 py-3 text-right">Avg deal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
          {rows.map((r, i) => {
            const prior = priorByKey.get(r.key);
            const cashDelta = prior ? r.cashCollected - prior.cashCollected : null;
            return (
              <tr key={r.key} className="hover:bg-[#0C0C10]/40">
                <td className="px-4 py-3 text-[#6B7280] font-mono">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-[#F5F5F7]">{r.name}</div>
                  {!r.key.startsWith("name:") && (
                    <Link href={`/team`} className="text-[10px] text-[#6B7280] hover:text-blue-400">view profile →</Link>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.calls}</td>
                <td className="px-4 py-3 text-right font-mono text-[rgba(245,245,247,0.8)]">{r.held}</td>
                <td className="px-4 py-3 text-right font-mono text-emerald-400">{r.won}</td>
                <td className="px-4 py-3 text-right font-mono text-red-400">{r.lost}</td>
                <td className="px-4 py-3 text-right font-mono text-[#9CA3AF]">{r.calls > 0 ? `${r.showRate.toFixed(0)}%` : "—"}</td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={r.closeRate >= 30 ? "text-emerald-400" : r.closeRate >= 15 ? "text-amber-400" : "text-red-400"}>
                    {r.held > 0 ? `${r.closeRate.toFixed(1)}%` : "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-[#F5F5F7]">
                  {formatCurrency(r.cashCollected)}
                  {cashDelta !== null && (
                    <span className="ml-2 text-[10px]">
                      {cashDelta > 0 ? <TrendingUp className="inline size-3 text-emerald-400" />
                       : cashDelta < 0 ? <TrendingDown className="inline size-3 text-red-400" />
                       : <Minus className="inline size-3 text-[#6B7280]" />}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[rgba(245,245,247,0.8)]">{formatCurrency(r.contractValue)}</td>
                <td className="px-4 py-3 text-right font-mono text-[#9CA3AF]">{r.won > 0 ? formatCurrency(r.avgDealSize) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-xs font-semibold">
            <td className="px-4 py-2 text-[#6B7280]" colSpan={2}>
              <Trophy className="inline size-3 text-amber-400 mr-2" />Total
            </td>
            <td className="px-4 py-2 text-right font-mono">{rows.reduce((s, r) => s + r.calls, 0)}</td>
            <td className="px-4 py-2 text-right font-mono">{rows.reduce((s, r) => s + r.held, 0)}</td>
            <td className="px-4 py-2 text-right font-mono text-emerald-400">{rows.reduce((s, r) => s + r.won, 0)}</td>
            <td className="px-4 py-2 text-right font-mono text-red-400">{rows.reduce((s, r) => s + r.lost, 0)}</td>
            <td colSpan={2} />
            <td className="px-4 py-2 text-right font-mono font-bold text-[#F5F5F7]">{formatCurrency(rows.reduce((s, r) => s + r.cashCollected, 0))}</td>
            <td className="px-4 py-2 text-right font-mono">{formatCurrency(rows.reduce((s, r) => s + r.contractValue, 0))}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
