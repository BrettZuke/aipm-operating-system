"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Mail, Users, Mic, ArrowRight, History } from "lucide-react";

const USAGE = [
  { icon: Sparkles, label: "AI calls",            used: 0, delta: -68, max: 5000 },
  { icon: Mail,     label: "Email generation",    used: 0, delta: -77, max: 1000 },
  { icon: Users,    label: "Lead enrichment",     used: 0, delta: -53, max: 500  },
  { icon: Mic,      label: "Voice transcription", used: 0, delta: 0,   max: 200  },
];

export function CreditsWidget() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const totalUsed = USAGE.reduce((s, u) => s + u.used, 0);
  const totalMax = USAGE.reduce((s, u) => s + u.max, 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-xs hover:border-[rgba(255,255,255,0.12)]"
      >
        <span className="text-[10px]" style={{color:"#0083FF"}}>◈</span>
        <span className="font-medium text-[#F5F5F7]">{totalUsed.toLocaleString()}</span>
        <span className="text-[#6B7280]">/ {totalMax >= 1000 ? `${(totalMax / 1000).toFixed(1)}k` : totalMax}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] shadow-2xl z-50"
             style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,131,255,0.05)" }}>
          {/* Header */}
          <div className="border-b border-[rgba(255,255,255,0.08)] px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-[#F5F5F7] tabular-nums">{totalUsed} <span className="text-sm font-medium text-[#6B7280]">c</span></span>
                </div>
                <div className="mt-0.5 text-xs text-[#9CA3AF]">credits remaining this month</div>
              </div>
              <span className="rounded-md bg-[rgba(0,131,255,0.10)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">Starter plan</span>
            </div>
          </div>

          {/* Mini chart */}
          <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.08)]">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280] mb-2">This month</div>
            <div className="flex items-end gap-0.5 h-10">
              {Array.from({ length: 30 }).map((_, i) => (
                // Deterministic placeholder heights — Math.random() here caused a hydration mismatch.
                <div key={i} className="flex-1 rounded-sm bg-[rgba(0,131,255,0.4)]" style={{ height: `${6 + ((i * 37) % 24)}%` }} />
              ))}
            </div>
          </div>

          {/* Breakdown */}
          <div className="px-5 py-3 space-y-2.5">
            {USAGE.map(u => (
              <div key={u.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <u.icon className="size-3.5 text-[#9CA3AF]" />
                  <span className="text-[rgba(245,245,247,0.8)]">{u.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[#9CA3AF]">{u.used.toLocaleString()}</span>
                  {u.delta !== 0 && (
                    <span className={`font-mono text-[10px] ${u.delta < 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {u.delta > 0 ? "+" : ""}{u.delta}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex gap-2 border-t border-[rgba(255,255,255,0.08)] p-3 bg-[#09090C]">
            <button className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600">
              Top up credits <ArrowRight className="size-3" />
            </button>
            <button className="flex items-center justify-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.10)] px-3 py-2 text-xs text-[rgba(245,245,247,0.8)] hover:bg-[rgba(255,255,255,0.06)]">
              <History className="size-3" /> View history
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
