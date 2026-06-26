import { fmtInt, fmtPct } from "@/lib/creator/format";

interface FunnelStep {
  label: string;
  value: number | null;
}

export function Funnel({ steps }: { steps: ReadonlyArray<FunnelStep> }) {
  const ref = steps.find((s) => typeof s.value === "number" && (s.value ?? 0) > 0)?.value ?? 0;
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const isPending = s.value === null;
        const v = typeof s.value === "number" ? s.value : 0;
        const pctOfRef = ref > 0 ? v / ref : 0;
        const prev = i > 0 ? steps[i - 1].value : null;
        const dropoff =
          typeof prev === "number" && prev > 0 && typeof s.value === "number" ? Math.max(0, 1 - s.value / prev) : null;
        return (
          <div key={s.label} className="relative">
            <div
              className={`absolute inset-y-0 left-0 rounded ${isPending ? "bg-white/5" : "bg-[#0083FF]/15"}`}
              style={{ width: `${Math.min(100, Math.max(8, pctOfRef * 100))}%` }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-[#6B7280]">{i + 1}.</span>
                <span className="text-[#F5F5F7]">{s.label}</span>
                {isPending && (
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-400">
                    Pending
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                {dropoff !== null && <span className="font-mono text-[#6B7280]">−{fmtPct(dropoff, 1)}</span>}
                <span className="font-mono tabular-nums text-[#F5F5F7]">{isPending ? "—" : fmtInt(v)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
