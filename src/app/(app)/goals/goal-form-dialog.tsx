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
import { createGoal, updateGoal } from "./actions";

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

export function GoalFormDialog({
  mode,
  goal,
  members,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  mode: "create" | "edit";
  goal?: Row;
  members: MemberOpt[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const result =
        mode === "create"
          ? await createGoal(null, formData)
          : await updateGoal(goal!.id, formData);
      if (!result.ok) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">
              <Plus />
              New goal
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create a goal" : "Edit goal"}
          </DialogTitle>
          <DialogDescription>
            Set a target and track progress over time.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Goal name *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={goal?.name ?? ""}
              placeholder="e.g. Q2 revenue target"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="target_value">Target *</Label>
              <Input
                id="target_value"
                name="target_value"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={goal?.target_value ?? ""}
                placeholder="100000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current_value">Current</Label>
              <Input
                id="current_value"
                name="current_value"
                type="number"
                step="0.01"
                min="0"
                defaultValue={goal?.current_value ?? 0}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit">Unit</Label>
            <select
              id="unit"
              name="unit"
              defaultValue={goal?.unit ?? "currency"}
              className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]"
            >
              <option value="currency">Currency ($)</option>
              <option value="count">Count</option>
              <option value="percent">Percent (%)</option>
              <option value="hours">Hours</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner_id">Owner</Label>
            <select
              id="owner_id"
              name="owner_id"
              defaultValue={goal?.owner_id ?? ""}
              className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]"
            >
              <option value="">— Team goal —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name ?? m.email}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="period_start">Start</Label>
              <Input
                id="period_start"
                name="period_start"
                type="date"
                defaultValue={goal?.period_start ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period_end">End</Label>
              <Input
                id="period_end"
                name="period_end"
                type="date"
                defaultValue={goal?.period_end ?? ""}
              />
            </div>
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
                  ? "Create goal"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
