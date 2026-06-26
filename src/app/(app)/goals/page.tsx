import Link from "next/link";
import { TrendingUp, Calendar, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { CreatorGoals } from "./creator-goals";

export const dynamic = "force-dynamic";

type Tab = "quarterly" | "annual" | "team" | "mine" | "checkins" | "archive";
const TABS = [
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
  { key: "team", label: "By team" },
  { key: "mine", label: "My goals" },
  { key: "checkins", label: "Check-ins" },
  { key: "archive", label: "Archive" },
];

function getCurrentQuarter() {
  const m = new Date().getMonth();
  const q = Math.floor(m / 3) + 1;
  return `Q${q} ${new Date().getFullYear()}`;
}

function getDaysLeftInQuarter() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const end = new Date(now.getFullYear(), (q + 1) * 3, 0);
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
}

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" ? sp.tab : "quarterly") as Tab;
  const { supabase, agencyId } = await getAuthContext();

  // Creator-template tenants (e.g. the creator) track a live Stripe revenue goal instead of OKRs.
  const { data: agencyRow } = await supabase
    .from("agencies")
    .select("name, dashboard_template")
    .eq("id", agencyId!)
    .maybeSingle<{ name: string; dashboard_template: string }>();
  if (agencyRow?.dashboard_template === "creator") {
    return <CreatorGoals agencyId={agencyId!} workspaceName={agencyRow.name ?? "Workspace"} searchParams={sp} />;
  }

  const { data: goals } = await supabase.from("goals").select("id,name,target_value,current_value,unit,period_start,period_end,owner_id").eq("agency_id", agencyId!).order("created_at");

  const quarter = getCurrentQuarter();
  const daysLeft = getDaysLeftInQuarter();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">OBJECTIVES · {quarter}</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]">Goals</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">One north-star. A set of key results that, if achieved, guarantee it. Weekly check-ins from every owner.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-3 py-1.5 text-xs text-[#9CA3AF]">
            <Calendar className="size-3.5" />
            {quarter} · {daysLeft} days left
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
            <Plus className="size-4" /> New objective
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[rgba(255,255,255,0.08)]">
        {TABS.map(t => (
          <Link key={t.key} href={`?tab=${t.key}`} replace scroll={false} className={`flex items-center gap-2 border-b-2 px-4 pb-3 text-sm font-medium transition-colors duration-100 ${tab === t.key ? "border-[#0083FF] text-[#F5F5F7]" : "border-transparent text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"}`}>
            {t.label}
            {t.key === "quarterly" && <span className={`rounded-full px-1.5 text-[10px] font-semibold ${tab === t.key ? "bg-blue-500 text-white" : "bg-[rgba(255,255,255,0.06)] text-[#6B7280]"}`}>{goals?.length ?? 0}</span>}
          </Link>
        ))}
      </div>

      {/* North-star empty state */}
      {!goals?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] mb-4">
            <TrendingUp className="size-6 text-[#9CA3AF]" />
          </div>
          <div className="text-base font-medium text-[#F5F5F7]">No north-star goal yet</div>
          <p className="mt-1 max-w-sm text-sm text-[#9CA3AF]">Create your first goal to unlock the north-star summary, pacing chart, and AI forecast panels.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {goals.map(g => {
            const pct = Number(g.target_value) > 0 ? Math.min(100, (Number(g.current_value) / Number(g.target_value)) * 100) : 0;
            return (
              <div key={g.id} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-5">
                <div className="font-semibold text-[#F5F5F7]">{g.name}</div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-[#9CA3AF]">{Number(g.current_value).toLocaleString()} / {Number(g.target_value).toLocaleString()}</span>
                  <span className={pct >= 100 ? "text-emerald-400" : "text-[#6B7280]"}>{pct.toFixed(0)}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                  <div className={`h-full ${pct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* All objectives */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-semibold text-[#F5F5F7]">All objectives</div>
            <div className="text-xs text-[#6B7280]">No goals yet — create your first one to start tracking</div>
          </div>
          <div className="flex gap-2">
            {["Level", "Status", "Owner"].map(f => (
              <button key={f} className="flex items-center gap-1 rounded-md border border-[rgba(255,255,255,0.08)] px-2 py-1 text-xs text-[#6B7280] hover:border-[rgba(255,255,255,0.10)]">
                <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 4h13M3 8h9M3 12h5"/></svg>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.08)] py-6 text-center text-sm text-[#6B7280]">
          No goals set yet. Click New objective above to create one.
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5">
          <div className="font-semibold text-[#F5F5F7]">What's moving</div>
          <div className="text-xs text-[#6B7280] mt-0.5">AI digest · today</div>
          <div className="mt-4 text-sm text-[#6B7280]">No movement to report yet.</div>
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5">
          <div className="font-semibold text-[#F5F5F7]">Team alignment</div>
          <div className="text-xs text-[#6B7280] mt-0.5">Everyone has at least one KR</div>
          <div className="mt-4 text-sm text-[#6B7280]">No team members with goals yet.</div>
        </div>
      </div>
    </div>
  );
}
