"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

// A small, reusable "i" affordance for a tab: a button that opens a short plain-English popover
// explaining what the tab does and how to use it. Built to be dropped next to ANY tab label
// (ClientTabs tabs, the Content sub-tab links, etc).
//
// Why a portal: tab bars scroll horizontally (overflow-x-auto), which would clip an absolutely
// positioned panel. Rendering the panel into document.body with fixed coordinates escapes the
// clip and lets us clamp it to the viewport, so it stays fully visible even at 390px.
//
// Accessibility: the trigger is a real button (Enter/Space), aria-expanded reflects state, Escape
// closes and returns focus to the trigger, and an outside pointer press closes it. The open panel
// takes focus so screen readers announce it. Motion is a short fade the browser drops under
// prefers-reduced-motion (motion-reduce:animate-none).

const PANEL_WIDTH = 264;

export function TabInfo({ label, text, className }: { label: string; text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(12, r.left), window.innerWidth - PANEL_WIDTH - 12);
    setPos({ top: r.bottom + 6, left });
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      if (!o) place();
      return !o;
    });
  }, [place]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Listeners live only while open; none of these set state during render/effect body. They react
  // to user events (key, pointer) or viewport changes, which is allowed under the no-sync-set rule.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onReflow() {
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
      cancelAnimationFrame(raf);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-label={`About the ${label} tab`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[#7C8595] transition-colors hover:text-[#F5F5F7] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0083FF]/50 ${className ?? ""}`}
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`About the ${label} tab`}
            tabIndex={-1}
            className="fixed z-[95] rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] p-3 text-left shadow-[0_16px_40px_rgba(0,0,0,0.55)] outline-none animate-[skFadeIn_140ms_ease-out] motion-reduce:animate-none"
            style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH, maxWidth: "calc(100vw - 24px)" }}
          >
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7C8595]">{label}</div>
            <p className="text-[13px] leading-relaxed text-[#C7CCD4]">{text}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
