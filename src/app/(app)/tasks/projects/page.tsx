import { FolderKanban, ChevronRight } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { NewProjectDialog } from "./new-project-dialog";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string,"success"|"warning"|"muted"|"primary"> = { active:"success", paused:"warning", archived:"muted", completed:"primary" };

export default async function ProjectsPage() {
  const { supabase, agencyId } = await getAuthContext();
  const [{ data: projects }, { data: taskCounts }, { data: clients }] = await Promise.all([
    supabase.from("projects").select("id,name,status,description,due_date,client_id,clients(name)").eq("agency_id", agencyId!).order("created_at", { ascending: false }),
    supabase.from("tasks").select("project_id,status").eq("agency_id", agencyId!),
    supabase.from("clients").select("id,name").eq("agency_id", agencyId!).order("name").limit(500),
  ]);

  const countMap = new Map<string, { total: number; done: number }>();
  for (const t of taskCounts ?? []) {
    if (!t.project_id) continue;
    const c = countMap.get(t.project_id) ?? { total: 0, done: 0 };
    c.total++; if (t.status === "done") c.done++;
    countMap.set(t.project_id, c);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#F5F5F7]">Projects</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{projects?.length ?? 0} projects.</p>
        </div>
        <NewProjectDialog clients={clients ?? []} />
      </header>

      {!projects?.length ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Organise tasks into projects for better tracking." />
      ) : (
        <div className="space-y-3">
          {projects.map(p => {
            const counts = countMap.get(p.id) ?? { total: 0, done: 0 };
            const pct = counts.total > 0 ? (counts.done / counts.total) * 100 : 0;
            const clientName = Array.isArray(p.clients) ? p.clients[0]?.name : (p.clients as any)?.name;
            return (
              <div key={p.id} className="flex items-center gap-4 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 px-5 py-4 hover:border-[rgba(255,255,255,0.10)] group">
                <FolderKanban className="size-5 text-[#6B7280] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#F5F5F7]">{p.name}</span>
                    <Badge variant={STATUS_VARIANT[p.status ?? "active"] ?? "default"}>{p.status ?? "active"}</Badge>
                    {clientName && <span className="text-xs text-[#6B7280]">· {clientName}</span>}
                  </div>
                  {counts.total > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 w-32 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-[#6B7280]">{counts.done}/{counts.total} tasks</span>
                    </div>
                  )}
                </div>
                {p.due_date && <span className="text-xs text-[#6B7280] shrink-0">{new Date(p.due_date).toLocaleDateString()}</span>}
                <ChevronRight className="size-4 text-[rgba(245,245,247,0.3)] group-hover:text-[#9CA3AF] shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
