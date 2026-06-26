"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bug, Wrench, Sparkles, ShieldAlert, Gauge, Database, ScrollText, ChevronDown, ChevronRight, Play, Check, X, Ban, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { updateImprovementStatus, updateImprovementPriority, deleteImprovement } from "./actions";

type Item = {
  id: string;
  kind: string;
  status: string;
  priority: number;
  title: string;
  description: string | null;
  proposed_fix: string | null;
  evidence: string | null;
  source: string | null;
  attempt_count: number;
  last_attempt_log: string | null;
  created_at: string;
  resolved_at: string | null;
};

const KIND_ICON: Record<string, LucideIcon> = {
  bug: Bug, tech_debt: Wrench, feature: Sparkles, audit: ScrollText,
  security: ShieldAlert, perf: Gauge, data_quality: Database,
};
const KIND_COLOR: Record<string, string> = {
  bug: "text-red-400", tech_debt: "text-amber-400", feature: "text-blue-400",
  audit: "text-[#9CA3AF]", security: "text-red-500", perf: "text-emerald-400",
  data_quality: "text-purple-400",
};

function PriorityBadge({ p, onChange, pending }: { p: number; onChange: (n: number) => void; pending: boolean }) {
  const colors: Record<number, string> = {
    1: "bg-red-500/15 text-red-400 border-red-500/30",
    2: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    3: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    4: "bg-[rgba(255,255,255,0.06)] text-[#9CA3AF] border-[rgba(255,255,255,0.10)]",
    5: "bg-[rgba(255,255,255,0.04)] text-[#6B7280] border-[rgba(255,255,255,0.08)]",
  };
  return (
    <select
      value={p}
      onChange={e => onChange(Number(e.target.value))}
      disabled={pending}
      className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${colors[p]}`}
    >
      <option value={1}>P1</option>
      <option value={2}>P2</option>
      <option value={3}>P3</option>
      <option value={4}>P4</option>
      <option value={5}>P5</option>
    </select>
  );
}

export function ImprovementRow({ item }: { item: Item }) {
  const Icon = KIND_ICON[item.kind] ?? Bug;
  const color = KIND_COLOR[item.kind] ?? "text-[#9CA3AF]";
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeStatus(newStatus: "in_progress" | "done" | "blocked" | "open" | "cancelled") {
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("id", item.id);
      fd.set("status", newStatus);
      const r = await updateImprovementStatus(null, fd);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }
  function changePriority(p: number) {
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("id", item.id);
      fd.set("priority", String(p));
      const r = await updateImprovementPriority(null, fd);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }
  function remove() {
    if (!confirm(`Delete "${item.title}"?`)) return;
    startTransition(async () => {
      const r = await deleteImprovement(item.id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
      <div className="flex items-start gap-3 p-3">
        <button onClick={() => setExpanded(e => !e)} className="mt-0.5 text-[#6B7280] hover:text-[#F5F5F7]">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <Icon className={`size-4 mt-0.5 shrink-0 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[#F5F5F7]">{item.title}</span>
            <PriorityBadge p={item.priority} onChange={changePriority} pending={pending} />
            {item.source && item.source !== "manual" && (
              <span className="rounded-md bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[10px] text-[#6B7280]">{item.source}</span>
            )}
            <span className="text-[10px] text-[#6B7280] capitalize">{item.kind.replace("_", " ")}</span>
            {item.attempt_count > 0 && (
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">{item.attempt_count} attempt{item.attempt_count === 1 ? "" : "s"}</span>
            )}
          </div>
          {!expanded && item.description && (
            <div className="mt-1 text-xs text-[#9CA3AF] truncate">{item.description}</div>
          )}
          <div className="mt-1 text-[10px] text-[#6B7280]">
            Added {new Date(item.created_at).toLocaleDateString()}
            {item.resolved_at && ` · resolved ${new Date(item.resolved_at).toLocaleDateString()}`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {item.status === "open" && (
            <button onClick={() => changeStatus("in_progress")} disabled={pending} title="Start work" className="rounded p-1.5 text-blue-400 hover:bg-blue-500/10"><Play className="size-3.5" /></button>
          )}
          {(item.status === "open" || item.status === "in_progress") && (
            <>
              <button onClick={() => changeStatus("done")} disabled={pending} title="Mark done" className="rounded p-1.5 text-emerald-400 hover:bg-emerald-500/10"><Check className="size-3.5" /></button>
              <button onClick={() => changeStatus("blocked")} disabled={pending} title="Mark blocked" className="rounded p-1.5 text-amber-400 hover:bg-amber-500/10"><Ban className="size-3.5" /></button>
              <button onClick={() => changeStatus("cancelled")} disabled={pending} title="Cancel" className="rounded p-1.5 text-[#6B7280] hover:bg-[rgba(255,255,255,0.06)]"><X className="size-3.5" /></button>
            </>
          )}
          {(item.status === "done" || item.status === "blocked" || item.status === "cancelled") && (
            <button onClick={() => changeStatus("open")} disabled={pending} title="Reopen" className="rounded p-1.5 text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.06)]"><Play className="size-3.5" /></button>
          )}
          <button onClick={remove} disabled={pending} title="Delete" className="rounded p-1.5 text-[#6B7280] hover:bg-red-500/10 hover:text-red-400"><Trash2 className="size-3.5" /></button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-[rgba(255,255,255,0.06)] p-4 pl-12 space-y-4">
          {item.description && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1">Description</div>
              <Markdown text={item.description} />
            </div>
          )}
          {item.proposed_fix && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1">Proposed fix</div>
              <Markdown text={item.proposed_fix} />
            </div>
          )}
          {item.evidence && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1">Evidence</div>
              <pre className="text-[11px] font-mono text-[#9CA3AF] whitespace-pre-wrap bg-[#09090C] rounded-md p-3 border border-[rgba(255,255,255,0.06)]">{item.evidence}</pre>
            </div>
          )}
          {item.last_attempt_log && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1">Last attempt log</div>
              <pre className="text-[11px] font-mono text-[#9CA3AF] whitespace-pre-wrap bg-[#09090C] rounded-md p-3 border border-[rgba(255,255,255,0.06)] max-h-40 overflow-y-auto">{item.last_attempt_log}</pre>
            </div>
          )}
        </div>
      )}
      {error && <div className="border-t border-[rgba(255,255,255,0.06)] bg-red-500/5 px-4 py-2 text-xs text-red-400">{error}</div>}
    </div>
  );
}
