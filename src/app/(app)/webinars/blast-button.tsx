"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fireWebinarBlast } from "./actions";

export function BlastButton({
  webinarId, kind, label, templateConfigured, unsentCount,
}: {
  webinarId: string;
  kind: "24h" | "1h" | "15m" | "live";
  label: string;
  templateConfigured: boolean;
  unsentCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Twilio cost — A2P 10DLC is ~$0.0079 per US SMS
  const estCost = (unsentCount * 0.0079).toFixed(2);

  function handleFire(dryRun: boolean) {
    startTransition(async () => {
      setResult(null);
      const fd = new FormData();
      fd.set("webinar_id", webinarId);
      fd.set("kind", kind);
      fd.set("dry_run", dryRun ? "true" : "false");
      const r = await fireWebinarBlast(null, fd);
      if (!r.ok) {
        setResult({ ok: false, msg: r.error });
      } else {
        setResult({ ok: true, msg: `${dryRun ? "Dry run: " : ""}${r.sent} sent · ${r.skipped} skipped · ${r.errored} errored` });
        if (!dryRun) setTimeout(() => { setOpen(false); router.refresh(); }, 1500);
      }
    });
  }

  const disabled = !templateConfigured;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <DialogTrigger asChild>
        <button
          disabled={disabled}
          className={`rounded-lg border px-4 py-3 text-left transition-colors ${
            disabled
              ? "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] text-[#4B5563] cursor-not-allowed"
              : unsentCount === 0
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10"
                : "border-blue-500/30 bg-blue-500/5 text-[#F5F5F7] hover:bg-blue-500/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{label}</span>
            <MessageSquare className="size-3.5" />
          </div>
          <div className="mt-1 text-[11px] opacity-80">
            {disabled ? "no template" : unsentCount === 0 ? "all sent ✓" : `${unsentCount} to send`}
          </div>
        </button>
      </DialogTrigger>
      <DialogContent>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Send {label} blast</h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Will send the {kind} template to {unsentCount} registration{unsentCount === 1 ? "" : "s"} that haven&apos;t received this reminder yet.
              Estimated cost: <span className="font-mono">${estCost}</span> via Twilio.
            </p>
          </div>

          {result && (
            <div className={`rounded-md border px-3 py-2 text-xs ${result.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
              {result.msg}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => handleFire(true)} disabled={pending}>
              {pending ? "…" : "Dry run"}
            </Button>
            <Button onClick={() => handleFire(false)} disabled={pending || unsentCount === 0}>
              {pending ? "Sending…" : `Send ${unsentCount} SMS`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
