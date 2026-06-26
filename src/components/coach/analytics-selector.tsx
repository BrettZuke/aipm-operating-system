"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface SelectorFunnel { key: string; name: string }

const RANGES: { value: string; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "ytd", label: "Year to date" },
];

const selStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#F5F5F7",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  outline: "none",
};

// One control bar for the coach's analytics: pick a funnel (scopes traffic + sales-funnel + revenue
// to that offer) and a timeline. Mirrors the creator's date picker but adds the funnel filter the operator
// wanted. Writes ?funnel + ?range and keeps the tab on analytics.
export function AnalyticsSelector({ funnels, funnel, range }: { funnels: SelectorFunnel[]; funnel: string; range: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function push(next: { funnel?: string; range?: string }) {
    const p = new URLSearchParams(Array.from(search.entries()));
    p.set("tab", "analytics");
    if ("funnel" in next) {
      if (next.funnel) p.set("funnel", next.funnel);
      else p.delete("funnel");
    }
    if (next.range) p.set("range", next.range);
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select style={selStyle} value={funnel} onChange={(e) => push({ funnel: e.target.value })} aria-label="Funnel / offer">
        <option value="">All funnels &amp; offers</option>
        {funnels.map((f) => (
          <option key={f.key} value={f.key}>{f.name}</option>
        ))}
      </select>
      <select style={selStyle} value={range} onChange={(e) => push({ range: e.target.value })} aria-label="Timeline">
        {RANGES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
    </div>
  );
}
