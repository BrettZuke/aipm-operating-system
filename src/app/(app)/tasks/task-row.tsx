"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { TaskFormDialog } from "./task-form-dialog";
import { deleteTask, toggleTaskStatus } from "./actions";

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

const PRIORITY_VARIANT: Record<string, "default" | "primary" | "warning" | "danger"> = {
  low: "default",
  medium: "primary",
  high: "warning",
  urgent: "danger",
};

function formatDueDate(iso: string | null): { label: string; danger: boolean } {
  if (!iso) return { label: "—", danger: false };
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const danger = diffMs < 0;
  if (Math.abs(diffDays) < 1) {
    const hours = Math.round(diffMs / (1000 * 60 * 60));
    return {
      label:
        hours <= 0
          ? `${Math.abs(hours)}h overdue`
          : `in ${hours}h`,
      danger,
    };
  }
  return {
    label: d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    danger,
  };
}

export function TaskRow({
  task,
  clients,
  members,
}: {
  task: Row;
  clients: ClientOpt[];
  members: MemberOpt[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const isDone = task.status === "done";
  const due = formatDueDate(task.due_date);
  const client = task.client_id ? clients.find((c) => c.id === task.client_id) : null;
  const assignee = task.assignee_id ? members.find((m) => m.id === task.assignee_id) : null;

  function onToggle() {
    startTransition(async () => {
      await toggleTaskStatus(task.id, task.status ?? "todo");
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${task.title}"?`)) return;
    startTransition(async () => {
      await deleteTask(task.id);
    });
  }

  return (
    <>
      <div className="group flex items-center gap-3 rounded-md border border-[rgba(255,255,255,0.08)]/60 bg-[#0C0C10]/30 px-3 py-2.5 hover:border-[rgba(255,255,255,0.10)]">
        <button
          onClick={onToggle}
          disabled={pending}
          className="shrink-0 text-[#6B7280] transition-colors hover:text-emerald-400 disabled:opacity-50"
          aria-label={isDone ? "Mark incomplete" : "Mark complete"}
        >
          {isDone ? (
            <CheckCircle2 className="size-5 text-emerald-500" />
          ) : (
            <Circle className="size-5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-sm ${
                isDone ? "text-[#6B7280] line-through" : "text-[#F5F5F7]"
              }`}
            >
              {task.title}
            </span>
            {task.priority && task.priority !== "medium" && (
              <Badge variant={PRIORITY_VARIANT[task.priority] ?? "default"}>
                {task.priority}
              </Badge>
            )}
          </div>
          {(task.description || client || assignee) && (
            <div className="mt-1 flex items-center gap-3 text-xs text-[#6B7280]">
              {task.description && (
                <span className="truncate">{task.description}</span>
              )}
              {client && <span>· {client.name}</span>}
              {assignee && <span>· {assignee.full_name ?? assignee.email}</span>}
            </div>
          )}
        </div>
        <span
          className={`shrink-0 text-xs tabular-nums ${
            due.danger ? "text-red-400" : "text-[#6B7280]"
          }`}
        >
          {due.label}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-md p-1.5 text-[#6B7280] opacity-0 transition-opacity hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5F5F7] group-hover:opacity-100 focus:opacity-100"
              aria-label="Task actions"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            className="z-50 min-w-[140px] rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0C0C10] p-1 shadow-xl"
          >
            <DropdownMenuItem
              onSelect={() => setEditOpen(true)}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[rgba(245,245,247,0.8)] outline-none hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5F5F7]"
            >
              <Pencil className="size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 h-px bg-[rgba(255,255,255,0.06)]" />
            <DropdownMenuItem
              onSelect={onDelete}
              disabled={pending}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-400 outline-none hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              {pending ? "Deleting…" : "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TaskFormDialog
        mode="edit"
        task={task}
        clients={clients}
        members={members}
        
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
