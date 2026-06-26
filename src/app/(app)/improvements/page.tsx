import { getAuthContext } from "@/lib/auth";
import { CreateImprovementDialog } from "./create-improvement-dialog";
import { ImprovementRow } from "./improvement-row";

export const dynamic = "force-dynamic";

type Status = "open" | "in_progress" | "done" | "blocked" | "cancelled";

const TABS: { key: Status; label: string }[] = [
  { key: "open",        label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked",     label: "Blocked" },
  { key: "done",        label: "Done" },
];

export default async function ImprovementsPage({ searchParams }: { searchParams: Promise<{ status?: Status }> }) {
  const { status: statusFilter = "open" } = await searchParams;
  const { supabase, agencyId } = await getAuthContext();

  const { data: items } = await supabase
    .from("improvements")
    .select("id,kind,status,priority,title,description,proposed_fix,evidence,source,attempt_count,last_attempt_log,created_at,resolved_at")
    .eq("agency_id", agencyId!)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  const all = items ?? [];
  const counts: Record<Status, number> = { open: 0, in_progress: 0, done: 0, blocked: 0, cancelled: 0 };
  for (const i of all) counts[i.status as Status]++;

  const filtered = all.filter(i => i.status === statusFilter);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SYSTEM · SELF-IMPROVEMENT</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Improvements</h1>
          <p className="mt-1 text-sm text-[#9CA3AF] max-w-2xl">Priority queue of bugs, tech debt, feature ideas, and audit findings. The nightly self-discovery audit feeds it automatically; work items down by priority.</p>
        </div>
        <CreateImprovementDialog />
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[rgba(255,255,255,0.08)]">
        {TABS.map(t => (
          <a
            key={t.key}
            href={`?status=${t.key}`}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium -mb-px transition-colors ${
              statusFilter === t.key ? "border-blue-500 text-[#F5F5F7]" : "border-transparent text-[#9CA3AF] hover:text-[#F5F5F7]"
            }`}
          >
            {t.label}
            <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] tabular-nums text-[#9CA3AF]">{counts[t.key]}</span>
          </a>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] py-16 text-center text-sm text-[#9CA3AF]">
          {statusFilter === "open" ? "Inbox zero — no open improvements." : `No ${statusFilter.replace("_", " ")} items.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(i => <ImprovementRow key={i.id} item={i} />)}
        </div>
      )}
    </div>
  );
}
