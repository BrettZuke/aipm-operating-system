import { TaskListView } from "../task-list";

export const dynamic = "force-dynamic";

export default function AllTasksPage() {
  return (
    <TaskListView
      title="All Tasks"
      description="Every task across the workspace."
      filter={{ kind: "all" }}
    />
  );
}
