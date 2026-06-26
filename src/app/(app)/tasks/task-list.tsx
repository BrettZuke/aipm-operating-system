import { CheckSquare } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskRow } from "./task-row";

export type TaskFilter =
  | { kind: "all" }
  | { kind: "mine" }
  | { kind: "today" }
  | { kind: "client"; clientId: string };

export async function TaskListView({
  title,
  description,
  filter,
}: {
  title: string;
  description: string;
  filter: TaskFilter;
}) {
  const { supabase, agencyId, user } = await getAuthContext();

  let query = supabase
    .from("tasks")
    .select(
      "id, title, description, status, priority, due_date, client_id, assignee_id, created_at",
    )
    .eq("agency_id", agencyId!)
    .order("status")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(500);

  if (filter.kind === "mine") {
    query = query.eq("assignee_id", user.id);
  } else if (filter.kind === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    query = query
      .gte("due_date", start.toISOString())
      .lte("due_date", end.toISOString());
  } else if (filter.kind === "client") {
    query = query.eq("client_id", filter.clientId);
  }

  const [{ data: tasks, error }, { data: clients }, { data: members }] =
    await Promise.all([
      query,
      supabase.from("clients").select("id, name").eq("agency_id", agencyId!).order("name"),
      supabase
        .from("agency_members")
        .select("user_id, profiles(id, full_name, email)")
        .eq("agency_id", agencyId!)
        .eq("status", "active"),
    ]);

  if (error) {
    return (
      <div className="rounded-md border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-300">
        Failed to load tasks: {error.message}
      </div>
    );
  }

  // flatten members
  const memberOptions: { id: string; full_name: string | null; email: string }[] =
    (members ?? [])
      .map((m) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return p
          ? { id: p.id, full_name: p.full_name, email: p.email }
          : null;
      })
      .filter((x): x is { id: string; full_name: string | null; email: string } => x !== null);

  // group by status
  const grouped = {
    todo: [] as typeof tasks,
    in_progress: [] as typeof tasks,
    blocked: [] as typeof tasks,
    done: [] as typeof tasks,
    cancelled: [] as typeof tasks,
  };
  for (const t of tasks ?? []) {
    const k = (t.status ?? "todo") as keyof typeof grouped;
    if (grouped[k]) grouped[k]!.push(t);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#F5F5F7]">{title}</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{description}</p>
        </div>
        <TaskFormDialog
          mode="create"
          clients={clients ?? []}
          members={memberOptions}
        />
      </header>

      {!tasks || tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks"
          description="Add your first task to get organized."
          action={
            <TaskFormDialog
              mode="create"
              clients={clients ?? []}
              members={memberOptions}
            />
          }
        />
      ) : (
        <div className="space-y-6">
          {(["todo", "in_progress", "blocked", "done", "cancelled"] as const).map(
            (status) => {
              const group = grouped[status];
              if (!group || group.length === 0) return null;
              return (
                <section key={status}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    {status.replace("_", " ")} ({group.length})
                  </h2>
                  <div className="space-y-1.5">
                    {group.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        clients={clients ?? []}
                        members={memberOptions}
                      />
                    ))}
                  </div>
                </section>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
