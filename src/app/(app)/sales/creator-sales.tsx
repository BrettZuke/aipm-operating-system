import { fetchStripeSnapshot, type StripeSnapshot } from "@/lib/creator/stripe";
import { loadCreatorSettings } from "@/lib/creator/settings";
import { parseRange, labelForRange, type DateRange } from "@/lib/creator/range";
import { DateRangePicker } from "@/components/creator-dashboard/date-range-picker";
import { RevenueChart } from "@/components/creator-dashboard/charts";
import { KpiCard } from "@/components/creator-dashboard/kpi-card";
import { fmtMoney, fmtInt } from "@/lib/creator/format";

const PANEL = "rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0E0E12]";

function titleCase(s: string): string {
  if (!s || s === "(untagged)") return "Untagged";
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sales view for creator-template tenants (e.g. the creator) — powered entirely by their own Stripe
 * account, NOT the coach-tenant Google Sheet. Mirrors the Settoku design used across the rest of settoku.
 */
export async function CreatorSales({
  agencyId,
  workspaceName,
  searchParams,
}: {
  agencyId: string;
  workspaceName: string;
  searchParams: { [k: string]: string | string[] | undefined };
}) {
  const range = parseRange(searchParams);
  const settings = await loadCreatorSettings(agencyId);

  if (!settings.stripeKey) {
    return (
      <div className="space-y-6">
        <SalesHeader workspaceName={workspaceName} range={range} />
        <div className={`${PANEL} p-12 text-center`}>
          <p className="text-[#9CA3AF]">Connect Stripe to see your sales.</p>
          <a href="/settings/integrations" className="mt-3 inline-block text-sm font-medium" style={{ color: "#0083FF" }}>
            Go to integrations →
          </a>
        </div>
      </div>
    );
  }

  let stripe: StripeSnapshot | null = null;
  let stripeError: string | null = null;
  try {
    stripe = await fetchStripeSnapshot({ key: settings.stripeKey, range });
  } catch (e) {
    stripeError = e instanceof Error ? e.message : "Stripe fetch failed";
  }

  const currency = (stripe?.currency ?? "usd").toUpperCase();
  const aov = stripe && stripe.salesCount > 0 ? stripe.newOrderRevenue / stripe.salesCount : 0;
  const sources = (stripe?.byUtmSource ?? []).filter((s) => s.revenue > 0);
  const campaigns = (stripe?.byUtmCampaign ?? []).filter((c) => c.revenue > 0);
  const maxSource = Math.max(1, ...sources.map((s) => s.revenue));

  return (
    <div className="space-y-8">
      <SalesHeader workspaceName={workspaceName} range={range} />

      {stripeError && (
        <div className="rounded-xl p-4 text-sm" style={{ border: "1px solid rgba(248,175,0,0.3)", background: "rgba(248,175,0,0.08)", color: "#F8AF00" }}>
          Couldn&apos;t load Stripe: {stripeError}
        </div>
      )}

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Revenue (net)" value={fmtMoney(stripe?.revenueNet ?? 0, currency)} current={stripe?.revenueNet} prior={stripe?.revenueNetPrior} hint="this period" source="Stripe" />
        <KpiCard label="Sales" value={fmtInt(stripe?.salesCount ?? 0)} current={stripe?.salesCount} prior={stripe?.salesCountPrior} hint="orders" source="Stripe" />
        <KpiCard label="Avg order value" value={fmtMoney(aov, currency)} hint="per order" />
        <KpiCard label="MRR" value={fmtMoney(stripe?.mrr ?? 0, currency)} hint={`${fmtInt(stripe?.activeSubscribers ?? 0)} active subs`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="New-order revenue" value={fmtMoney(stripe?.newOrderRevenue ?? 0, currency)} hint="from new checkouts" />
        <KpiCard label="Refunds" value={fmtMoney(stripe?.refunds ?? 0, currency)} accent={stripe && stripe.refunds > 0 ? "bad" : "default"} hint="this period" />
        <KpiCard label="Active subscribers" value={fmtInt(stripe?.activeSubscribers ?? 0)} hint="recurring" />
        <KpiCard label="LTV" value={fmtMoney(stripe?.ltv ?? 0, currency)} hint="avg / customer (12m)" />
      </div>

      {/* Sales over time */}
      <div className={`${PANEL} p-6`}>
        <div className="text-xs font-semibold mb-3 text-[#9CA3AF]">Sales over time</div>
        <RevenueChart points={stripe?.dailyRevenue ?? []} currency={currency} />
      </div>

      {/* Attribution — where the money comes from */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={`${PANEL} p-6`}>
          <div className="text-xs font-semibold mb-4 text-[#9CA3AF]">Sales by source</div>
          {sources.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No tagged sales yet. Use your UTM links (bio, dm, story…) so every sale shows its source.</p>
          ) : (
            <div className="space-y-2.5">
              {sources.map((s) => (
                <div key={s.key} className="relative">
                  <div className="absolute inset-y-0 left-0 rounded bg-[#0083FF]/15" style={{ width: `${(s.revenue / maxSource) * 100}%` }} aria-hidden />
                  <div className="relative flex items-center justify-between px-2.5 py-1.5 text-sm">
                    <span className="text-[#F5F5F7]">{titleCase(s.key)}</span>
                    <span className="font-mono text-xs tabular-nums text-[#9CA3AF]">
                      {fmtMoney(s.revenue, currency)} <span className="text-[#6B7280]">· {fmtInt(s.count)} {s.count === 1 ? "sale" : "sales"}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={`${PANEL} p-6`}>
          <div className="text-xs font-semibold mb-4 text-[#9CA3AF]">Sales by content / campaign</div>
          {campaigns.length === 0 ? (
            <p className="text-sm text-[#6B7280]">Tag links with <code className="text-[#9CA3AF]">utm_campaign</code> (per video / story / email) to see which pieces drive sales.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B7280]">
                  <th className="pb-2 font-medium">Piece</th>
                  <th className="pb-2 text-right font-medium">Sales</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.key} className="border-t border-[rgba(255,255,255,0.05)]">
                    <td className="py-1.5 text-[#F5F5F7]">{titleCase(c.key)}</td>
                    <td className="py-1.5 text-right tabular-nums text-[#9CA3AF]">{fmtInt(c.count)}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium text-[#F5F5F7]">{fmtMoney(c.revenue, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function SalesHeader({ workspaceName, range }: { workspaceName: string; range: DateRange }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">SALES · LIVE FROM STRIPE</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[#F5F5F7]" style={{ fontFamily: "var(--font-playfair),Georgia,serif" }}>
          Sales
        </h1>
        <p className="mt-2 text-sm text-[#9CA3AF]">
          {workspaceName} · {labelForRange(range)}
        </p>
      </div>
      <DateRangePicker range={range} />
    </div>
  );
}
