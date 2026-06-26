import { Target } from "lucide-react";
import { fetchStripeSnapshot, type StripeSnapshot } from "@/lib/creator/stripe";
import { loadCreatorSettings } from "@/lib/creator/settings";
import { parseRange, labelForRange, type DateRange } from "@/lib/creator/range";
import { DateRangePicker } from "@/components/creator-dashboard/date-range-picker";
import { ProgressBar } from "@/components/creator-dashboard/progress-bar";
import { KpiCard } from "@/components/creator-dashboard/kpi-card";
import { fmtMoney, fmtInt, fmtPct } from "@/lib/creator/format";

const PANEL = "rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0E0E12]";

/**
 * Goals for creator-template tenants (e.g. the creator). One north-star — revenue toward goal — plus
 * the recurring metrics that drive it, all live from Stripe. Replaces the empty Supabase OKR view.
 */
export async function CreatorGoals({
  agencyId,
  workspaceName,
  searchParams,
}: {
  agencyId: string;
  workspaceName: string;
  searchParams: { [k: string]: string | string[] | undefined };
}) {
  // Revenue goal is monthly → default to month-to-date unless the user picked a range.
  const hasRange = typeof searchParams.range === "string" || typeof searchParams.from === "string";
  const range = parseRange(hasRange ? searchParams : { ...searchParams, range: "mtd" });
  const settings = await loadCreatorSettings(agencyId);

  if (!settings.stripeKey) {
    return (
      <div className="space-y-6">
        <Header workspaceName={workspaceName} range={range} />
        <div className={`${PANEL} p-12 text-center`}>
          <p className="text-[#9CA3AF]">Connect Stripe to track your revenue goal.</p>
          <a href="/settings/integrations" className="mt-3 inline-block text-sm font-medium" style={{ color: "#0083FF" }}>Go to integrations →</a>
        </div>
      </div>
    );
  }

  let stripe: StripeSnapshot | null = null;
  let error: string | null = null;
  try {
    stripe = await fetchStripeSnapshot({ key: settings.stripeKey, range });
  } catch (e) {
    error = e instanceof Error ? e.message : "Stripe fetch failed";
  }

  const currency = (stripe?.currency ?? "usd").toUpperCase();
  const goal = settings.revenueGoalUsd;
  const revenue = stripe?.revenueNet ?? 0;
  const pct = goal > 0 ? revenue / goal : 0;
  const remaining = Math.max(0, goal - revenue);
  const aov = stripe && stripe.salesCount > 0 ? stripe.newOrderRevenue / stripe.salesCount : 0;

  return (
    <div className="space-y-6">
      <Header workspaceName={workspaceName} range={range} />

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ border: "1px solid rgba(248,175,0,0.3)", background: "rgba(248,175,0,0.08)", color: "#F8AF00" }}>
          Couldn&apos;t load Stripe: {error}
        </div>
      )}

      {/* North-star: revenue goal */}
      <div className={`${PANEL} p-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-[#0083FF]" />
            <span className="text-sm font-semibold text-[#F5F5F7]">Revenue goal</span>
          </div>
          <span className="text-xs text-[#6B7280]">{labelForRange(range)}</span>
        </div>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-4xl font-bold tabular-nums text-[#F5F5F7]">{fmtMoney(revenue, currency)}</span>
          <span className="text-sm text-[#6B7280]">of {fmtMoney(goal, currency)}</span>
          <span className="ml-auto text-2xl font-semibold tabular-nums" style={{ color: pct >= 1 ? "#00D393" : "#0083FF" }}>{fmtPct(pct, 0)}</span>
        </div>
        <div className="mt-4">
          <ProgressBar value={revenue} target={goal} format={(n) => fmtMoney(n, currency)} />
        </div>
        <div className="mt-3 text-xs text-[#6B7280]">
          {pct >= 1 ? "Goal smashed 🎉" : `${fmtMoney(remaining, currency)} to go`}
          {aov > 0 && pct < 1 ? ` · ~${fmtInt(Math.ceil(remaining / aov))} more sales at current AOV` : ""}
          . Set your target in <a href="/settings/integrations" className="text-[#0083FF]">workspace settings</a>.
        </div>
      </div>

      {/* Key results — the recurring metrics that move the goal */}
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Key results · tracked live</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="MRR" value={fmtMoney(stripe?.mrr ?? 0, currency)} hint={`${fmtInt(stripe?.activeSubscribers ?? 0)} active subs`} source="Stripe" />
          <KpiCard label="Sales" value={fmtInt(stripe?.salesCount ?? 0)} current={stripe?.salesCount} prior={stripe?.salesCountPrior} hint="orders in range" source="Stripe" />
          <KpiCard label="Avg order value" value={fmtMoney(aov, currency)} hint="per order" source="Stripe" />
          <KpiCard label="LTV" value={fmtMoney(stripe?.ltv ?? 0, currency)} hint="avg / customer (12m)" source="Stripe" />
        </div>
      </div>

      <div className="text-xs text-[#6B7280]">
        Live from Stripe{stripe ? ` · fetched ${new Date(stripe.fetchedAt).toLocaleTimeString("en-GB")}` : ""}.
      </div>
    </div>
  );
}

function Header({ workspaceName, range }: { workspaceName: string; range: DateRange }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">OBJECTIVES · LIVE FROM STRIPE</div>
        <h1 className="mt-2 text-3xl font-bold text-[#F5F5F7]" style={{ fontFamily: "var(--font-playfair),Georgia,serif" }}>Goals</h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">{workspaceName} · revenue north-star + the metrics that drive it</p>
      </div>
      <DateRangePicker range={range} />
    </div>
  );
}
