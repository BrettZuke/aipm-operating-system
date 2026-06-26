"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base: proper transition (not transition-all), scale on press, min hit area
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg",
    "text-sm font-medium select-none",
    "transition-[background-color,box-shadow,opacity,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[#09090C]",
    "disabled:pointer-events-none disabled:opacity-40",
    "active:scale-[0.96]",                      // Principle 12: scale on press
    "[&_svg]:size-4 [&_svg]:shrink-0",
    "min-h-[36px]",                              // Principle 16: min hit area
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          // Primary — nekter blue with glow
          "bg-[#0083FF] text-white hover:bg-[#0066CC] shadow-[0_0_0_1px_rgba(0,131,255,0.4),0_1px_3px_rgba(0,0,0,0.3),0_0_20px_rgba(0,131,255,0.2)] hover:shadow-[0_0_0_1px_rgba(0,131,255,0.6),0_2px_8px_rgba(0,131,255,0.3),0_0_32px_rgba(0,131,255,0.25)]",
        destructive:
          "bg-red-500 text-white hover:bg-red-500/90 shadow-[0_1px_3px_rgba(0,0,0,0.3)]",
        outline:
          "border border-[rgba(255,255,255,0.12)] bg-transparent text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.18)]",
        secondary:
          "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.08)] shadow-[0_1px_2px_rgba(0,0,0,0.2)]",
        ghost:
          "text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#F5F5F7]",
        link:
          "text-blue-400 underline-offset-4 hover:underline hover:text-blue-300 min-h-0",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-8 rounded-md px-3 text-xs",
        lg:      "h-10 rounded-lg px-6",
        icon:    "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
