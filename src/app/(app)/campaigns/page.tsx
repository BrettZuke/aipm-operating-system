import Link from "next/link";
import { Megaphone, Link2 } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import { CampaignDialog } from "./campaign-dialog";
import { CampaignRowActions } from "./campaign-row-actions";
import { StatCard, Section } from "../dashboard/tabs";

export const dynamic = "force-dynamic";

type Tab = "all" | "live" | "scheduled" | "completed" | "drafts";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: Tab }>;
}) {
  const { tab = "all" } = await searchParams;
  const { supabase, agencyId } = await getAuthContext();

  const [{ data: campaigns, error }, { data: clients }] = await Promise.all([
    supabase.from("campaigns").select("id,name,status,client_id,start_date,end_date,budget,created_at").eq("agency_id", agencyId!).order("created_at", { ascending: false }),
    supabase.from("clients").select("id,name").eq("agency_id", agencyId!).order("name"),
  ]);

  if (error) return <div className="text-red-300 text-sm p-4">{error.message}</div>;
  const clientMap = new Map((clients ?? []).map(c => [c.id, c.name]));

  const all = campaigns ?? [];
  const live = all.filter(c => c.status === "active");
  const scheduled = all.filter(c => c.status === "draft" && c.start_date);
  const completed = all.filter(c => c.status === "completed");
  const drafts = all.filter(c => c.status === "draft");

  const filtered = tab === "live" ? live : tab === "scheduled" ? scheduled : tab === "completed" ? completed : tab === "drafts" ? drafts : all;

  const totalBudget = all.reduce((s, c) => s + Number(c.budget ?? 0), 0);
  const tabs = [
    { key: "all", label: "All", count: all.length },
    { key: "live", label: "Live", count: live.length },
    { key: "scheduled", label: "Scheduled", count: scheduled.length },
    { key: "completed", label: "Completed", count: completed.length },
    { key: "drafts", label: "Drafts", count: drafts.length },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">MARKETING · PROGRAMS</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Campaigns</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Living campaigns feeding the pipeline — spend velocity, lead flow, conversion, and what&apos;s working.</p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodToggle />
          <button className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.10)] px-3 py-2 text-sm text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.06)]">
            <Link2 className="size-3.5" /> UTM Builder
          </button>
          <CampaignDialog mode="create" clients={clients ?? []} showTrigger />
        </div>
      </div>

      {/* 01 · Status overview */}
      <Section num="01" title="Status overview" sub={`${all.length} campaign${all.length === 1 ? "" : "s"} across all states`}>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Draft",     count: drafts.length,     color: "text-[#9CA3AF]" },
            { label: "Active",    count: live.length,       color: "text-emerald-400" },
            { label: "Paused",    count: all.filter(c => c.status === "paused").length,   color: "text-amber-400" },
            { label: "Completed", count: completed.length,  color: "text-blue-400" },
            { label: "Archived",  count: all.filter(c => c.status === "archived").length, color: "text-[#6B7280]" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4">
              <div className={`text-[10px] font-semibold uppercase tracking-wider ${s.color}`}>{s.label}</div>
              <div className="mt-2 text-2xl font-bold text-[#F5F5F7] tabular-nums">{s.count}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[rgba(255,255,255,0.08)]">
        {tabs.map(t => (
          <Link key={t.key} href={`?tab=${t.key}`} replace scroll={false} className={`flex items-center gap-2 border-b-2 px-4 pb-3 text-sm font-medium transition-colors duration-100 ${tab === t.key ? "border-[#0083FF] text-[#F5F5F7]" : "border-transparent text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"}`}>
            {t.label}
            <span className={`rounded-full px-1.5 text-[10px] font-semibold ${tab === t.key ? "bg-blue-500 text-white" : "bg-[rgba(255,255,255,0.06)] text-[#6B7280]"}`}>{t.count}</span>
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Active campaigns" value={String(live.length)} sub={`${all.length} total`} accent />
        <StatCard label="Spent" value={formatCurrency(totalBudget)} sub={totalBudget === 0 ? "No budget set" : `${all.length} campaigns`} />
        <StatCard label="Revenue" value={formatCurrency(0)} sub="Closed-won attributed" />
        <StatCard label="Blended ROI" value="—" sub="Revenue / spend" />
      </div>

      {/* Chart + search */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-5">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-semibold text-[#F5F5F7]">Lead velocity &amp; spend</div>
            <div className="flex gap-3 text-[11px] text-[#6B7280]">
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-blue-400" />Leads/day</span>
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-[rgba(255,255,255,0.25)]" />Spend/day</span>
            </div>
          </div>
          <div className="text-xs text-[#6B7280] mb-4">Last 30 days · daily, smoothed</div>
          <div className="flex h-32 items-end">
            {/* Simple visual line chart placeholder */}
            <svg viewBox="0 0 400 100" className="w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M 0 80 Q 100 60 200 50 T 400 10" stroke="#3b82f6" strokeWidth="2" fill="none" />
              <path d="M 0 80 Q 100 60 200 50 T 400 10 V 100 H 0 Z" fill="url(#chartGrad)" />
            </svg>
          </div>
        </div>
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-5">
          <div className="mb-1 text-sm font-semibold text-[#F5F5F7]">Find campaigns</div>
          <div className="mb-3 text-xs text-[#6B7280]">Search by name</div>
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search campaigns..." className="h-9 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10] pl-8 pr-3 text-sm text-[rgba(245,245,247,0.8)] placeholder:text-[#6B7280] focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="mt-3 text-xs text-[#6B7280]">{filtered.length} shown · {all.length} total</div>
        </div>
      </div>

      {/* 02 · Spend by type */}
      <Section num="02" title="Spend by type" sub="Where the budget went.">
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          {totalBudget === 0 ? (
            <div className="text-sm text-[#9CA3AF] text-center py-6">No budget allocated yet — campaigns with budget appear here split by type.</div>
          ) : (
            <div className="space-y-3">
              {["Paid social", "Search", "Display", "Email", "Affiliate"].map((kind, i) => {
                const value = i === 0 ? totalBudget : 0;
                const pct = totalBudget > 0 ? (value / totalBudget) * 100 : 0;
                return (
                  <div key={kind} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-[#9CA3AF] text-right shrink-0">{kind}</div>
                    <div className="flex-1 h-4 rounded bg-[rgba(255,255,255,0.06)] overflow-hidden">
                      <div className="h-full rounded bg-[rgba(0,131,255,0.6)]" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-20 text-right text-xs font-mono text-[#F5F5F7] tabular-nums">{formatCurrency(value)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      {/* 03 · Campaigns list */}
      {!filtered.length ? (
        <div className="flex items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 py-10">
          <p className="text-sm text-[#9CA3AF]">No campaigns yet. Create your first campaign to begin.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
              <th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Client</th><th className="px-4 py-3 text-right">Budget</th><th className="w-10" />
            </tr></thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-[#0C0C10]/40">
                  <td className="px-4 py-3 font-medium text-[#F5F5F7]">{c.name}</td>
                  <td className="px-4 py-3 capitalize text-[#9CA3AF]">{c.status ?? "draft"}</td>
                  <td className="px-4 py-3 text-[#9CA3AF]">{c.client_id ? clientMap.get(c.client_id) ?? "—" : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#F5F5F7]">{formatCurrency(Number(c.budget ?? 0))}</td>
                  <td className="px-2 py-3"><CampaignRowActions campaign={c} clients={clients ?? []} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PeriodToggle() {
  return (
    <div className="flex rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-0.5 text-xs">
      {["30d", "90d", "YTD", "All"].map((p, i) => (
        <button
          key={p}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            i === 0 ? "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]" : "text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"
          }`}
        >{p}</button>
      ))}
    </div>
  );
}
