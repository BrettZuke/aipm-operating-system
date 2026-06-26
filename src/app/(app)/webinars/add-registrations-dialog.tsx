"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { addRegistrationsFromCsv } from "./actions";

export function AddRegistrationsDialog({ webinarId }: { webinarId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [pending, startTransition] = useTransition();
  const [warnings, setWarnings] = useState<string[]>([]);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null); setSuccess(null); setWarnings([]);
      const r = await addRegistrationsFromCsv(null, formData);
      if (!r.ok) { setError(r.error); return; }
      setSuccess(`✓ ${r.inserted} added · ${r.skipped} skipped`);
      setWarnings(r.errors);
      setCsv("");
      setTimeout(() => { setOpen(false); router.refresh(); }, 1500);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setCsv(""); setError(null); setSuccess(null); setWarnings([]); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5"><Upload className="size-3.5" /> Add registrations</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Add registrations</h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Paste CSV or tab-separated. Header row optional — first column is name, second email, third phone.
              Phones must be E.164 format (<span className="font-mono">+15551234567</span>) to receive SMS.
            </p>
          </div>

          <input type="hidden" name="webinar_id" value={webinarId} />

          <div className="space-y-1.5">
            <textarea
              name="csv"
              value={csv}
              onChange={e => setCsv(e.target.value)}
              rows={10}
              placeholder={"name,email,phone\nJane Doe,jane@example.com,+15550100001\nJohn Smith,john@example.com,+15550100002"}
              className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 py-2 text-xs font-mono text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              required
            />
            <p className="text-[10px] text-[#6B7280]">{csv.split("\n").filter(l => l.trim()).length} non-blank line{csv.split("\n").filter(l => l.trim()).length === 1 ? "" : "s"}</p>
          </div>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
          {success && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">{success}</div>}
          {warnings.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400 max-h-32 overflow-y-auto">
              <div className="font-semibold mb-1">Warnings:</div>
              {warnings.slice(0, 10).map((w, i) => <div key={i} className="font-mono text-[11px]">· {w}</div>)}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !csv.trim()}>{pending ? "Adding…" : "Add registrations"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
