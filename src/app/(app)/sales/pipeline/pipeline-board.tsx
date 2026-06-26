"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { updateDealStage } from "./actions";

type Stage = "discovery" | "proposal" | "negotiation" | "closed_won" | "closed_lost";

export type DealCard = {
  id: string;
  name: string;
  stage: Stage;
  amount: number;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
  owner_name: string | null;
  closed_at: string | null;
  created_at: string;
  needs_review: boolean;
};

const STAGES: { key: Stage; label: string; accent: string; ring: string }[] = [
  { key: "discovery",   label: "Discovery",   accent: "text-[#9CA3AF]",    ring: "ring-white/10" },
  { key: "proposal",    label: "Proposal",    accent: "text-blue-400",     ring: "ring-blue-500/20" },
  { key: "negotiation", label: "Negotiation", accent: "text-amber-400",    ring: "ring-amber-500/20" },
  { key: "closed_won",  label: "Won",         accent: "text-emerald-400",  ring: "ring-emerald-500/20" },
  { key: "closed_lost", label: "Lost",        accent: "text-red-400",      ring: "ring-red-500/20" },
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function daysIn(d: { closed_at: string | null; created_at: string }) {
  const ref = d.closed_at ? new Date(d.closed_at).getTime() : Date.now();
  return Math.max(0, Math.round((ref - new Date(d.created_at).getTime()) / 86400000));
}

export function PipelineBoard({ deals }: { deals: DealCard[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  // Local optimistic state — when a drop happens, update immediately so the UI
  // doesn't flicker while the server round-trip completes.
  const [optimistic, setOptimistic] = useState<Map<string, Stage>>(new Map());

  function effectiveStage(d: DealCard): Stage {
    return optimistic.get(d.id) ?? d.stage;
  }

  function onDragStart(e: React.DragEvent<HTMLDivElement>, dealId: string) {
    setDraggingId(dealId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dealId);
  }
  function onDragEnd() {
    setDraggingId(null);
    setDragOverStage(null);
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>, stage: Stage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stage) setDragOverStage(stage);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>, newStage: Stage) {
    e.preventDefault();
    const dealId = e.dataTransfer.getData("text/plain") || draggingId;
    setDragOverStage(null); setDraggingId(null);
    if (!dealId) return;
    const deal = deals.find(d => d.id === dealId);
    if (!deal || effectiveStage(deal) === newStage) return;

    // Optimistic update
    setOptimistic(prev => { const m = new Map(prev); m.set(dealId, newStage); return m; });

    startTransition(async () => {
      const r = await updateDealStage(dealId, newStage);
      if (!r.ok) {
        // Roll back on error
        setOptimistic(prev => { const m = new Map(prev); m.delete(dealId); return m; });
        alert(`Failed to update stage: ${r.error}`);
      } else {
        router.refresh();
      }
    });
  }

  // Group deals by effective stage
  const grouped = new Map<Stage, DealCard[]>(STAGES.map(s => [s.key, []]));
  for (const d of deals) {
    const s = effectiveStage(d);
    grouped.get(s)?.push(d);
  }

  return (
    <div className="grid grid-cols-5 gap-3">
      {STAGES.map(s => {
        const cards = grouped.get(s.key) ?? [];
        const total = cards.reduce((sum, d) => sum + Number(d.amount ?? 0), 0);
        const isOver = dragOverStage === s.key;
        return (
          <div
            key={s.key}
            onDragOver={e => onDragOver(e, s.key)}
            onDrop={e => onDrop(e, s.key)}
            className={`rounded-xl border bg-[#0C0C10]/40 transition-colors ${isOver ? "border-blue-500/60 bg-blue-500/5" : "border-[rgba(255,255,255,0.08)]"}`}
          >
            <div className="border-b border-[rgba(255,255,255,0.08)] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className={`text-xs font-semibold uppercase tracking-wider ${s.accent}`}>{s.label}</div>
                <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[10px] tabular-nums text-[#9CA3AF]">{cards.length}</span>
              </div>
              <div className="mt-1 text-[11px] text-[#6B7280] tabular-nums">{formatCurrency(total)}</div>
            </div>
            <div className="space-y-2 p-2 min-h-[200px]">
              {cards.length === 0 ? (
                <div className="rounded-md border border-dashed border-[rgba(255,255,255,0.06)] py-6 text-center text-[10px] text-[#6B7280]">
                  Drop deals here
                </div>
              ) : (
                cards.map(d => {
                  const isDragging = draggingId === d.id;
                  return (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={e => onDragStart(e, d.id)}
                      onDragEnd={onDragEnd}
                      className={`group rounded-md border bg-[#0C0C10]/80 p-3 cursor-move ring-1 ${s.ring} transition-all ${isDragging ? "opacity-30" : "hover:border-[rgba(255,255,255,0.16)]"}`}
                    >
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="size-3 text-[#4B5563] mt-0.5 opacity-0 group-hover:opacity-100" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[#F5F5F7] truncate">{d.name}</div>
                          <div className="text-[11px] text-[#9CA3AF] truncate">
                            {d.client_id ? (
                              <Link href={`/clients/${d.client_id}`} className="hover:text-blue-400">
                                {d.client_name ?? "—"}
                              </Link>
                            ) : (
                              d.client_name ?? "—"
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="font-mono text-sm font-semibold text-[#F5F5F7]">{formatCurrency(Number(d.amount ?? 0))}</div>
                        <div className="text-[10px] text-[#6B7280]">{daysIn(d)}d</div>
                      </div>
                      {d.owner_name && <div className="mt-1.5 text-[10px] text-[#9CA3AF]">@{d.owner_name.split(" ")[0]}</div>}
                      {d.needs_review && <div className="mt-1.5 inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400">⚠ needs review</div>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
      {pending && <div className="fixed bottom-4 right-4 rounded-md bg-[#0C0C10] border border-[rgba(255,255,255,0.10)] px-3 py-2 text-xs text-[#9CA3AF] shadow-xl">Updating…</div>}
    </div>
  );
}
