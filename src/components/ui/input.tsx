import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base
          "flex h-9 w-full rounded-lg px-3 py-2 text-sm",
          // Settoku design: dark input bg with subtle border
          "bg-[#09090C] border border-[rgba(255,255,255,0.10)] text-[#f4f4f5]",
          // Placeholder: muted
          "placeholder:text-[#52525b]",
          // Transition only border/shadow — not layout props
          "transition-[border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
          // Focus: blue border + soft ring (no offset needed on dark)
          "focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/20",
          // Hover: slightly brighter border
          "hover:border-[rgba(255,255,255,0.18)]",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-40",
          // File input reset
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
