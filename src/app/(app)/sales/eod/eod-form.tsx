"use client";

import { useState, useTransition } from "react";
import { Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { submitEodReport } from "./actions";

type Defaults = {
  wins?: string;
  blockers?: string;
  tomorrow?: string;
  metrics?: string;
};

export function EodForm({
  defaults,
  alreadySubmitted,
}: {
  defaults: Defaults;
  alreadySubmitted: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const result = await submitEodReport(null, formData);
      if (!result.ok) setError(result.error);
      else setSavedAt(Date.now());
    });
  }

  return (
    <form action={onSubmit} className="space-y-4 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#F5F5F7]">
          {alreadySubmitted ? "Edit today's report" : "Submit today's report"}
        </h2>
        {alreadySubmitted && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <Check className="size-3.5" /> Already submitted
          </span>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="wins">Wins</Label>
        <textarea
          id="wins"
          name="wins"
          rows={3}
          defaultValue={defaults.wins ?? ""}
          placeholder="Closed deals, milestones hit, anything worth celebrating."
          className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="blockers">Blockers</Label>
        <textarea
          id="blockers"
          name="blockers"
          rows={3}
          defaultValue={defaults.blockers ?? ""}
          placeholder="Anything stuck or needing help."
          className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tomorrow">Tomorrow&apos;s priorities</Label>
        <textarea
          id="tomorrow"
          name="tomorrow"
          rows={3}
          defaultValue={defaults.tomorrow ?? ""}
          placeholder="The 1-3 things that matter most tomorrow."
          className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="metrics">Numbers (optional)</Label>
        <textarea
          id="metrics"
          name="metrics"
          rows={2}
          defaultValue={defaults.metrics ?? ""}
          placeholder="e.g. Calls 23 · Demos 4 · Closes 2 · Revenue $4,200"
          className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Send />
          {pending ? "Submitting…" : alreadySubmitted ? "Update report" : "Submit report"}
        </Button>
        {savedAt && !pending && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <Check className="size-3.5" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
