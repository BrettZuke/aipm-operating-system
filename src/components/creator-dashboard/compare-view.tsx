import { BarList } from "@/components/creator-dashboard/charts";
import type { Ga4PageReport } from "@/lib/creator/ga4";
import type { StripeSnapshot } from "@/lib/creator/stripe";
import { fmtInt, fmtMoney, fmtPct, fmtDuration } from "@/lib/creator/format";

// One consistent colour per page, reused in the legend, every column header, every bar.
const PAGE_COLORS = ["#0083FF", "#00D393", "#F8AF00", "#B57EFF"];

export interface ComparePageReport {
  page: { label: string; path: string };
  report: Ga4PageReport | null;
}

interface CompareViewProps {
  pages: ComparePageReport[];
  rangeLabel: string;
  stripe: StripeSnapshot | null;
  stripeError: string | null;
}

type Colored = ComparePageReport & { color: string };

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}

interface RowDef {
  label: string;
  hint?: string;
  sel: (r: Ga4PageReport) => number | null;
  fmt: (n: number) => string;
  lowerBetter?: boolean;
}

const GROUPS: { title: string; rows: RowDef[] }[] = [
  {
    title: "Traffic",
    rows: [
      { label: "Unique visitors", hint: "people who landed", sel: (r) => r.visitors, fmt: fmtInt },
      { label: "New visitors", hint: "first time on the page", sel: (r) => r.newUsers, fmt: fmtInt },
      { label: "Page views", hint: "incl. repeat loads", sel: (r) => r.views, fmt: fmtInt },
      { label: "Sessions", hint: "visits", sel: (r) => r.sessions, fmt: fmtInt },
      { label: "Views per visitor", hint: "how much they look around", sel: (r) => (r.visitors > 0 ? r.views / r.visitors : 0), fmt: (n) => n.toFixed(1) },
    ],
  },
  {
    title: "Engagement quality",
    rows: [
      { label: "Avg. time on page", hint: "engaged time / visitor", sel: (r) => r.avgEngagedSec, fmt: fmtDuration },
      { label: "Engagement rate", hint: "engaged sessions", sel: (r) => r.engagementRate, fmt: (n) => fmtPct(n, 0) },
      { label: "Bounce rate", hint: "left fast · lower is better", sel: (r) => r.bounceRate, fmt: (n) => fmtPct(n, 0), lowerBetter: true },
    ],
  },
  {
    title: "Conversion on the page",
    rows: [
      { label: "Opt-ins", hint: "email captured on the page", sel: (r) => r.optIns, fmt: fmtInt },
      { label: "Opt-in rate", hint: "opt-ins ÷ visitors", sel: (r) => (r.visitors > 0 ? r.optIns / r.visitors : 0), fmt: (n) => fmtPct(n, 1) },
    ],
  },
];

function bestIndex(vals: (number | null)[], lowerBetter?: boolean): number {
  let bi = -1;
  vals.forEach((v, i) => {
    if (v === null) return;
    if (bi === -1) { bi = i; return; }
    const cur = vals[bi] as number;
    if (lowerBetter ? v < cur : v > cur) bi = i;
  });
  // No clear winner if every value ties.
  const nonNull = vals.filter((v): v is number => v !== null);
  if (nonNull.length > 1 && nonNull.every((v) => v === nonNull[0])) return -1;
  return bi;
}

function DeltaPill({ a, b, lowerBetter }: { a: number | null; b: number | null; lowerBetter?: boolean }) {
  if (a === null || b === null || a === 0) return <span className="text-[#4B5563]">—</span>;
  const d = (b - a) / Math.abs(a);
  if (Math.abs(d) < 0.005) return <span className="font-mono text-xs text-[#6B7280]">→ 0%</span>;
  const better = lowerBetter ? b < a : b > a;
  const arrow = d > 0 ? "↑" : "↓";
  const tone = better ? "text-[#00D393]" : "text-[#FF6466]";
  return <span className={`font-mono text-xs font-semibold ${tone}`}>{arrow} {fmtPct(Math.abs(d), 0)}</span>;
}

function CompareTable({ live }: { live: Colored[] }) {
  const showDelta = live.length === 2;
  const cols = `minmax(0,1.6fr) ${live.map(() => "minmax(0,1fr)").join(" ")}${showDelta ? " minmax(0,0.9fr)" : ""}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)]">
      {/* header */}
      <div className="grid items-center gap-x-4 border-b border-white/[0.07] px-6 py-3.5" style={{ gridTemplateColumns: cols }}>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Metric</div>
        {live.map((p) => (
          <div key={p.page.path} className="flex items-center justify-end gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="truncate text-xs font-semibold" style={{ color: p.color }} title={p.page.label}>{p.page.label}</span>
          </div>
        ))}
        {showDelta && <div className="text-right text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Change</div>}
      </div>

      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="bg-white/[0.015] px-6 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{g.title}</div>
          {g.rows.map((row) => {
            const vals = live.map((p) => (p.report ? row.sel(p.report) : null));
            const bi = bestIndex(vals, row.lowerBetter);
            return (
              <div
                key={row.label}
                className="grid items-center gap-x-4 border-b border-white/[0.04] px-6 py-3.5 last:border-b-0"
                style={{ gridTemplateColumns: cols }}
              >
                <div>
                  <div className="text-sm font-medium text-[#F5F5F7]">{row.label}</div>
                  {row.hint && <div className="text-[11px] text-[#6B7280]">{row.hint}</div>}
                </div>
                {live.map((p, i) => {
                  const v = vals[i];
                  const isBest = i === bi;
                  return (
                    <div
                      key={p.page.path}
                      className="text-right font-mono text-sm tabular-nums"
                      style={{ color: v === null ? "#4B5563" : isBest ? p.color : "#F5F5F7", fontWeight: isBest ? 600 : 400 }}
                    >
                      {v === null ? "—" : row.fmt(v)}
                    </div>
                  );
                })}
                {showDelta && (
                  <div className="text-right">
                    <DeltaPill a={vals[0]} b={vals[1]} lowerBetter={row.lowerBetter} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DepthRow({ label, live, reach }: { label: string; live: Colored[]; reach: (r: Ga4PageReport) => number }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-[#9CA3AF]">{label}</div>
      <div className="space-y-2">
        {live.map((p) => {
          const f = p.report ? reach(p.report) : 0;
          return (
            <div key={p.page.path} className="flex items-center gap-3">
              <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-[#9CA3AF]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                <span className="truncate" title={p.page.label}>{p.page.label}</span>
              </span>
              <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-white/[0.035]">
                <div className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${Math.max(2, f * 100)}%`, background: p.color, opacity: 0.85 }} aria-hidden />
                <div className="relative flex h-full items-center px-3">
                  <span className="font-mono text-xs font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{fmtPct(f, 0)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScrollDepthBlock({ live }: { live: Colored[] }) {
  const milestones = [25, 50, 75, 100];
  const milestoneReach = (r: Ga4PageReport, depth: number): number => {
    const c = r.scroll.find((s) => s.depth === depth)?.count ?? 0;
    return r.sessions > 0 ? Math.min(1, c / r.sessions) : 0;
  };
  const bottomReach = (r: Ga4PageReport): number => (r.sessions > 0 ? Math.min(1, r.scrollReached / r.sessions) : 0);
  const milestoneHasData = live.some((p) => p.report && p.report.scroll.some((s) => s.count > 0));
  const bottomHasData = live.some((p) => p.report && p.report.scrollReached > 0);

  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-6">
      <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Scroll depth · how far down each page people get</div>
      {!milestoneHasData && !bottomHasData ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-[13px] leading-relaxed text-amber-300/90">
          Scroll tracking just went live on both pages. This chart fills in over the next day or so as people visit and
          scroll. Everything above (traffic, engagement, sources) is live now.
        </div>
      ) : (
        <div className="space-y-5">
          {bottomHasData && <DepthRow label="Reached the bottom (~90%)" live={live} reach={bottomReach} />}
          {milestoneHasData ? (
            milestones.map((m) => (
              <DepthRow key={m} label={`Scrolled past ${m}%`} live={live} reach={(r) => milestoneReach(r, m)} />
            ))
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12px] leading-relaxed text-[#9CA3AF]">
              The 25 / 50 / 75 / 100% depth detail just turned on and fills in over the next day. The reached-the-bottom
              number above is live now.
            </div>
          )}
          <div className="text-[11px] leading-relaxed text-[#6B7280]">
            Share of each page&rsquo;s visits that scrolled at least this far. A page that holds more people deeper down is
            doing a better job of pulling them toward the offer.
          </div>
        </div>
      )}
    </div>
  );
}

export function CompareView({ pages, rangeLabel, stripe, stripeError }: CompareViewProps) {
  const colored: Colored[] = pages.map((p, i) => ({ ...p, color: PAGE_COLORS[i % PAGE_COLORS.length] }));
  const live = colored.filter((p) => p.report);
  const missing = colored.filter((p) => !p.report);
  const currency = (stripe?.currency ?? "usd").toUpperCase();

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] px-6 py-4">
        <span className="text-sm text-[#9CA3AF]">Comparing</span>
        {colored.map((p) => (
          <span key={p.page.path} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-sm font-semibold text-[#F5F5F7]">{p.page.label}</span>
            <span className="font-mono text-xs text-[#6B7280]">{p.page.path}</span>
          </span>
        ))}
        <span className="ml-auto text-xs text-[#6B7280]">{rangeLabel}</span>
      </div>

      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-300/90">
          No GA4 data for {missing.map((p) => p.page.label).join(", ")} in this range. Showing the pages with traffic.
        </div>
      )}

      {live.length > 0 && <CompareTable live={live} />}
      {live.length > 0 && <ScrollDepthBlock live={live} />}

      {/* Per-page breakdown: where the traffic comes from */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {live.map((p) => (
          <div key={p.page.path} className="rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} aria-hidden />
              <span className="text-sm font-semibold text-[#F5F5F7]">{p.page.label}</span>
              <span className="ml-auto font-mono text-xs text-[#6B7280]">{fmtInt(p.report!.visitors)} visitors</span>
            </div>
            <Sub title="Traffic sources" />
            {p.report!.sources.length > 0 ? <BarList rows={p.report!.sources} /> : <Empty />}
            <Sub title="Devices" className="mt-5" />
            {p.report!.devices.length > 0 ? <BarList rows={p.report!.devices} /> : <Empty />}
            <Sub title="Top countries" className="mt-5" />
            {p.report!.countries.length > 0 ? <BarList rows={p.report!.countries} /> : <Empty />}
          </div>
        ))}
      </div>

      {/* Revenue once + the attribution answer */}
      <div className="rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Revenue &amp; sales</div>
          <span className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF]">Account-wide</span>
        </div>
        {stripe ? (
          <div className="mb-4 flex flex-wrap gap-x-10 gap-y-3">
            <Stat value={fmtMoney(stripe.revenueNet, currency)} label="Revenue (net)" />
            <Stat value={fmtMoney(stripe.mrr, currency)} label="MRR" />
            <Stat value={fmtInt(stripe.salesCount)} label="Sales" />
          </div>
        ) : (
          <div className="mb-4 text-xs text-[#6B7280]">{stripeError ?? "Waiting for Stripe."}</div>
        )}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-sm font-semibold text-[#F5F5F7]">Why sales are not split per page</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#9CA3AF]">
            Stripe records the payment, not the page someone saw before buying, so the totals above are the whole account.
            To split sales by page, tag the payment links you send after a chat: add a{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-[#F5F5F7]">?utm_source=PAGE</code>{" "}
            code to each page&rsquo;s link (a short, distinct code per page). Sales then split by page in the
            &ldquo;Sales by source&rdquo; panel automatically.
          </p>
          {stripe && stripe.byUtmSource.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Sales by tagged source so far</div>
              {stripe.byUtmSource.slice(0, 6).map((r) => {
                const max = Math.max(...stripe.byUtmSource.map((x) => x.revenue), 1);
                const label = r.key === "(untagged)" ? "Untagged / direct" : r.key;
                return (
                  <div key={r.key} className="relative">
                    <div className="absolute inset-y-0 left-0 rounded bg-[#00D393]/15" style={{ width: `${(r.revenue / max) * 100}%` }} aria-hidden />
                    <div className="relative flex items-center justify-between px-2.5 py-1.5 text-sm">
                      <span className="truncate text-[#F5F5F7]" title={r.key}>{label}</span>
                      <span className="ml-2 font-mono text-xs tabular-nums text-[#9CA3AF]">{r.count} {r.count === 1 ? "sale" : "sales"} · {fmtMoney(r.revenue, currency)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-[#6B7280]">
        Per-page figures are from GA4 (traffic, engagement, scroll, sources), scoped to each page. Revenue is
        account-wide from Stripe. Range filter top right.
      </div>
    </div>
  );
}

function Sub({ title, className = "" }: { title: string; className?: string }) {
  return <div className={`mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280] ${className}`}>{title}</div>;
}

function Empty() {
  return <div className="text-xs text-[#6B7280]">No data yet.</div>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-2xl font-semibold tabular-nums text-[#F5F5F7]">{value}</div>
      <div className="mt-0.5 text-xs text-[#6B7280]">{label}</div>
    </div>
  );
}
