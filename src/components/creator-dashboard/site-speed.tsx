"use client";

import { useEffect, useState } from "react";
import type { SiteSpeed } from "@/lib/creator/pagespeed";

const RATING_COLOR: Record<string, string> = {
  good: "#00D393",
  warn: "#F8AF00",
  bad: "#FF6466",
};

function scoreColor(score: number): string {
  if (score >= 90) return "#00D393";
  if (score >= 50) return "#F8AF00";
  return "#FF6466";
}

interface State {
  loading: boolean;
  data: SiteSpeed | null;
  reason?: string | null;
}

/**
 * Site speed panel — real-user Core Web Vitals + Lighthouse score for the workspace's site.
 * Fetched from /api/site-speed (cached 24h server-side) so a slow PageSpeed call never blocks
 * the dashboard render.
 */
export function SiteSpeedPanel({ speedInsightsUrl }: { speedInsightsUrl?: string }) {
  const [state, setState] = useState<State>({ loading: true, data: null });

  useEffect(() => {
    let alive = true;
    fetch("/api/site-speed")
      .then((r) => r.json())
      .then((j) => alive && setState({ loading: false, data: j.siteSpeed ?? null, reason: j.reason }))
      .catch(() => alive && setState({ loading: false, data: null, reason: "failed" }));
    return () => {
      alive = false;
    };
  }, []);

  const { loading, data, reason } = state;

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Site speed · real users</div>
        {speedInsightsUrl && (
          <a href={speedInsightsUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-medium uppercase tracking-wider text-[#0083FF] hover:text-[#00A4FF]">
            Vercel Speed Insights →
          </a>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-2 text-sm text-[#6B7280]">
          <span className="inline-block size-3 animate-pulse rounded-full bg-[#0083FF]" /> Measuring…
        </div>
      ) : !data ? (
        <div className="text-sm text-[#6B7280]">
          Couldn&apos;t measure right now{reason ? ` (${reason})` : ""}. {speedInsightsUrl ? "See Vercel Speed Insights for live data." : ""}
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Lighthouse score */}
          {data.perfScore !== null && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-[rgba(255,255,255,0.06)] px-5 py-3">
              <div className="text-3xl font-bold tabular-nums" style={{ color: scoreColor(data.perfScore) }}>{data.perfScore}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[#6B7280]">Performance</div>
            </div>
          )}
          {/* Core Web Vitals */}
          {data.metrics.length > 0 ? (
            <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {data.metrics.map((m) => (
                <div key={m.key}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold tabular-nums" style={{ color: RATING_COLOR[m.rating] }}>{m.display}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">{m.key}</span>
                  </div>
                  <div className="text-[11px] text-[#6B7280]">{m.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 text-sm text-[#6B7280]">
              Lighthouse lab score shown. Real-user Core Web Vitals appear once the site has enough traffic in Google&apos;s field dataset.
            </div>
          )}
        </div>
      )}
      <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
        {data?.hasField
          ? "Real-user data (Google CrUX, 28-day rolling). Slow pages cost sales — green is the target."
          : "Lighthouse lab test. Vercel Speed Insights (top right) tracks your real visitors' speed over time."}
      </div>
    </div>
  );
}
