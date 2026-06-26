import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/30 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)]/60">
        <Icon className="size-5 text-[#9CA3AF]" />
      </div>
      <h3 className="mt-4 text-base font-medium text-[#F5F5F7]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[#9CA3AF]">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
