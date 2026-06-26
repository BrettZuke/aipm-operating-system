"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "settoku-setup-dismissed";

export function SetupBanner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  // Hide on onboarding itself
  if (dismissed || pathname?.startsWith("/onboarding") || pathname?.startsWith("/login") || pathname?.startsWith("/signup")) {
    return null;
  }

  function handleDismiss() {
    setDismissed(true);
    window.localStorage.setItem(STORAGE_KEY, "1");
  }

  return (
    <div className="flex items-center justify-between border-b border-[rgba(0,131,255,0.18)] bg-[rgba(0,131,255,0.06)] px-4 py-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="rounded-md bg-[rgba(0,131,255,0.18)] px-2 py-0.5 font-semibold uppercase tracking-wider text-blue-400">Setup in progress</span>
        <span className="text-[rgba(245,245,247,0.8)]">You can close this and come back later — we'll save your progress.</span>
        <Link href="/onboarding" className="font-medium text-blue-400 hover:underline">Continue setup →</Link>
      </div>
      <button onClick={handleDismiss} className="text-[#6B7280] hover:text-[#9CA3AF]">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
