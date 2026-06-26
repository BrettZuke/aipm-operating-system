import Link from "next/link";
import { BookOpen, Plus, Search, LayoutList, LayoutGrid, Inbox, Play, GitBranch, Building2 } from "lucide-react";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Tab = "browse" | "review" | "active" | "edits" | "departments";

const TABS: { key: Tab; label: string }[] = [
  { key: "browse",      label: "Browse" },
  { key: "review",      label: "Review queue" },
  { key: "active",      label: "Active runs" },
  { key: "edits",       label: "Pending edits" },
  { key: "departments", label: "Departments" },
];

const CATEGORY_TAGS = ["All", "Content", "Ads", "Outreach", "Client delivery", "Sales", "Systems", "AI"];
const VISIBILITY_TAGS = ["All", "Internal", "Client-facing"];

export default async function PlaybooksPage({ searchParams }: { searchParams: Promise<{ tab?: Tab }> }) {
  const { tab = "browse" } = await searchParams;
  const { supabase } = await getAuthContext();
  const { data: sops } = await supabase
    .from("department_sops")
    .select("id,title,updated_at,department_id,departments(name)")
    .order("updated_at", { ascending: false });

  const counts: Record<Tab, number> = { browse: sops?.length ?? 0, review: 0, active: 0, edits: 0, departments: 0 };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SYSTEMS · OPERATING</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Playbooks & SOPs</h1>
          <p className="mt-1 text-sm text-[#9CA3AF] max-w-2xl">Every system that runs the agency. Verified, owned, executable. Each SOP carries a human view and an agent-runnable JSON.</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
          <Plus className="size-3.5" /> New SOP
        </button>
      </div>

      {/* 3 stat pills */}
      <div className="flex gap-3">
        <StatPill icon={Inbox} label="Review queue" value={counts.review} subtext={counts.review === 0 ? "all current" : "to review"} />
        <StatPill icon={Play} label="Active runs" value={counts.active} subtext={counts.active === 0 ? "no live runs" : "in flight"} />
        <StatPill icon={GitBranch} label="Agent-proposed edits" value={counts.edits} subtext={counts.edits === 0 ? "Inbox clear" : "awaiting review"} />
      </div>

      {/* 5 tabs */}
      <div className="flex gap-0 border-b border-[rgba(255,255,255,0.08)] overflow-x-auto">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={`?tab=${t.key}`}
            replace
            scroll={false}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors duration-100 ${
              tab === t.key
                ? "border-[#0083FF] text-[#F5F5F7] bg-[#0C0C10]/80"
                : "border-transparent text-[#9CA3AF] hover:text-[#F5F5F7] hover:bg-white/[0.03]"
            }`}
          >
            {t.label}
            <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] tabular-nums text-[#9CA3AF]">{counts[t.key]}</span>
          </Link>
        ))}
      </div>

      {tab === "browse" && (
        <>
          {/* Filters */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_TAGS.map((c, i) => (
                <button key={c} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  i === 0 ? "border-[rgba(0,131,255,0.30)] bg-[rgba(0,131,255,0.10)] text-blue-400" : "border-[rgba(255,255,255,0.08)] text-[#9CA3AF] hover:text-[#F5F5F7]"
                }`}>{c}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {VISIBILITY_TAGS.map((v, i) => (
                <button key={v} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  i === 0 ? "border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]" : "border-[rgba(255,255,255,0.08)] text-[#9CA3AF] hover:text-[#F5F5F7]"
                }`}>{v}</button>
              ))}
            </div>
          </div>

          {/* Search + view toggle */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" />
              <input placeholder="Search SOPs…" className="h-9 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10] pl-9 pr-3 text-sm text-[rgba(245,245,247,0.8)] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div className="flex rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-0.5">
              <button className="flex items-center gap-1.5 rounded-md bg-[rgba(255,255,255,0.06)] px-2.5 py-1.5 text-xs text-[#F5F5F7]">
                <LayoutList className="size-3" /> Table
              </button>
              <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[#9CA3AF] hover:text-[#F5F5F7]">
                <LayoutGrid className="size-3" /> Cards
              </button>
            </div>
          </div>

          {/* SOP table */}
          <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                  <th className="px-4 py-3">SOP</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Cadence</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3 text-right">Steps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
                {!sops?.length ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-[#6B7280]">No SOPs yet — click + New SOP to add one.</td></tr>
                ) : sops.map(s => (
                  <tr key={s.id} className="hover:bg-[#0C0C10]/40 cursor-pointer">
                    <td className="px-4 py-3 flex items-center gap-2 font-medium text-[#F5F5F7]">
                      <BookOpen className="size-3.5 text-[#9CA3AF] shrink-0" />
                      {s.title}
                    </td>
                    <td className="px-4 py-3 text-[#9CA3AF]">—</td>
                    <td className="px-4 py-3"><span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Verified</span></td>
                    <td className="px-4 py-3 text-xs text-[#6B7280]">—</td>
                    <td className="px-4 py-3 text-xs text-[#6B7280]">Markdown + JSON</td>
                    <td className="px-4 py-3 text-right text-xs text-[#9CA3AF]">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "review" && <EmptyTab title="Review queue" sub="SOPs needing a fresh review will appear here." />}
      {tab === "active" && <EmptyTab title="Active runs" sub="SOPs currently being executed by Settoku or a teammate." />}
      {tab === "edits" && <EmptyTab title="Agent-proposed edits" sub="When Settoku drafts an edit to a SOP, you'll see it here for review." />}
      {tab === "departments" && (
        <div className="grid grid-cols-3 gap-3">
          {["Sales", "Marketing", "Operations", "Client Success", "Finance", "Hiring"].map(d => (
            <div key={d} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5 hover:border-[rgba(255,255,255,0.12)] cursor-pointer">
              <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)] mb-3">
                <Building2 className="size-4 text-[#9CA3AF]" />
              </div>
              <div className="text-sm font-semibold text-[#F5F5F7]">{d}</div>
              <div className="mt-1 text-xs text-[#9CA3AF]">0 SOPs · No mission set</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, label, value, subtext }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; subtext: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
        <Icon className="size-4 text-[#9CA3AF]" />
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[#F5F5F7]">{label}</span>
          <span className="text-base font-bold text-[#F5F5F7] tabular-nums">{value}</span>
        </div>
        <div className="text-xs text-[#6B7280]">{subtext}</div>
      </div>
    </div>
  );
}

function EmptyTab({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] py-16 text-center">
      <div className="text-base font-medium text-[#9CA3AF]">{title}</div>
      <p className="mt-1 max-w-sm text-xs text-[#6B7280]">{sub}</p>
    </div>
  );
}
