import { TaskListView } from "../task-list";

export const dynamic = "force-dynamic";

export default function MyTasksPage() {
  return (
    <TaskListView
      title="My Tasks"
      description="Tasks assigned to you, grouped by status."
      filter={{ kind: "mine" }}
    />
  );
}
