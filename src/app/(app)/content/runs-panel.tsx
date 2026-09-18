"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

// Every run the machine has done, not just the most recent one. The table has always recorded
// this; the dashboard read .limit(1) and threw the rest away, so a run that quietly skipped four
// creators looked identical to a clean one. Skips are shown by name because a silently dropped
// creator has bitten this pipeline twice.

export type Run = {
  id: string;
  stage: string;
  ran_at: string;
  creators_read: number;
  creators_skipped: number;
  outliers_found: number;
  outliers_analysed: number;
  scripts_written: number;
  detail: { skipped?: string[]; min_multiple?: number; signal?: string } | null;
};

const STAGE_LABEL: Record<string, string> = {
  scrape: "Collected posts",
  parse: "Found winners",
  script: "Wrote scripts",
};

function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} hr ago`;
  const days = Math.round(mins / 1440);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default function RunsPanel({ runs, nextRun }: { runs: Run[]; nextRun: string | null }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-8 text-center">
        <Clock className="mx-auto size-5 text-[#5C6472]" />
        <p className="mt-3 text-sm text-[#F5F5F7]">The machine has not run yet</p>
        <p className="mt-1 text-xs text-[#7C8595]">
          Once it runs, every pass is listed here with what it read, what it found, and anything it
          could not reach.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[#F5F5F7]">Every run, newest first</p>
          <p className="text-xs text-[#7C8595]">
            What the machine actually did each time, including anything it could not read.
          </p>
        </div>
        <span className="rounded-full border border-[rgba(255,255,255,0.10)] px-2.5 py-1 text-xs text-[#A8B0BD]">
          {nextRun ? `Next run ${nextRun}` : "Runs manually, no schedule set"}
        </span>
      </div>

      <div className="space-y-2">
        {runs.map((r) => {
          const skippedNames = r.detail?.skipped ?? [];
          const hasProblem = r.creators_skipped > 0;
          return (
            <div
              key={r.id}
              className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {hasProblem ? (
                    <AlertTriangle className="size-3.5 text-[#FFB4B4]" />
                  ) : (
                    <CheckCircle2 className="size-3.5 text-[#7BE0A5]" />
                  )}
                  <span className="text-sm text-[#F5F5F7]">
                    {STAGE_LABEL[r.stage] ?? r.stage}
                  </span>
                </div>
                <span className="text-xs text-[#5C6472]">
                  {when(r.ran_at)} · {new Date(r.ran_at).toLocaleString()}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#A8B0BD]">
                {r.creators_read > 0 && <span>{r.creators_read} creators read</span>}
                {r.outliers_found > 0 && <span>{r.outliers_found} winners found</span>}
                {r.outliers_analysed > 0 && <span>{r.outliers_analysed} studied</span>}
                {r.scripts_written > 0 && <span>{r.scripts_written} scripts written</span>}
                {r.detail?.min_multiple && (
                  <span className="text-[#5C6472]">
                    bar: {r.detail.min_multiple}x their normal
                  </span>
                )}
              </div>

              {hasProblem && (
                <div className="mt-2 rounded-lg border border-[rgba(255,90,90,0.28)] bg-[rgba(255,90,90,0.07)] px-3 py-2 text-xs text-[#FFB4B4]">
                  Could not read {r.creators_skipped}{" "}
                  {r.creators_skipped === 1 ? "creator" : "creators"}
                  {skippedNames.length > 0 && `: ${skippedNames.join(", ")}`}
                  <span className="mt-0.5 block text-[#C99]">
                    Usually a private account, a changed handle, or a channel with no posts to read.
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
