import { fmtPct } from "@/lib/creator/format";

interface ProgressBarProps {
  value: number;
  target: number;
  label?: string;
  format?: (n: number) => string;
}

export function ProgressBar({ value, target, label, format = (n) => n.toFixed(0) }: ProgressBarProps) {
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  const pctText = target > 0 ? fmtPct(value / target, 1) : "—";
  const remaining = Math.max(0, target - value);
  return (
    <div>
      <div className="flex items-end justify-between text-sm">
        {label && <span className="text-[#F5F5F7]">{label}</span>}
        <span className="text-[#9CA3AF]">
          <span className="font-mono text-[#F5F5F7]">{format(value)}</span> of {format(target)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-[#00D393] transition-all" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span className="text-[#00D393]">{pctText}</span>
        <span className="text-[#6B7280]">{format(remaining)} to go</span>
      </div>
    </div>
  );
}
