import { computeDelta } from "@/lib/creator/range";
import { fmtPct } from "@/lib/creator/format";

type Accent = "good" | "bad" | "warn" | "default";

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: Accent;
  current?: number;
  prior?: number;
  /** When true, "down" is the good direction (used for churn, refunds, etc.). */
  inverse?: boolean;
  source?: string;
  sourceTone?: "ok" | "pending";
  children?: React.ReactNode;
}

export function KpiCard({
  label,
  value,
  hint,
  accent = "default",
  current,
  prior,
  inverse,
  source,
  sourceTone = "ok",
  children,
}: KpiCardProps) {
  const colorClass =
    accent === "good"
      ? "text-[#00D393]"
      : accent === "bad"
      ? "text-[#FF6466]"
      : accent === "warn"
      ? "text-[#F8AF00]"
      : "text-[#F5F5F7]";

  let delta: { value: number | null; direction: "up" | "down" | "flat" } | null = null;
  if (typeof current === "number" && typeof prior === "number") {
    delta = computeDelta(current, prior);
  }
  const goodDirection = inverse ? "down" : "up";
  const deltaTone =
    !delta || delta.direction === "flat"
      ? "text-[#6B7280]"
      : delta.direction === goodDirection
      ? "text-[#00D393]"
      : "text-[#FF6466]";
  const arrow = delta?.direction === "up" ? "↑" : delta?.direction === "down" ? "↓" : "→";

  const sourceClasses =
    sourceTone === "pending"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#9CA3AF]";

  return (
    <div className="flex h-full flex-col rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{label}</div>
        {source && (
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${sourceClasses}`}>
            {source}
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-semibold tabular-nums ${colorClass}`}>{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta && (
          <span className={`font-mono ${deltaTone}`}>
            {arrow} {delta.value === null ? "—" : fmtPct(Math.abs(delta.value), 1)}
          </span>
        )}
        {hint && <span className="text-[#6B7280]">{hint}</span>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

interface PendingKpiProps {
  label: string;
  pendingOn: string;
  hint?: string;
}

export function PendingKpi({ label, pendingOn, hint }: PendingKpiProps) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-dashed border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{label}</div>
        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">
          Pending {pendingOn}
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums text-[#4B5563]">—</div>
      <div className="mt-1 text-xs text-[#6B7280]">{hint ?? "Wires up once data source is connected."}</div>
    </div>
  );
}
