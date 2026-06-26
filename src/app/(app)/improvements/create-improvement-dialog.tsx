"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createImprovement } from "./actions";

export function CreateImprovementDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const r = await createImprovement(null, formData);
      if (!r.ok) setError(r.error);
      else { setOpen(false); router.refresh(); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5"><Plus className="size-3.5" /> New improvement</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Add improvement</h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">Bug, tech debt, feature idea, audit finding — anything you want fixed/built. Lands in the queue, ranked by priority.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="e.g. /clients page slow on initial load" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kind">Kind</Label>
              <select name="kind" id="kind" defaultValue="bug" className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 text-sm text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="bug">Bug</option>
                <option value="tech_debt">Tech debt</option>
                <option value="feature">Feature</option>
                <option value="audit">Audit finding</option>
                <option value="security">Security</option>
                <option value="perf">Performance</option>
                <option value="data_quality">Data quality</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select name="priority" id="priority" defaultValue="3" className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 text-sm text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="1">P1 — urgent / blocker</option>
                <option value="2">P2 — high</option>
                <option value="3">P3 — medium</option>
                <option value="4">P4 — low</option>
                <option value="5">P5 — someday</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="What's the problem / what would success look like?"
              className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proposed_fix">Proposed fix (optional)</Label>
            <textarea
              id="proposed_fix"
              name="proposed_fix"
              rows={3}
              placeholder="If you have a hypothesis — what file? What change?"
              className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add to queue"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
