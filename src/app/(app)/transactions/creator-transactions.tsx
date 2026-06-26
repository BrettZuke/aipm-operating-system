import { ExternalLink } from "lucide-react";
import { fetchStripeLedger, type StripeLedger, type LedgerEntry } from "@/lib/creator/stripe";
import { loadCreatorSettings } from "@/lib/creator/settings";
import { parseRange, labelForRange, type DateRange } from "@/lib/creator/range";
import { DateRangePicker } from "@/components/creator-dashboard/date-range-picker";
import { RevenueChart } from "@/components/creator-dashboard/charts";
import { fmtMoney, fmtInt } from "@/lib/creator/format";

const PANEL = "rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0E0E12]";

const KIND_STYLE: Record<LedgerEntry["kind"], { bg: string; color: string; label: string }> = {
  payment: { bg: "rgba(0,131,255,0.15)", color: "#0083FF", label: "Payment" },
  refund: { bg: "rgba(248,175,0,0.15)", color: "#F8AF00", label: "Refund" },
  chargeback: { bg: "rgba(255,100,102,0.15)", color: "#FF6466", label: "Chargeback" },
};

function fmtWhen(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Transactions ledger for creator-template tenants (e.g. the creator) — every charge, refund and
 * dispute straight from their own Stripe account, NOT the shared Supabase finance ledger.
 */
export async function CreatorTransactions({
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
        <Header workspaceName={workspaceName} range={range} />
        <div className={`${PANEL} p-12 text-center`}>
          <p className="text-[#9CA3AF]">Connect Stripe to see your transactions.</p>
          <a href="/settings/integrations" className="mt-3 inline-block text-sm font-medium" style={{ color: "#0083FF" }}>
            Go to integrations →
          </a>
        </div>
      </div>
    );
  }

  let ledger: StripeLedger | null = null;
  let error: string | null = null;
  try {
    ledger = await fetchStripeLedger({ key: settings.stripeKey, range });
  } catch (e) {
    error = e instanceof Error ? e.message : "Stripe fetch failed";
  }

  const currency = (ledger?.currency ?? "usd").toUpperCase();
  const entries = ledger?.entries ?? [];

  return (
    <div className="space-y-6">
      <Header workspaceName={workspaceName} range={range} />

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ border: "1px solid rgba(248,175,0,0.3)", background: "rgba(248,175,0,0.08)", color: "#F8AF00" }}>
          Couldn&apos;t load Stripe: {error}
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Net collected" value={fmtMoney(ledger?.net ?? 0, currency)} sub={`${fmtInt(ledger?.paymentCount ?? 0)} payments`} accent />
        <Stat label="Gross paid" value={fmtMoney(ledger?.grossPaid ?? 0, currency)} sub="before refunds" />
        <Stat label="Refunded" value={fmtMoney(ledger?.refunded ?? 0, currency)} sub={`${fmtInt(ledger?.refundCount ?? 0)} refunds`} tone={ledger && ledger.refunded > 0 ? "warn" : "default"} />
        <Stat label="Failed / disputed" value={`${fmtInt(ledger?.failedCount ?? 0)} / ${fmtMoney(ledger?.disputed ?? 0, currency)}`} sub="declines · chargebacks" tone={ledger && (ledger.failedCount > 0 || ledger.disputed > 0) ? "bad" : "default"} />
      </div>

      {/* Cash flow */}
      <div className={`${PANEL} p-6`}>
        <div className="text-xs font-semibold mb-3 text-[#9CA3AF]">Net collected over time</div>
        <RevenueChart points={ledger?.dailyNet ?? []} currency={currency} />
      </div>

      {/* Ledger */}
      <div className={`${PANEL} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.07)] text-xs font-semibold text-[#9CA3AF]">
          {fmtInt(entries.length)} transactions · {labelForRange(range)}
        </div>
        {entries.length === 0 ? (
          <div className="p-12 text-center text-[#6B7280]">No transactions in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)] text-left text-[10px] uppercase tracking-wider text-[#6B7280]">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Method</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
                {entries.map((e) => {
                  const ks = KIND_STYLE[e.kind];
                  const isNeg = e.amount < 0;
                  const isFailed = e.status === "failed";
                  return (
                    <tr key={e.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-5 py-3 whitespace-nowrap text-[rgba(245,245,247,0.8)]">{fmtWhen(e.created)}</td>
                      <td className="px-5 py-3 text-[rgba(245,245,247,0.8)]">{e.customerEmail ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ background: ks.bg, color: ks.color }}>{ks.label}</span>
                        {isFailed && <span className="ml-1.5 rounded px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ background: "rgba(255,100,102,0.15)", color: "#FF6466" }}>Failed</span>}
                      </td>
                      <td className="px-5 py-3 text-[#9CA3AF] max-w-[220px] truncate" title={e.description ?? ""}>{e.description ?? "—"}</td>
                      <td className="px-5 py-3 text-[#9CA3AF] whitespace-nowrap">{e.cardBrand ? `${e.cardBrand} ·· ${e.last4 ?? ""}` : "—"}</td>
                      <td className={`px-5 py-3 text-right font-mono tabular-nums ${isNeg || isFailed ? "text-[#FF6466]" : "text-[#F5F5F7]"}`}>
                        {fmtMoney(e.amount, (e.currency || currency).toUpperCase())}
                      </td>
                      <td className="px-3 py-3">
                        {e.receiptUrl && (
                          <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-[#0083FF] hover:text-[#00A4FF]" title="Stripe receipt">
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-[#6B7280]">
        Live from Stripe{ledger ? ` · fetched ${new Date(ledger.fetchedAt).toLocaleTimeString("en-GB")}` : ""}. Refunds and chargebacks shown as negative.
      </div>
    </div>
  );
}

function Header({ workspaceName, range }: { workspaceName: string; range: DateRange }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">MONEY · LIVE FROM STRIPE</div>
        <h1 className="mt-2 text-3xl font-bold text-[#F5F5F7]" style={{ fontFamily: "var(--font-playfair),Georgia,serif" }}>
          Transactions
        </h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">{workspaceName} · {labelForRange(range)}</p>
      </div>
      <DateRangePicker range={range} />
    </div>
  );
}

function Stat({ label, value, sub, accent, tone = "default" }: { label: string; value: string; sub?: string; accent?: boolean; tone?: "default" | "warn" | "bad" }) {
  const color = tone === "bad" ? "#FF6466" : tone === "warn" ? "#F8AF00" : accent ? "#F5F5F7" : "#F5F5F7";
  return (
    <div className={`${PANEL} p-5`}>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ color }}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[#6B7280]">{sub}</div>}
    </div>
  );
}
