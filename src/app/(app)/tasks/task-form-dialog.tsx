"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTask, updateTask } from "./actions";

type Row = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  client_id: string | null;
  assignee_id: string | null;
};
type ClientOpt = { id: string; name: string };
type MemberOpt = { id: string; full_name: string | null; email: string };

type Props = {
  mode: "create" | "edit";
  task?: Row;
  clients: ClientOpt[];
  members: MemberOpt[];
  showTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function TaskFormDialog({
  mode,
  task,
  clients,
  members,
  showTrigger,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const result =
        mode === "create"
          ? await createTask(null, formData)
          : await updateTask(task!.id, formData);
      if (!result.ok) setError(result.error);
      else setOpen(false);
    });
  }

  const defaultDueDate = task?.due_date
    ? new Date(task.due_date).toISOString().slice(0, 16)
    : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus />
            New task
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create a task" : "Edit task"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a task for yourself or a teammate."
              : "Update this task's details."}
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={task?.title ?? ""}
              placeholder="Follow up with new lead"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={task?.description ?? ""}
              placeholder="Details, links, context…"
              className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={task?.status ?? "todo"}
                className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]"
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                defaultValue={task?.priority ?? "medium"}
                className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="assignee_id">Assignee</Label>
              <select
                id="assignee_id"
                name="assignee_id"
                defaultValue={task?.assignee_id ?? ""}
                className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]"
              >
                <option value="">— Unassigned —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name ?? m.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_id">Client</Label>
              <select
                id="client_id"
                name="client_id"
                defaultValue={task?.client_id ?? ""}
                className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]"
              >
                <option value="">— No client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">Due date</Label>
            <Input
              id="due_date"
              name="due_date"
              type="datetime-local"
              defaultValue={defaultDueDate}
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : mode === "create"
                  ? "Create task"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
