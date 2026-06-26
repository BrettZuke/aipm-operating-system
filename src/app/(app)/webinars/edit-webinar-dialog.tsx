"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateWebinar, deleteWebinar } from "./actions";

type Webinar = {
  id: string;
  title: string;
  starts_at: string;
  join_url: string | null;
  template_24h: string | null;
  template_1h: string | null;
  template_15m: string | null;
  template_live: string | null;
};

// Convert ISO → datetime-local string (YYYY-MM-DDTHH:MM)
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditWebinarDialog({ webinar }: { webinar: Webinar }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const r = await updateWebinar(null, formData);
      if (!r.ok) setError(r.error);
      else { setOpen(false); router.refresh(); }
    });
  }

  function handleDelete() {
    if (!confirm(`Delete webinar "${webinar.title}"? This also removes all registrations.`)) return;
    startTransition(async () => {
      const r = await deleteWebinar(webinar.id);
      if (!r.ok) setError(r.error);
      else router.push("/webinars");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5"><Pencil className="size-3.5" /> Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Edit webinar</h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">Templates support placeholders: <span className="font-mono text-[#9CA3AF]">{"{name}"}</span> · <span className="font-mono text-[#9CA3AF]">{"{title}"}</span> · <span className="font-mono text-[#9CA3AF]">{"{join_url}"}</span> · <span className="font-mono text-[#9CA3AF]">{"{minutes}"}</span></p>
          </div>

          <input type="hidden" name="id" value={webinar.id} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" defaultValue={webinar.title} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="starts_at">Starts at</Label>
              <Input id="starts_at" name="starts_at" type="datetime-local" defaultValue={toLocalInput(webinar.starts_at)} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="join_url">Join URL</Label>
            <Input id="join_url" name="join_url" type="url" defaultValue={webinar.join_url ?? ""} placeholder="https://..." />
          </div>

          <div className="border-t border-[rgba(255,255,255,0.08)] pt-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] mb-2">SMS templates</div>

            {[
              { key: "template_24h",  label: "24h before", default: webinar.template_24h },
              { key: "template_1h",   label: "1h before",  default: webinar.template_1h },
              { key: "template_15m",  label: "15m before", default: webinar.template_15m },
              { key: "template_live", label: "Live (now)", default: webinar.template_live },
            ].map(t => (
              <div key={t.key} className="space-y-1 mb-3">
                <Label htmlFor={t.key} className="text-[11px]">{t.label}</Label>
                <textarea
                  id={t.key}
                  name={t.key}
                  defaultValue={t.default ?? ""}
                  rows={2}
                  className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 py-2 text-xs text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder={t.key === "template_live" ? "{title} starts NOW. Join: {join_url}" : "..."}
                />
              </div>
            ))}
            <p className="text-[10px] text-[#6B7280]">Leave a template blank to skip that reminder window.</p>
          </div>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={handleDelete} disabled={pending} className="text-red-400 hover:text-red-300 border-red-500/30">Delete</Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
