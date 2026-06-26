"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { GoalFormDialog } from "./goal-form-dialog";
import { deleteGoal } from "./actions";

type Row = {
  id: string;
  name: string;
  target_value: number;
  current_value: number;
  unit: string | null;
  period_start: string | null;
  period_end: string | null;
  owner_id: string | null;
};
type MemberOpt = { id: string; full_name: string | null; email: string };

export function GoalRowActions({
  goal,
  members,
}: {
  goal: Row;
  members: MemberOpt[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`Delete goal "${goal.name}"?`)) return;
    startTransition(async () => {
      await deleteGoal(goal.id);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded-md p-1.5 text-[#6B7280] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5F5F7]"
            aria-label="Goal actions"
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
      <GoalFormDialog
        mode="edit"
        goal={goal}
        members={members}
        
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
