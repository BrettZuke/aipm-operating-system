import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskRow } from "./task-row";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const { supabase, user, agencyId } = await getAuthContext();

  const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString();
  const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString();
  const now = new Date().toISOString();

  const [{ data: allTasks }, { data: members }, { data: clients }] = await Promise.all([
    supabase.from("tasks").select("id,title,description,status,priority,due_date,client_id,assignee_id,created_at").eq("agency_id", agencyId!).order("created_at", { ascending: false }),
    supabase.from("agency_members").select("user_id,profiles(id,full_name,email)").eq("agency_id", agencyId!).eq("status", "active"),
    supabase.from("clients").select("id,name").eq("agency_id", agencyId!).order("name"),
  ]);

  const myTasks = (allTasks ?? []).filter(t => t.assignee_id === user.id);
  const next7 = (allTasks ?? []).filter(t => t.due_date && t.due_date >= now && t.due_date <= sevenDays);
  const next30 = (allTasks ?? []).filter(t => t.due_date && t.due_date >= now && t.due_date <= thirtyDays);

  const memberOptions: { id: string; full_name: string | null; email: string }[] = [];
  for (const m of members ?? []) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (p) memberOptions.push({ id: p.id, full_name: p.full_name, email: p.email });
  }

  const tabs = [
    { label: "My Tasks", count: myTasks.length, tasks: myTasks },
    { label: "All Tasks", count: allTasks?.length ?? 0, tasks: allTasks ?? [], active: true },
    { label: "Next 7 Days", count: next7.length, tasks: next7 },
    { label: "Next 30 Days", count: next30.length, tasks: next30 },
  ];

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <nav className="flex gap-1">
          {tabs.map((tab, i) => (
            <Link
              key={tab.label}
              href={i === 0 ? "/tasks/my" : i === 1 ? "/tasks/all" : i === 2 ? "/tasks/today" : "/tasks/all"}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                i === 1
                  ? "border-blue-500 text-[#F5F5F7]"
                  : "border-transparent text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${i === 1 ? "bg-blue-500 text-white" : "bg-[rgba(255,255,255,0.06)] text-[#9CA3AF]"}`}>
                {tab.count}
              </span>
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search tasks" className="h-9 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 pl-8 pr-3 text-sm text-[rgba(245,245,247,0.8)] placeholder:text-[#6B7280] focus:outline-none focus:ring-1 focus:ring-blue-500 w-48" />
          </div>
          <TaskFormDialog mode="create" clients={clients ?? []} members={memberOptions}
            showTrigger
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { label: "Assignee", key: "assignee" },
          { label: "Project", key: "project" },
          { label: "Priority", key: "priority" },
          { label: "Status", key: "status" },
        ].map((f) => (
          <div key={f.key} className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-3 py-1.5 text-xs text-[#9CA3AF] hover:border-[rgba(255,255,255,0.10)] cursor-pointer">
            <span className="text-[#6B7280]">{f.label}:</span>
            <span>All</span>
            <svg className="size-3 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6"/></svg>
          </div>
        ))}
      </div>

      {/* Tasks list */}
      {!allTasks?.length ? (
        <div className="flex items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 py-10">
          <p className="text-sm text-[#9CA3AF]">No items yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {allTasks.map((t) => (
            <TaskRow key={t.id} task={t} clients={clients ?? []} members={memberOptions} />
          ))}
        </div>
      )}
    </div>
  );
}
