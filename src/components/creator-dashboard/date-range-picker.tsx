"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { PRESETS, labelForRange, type DateRange, type RangePreset } from "@/lib/creator/range";

export function DateRangePicker({ range }: { range: DateRange }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function apply(preset: RangePreset, from?: string, to?: string) {
    const params = new URLSearchParams(sp.toString());
    if (preset === "custom" && from && to) {
      params.set("range", "custom");
      params.set("from", from);
      params.set("to", to);
    } else {
      params.set("range", preset);
      params.delete("from");
      params.delete("to");
    }
    startTransition(() => router.push(`?${params.toString()}`));
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-sm text-[#F5F5F7] hover:border-[rgba(255,255,255,0.15)]"
      >
        <span className="text-[#9CA3AF]">📅</span>
        <span>{labelForRange(range)}</span>
        <span className="text-[#6B7280]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10] p-2 shadow-xl">
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.filter((p) => p.value !== "custom").map((p) => (
              <button
                key={p.value}
                onClick={() => apply(p.value)}
                className={`rounded px-2 py-1.5 text-left text-sm hover:bg-white/5 ${
                  range.preset === p.value ? "bg-white/5 text-[#0083FF]" : "text-[#F5F5F7]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="my-2 h-px bg-white/5" />
          <div className="px-2 py-1">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-[#6B7280]">Custom</div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded border border-[rgba(255,255,255,0.08)] bg-[#09090C] px-2 py-1 text-xs text-[#F5F5F7]"
              />
              <span className="text-[#6B7280]">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded border border-[rgba(255,255,255,0.08)] bg-[#09090C] px-2 py-1 text-xs text-[#F5F5F7]"
              />
            </div>
            <button
              onClick={() => apply("custom", customFrom, customTo)}
              className="mt-2 w-full rounded bg-[#0083FF]/20 px-2 py-1.5 text-sm text-[#0083FF] hover:bg-[#0083FF]/30"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
