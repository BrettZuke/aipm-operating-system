"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCampaign, updateCampaign } from "./actions";

type Row = { id: string; name: string; status: string | null; client_id: string | null; start_date: string | null; end_date: string | null; budget: number | null };
type ClientOpt = { id: string; name: string };

export function CampaignDialog({ mode, campaign, clients, showTrigger, open: co, onOpenChange: ooc }: {
  mode: "create" | "edit"; campaign?: Row; clients: ClientOpt[];
  showTrigger?: boolean; open?: boolean; onOpenChange?: (v: boolean) => void;
}) {
  const [io, sio] = useState(false);
  const [err, se] = useState<string | null>(null);
  const [pending, sp] = useTransition();
  const isControlled = co !== undefined;
  const open = isControlled ? co! : io;
  const setOpen = isControlled ? ooc! : sio;

  function onSubmit(fd: FormData) {
    sp(async () => {
      se(null);
      const r = mode === "create" ? await createCampaign(null, fd) : await updateCampaign(campaign!.id, fd);
      if (!r.ok) se(r.error); else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild><Button size="sm"><Plus />New campaign</Button></DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader><DialogTitle>{mode === "create" ? "New campaign" : "Edit campaign"}</DialogTitle></DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2"><Label>Name *</Label>
            <Input name="name" required defaultValue={campaign?.name ?? ""} placeholder="Q3 Outreach" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Status</Label>
              <select name="status" defaultValue={campaign?.status ?? "draft"} className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]">
                {["draft","active","paused","completed","archived"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>Budget</Label>
              <Input name="budget" type="number" step="0.01" min="0" defaultValue={campaign?.budget ?? 0} />
            </div>
          </div>
          <div className="space-y-2"><Label>Client</Label>
            <select name="client_id" defaultValue={campaign?.client_id ?? ""} className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]">
              <option value="">— No client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Start</Label><Input name="start_date" type="date" defaultValue={campaign?.start_date ?? ""} /></div>
            <div className="space-y-2"><Label>End</Label><Input name="end_date" type="date" defaultValue={campaign?.end_date ?? ""} /></div>
          </div>
          {err && <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : mode === "create" ? "Create" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
