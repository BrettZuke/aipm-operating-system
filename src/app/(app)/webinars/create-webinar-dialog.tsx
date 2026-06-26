"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebinar } from "./actions";

export function CreateWebinarDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const r = await createWebinar(null, formData);
      if (!r.ok) setError(r.error);
      else { setOpen(false); router.push(`/webinars/${r.webinarId}`); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="size-3.5" /> New webinar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Create webinar</h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">You can edit templates and add registrations on the next screen.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="your agency Masterclass" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="starts_at">Starts at</Label>
            <Input id="starts_at" name="starts_at" type="datetime-local" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="join_url">Join URL (optional)</Label>
            <Input id="join_url" name="join_url" type="url" placeholder="https://event.webinarjam.com/go/live/123" />
          </div>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create webinar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
