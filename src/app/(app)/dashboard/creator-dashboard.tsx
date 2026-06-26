import { KpiCard, PendingKpi } from "@/components/creator-dashboard/kpi-card";
import { BarList, RevenueChart, SessionsSparkline, UtmDonut } from "@/components/creator-dashboard/charts";
import { Funnel } from "@/components/creator-dashboard/funnel";
import { ProgressBar } from "@/components/creator-dashboard/progress-bar";
import { DateRangePicker } from "@/components/creator-dashboard/date-range-picker";
import { fetchGa4Snapshot, fetchGa4PageReport, type Ga4Snapshot } from "@/lib/creator/ga4";
import { fetchKitSnapshot, fetchKitEmailSnapshot, fetchTagClickers, type KitSnapshot, type KitEmailSnapshot, type KitBroadcastStat } from "@/lib/creator/kit";
import { ClientTabs } from "@/components/ui/client-tabs";
import { fetchStripeSnapshot, type StripeSnapshot, type UtmSales } from "@/lib/creator/stripe";
import { loadCreatorSettings, type CreatorSettings } from "@/lib/creator/settings";
import { fetchDmClickers, dmCampaignLabel } from "@/lib/creator/dm-clicks";
import { parseRange, labelForRange, type DateRange } from "@/lib/creator/range";
import { fmtInt, fmtMoney, fmtPath, fmtPct, fmtReferrer, fmtUtmSource, fmtDuration } from "@/lib/creator/format";
import { SiteSpeedPanel } from "@/components/creator-dashboard/site-speed";
import { CompareView } from "@/components/creator-dashboard/compare-view";
import Link from "next/link";

interface CreatorDashboardProps {
  agencyId: string;
  workspaceName: string;
  firstName: string | null;
  searchParams: { [k: string]: string | string[] | undefined };
}

interface PageData {
  ga4: Ga4Snapshot | null;
  ga4Error: string | null;
  kit: KitSnapshot | null;
  kitError: string | null;
  stripe: StripeSnapshot | null;
  stripeError: string | null;
  kitEmail: KitEmailSnapshot | null;
  kitEmailError: string | null;
  emailAttribution: { label: string; clicked: number; sales: number; revenue: number }[] | null;
  settings: CreatorSettings;
  missing: string[];
}

async function load(range: DateRange, settings: CreatorSettings, salesPagePath: string): Promise<PageData> {
  const missing: string[] = [];
  if (!settings.ga4PropertyId) missing.push("ga4 property_id");
  if (!settings.kitApiSecret) missing.push("kit api_secret");
  if (!settings.stripeKey) missing.push("stripe key");

  const ga4Promise = settings.ga4PropertyId
    ? fetchGa4Snapshot({
        propertyId: settings.ga4PropertyId,
        range,
        salesPagePath,
        checkoutPagePath: settings.checkoutPagePath,
      })
        .then((s) => ({ s, e: null as string | null }))
        .catch((e: Error) => ({ s: null as Ga4Snapshot | null, e: e.message }))
    : Promise.resolve({ s: null as Ga4Snapshot | null, e: null as string | null });

  const kitPromise = settings.kitApiSecret
    ? fetchKitSnapshot({
        secret: settings.kitApiSecret,
        range,
        webinarTagId: settings.webinarRegistrantTagId,
        checkoutTagIds: settings.checkoutTagIds,
        optInTagIds: settings.optInTagIds,
      })
        .then((s) => ({ s, e: null as string | null }))
        .catch((e: Error) => ({ s: null as KitSnapshot | null, e: e.message }))
    : Promise.resolve({ s: null as KitSnapshot | null, e: null as string | null });

  const stripePromise = settings.stripeKey
    ? fetchStripeSnapshot({ key: settings.stripeKey, range })
        .then((s) => ({ s, e: null as string | null }))
        .catch((e: Error) => ({ s: null as StripeSnapshot | null, e: e.message }))
    : Promise.resolve({ s: null as StripeSnapshot | null, e: null as string | null });

  const kitEmailPromise = settings.kitApiSecret
    ? fetchKitEmailSnapshot(settings.kitApiSecret, range)
        .then((s) => ({ s, e: null as string | null }))
        .catch((e: Error) => ({ s: null as KitEmailSnapshot | null, e: e.message }))
    : Promise.resolve({ s: null as KitEmailSnapshot | null, e: null as string | null });

  const [ga4Res, kitRes, stripeRes, kitEmailRes] = await Promise.all([ga4Promise, kitPromise, stripePromise, kitEmailPromise]);

  // Email -> DM -> sale attribution (time-windowed): a sale is credited to a campaign when the
  // buyer's email clicked that campaign's "DM the creator" link AND bought within the window after.
  // Primary source = our own DM-click log (the Settoku redirect link /api/dm-click): we own the
  // data, it carries real timestamps and is range-scoped. Falls back to Kit link-trigger tags for
  // any agency configured that way instead. Runs only once there is click data to match.
  let emailAttribution: PageData["emailAttribution"] = null;
  if (stripeRes.s) {
    const buyers = stripeRes.s.buyers;
    const windowSec = Math.max(1, settings.attributionWindowHours) * 3600;
    const fromTs = Math.floor(Date.parse(`${range.from}T00:00:00Z`) / 1000);
    const toTs = Math.floor(Date.parse(`${range.to}T23:59:59Z`) / 1000);

    // clicked = unique clickers in the selected range; sales/revenue = buyers who clicked (any time)
    // then paid within the window after that click.
    const creditRow = (label: string, clickers: Map<string, number>) => {
      let clicked = 0;
      for (const at of clickers.values()) if (at >= fromTs && at <= toTs) clicked += 1;
      let sales = 0;
      let revenue = 0;
      for (const b of buyers) {
        const clickedAt = clickers.get(b.email);
        if (clickedAt === undefined) continue;
        if (b.at >= clickedAt && b.at - clickedAt <= windowSec) {
          sales += 1;
          revenue += b.amount;
        }
      }
      return { label, clicked, sales, revenue };
    };

    const dmCampaigns = await fetchDmClickers(settings.agencyId).catch(() => []);
    if (dmCampaigns.length > 0) {
      emailAttribution = dmCampaigns.map((c) => creditRow(dmCampaignLabel(c.campaign, settings.dmHandle), c.clickers));
    } else if (settings.kitApiSecret && settings.dmCtaTags.length > 0) {
      const secret = settings.kitApiSecret;
      emailAttribution = await Promise.all(
        settings.dmCtaTags.map(async (t) => {
          try {
            return creditRow(t.label, await fetchTagClickers(secret, t.tagId));
          } catch {
            return { label: t.label, clicked: 0, sales: 0, revenue: 0 };
          }
        }),
      );
    }
  }

  return {
    ga4: ga4Res.s,
    ga4Error: ga4Res.e,
    kit: kitRes.s,
    kitError: kitRes.e,
    stripe: stripeRes.s,
    stripeError: stripeRes.e,
    kitEmail: kitEmailRes.s,
    kitEmailError: kitEmailRes.e,
    emailAttribution,
    settings,
    missing,
  };
}

function pickPagePath(param: string | string[] | undefined, pages: { path: string }[]): string {
  const p = typeof param === "string" ? param : undefined;
  return pages.find((x) => x.path === p)?.path ?? pages[0]?.path ?? "/";
}

export async function CreatorDashboard({ agencyId, workspaceName, firstName, searchParams }: CreatorDashboardProps) {
  const range = parseRange(searchParams);
  const settings0 = await loadCreatorSettings(agencyId);
  const pages = settings0.salesPages;
  const selectedPath = pickPagePath(searchParams.page, pages);
  const compareOn = searchParams.compare === "1" && pages.length > 1;
  const data = await load(range, settings0, selectedPath);

  // Compare mode renders a dedicated comparison of ALL pages (a full per-page GA4 report each),
  // not the single dashboard. Money is account-wide so it is shown once inside the compare view.
  const comparePages = compareOn
    ? await Promise.all(
        pages.map(async (p) => ({
          page: p,
          report: settings0.ga4PropertyId
            ? await fetchGa4PageReport({ propertyId: settings0.ga4PropertyId, range, pagePath: p.path }).catch(() => null)
            : null,
        })),
      )
    : null;
  const { kit, kitError, stripe, stripeError, settings } = data;

  // Render the full dashboard body for ONE page's GA4 data. The param is named `ga4` (and
  // `ga4Error`) so every section below is unchanged; stripe/kit/settings are shared (captured).
  // Single mode renders it once; compare mode renders it per page in side-by-side columns.
  function renderBody(ga4: Ga4Snapshot | null, ga4Error: string | null) {
  const stripeCurrency = (stripe?.currency ?? "usd").toUpperCase();

  // Email roll-ups are raw COUNTS (no averaged rates) — per-email rates live in the broadcast list.
  const emOpens = data.kitEmail ? data.kitEmail.broadcasts.reduce((a, b) => a + b.emailsOpened, 0) : 0;
  const emClicks = data.kitEmail ? data.kitEmail.broadcasts.reduce((a, b) => a + b.totalClicks, 0) : 0;
  const emAttr = data.emailAttribution ?? [];
  // DM funnel is opt-in per workspace (settings.dmTo set). Show the panel only when this workspace
  // uses it (has a DM code) or already has attributed rows — otherwise it stays hidden, so a
  // non-DM workspace (e.g. one selling via Whop/Discord) never sees another creator's DM copy.
  const dmHandle = settings.dmHandle ?? workspaceName;
  const dmTo = settings.dmTo;
  const showDmPanel = emAttr.length > 0 || !!dmTo;

  // Checkout-started: prefer Kit's tag count (reliable) over GA4 begin_checkout, which
  // undercounts badly when the event isn't fully wired on the page. optIns likewise.
  const checkoutStarted = kit?.checkoutStarted ?? ga4?.beginCheckout ?? null;
  const checkoutStartedPrior = kit?.checkoutStartedPrior ?? ga4?.beginCheckoutPrior ?? null;
  const checkoutSource = kit?.checkoutStarted != null ? "Kit" : "GA4";
  const optInsResolved = kit?.optIns ?? ga4?.generateLead ?? null;

  // Funnel step ratios must land in 0–100%. A value above 100% means numerator and denominator
  // come from sources that disagree (server-side Kit count vs adblock-undercounted GA4 sessions),
  // so we show "—" instead of a misleading >100%. null = not enough data / source pending.
  const stepRatio = (num: number, den: number | null | undefined): number | null => {
    if (!den || den <= 0 || num < 0) return null;
    const r = num / den;
    return r <= 1.0001 ? r : null;
  };
  const checkoutToBuy = checkoutStarted !== null && stripe ? stepRatio(stripe.salesCount, checkoutStarted) : null;
  const visitorToBuy = ga4 && stripe ? stepRatio(stripe.salesCount, ga4.visitors) : null;
  const aov = stripe && stripe.salesCount > 0 ? stripe.newOrderRevenue / stripe.salesCount : null;
  const optInRate = optInsResolved !== null && ga4 ? stepRatio(optInsResolved, ga4.visitors) : null;
  const cartAbandoned = checkoutStarted !== null && stripe ? Math.max(0, checkoutStarted - stripe.salesCount) : null;
  const abandonRate = checkoutStarted !== null && checkoutStarted > 0 && stripe ? Math.max(0, 1 - stripe.salesCount / checkoutStarted) : null;

  // ─── Pablo-style sales funnel (unique-visitor based, both cold + warm steps) ───
  const funnelUsers = ga4?.salesPageUsers ?? null; // unique funnel views (cold top)
  const reachedUsers = ga4?.checkoutPageUsers ?? null; // unique who reached a checkout page
  const hasCheckoutPage = !!ga4 && (ga4.checkoutPageViews > 0 || ga4.checkoutPageSessions > 0 || (ga4.checkoutPageUsers ?? 0) > 0);
  // People who reached checkout but never entered name/email (anonymous, page/CTA fix not email).
  const reachedNoInfo = reachedUsers !== null && checkoutStarted !== null ? Math.max(0, reachedUsers - checkoutStarted) : null;
  const landingToReach = reachedUsers !== null && funnelUsers ? stepRatio(reachedUsers, funnelUsers) : null;
  const reachToStarted = checkoutStarted !== null && reachedUsers ? stepRatio(checkoutStarted, reachedUsers) : null;
  const funnelToBuy = stripe && funnelUsers ? stepRatio(stripe.uniqueCustomers, funnelUsers) : null;

  // Content pieces: join GA4 traffic-by-campaign with Stripe sales-by-campaign so each
  // tagged video / story / email shows its visitors AND sales side by side.
  const PLACEHOLDER = new Set(["(not set)", "(organic)", "(referral)", "(direct)", "(none)", ""]);
  const pieceMap = new Map<string, { visitors: number; sales: number; revenue: number }>();
  for (const c of ga4?.utmCampaigns ?? []) {
    if (PLACEHOLDER.has(c.label.toLowerCase())) continue;
    const cur = pieceMap.get(c.label) ?? { visitors: 0, sales: 0, revenue: 0 };
    cur.visitors += c.sessions;
    pieceMap.set(c.label, cur);
  }
  for (const c of stripe?.byUtmCampaign ?? []) {
    if (c.key === "(untagged)") continue;
    const cur = pieceMap.get(c.key) ?? { visitors: 0, sales: 0, revenue: 0 };
    cur.sales += c.count;
    cur.revenue += c.revenue;
    pieceMap.set(c.key, cur);
  }
  const contentPieces = Array.from(pieceMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue || b.visitors - a.visitors)
    .slice(0, 15);

  const tabs = [
    { key: "revenue", label: "Revenue" },
    { key: "funnel", label: "Funnel" },
    { key: "audience", label: "Audience" },
    { key: "email", label: "Email" },
    { key: "traffic", label: "Traffic" },
    { key: "attribution", label: "Attribution" },
  ];
  const tabParam = typeof searchParams.tab === "string" ? searchParams.tab : "";
  const activeTab = tabs.some((t) => t.key === tabParam) ? tabParam : "revenue";

  return (
    <div className="space-y-4">
      <ClientTabs
        tabs={tabs}
        initialTab={activeTab}
        panels={{
          revenue: (
            <div className="space-y-8">

      {settings.hasWhop && !stripe && (
        <Panel>
          <div className="text-sm font-semibold text-[#F5F5F7]">Revenue tracking not connected</div>
          <p className="mt-1 text-xs leading-relaxed text-[#9CA3AF]">
            This workspace bills through Whop. To see revenue, MRR and active members here, connect a Whop API key in
            workspace settings. Until then traffic, funnel and email metrics still track normally.
          </p>
        </Panel>
      )}

      {/* ───────── Revenue ───────── */}
      <Section title="Revenue">
        <Grid cols={4}>
          {stripe ? (
            <KpiCard
              label="Revenue"
              value={fmtMoney(stripe.revenueNet, stripeCurrency)}
              hint="Paid charges net of refunds"
              current={stripe.revenueNet}
              prior={stripe.revenueNetPrior}
              source="Stripe"
            />
          ) : (
            <PendingKpi label="Revenue" pendingOn="Stripe" hint={stripeError ?? "Sum of paid transactions in range"} />
          )}
          {stripe ? (
            <KpiCard label="MRR" value={fmtMoney(stripe.mrr, stripeCurrency)} hint="Active subscription run-rate" source="Stripe" />
          ) : (
            <PendingKpi label="MRR" pendingOn="Stripe" hint="Active subscription run-rate" />
          )}
          {stripe ? (
            <KpiCard
              label="Blended MRR"
              value={fmtMoney(stripe.blendedMrr, stripeCurrency)}
              hint="MRR + (90d one-time ÷ 3)"
              source="Stripe"
            />
          ) : (
            <PendingKpi label="Blended MRR" pendingOn="Stripe" hint="MRR + (90d one-time ÷ 3)" />
          )}
          {stripe ? (
            <KpiCard
              label="Next 30 Days"
              value={fmtMoney(stripe.next30d, stripeCurrency)}
              hint="MRR projected forward (rough)"
              source="Stripe"
            />
          ) : (
            <PendingKpi label="Next 30 Days" pendingOn="Stripe" hint="From scheduled subscription payments" />
          )}
        </Grid>
        <Panel>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
              Revenue goal (lifetime)
            </div>
            {!stripe && (
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-400">
                Pending Stripe
              </span>
            )}
          </div>
          <ProgressBar
            value={stripe?.revenueNet ?? 0}
            target={settings.revenueGoalUsd}
            format={(n) => fmtMoney(n, stripeCurrency)}
          />
        </Panel>
        <Panel>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
            Sales over time
          </div>
          {stripe ? (
            <RevenueChart points={stripe.dailyRevenue} currency={stripeCurrency} />
          ) : (
            <div className="text-xs text-[#6B7280]">{stripeError ?? "Waiting for Stripe."}</div>
          )}
        </Panel>
      </Section>
            </div>
          ),
          funnel: (
            <div className="space-y-8">

      {/* ───────── Sales funnel (Pablo-style: views + unique at each step) ───────── */}
      <Section title="Sales funnel">
        <Grid cols={4}>
          {ga4 ? (
            <KpiCard label="Sales page visits" value={fmtInt(ga4.salesPageUsers)} hint={`${fmtInt(ga4.salesPageViews)} views · front door (new vs Pablo)`}
              current={ga4.salesPageUsers} prior={ga4.salesPageUsersPrior} source="GA4" />
          ) : (
            <PendingKpi label="Sales page visits" pendingOn="GA4" hint={ga4Error ?? "unique visitors on the sales page"} />
          )}
          {hasCheckoutPage && ga4 ? (
            <KpiCard label="Reached checkout" value={fmtInt(ga4.checkoutPageUsers)}
              hint={`${fmtInt(ga4.checkoutPageViews)} views · = Pablo "Funnel Views"`}
              current={ga4.checkoutPageUsers} prior={ga4.checkoutPageUsersPrior} source="GA4" />
          ) : (
            <PendingKpi label="Reached checkout" pendingOn="GA4" hint="set checkout_page_path in workspace settings" />
          )}
          {checkoutStarted !== null ? (
            <KpiCard label="Started checkout" value={fmtInt(checkoutStarted)}
              hint={checkoutSource === "Kit" ? "entered name/email · unique" : "begin_checkout (GA4)"}
              current={checkoutStarted} prior={checkoutStartedPrior ?? undefined} source={checkoutSource} />
          ) : (
            <PendingKpi label="Started checkout" pendingOn="Kit" hint="entered name/email" />
          )}
          {stripe ? (
            <KpiCard label="Completed checkout" value={fmtInt(stripe.uniqueCustomers)} accent="good"
              hint={`${fmtInt(stripe.salesCount)} orders · ${fmtInt(stripe.salesCountPaid)} paid / ${fmtInt(stripe.salesCountFree)} free`}
              current={stripe.uniqueCustomers} source="Stripe" />
          ) : (
            <PendingKpi label="Completed checkout" pendingOn="Stripe" hint="paid orders in range" />
          )}
        </Grid>
        <Grid cols={4}>
          <KpiCard label="Sales page → checkout" value={landingToReach === null ? "—" : fmtPct(landingToReach, 1)}
            hint="reached checkout ÷ sales page (NEW vs Pablo)" source="GA4" sourceTone={landingToReach === null ? "pending" : "ok"} />
          <KpiCard label="Checkout → started" value={reachToStarted === null ? "—" : fmtPct(reachToStarted, 1)}
            hint="entered info ÷ reached · ≈ Pablo's rate" source="Blended" sourceTone={reachToStarted === null ? "pending" : "ok"} />
          <KpiCard label="Started → buy" value={checkoutToBuy === null ? "—" : fmtPct(checkoutToBuy, 1)}
            hint="sales ÷ started checkout" source="Blended" sourceTone={checkoutToBuy === null ? "pending" : "ok"} />
          <KpiCard label="Sales page → buy" value={funnelToBuy === null ? "—" : fmtPct(funnelToBuy, 2)}
            hint="buyers ÷ sales page visits" source="Blended" sourceTone={funnelToBuy === null ? "pending" : "ok"} />
        </Grid>
        <Grid cols={4}>
          <KpiCard label="Net sales" value={stripe ? fmtInt(stripe.netSalesCount) : "—"}
            hint="paid completions, net of refunds" source="Stripe" sourceTone={stripe ? "ok" : "pending"} />
          <KpiCard label="Reached, no info" value={reachedNoInfo === null ? "—" : fmtInt(reachedNoInfo)}
            hint="reached checkout, never entered info" source="GA4" sourceTone={reachedNoInfo === null ? "pending" : "ok"} />
          <KpiCard label="AOV" value={aov === null ? "—" : fmtMoney(aov, stripeCurrency)}
            hint="avg order value" source="Stripe" sourceTone={aov === null ? "pending" : "ok"} />
          <KpiCard label="Visitor → buy" value={visitorToBuy === null ? "—" : fmtPct(visitorToBuy, 2)}
            hint="buyers ÷ all visitors" source="Blended" sourceTone={visitorToBuy === null ? "pending" : "ok"} />
        </Grid>
        <Panel>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
            Funnel drop-off (unique visitors)
          </div>
          <Funnel
            steps={[
              { label: "Sales page visits", value: ga4?.salesPageUsers ?? null },
              { label: "Reached checkout", value: hasCheckoutPage ? (ga4?.checkoutPageUsers ?? null) : null },
              { label: "Started checkout", value: checkoutStarted },
              { label: "Purchased", value: stripe?.uniqueCustomers ?? null },
            ]}
          />
          <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
            Unique visitors at each step. Sales page visits and reached checkout come from GA4 (your website, directional). Started checkout is {checkoutSource === "Kit" ? "exact from your Kit checkout tags (name and email submitted)" : "GA4 begin_checkout (wire checkout tags for an exact count)"}; Purchased is exact from Stripe. Pablo only hosted your checkout, so its &ldquo;Funnel Views&rdquo; = the Reached checkout step here, and its rates begin from there. The number Pablo never showed is Sales page to checkout, where most cold traffic drops off.
          </div>
        </Panel>
      </Section>

      {/* ───────── Webinar ───────── */}
      <Section title="Webinar">
        <Grid cols={3}>
          {kit?.webinarRegistrants !== null && kit?.webinarRegistrants !== undefined ? (
            <KpiCard
              label="Registrants"
              value={fmtInt(kit.webinarRegistrants)}
              hint="From Kit webinar tag"
              current={kit.webinarRegistrants ?? 0}
              prior={kit.webinarRegistrantsPrior ?? 0}
              source="Kit"
            />
          ) : (
            <PendingKpi label="Registrants" pendingOn="Kit tag" hint="Set webinar_registrant_tag_id in workspace settings" />
          )}
          <PendingKpi label="Shows" pendingOn="WebinarJam" hint="Attended live or replay" />
          <PendingKpi label="Sales" pendingOn="Stripe + UTM" hint="utm_source=webinar in checkout" />
        </Grid>
        <Panel>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
            Webinar funnel
          </div>
          <Funnel
            steps={[
              { label: "Registered", value: kit?.webinarRegistrants ?? null },
              { label: "Showed up", value: null },
              { label: "Bought", value: null },
            ]}
          />
        </Panel>
      </Section>
            </div>
          ),
          audience: (
            <div className="space-y-8">

      {/* ───────── Audience & retention ───────── */}
      <Section title="Audience & retention">
        <Grid cols={4}>
          {stripe ? (
            <KpiCard label="Active subscribers" value={fmtInt(stripe.activeSubscribers)}
              hint={`${fmtInt(Math.max(0, stripe.activeSubscribers - stripe.cancelling))} renewing · ${fmtInt(stripe.trialingSubscribers)} trials`} source="Stripe" />
          ) : (
            <PendingKpi label="Active subscribers" pendingOn="Stripe" hint="paid subs currently active" />
          )}
          {stripe ? (
            <KpiCard label="New subscriptions" value={fmtInt(stripe.newSubscriptions)} hint="subs created in range" source="Stripe" />
          ) : (
            <PendingKpi label="New subscriptions" pendingOn="Stripe" hint="subs created in range" />
          )}
          {stripe ? (
            <KpiCard label="Cancelling" value={fmtInt(stripe.cancelling)} accent={stripe.cancelling > 0 ? "warn" : "default"} inverse
              hint="active subs set to cancel at period end" source="Stripe" />
          ) : (
            <PendingKpi label="Cancelling" pendingOn="Stripe" hint="active subs set to cancel" />
          )}
          {stripe ? (
            <KpiCard label="Expired subs" value={fmtInt(stripe.canceledInRange)} accent={stripe.canceledInRange > 0 ? "bad" : "default"} inverse
              hint="subscriptions canceled in range" source="Stripe" />
          ) : (
            <PendingKpi label="Expired subs" pendingOn="Stripe" hint="canceled in range" />
          )}
          {kit ? (
            <KpiCard label="Opt-ins (new)" value={fmtInt(kit.newSubscribers)} hint={`${fmtInt(kit.totalSubscribers)} total Kit subs`}
              current={kit.newSubscribers} prior={kit.newSubscribersPrior} source="Kit" />
          ) : (
            <PendingKpi label="Opt-ins (new)" pendingOn="Kit" hint={kitError ?? "Waiting for Kit"} />
          )}
          <KpiCard label="Opt-in rate" value={optInRate === null ? "—" : fmtPct(optInRate, 1)}
            hint="opt-ins ÷ visitors" source="GA4" sourceTone={optInRate === null ? "pending" : "ok"} />
          {stripe ? (
            <KpiCard label="LTV" value={fmtMoney(stripe.ltv, stripeCurrency)} hint="avg paid/customer (last 365d)" source="Stripe" />
          ) : (
            <PendingKpi label="LTV" pendingOn="Stripe" hint="avg total $/customer" />
          )}
          {stripe ? (
            <KpiCard label="Refunds" value={fmtMoney(stripe.refunds, stripeCurrency)} hint="$ refunded in range" source="Stripe" />
          ) : (
            <PendingKpi label="Refunds" pendingOn="Stripe" hint="$ refunded in range" />
          )}
          {stripe && stripe.churnRate !== null ? (
            <KpiCard label="Churn rate" value={fmtPct(stripe.churnRate, 1)} inverse hint={`${fmtInt(stripe.canceledInRange)} canceled in range`} source="Stripe" />
          ) : (
            <PendingKpi label="Churn rate" pendingOn="Stripe" hint="subs canceled ÷ active base" />
          )}
          {stripe ? (
            <KpiCard label="Chargebacks" value={fmtInt(stripe.chargebacks)} accent={stripe.chargebacks > 0 ? "bad" : "default"}
              hint={stripe.chargebacks > 0 ? `${fmtMoney(stripe.chargebacksAmount, stripeCurrency)} disputed` : "none in range"} source="Stripe" />
          ) : (
            <PendingKpi label="Chargebacks" pendingOn="Stripe" hint="disputes in range" />
          )}
        </Grid>
      </Section>
            </div>
          ),
          email: (
            <div className="space-y-8">

      {/* ───────── Email (Kit broadcasts + DM-funnel attribution) ───────── */}
      <Section title="Email">
        {/* Roll-up = raw counts only. No blended/averaged rate — each email's real rate is in the list below. */}
        <Grid cols={4}>
          {data.kitEmail ? (
            <KpiCard label="Emails sent" value={fmtInt(data.kitEmail.broadcastsSent)} hint="broadcasts in range" source="Kit" />
          ) : (
            <PendingKpi label="Emails sent" pendingOn="Kit" hint={data.kitEmailError ?? "broadcasts in range"} />
          )}
          {data.kitEmail ? (
            <KpiCard label="Recipients" value={fmtInt(data.kitEmail.totalRecipients)} hint="total delivered" source="Kit" />
          ) : (
            <PendingKpi label="Recipients" pendingOn="Kit" hint="total delivered" />
          )}
          {data.kitEmail ? (
            <KpiCard label="Total opens" value={fmtInt(emOpens)} hint="across every send" source="Kit" />
          ) : (
            <PendingKpi label="Total opens" pendingOn="Kit" hint="across every send" />
          )}
          {data.kitEmail ? (
            <KpiCard label="Total clicks" value={fmtInt(emClicks)} hint={`${fmtInt(data.kitEmail.totalUnsubscribes)} unsubscribed`} source="Kit" />
          ) : (
            <PendingKpi label="Total clicks" pendingOn="Kit" hint="across every send" />
          )}
        </Grid>
        {data.kitEmail && data.kitEmail.broadcasts.length > 0 && (
          <Panel>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Every email · open &amp; click</div>
            <div className="mb-3 text-[11px] text-[#6B7280]">Each send on its own, newest first — no averaging. The percentages are that one email&rsquo;s real numbers.</div>
            <BroadcastList rows={data.kitEmail.broadcasts} />
          </Panel>
        )}
        {data.kitEmail && data.kitEmail.broadcasts.length === 0 && !data.kitEmailError && (
          <Panel>
            <div className="text-xs text-[#6B7280]">No broadcasts sent in this range.</div>
          </Panel>
        )}
        {showDmPanel && (
        <Panel>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
            Email-attributed sales · DM funnel
          </div>
          {emAttr.length > 0 ? (
            <>
              <EmailAttribution rows={emAttr} currency={stripeCurrency} />
              <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
                A sale is credited here when the buyer clicked a &ldquo;DM {dmHandle}&rdquo; tracking link and then bought
                within {settings.attributionWindowHours}h. Matched by email, so it still counts the sale days later in
                the DM, but only when the buyer pays with the email they&rsquo;re subscribed with.
              </div>
            </>
          ) : (
            <div className="mt-1 text-[12px] leading-relaxed text-[#9CA3AF]">
              Tracks sales from emails that send leads to DM {dmHandle}. Use this as the DM button link in your emails:
              <div className="mt-2 select-all break-all rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-[#F5F5F7]">
                {`https://your-app.example.com/api/dm-click?to=${dmTo ?? ""}&e={{ subscriber.email_address }}`}
              </div>
              <div className="mt-2">
                Kit fills in each subscriber&rsquo;s email, the click is logged here, then they land in {dmHandle}&rsquo;s DMs.
                Any clicker who buys within {settings.attributionWindowHours}h is credited automatically, matched by email.
                Add <code className="rounded bg-white/10 px-1 font-mono text-[11px] text-[#F5F5F7]">&amp;c=name</code> to
                track a specific campaign separately.
              </div>
            </div>
          )}
        </Panel>
        )}
      </Section>
            </div>
          ),
          traffic: (
            <div className="space-y-8">

      {/* ───────── Traffic & audience ───────── */}
      {ga4 && (
        <Section title="Traffic & audience">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <KpiCard label="Sessions" value={fmtInt(ga4.sessions)} hint="all pages"
              current={ga4.sessions} prior={ga4.sessionsPrior} source="GA4" />
            <KpiCard label="Avg. time on page" value={fmtDuration(ga4.avgEngagementSec)} hint="engaged time / session" source="GA4" />
            <div className="md:col-span-2">
              <Panel>
                <SessionsSparkline points={ga4.sessionsTrend} />
              </Panel>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Panel>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
                Device
              </div>
              <BarList rows={ga4.deviceSplit.map((r) => ({ ...r, label: r.label ? r.label.charAt(0).toUpperCase() + r.label.slice(1) : "Unknown" }))} />
            </Panel>
            <Panel>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
                Top countries
              </div>
              <BarList rows={ga4.topCountries} />
            </Panel>
            <Panel>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
                Top referrers
              </div>
              <BarList rows={ga4.topReferrers.map((r) => ({ ...r, label: fmtReferrer(r.label) }))} />
            </Panel>
            <Panel>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
                Top paths
              </div>
              <BarList rows={ga4.topPaths.map((r) => ({ ...r, label: fmtPath(r.label) }))} />
            </Panel>
          </div>
          <Panel>
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
              How far down the page people get
            </div>
            <PageScrollMap agencyId={agencyId} steps={(ga4?.sectionFunnel ?? []).map((s) => ({ label: s.label, value: s.sessions }))} />
          </Panel>
          <Panel>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
              Cart abandonment
            </div>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div><span className="font-mono text-xl text-[#F5F5F7]">{checkoutStarted !== null ? fmtInt(checkoutStarted) : "—"}</span> <span className="text-xs text-[#6B7280]">started</span></div>
              <div><span className="font-mono text-xl text-[#00D393]">{stripe ? fmtInt(stripe.salesCount) : "—"}</span> <span className="text-xs text-[#6B7280]">bought</span></div>
              <div><span className="font-mono text-xl text-[#FF6466]">{cartAbandoned !== null ? fmtInt(cartAbandoned) : "—"}</span> <span className="text-xs text-[#6B7280]">abandoned</span></div>
              <div><span className="font-mono text-xl text-[#F8AF00]">{abandonRate !== null ? fmtPct(abandonRate, 0) : "—"}</span> <span className="text-xs text-[#6B7280]">abandon rate</span></div>
            </div>
            <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
              Abandoners (started checkout, never bought) are auto-tagged “Started Checkout” in Kit and enter your recovery email sequence. Started is GA4 (forward-only); bought is exact from Stripe.
            </div>
          </Panel>
        </Section>
      )}

      {/* ───────── Site speed ───────── */}
      {settings.speedInsightsUrl && (
        <Section title="Site speed">
          <SiteSpeedPanel speedInsightsUrl={settings.speedInsightsUrl} />
        </Section>
      )}
            </div>
          ),
          attribution: (
            <div className="space-y-8">

      {/* ───────── Attribution: traffic vs sales by source ───────── */}
      <Section title="Attribution — UTM">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ga4 && (
            <Panel>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
                Traffic by source · GA4 sessions
              </div>
              <UtmDonut
                data={ga4.utmSources.slice(0, 8).map((r) => ({ label: fmtUtmSource(r.label), value: r.sessions }))}
              />
            </Panel>
          )}
          <Panel>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
                Sales by source · Stripe orders
              </div>
              <span className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF]">
                Stripe
              </span>
            </div>
            {stripe ? (
              <SalesByUtm rows={stripe.byUtmSource} currency={stripeCurrency} />
            ) : (
              <div className="text-xs text-[#6B7280]">{stripeError ?? "Waiting for Stripe."}</div>
            )}
            <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
              Exact — from the UTM stamped on each Stripe checkout. Orders placed before tracking went live show as “Untagged”.
            </div>
          </Panel>
        </div>
      </Section>

      {/* ───────── Content pieces (campaign level) ───────── */}
      <Section title="Content pieces — what's driving sales">
        <Panel>
          <ContentPieces rows={contentPieces} currency={stripeCurrency} siteUrl={settings.siteUrl} />
          <div className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
            Every link you build (each video, story, email) shows here under its own campaign name: visitors from GA4, sales + revenue from Stripe, sorted by revenue. This is where you see which specific pieces sell, not just which channels.
          </div>
        </Panel>
      </Section>

      {(data.missing.length > 0 || ga4Error || kitError || stripeError) && (
        <Section title="Setup">
          <Panel>
            {data.missing.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
                  Missing workspace settings
                </div>
                <ul className="mt-2 space-y-1 font-mono text-xs">
                  {data.missing.map((m) => (
                    <li key={m} className="rounded bg-white/5 px-3 py-1.5 text-[#F5F5F7]">{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {ga4Error && (
              <div className="mb-2 text-sm">
                <span className="font-semibold text-amber-400">GA4 error: </span>
                <span className="text-[#9CA3AF]">{ga4Error}</span>
              </div>
            )}
            {kitError && (
              <div className="mb-2 text-sm">
                <span className="font-semibold text-amber-400">Kit error: </span>
                <span className="text-[#9CA3AF]">{kitError}</span>
              </div>
            )}
            {stripeError && (
              <div className="text-sm">
                <span className="font-semibold text-amber-400">Stripe error: </span>
                <span className="text-[#9CA3AF]">{stripeError}</span>
              </div>
            )}
          </Panel>
        </Section>
      )}
            </div>
          ),
        }}
      />

      <div className="text-xs text-[#6B7280]">
        Last fetched {ga4 ? new Date(ga4.fetchedAt).toLocaleTimeString("en-GB") : "—"} · cache 5 min · range filter top
        right.
      </div>
    </div>
  );
  }

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold text-[#F5F5F7]" style={{ fontFamily: "var(--font-settoku-display)" }}>
          {firstName ? `Hey ${firstName}` : "Dashboard"} <span className="text-[#9CA3AF]">·</span> {workspaceName}
        </h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          {labelForRange(range)} ({range.from} → {range.to}) · vs prior {range.prevFrom} → {range.prevTo}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {pages.length > 1 && (
          <PageSwitcher pages={pages} selectedPath={selectedPath} compareOn={compareOn} searchParams={searchParams} />
        )}
        <DateRangePicker range={range} />
      </div>
    </div>
  );

  return (
    <div className="space-y-8 p-6">
      {header}
      {compareOn && comparePages ? (
        <CompareView
          pages={comparePages}
          rangeLabel={`${labelForRange(range)} (${range.from} → ${range.to})`}
          stripe={stripe}
          stripeError={stripeError}
        />
      ) : (
        renderBody(data.ga4, data.ga4Error)
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{title}</div>
      {children}
    </section>
  );
}

function Grid({ cols, children }: { cols: 3 | 4; children: React.ReactNode }) {
  const cls = cols === 4 ? "grid grid-cols-2 gap-3 md:grid-cols-4" : "grid grid-cols-1 gap-3 md:grid-cols-3";
  return <div className={cls}>{children}</div>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">{children}</div>
  );
}

// The sales page top-to-bottom: each row pairs a PREVIEW of the real section with a heat
// bar (length + colour = how many reach it). ▼ marks the biggest drop-offs. Thumbnails are
// PER-TENANT: /public/sections/<agencyId>/<key>.jpg, so each agency shows its OWN page (never
// another tenant's). A tenant with no folder simply shows an empty slot (no shared fallback).
// Re-capture if the page changes.
const SECTION_THUMBS = ["hero", "who", "offer", "pricing", "proof", "final"];
function PageScrollMap({ agencyId, steps }: { agencyId: string; steps: ReadonlyArray<{ label: string; value: number | null }> }) {
  // Sections fire via IntersectionObserver (first-seen), so counts are non-monotonic — a lower
  // section can out-count the hero. Use the max as the 100% reference so a bar never exceeds 100%.
  const top = steps.reduce((m, s) => (typeof s.value === "number" && s.value > m ? s.value : m), 0);
  function heat(frac: number): string {
    if (frac >= 0.75) return "#00D393";
    if (frac >= 0.5) return "#84cc16";
    if (frac >= 0.3) return "#F8AF00";
    return "#FF6466";
  }
  const shadow = { textShadow: "0 1px 3px rgba(0,0,0,0.65)" };
  return (
    <div>
      {steps.map((s, i) => {
        const v = typeof s.value === "number" ? s.value : 0;
        const frac = top > 0 ? Math.min(1, v / top) : 0;
        const prev = i > 0 ? steps[i - 1].value : null;
        const prevNum = typeof prev === "number" ? prev : null;
        // 40%-visibility first-seen tracking: a tall section (e.g. Pricing) can under-count, so a
        // section below it may read higher. Flag that as noise instead of showing a fake "gain".
        const inversion = prevNum !== null && prevNum > 0 && typeof s.value === "number" && s.value > prevNum;
        const drop = prevNum && prevNum > 0 && typeof s.value === "number" ? Math.max(0, 1 - s.value / prevNum) : null;
        const bigDrop = drop !== null && drop >= 0.3;
        const thumb = SECTION_THUMBS[i];
        return (
          <div key={s.label}>
            {i > 0 && (
              <div className="flex items-center gap-1.5 py-1 pl-[76px] text-[10px] font-semibold">
                {inversion ? (
                  <span className="text-[#6B7280]">~ tracking noise here (tall section under-counts)</span>
                ) : (
                  <span style={{ color: bigDrop ? "#FF6466" : "#6B7280" }}>
                    ▼ {fmtPct(drop as number, 0)} leave before this section
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 py-1.5">
              <div
                className="h-12 w-16 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/5 bg-cover bg-top bg-no-repeat"
                style={{
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  backgroundImage: thumb ? `url(/sections/${agencyId}/${thumb}.jpg)` : undefined,
                }}
                role="img"
                aria-label={s.label}
              />
              <div className="relative h-12 flex-1 overflow-hidden rounded-md" style={{ background: "rgba(255,255,255,0.045)" }}>
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${Math.min(100, Math.max(6, frac * 100))}%`, background: heat(frac), opacity: 0.85 }}
                  aria-hidden
                />
                <div className="relative flex h-full items-center justify-between px-3">
                  <span className="text-[13px] font-semibold text-white" style={shadow}>{s.label}</span>
                  <span className="font-mono text-[11px] font-semibold text-white" style={shadow}>
                    {fmtInt(v)} · {fmtPct(frac, 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div className="mt-2 text-[10px] leading-relaxed text-[#6B7280]">
        Each row is a real section of your page, top to bottom. The % is the share of your hero viewers who scrolled this far (a survival rate), so it counts down from 100% and the rows never sum to 100%. Focus on the biggest ▼ drop-offs. Heads up: very tall sections like Pricing can under-count, so a lower section may read higher; treat those as noise.
      </div>
    </div>
  );
}

function ContentPieces({
  rows,
  currency,
  siteUrl,
}: {
  rows: ReadonlyArray<{ name: string; visitors: number; sales: number; revenue: number }>;
  currency: string;
  siteUrl?: string | null;
}) {
  if (!rows.length) {
    const builder = siteUrl ? `${siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/links` : null;
    return (
      <div className="text-xs text-[#6B7280]">
        No tagged content pieces yet. Build links in your link builder{builder ? ` (${builder})` : ""} and each one shows up here.
      </div>
    );
  }
  const maxRev = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div>
      <div className="grid grid-cols-[1fr_4rem_3rem_5rem] gap-x-3 border-b border-white/10 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
        <div>Content piece</div>
        <div className="text-right">Visitors</div>
        <div className="text-right">Sales</div>
        <div className="text-right">Revenue</div>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="relative border-b border-white/5">
          <div
            className="absolute inset-y-0 left-0 rounded bg-[#00D393]/10"
            style={{ width: `${(r.revenue / maxRev) * 100}%` }}
            aria-hidden
          />
          <div className="relative grid grid-cols-[1fr_4rem_3rem_5rem] items-center gap-x-3 py-2 text-sm">
            <div className="truncate text-[#F5F5F7]" title={r.name}>{r.name}</div>
            <div className="text-right font-mono tabular-nums text-[#9CA3AF]">{fmtInt(r.visitors)}</div>
            <div className="text-right font-mono tabular-nums text-[#F5F5F7]">{r.sales || "—"}</div>
            <div className="text-right font-mono tabular-nums text-[#00D393]">{r.revenue ? fmtMoney(r.revenue, currency) : "—"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SalesByUtm({ rows, currency }: { rows: ReadonlyArray<UtmSales>; currency: string }) {
  if (!rows.length) return <div className="text-xs text-[#6B7280]">No sales in range yet.</div>;
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const pct = (r.revenue / max) * 100;
        const label = r.key === "(untagged)" ? "Untagged / direct" : r.key;
        return (
          <div key={r.key} className="relative">
            <div className="absolute inset-y-0 left-0 rounded bg-[#00D393]/15" style={{ width: `${pct}%` }} aria-hidden />
            <div className="relative flex items-center justify-between px-2.5 py-1.5 text-sm">
              <span className="truncate text-[#F5F5F7]" title={r.key}>{label}</span>
              <span className="ml-2 font-mono text-xs tabular-nums text-[#9CA3AF]">
                {r.count} {r.count === 1 ? "sale" : "sales"} · {fmtMoney(r.revenue, currency)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BroadcastList({ rows }: { rows: ReadonlyArray<KitBroadcastStat> }) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_4rem_4.75rem_4.75rem] gap-x-3 border-b border-white/10 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
        <div>Subject</div>
        <div className="text-right">Sent to</div>
        <div className="text-right">Opens</div>
        <div className="text-right">Clicks</div>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[1fr_4rem_4.75rem_4.75rem] items-center gap-x-3 border-b border-white/5 py-2.5 text-sm">
          <div className="min-w-0">
            <div className="truncate text-[#F5F5F7]" title={r.subject}>{r.subject}</div>
            <div className="font-mono text-[10px] text-[#6B7280]">{r.date}</div>
          </div>
          <div className="text-right font-mono text-xs tabular-nums text-[#9CA3AF]">{fmtInt(r.recipients)}</div>
          <div className="text-right">
            <div className="font-mono text-sm tabular-nums text-[#F5F5F7]">{fmtPct(r.openRate, 0)}</div>
            <div className="font-mono text-[10px] tabular-nums text-[#6B7280]">{fmtInt(r.emailsOpened)} opens</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm tabular-nums text-[#00D393]">{fmtPct(r.clickRate, 0)}</div>
            <div className="font-mono text-[10px] tabular-nums text-[#6B7280]">{fmtInt(r.totalClicks)} clicks</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmailAttribution({
  rows,
  currency,
}: {
  rows: ReadonlyArray<{ label: string; clicked: number; sales: number; revenue: number }>;
  currency: string;
}) {
  const maxRev = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div className="mt-2">
      <div className="grid grid-cols-[1fr_4rem_3.5rem_5rem] gap-x-3 border-b border-white/10 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
        <div>Campaign</div>
        <div className="text-right">Clicked</div>
        <div className="text-right">Sales</div>
        <div className="text-right">Revenue</div>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="relative border-b border-white/5">
          <div className="absolute inset-y-0 left-0 rounded bg-[#00D393]/10" style={{ width: `${(r.revenue / maxRev) * 100}%` }} aria-hidden />
          <div className="relative grid grid-cols-[1fr_4rem_3.5rem_5rem] items-center gap-x-3 py-2 text-sm">
            <div className="truncate text-[#F5F5F7]" title={r.label}>{r.label}</div>
            <div className="text-right font-mono tabular-nums text-[#9CA3AF]">{fmtInt(r.clicked)}</div>
            <div className="text-right font-mono tabular-nums text-[#F5F5F7]">{r.sales || "—"}</div>
            <div className="text-right font-mono tabular-nums text-[#00D393]">{r.revenue ? fmtMoney(r.revenue, currency) : "—"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PageSwitcher({ pages, selectedPath, compareOn, searchParams }: {
  pages: { label: string; path: string }[];
  selectedPath: string;
  compareOn: boolean;
  searchParams: { [k: string]: string | string[] | undefined };
}) {
  const mk = (page: string, compare: boolean) => {
    const sp = new URLSearchParams();
    for (const k of ["range", "from", "to", "tab"]) {
      const v = searchParams[k];
      if (typeof v === "string") sp.set(k, v);
    }
    sp.set("page", page);
    if (compare) sp.set("compare", "1");
    return `?${sp.toString()}`;
  };
  const btn = "rounded-md px-2.5 py-1 text-xs font-medium transition-colors";
  const on = "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]";
  const off = "text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]";
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-0.5">
      {pages.map((p) => (
        <Link key={p.path} href={mk(p.path, compareOn)} className={`${btn} ${p.path === selectedPath ? on : off}`}>
          {p.label}
        </Link>
      ))}
      <span className="mx-0.5 h-4 w-px bg-[rgba(255,255,255,0.08)]" aria-hidden />
      <Link href={mk(selectedPath, !compareOn)} className={`${btn} ${compareOn ? on : off}`}>
        Compare
      </Link>
    </div>
  );
}
