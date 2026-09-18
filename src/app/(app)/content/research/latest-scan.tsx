"use client";

// The most recent scan, above the run history: what it read, what it found and what it cost. The
// cost is the number Apify charged, not an estimate, so a student can see exactly what a scan
// spends before they run more of them.

import { usdText } from "@/lib/research/apify";
import type { JobView } from "@/lib/research/jobs";
import { dateText, jobIsRunning, sinceText } from "@/lib/research/view";
import { Card } from "./ui";

const STATUS_TEXT: Record<JobView["status"], string> = {
  starting: "Starting",
  running: "Running",
  ingesting: "Saving what it found",
  done: "Finished",
  failed: "Failed",
};

export function LatestScan({ job, nowMs }: { job: JobView | null; nowMs: number }) {
  if (!job) {
    return (
      <Card className="p-4">
        <p className="text-[13px] text-[#A8B0BD]">No scan has run in this workspace yet. Use Scan now on Standout videos.</p>
      </Card>
    );
  }
  const running = jobIsRunning(job, nowMs);
  const tone = running ? "text-[#0083FF]" : job.status === "failed" ? "text-[#FF6466]" : "text-[#7BE0A5]";
  const when = job.finished_at ?? job.created_at;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-[#F5F5F7]">
            {job.purpose === "onboard" ? "A new creator's first read" : "The last scan"} <span className={tone}>{STATUS_TEXT[job.status]}</span>
          </p>
          <p className="font-mono text-[11px] text-[#7C8595]">
            {dateText(when)} {sinceText(when, nowMs) ? `(${sinceText(when, nowMs)})` : ""} {job.mode === "full" ? "last 120 days" : "last 30 days"}
          </p>
        </div>
        <p className="font-mono text-[11px] text-[#7C8595]">Cost {usdText(job.cost_usd)}</p>
      </div>
      {job.result && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Accounts read" value={job.result.creators_read} />
          <Stat label="Posts saved" value={job.result.posts} />
          <Stat label="Standouts found" value={job.result.outliers} />
          <Stat label="Not read" value={job.result.creators_skipped.length} />
        </dl>
      )}
      {job.result && job.result.creators_skipped.length > 0 && (
        <p className="text-xs text-[#7C8595]">Nothing came back for: {job.result.creators_skipped.join(", ")}.</p>
      )}
      {job.error && <p className="text-[13px] text-[#FF6466]">{job.error}</p>}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#5C6472]">{label}</dt>
      <dd className="text-lg font-semibold text-[#F5F5F7] tabular-nums">{value}</dd>
    </div>
  );
}
