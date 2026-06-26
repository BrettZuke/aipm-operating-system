"use client";

import { useState, useCallback, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Bot, MessageSquare, GitBranch, Users, Hash,
  Phone, List, Layers, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icon names are passed as strings from the server; components live here on the client.
const ICON_MAP: Record<string, LucideIcon> = {
  Bot, MessageSquare, GitBranch, Users, Hash,
  Phone, List, Layers,
};

export type TabDef = {
  key: string;
  label: string;
  iconName?: string; // string so it's serialisable across server→client boundary
};

type Props = {
  tabs: TabDef[];
  initialTab: string;
  panels: Record<string, ReactNode>; // pre-rendered server content, ReactNode is serialisable
  className?: string;
};

export function ClientTabs({ tabs, initialTab, panels, className }: Props) {
  const [active, setActive] = useState(initialTab);
  const router = useRouter();
  const pathname = usePathname();

  const switchTab = useCallback((key: string) => {
    setActive(key);
    // Preserve other query params (range / page / compare) so switching tabs doesn't reset them.
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60", className)}>
      <div className="flex gap-0 border-b border-[rgba(255,255,255,0.08)] overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.iconName ? ICON_MAP[t.iconName] : null;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors duration-100 cursor-pointer",
                isActive
                  ? "border-[#0083FF] text-[#F5F5F7] bg-[#0C0C10]/80"
                  : "border-transparent text-[#9CA3AF] hover:text-[#F5F5F7] hover:bg-white/[0.03]",
              )}
            >
              {Icon && <Icon className="size-3.5 shrink-0" />}
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="p-5">
        <div key={active} className="tab-enter">
          {panels[active]}
        </div>
      </div>
    </div>
  );
}
