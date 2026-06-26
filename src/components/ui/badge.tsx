import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Principle 1: Concentric radius — badge is typically inside a card (rounded-xl/12px),
  // so badge uses rounded-full or rounded-md (6px) which is correct at 4px padding.
  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide select-none",
  {
    variants: {
      variant: {
        default:  "bg-[rgba(255,255,255,0.06)]   text-[rgba(245,245,247,0.8)]   ring-1 ring-inset ring-[rgba(255,255,255,0.12)]",
        primary:  "bg-blue-500/12  text-blue-300    ring-1 ring-inset ring-blue-500/25",
        success:  "bg-emerald-500/12 text-emerald-300 ring-1 ring-inset ring-emerald-500/25",
        warning:  "bg-amber-500/12  text-amber-300   ring-1 ring-inset ring-amber-500/25",
        danger:   "bg-red-500/12    text-red-300     ring-1 ring-inset ring-red-500/25",
        muted:    "bg-[#0C0C10]     text-[#6B7280]     ring-1 ring-inset ring-[rgba(255,255,255,0.08)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
