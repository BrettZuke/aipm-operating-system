"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAdCampaign } from "./actions";

export function NewCampaignDialog({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const r = await createAdCampaign(null, formData);
      if (!r.ok) setError(r.error);
      else { setOpen(false); router.refresh(); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5"><Plus className="size-3.5" /> New campaign</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F7]">New ad campaign</h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">Track a paid campaign manually. Spend updates as you connect platform integrations.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Campaign name</Label>
            <Input id="name" name="name" placeholder="Q3 Webinar push — Meta lookalikes" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="platform">Platform</Label>
              <select id="platform" name="platform" defaultValue="meta" className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 text-sm text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-blue-500/20" required>
                <option value="meta">Meta (Facebook / Instagram)</option>
                <option value="google">Google Ads</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
                <option value="linkedin">LinkedIn</option>
                <option value="twitter">X / Twitter</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget">Budget (USD)</Label>
              <Input id="budget" name="budget" type="number" step="100" min="0" placeholder="5000" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client_id">Client (optional)</Label>
            <select id="client_id" name="client_id" defaultValue="" className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 text-sm text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">None — workspace-level campaign</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create campaign"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
