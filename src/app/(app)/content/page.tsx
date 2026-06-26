import Link from "next/link";
import { Plus, Search, BarChart2, Eye, Heart, UserPlus } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { ClientTabs } from "@/components/ui/client-tabs";
import { StatCard, EmptyPanel } from "../dashboard/tabs";

export const dynamic = "force-dynamic";

type Tab = "workspace" | "performance";
type WorkspaceSub = "pipeline" | "sources" | "calendar" | "ideas";
type PerformanceSub = "overview" | "pieces" | "outliers" | "audience";

const TABS = [
  { key: "workspace",   label: "Workspace"   },
  { key: "performance", label: "Performance" },
];

const WORKSPACE_SUBS: { key: WorkspaceSub; label: string }[] = [
  { key: "pipeline",  label: "Pipeline" },
  { key: "sources",   label: "Sources" },
  { key: "calendar",  label: "Calendar" },
  { key: "ideas",     label: "Ideas" },
];

const PERFORMANCE_SUBS: { key: PerformanceSub; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "pieces",   label: "Pieces" },
  { key: "outliers", label: "Outliers" },
  { key: "audience", label: "Audience" },
];

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: Tab; sub?: string }> }) {
  const { tab = "workspace", sub } = await searchParams;
  const { supabase, agencyId } = await getAuthContext();
  const { data: items } = await supabase
    .from("content")
    .select("id,title,content_type,status,scheduled_for,created_at")
    .eq("agency_id", agencyId!)
    .order("scheduled_for", { ascending: true, nullsFirst: false });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">CONTENT · SHIPPING</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Content</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Track content lifecycle from idea to published performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">Zapier not linked</span>
          <select className="h-9 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-3 text-xs text-[#F5F5F7] focus:outline-none">
            <option>All clients</option>
          </select>
          <button className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
            <Plus className="size-3.5" /> New piece
          </button>
        </div>
      </div>

      <ClientTabs
        tabs={TABS}
        initialTab={tab}
        panels={{
          workspace: <WorkspaceTab items={items ?? []} sub={(sub as WorkspaceSub) ?? "pipeline"} />,
          performance: <PerformanceTab sub={(sub as PerformanceSub) ?? "overview"} />,
        }}
      />
    </div>
  );
}

type Item = { id: string; title: string; content_type: string | null; status: string | null; scheduled_for: string | null; created_at: string };

function WorkspaceTab({ items, sub }: { items: Item[]; sub: WorkspaceSub }) {
  const scripting = items.filter(i => i.status === "draft" || i.status === "scripting");
  const editing = items.filter(i => i.status === "editing" || i.status === "review");
  const queued = items.filter(i => i.status === "scheduled" || i.status === "queued");

  return (
    <div className="space-y-5">
      {/* Sub-tabs + period */}
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2">
        <div className="flex gap-0">
          {WORKSPACE_SUBS.map(s => (
            <Link
              key={s.key}
              href={`?tab=workspace&sub=${s.key}`}
              replace
              scroll={false}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                sub === s.key ? "text-[#F5F5F7] border-b-2 border-blue-500 -mb-[10px]" : "text-[#9CA3AF] hover:text-[#F5F5F7]"
              }`}
            >{s.label}</Link>
          ))}
        </div>
        <div className="flex rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-0.5 text-xs">
          {["7d", "30d", "90d"].map((p, i) => (
            <button key={p} className={`rounded-md px-2.5 py-1 font-medium ${i === 1 ? "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]" : "text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"}`}>{p}</button>
          ))}
        </div>
      </div>

      {sub === "pipeline" && (
        <div className="grid grid-cols-3 gap-3">
          <KanbanColumn title="Scripting" count={scripting.length} items={scripting} color="text-purple-400" />
          <KanbanColumn title="Editing"   count={editing.length}   items={editing}   color="text-amber-400" />
          <KanbanColumn title="Queued"    count={queued.length}    items={queued}    color="text-emerald-400" />
        </div>
      )}

      {sub === "sources" && (
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Source ROI</div>
          <EmptyPanel icon={BarChart2} title="No source attribution" sub="Tag pieces with the source/idea origin to see what's working." />
        </div>
      )}

      {sub === "calendar" && (
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <EmptyPanel icon={BarChart2} title="Calendar view coming" sub="Month view of scheduled pieces ships next." />
        </div>
      )}

      {sub === "ideas" && (
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <EmptyPanel icon={BarChart2} title="No ideas in the bank" sub="Drop ideas here. AI organizes them by angle and platform." />
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ title, count, items, color }: { title: string; count: number; items: Item[]; color: string }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-4 min-h-[300px]">
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-xs font-semibold uppercase tracking-widest ${color}`}>{title}</span>
        <span className="text-xs font-medium text-[#9CA3AF] tabular-nums">{count}</span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-[#6B7280] text-center py-6">Empty</p>
        ) : items.map(it => (
          <div key={it.id} className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/80 p-2.5 hover:border-[rgba(255,255,255,0.15)] cursor-pointer">
            <div className="text-xs font-medium text-[#F5F5F7] line-clamp-2">{it.title}</div>
            <div className="mt-1 text-[10px] text-[#6B7280] capitalize">{it.content_type ?? "post"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceTab({ sub }: { sub: PerformanceSub }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2">
        <div className="flex gap-0">
          {PERFORMANCE_SUBS.map(s => (
            <Link
              key={s.key}
              href={`?tab=performance&sub=${s.key}`}
              replace
              scroll={false}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                sub === s.key ? "text-[#F5F5F7] border-b-2 border-blue-500 -mb-[10px]" : "text-[#9CA3AF] hover:text-[#F5F5F7]"
              }`}
            >{s.label}</Link>
          ))}
        </div>
        <div className="flex rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-0.5 text-xs">
          {["7d", "30d", "90d"].map((p, i) => (
            <button key={p} className={`rounded-md px-2.5 py-1 font-medium ${i === 1 ? "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]" : "text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"}`}>{p}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total reach" value="—" sub="Connect platforms" accent />
        <StatCard label="Engagement rate" value="—" sub="Likes + comments / reach" />
        <StatCard label="New followers" value="—" sub="Across all channels" />
        <StatCard label="Pieces published" value="—" sub="In this period" />
      </div>

      {sub === "overview" && (
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Source ROI</div>
          <EmptyPanel icon={BarChart2} title="Connect a platform" sub="Wire Instagram, YouTube, or TikTok in Settings → Integrations to see ROI per source." />
        </div>
      )}

      {sub === "pieces" && (
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <EmptyPanel icon={Eye} title="No published pieces yet" sub="Performance per piece appears here once content is live." />
        </div>
      )}

      {sub === "outliers" && (
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <EmptyPanel icon={Heart} title="No outliers detected" sub="AI flags pieces that meaningfully outperform your baseline." />
        </div>
      )}

      {sub === "audience" && (
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <EmptyPanel icon={UserPlus} title="No audience data" sub="Demographics and growth trends appear here once platforms are linked." />
        </div>
      )}
    </div>
  );
}
