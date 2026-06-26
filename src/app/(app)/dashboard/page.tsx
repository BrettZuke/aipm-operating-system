import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { ClientTabs } from "@/components/ui/client-tabs";
import {
  OverviewTab, RevenueTab, TrendsTab, ClientsTab, PipelineTab,
  OutreachTab, AdsTab, ReferralsTab, TeamTab, CSTab,
  type DashboardData,
} from "./tabs";
import { CreatorDashboard } from "./creator-dashboard";
import { CoachAnalytics } from "./coach-analytics";
import { CoachWebinar } from "./coach-webinar";
import { LinkBuilder } from "@/components/coach/link-builder";
import { loadCoachConfig } from "@/lib/coach/funnel-traffic";
import { fanbasisEnabledFor, fanbasisAllTimeRevenue } from "@/lib/coach/fanbasis";
import { webinarjamEnabledFor } from "@/lib/coach/webinarjam";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Tab = "overview" | "analytics" | "webinar" | "links" | "revenue" | "trends" | "clients" | "pipeline" | "outreach" | "ads" | "referrals" | "team" | "cs";

const TABS = [
  { key: "overview",  label: "Overview"  },
  { key: "revenue",   label: "Revenue"   },
  { key: "trends",    label: "Trends"    },
  { key: "clients",   label: "Clients"   },
  { key: "pipeline",  label: "Pipeline"  },
  { key: "outreach",  label: "Outreach"  },
  { key: "ads",       label: "Ads"       },
  { key: "referrals", label: "Referrals" },
  { key: "team",      label: "Team / Ops" },
  { key: "cs",        label: "CS"        },
];

function getGreeting(name: string | null): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = name?.split(" ")[0] ?? "there";
  return `Good ${time}, ${firstName}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: Tab; range?: string; from?: string; to?: string; funnel?: string; page?: string; offer?: string; compare?: string }>;
}) {
  const allParams = await searchParams;
  const { tab } = allParams;
  const { supabase, user, agencyId } = await getAuthContext();
  const firstName = user.user_metadata?.full_name?.split(" ")[0] ?? null;

  // Branch on workspace's dashboard_template: 'coach' → existing the coach-style flow below,
  // 'creator' → new creator dashboard (the creator's traffic / MRR / community shape).
  if (agencyId) {
    // dashboard_template column was added 2026-06-06; types haven't been regenerated.
    const { data: agencyRow } = await supabase
      .from("agencies")
      .select("name, dashboard_template")
      .eq("id", agencyId)
      .maybeSingle<{ name: string; dashboard_template: string }>();
    if (agencyRow?.dashboard_template === "creator") {
      return (
        <CreatorDashboard
          agencyId={agencyId}
          workspaceName={agencyRow.name}
          firstName={firstName}
          searchParams={allParams}
        />
      );
    }
  }

  // clients can exceed 1000 rows (waitlist + market research) so paginate.
  // All other queries are bounded.
  const [
    clients,
    { data: deals },
    { data: calls },
    { data: recentTx },
    { data: goals },
    { count: teamCount },
  ] = await Promise.all([
    fetchAllPages<{ id: string; name: string; status: string | null; mrr: number | null; total_pending: number | null; created_at: string }>(
      (from, to) => supabase
        .from("clients")
        .select("id, name, status, mrr, total_pending, created_at")
        .eq("agency_id", agencyId!)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    supabase.from("deals").select("id, stage, amount").eq("agency_id", agencyId!),
    supabase.from("calls").select("id, outcome").eq("agency_id", agencyId!).eq("outcome", "booked"),
    supabase.from("transactions").select("id, amount, kind, occurred_at, description, client_id").eq("agency_id", agencyId!).order("occurred_at", { ascending: false }).limit(60),
    supabase.from("goals").select("id, name, target_value, current_value").eq("agency_id", agencyId!).limit(10),
    agencyId
      ? supabase.from("agency_members").select("*", { count: "exact", head: true }).eq("agency_id", agencyId).eq("status", "active")
      : Promise.resolve({ count: 0 }),
  ]);

  const allClients = clients;
  const activeClients = allClients.filter(c => c.status === "active");
  const totalMrr = activeClients.reduce((s, c) => s + Number(c.mrr ?? 0), 0);
  const pendingRevenue = allClients.reduce((s, c) => s + Number(c.total_pending ?? 0), 0);

  // Cash collected — actual money in (transactions = FanBasis source of truth)
  const payments = (recentTx ?? []).filter(t => t.kind === "payment");
  const refunds = (recentTx ?? []).filter(t => t.kind === "refund");
  const cashCollected = payments.reduce((s, t) => s + Number(t.amount ?? 0), 0)
                      - refunds.reduce((s, t) => s + Number(t.amount ?? 0), 0);

  // Contract value — what was sold (deals.amount where stage = closed_won)
  const wonDeals = (deals ?? []).filter(d => d.stage === "closed_won");
  const totalContractValue = wonDeals.reduce((s, d) => s + Number(d.amount ?? 0), 0);

  const dealsClosed = wonDeals.length;
  const callCount = calls?.length ?? 0;
  const closeRate = callCount > 0 ? (dealsClosed / callCount) * 100 : 0;

  const d: DashboardData = {
    totalMrr,
    totalRevenue: cashCollected,  // legacy field, alias for cash collected
    cashCollected,
    totalContractValue,
    pendingRevenue,
    activeClients: activeClients.length,
    totalClients: allClients.length,
    dealsClosed,
    callCount,
    closeRate,
    recentTx: recentTx ?? [],
    clients: allClients,
    deals: deals ?? [],
    goals: goals ?? [],
    teamCount: teamCount ?? 0,
  };

  // the coach is on FanBasis (merchant of record), not Stripe. The transactions table only holds a
  // partial early import, so for the coach show the real lifetime total pulled live from FanBasis.
  const showOffers = fanbasisEnabledFor(agencyId);
  if (showOffers) {
    try {
      const fbTotal = await fanbasisAllTimeRevenue();
      d.cashCollected = fbTotal;
      d.totalRevenue = fbTotal;
    } catch {
      /* FanBasis unreachable — keep the existing number rather than break the page */
    }
  }

  const isEmpty = d.activeClients === 0 && d.totalRevenue === 0;

  // the coach's "Analytics" page mirrors the creator's dashboard (Revenue / sales funnel / retention /
  // traffic / attribution) with a funnel + timeline filter, so the two client dashboards look
  // and track the same. Shown for a coach tenant with GA4 funnels or FanBasis configured (the coach);
  // it becomes the first/default tab, with the existing coach tabs kept after it as extras.
  const coachCfg = await loadCoachConfig(agencyId!);
  const showAnalytics = (!!coachCfg.ga4PropertyId && coachCfg.funnels.length > 0) || showOffers;
  const showWebinar = webinarjamEnabledFor(agencyId);
  // Destinations for the UTM link builder = the on-domain steps of each funnel (+ home).
  const linkDestinations = (() => {
    const seen = new Set<string>();
    const out: { label: string; url: string }[] = [];
    for (const f of coachCfg.funnels) {
      for (const s of f.steps) {
        if (!s.path || s.offsite) continue;
        const url = `https://example.com${s.path}`;
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ label: `${f.name} · ${s.label}`, url });
      }
    }
    if (!out.some((d) => d.url === "https://example.com/")) {
      out.unshift({ label: "Home", url: "https://example.com/" });
    }
    return out;
  })();
  const tabs = [
    ...(showAnalytics ? [{ key: "analytics", label: "Analytics" }, { key: "links", label: "Links" }] : []),
    ...(showWebinar ? [{ key: "webinar", label: "Webinar" }] : []),
    ...TABS,
  ];
  const initialTab = (tab ?? (showAnalytics ? "analytics" : "overview")) as string;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>{getGreeting(firstName)}</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            {isEmpty
              ? `${d.activeClients} active clients · 0 deals closed · all-time`
              : `${d.activeClients} active ${d.activeClients === 1 ? "client" : "clients"} · ${formatCurrency(totalMrr)} MRR · ${dealsClosed} deals closed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector />
          <Link
            href="/settoku-chat"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[rgba(245,245,247,0.8)] hover:text-[#F5F5F7] transition-all duration-150 hover:-translate-y-0.5"
            style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(0,131,255,0.2)",boxShadow:"0 0 16px rgba(0,131,255,0.1)"}}
          >
            <Sparkles className="size-4" style={{color:"#0083FF"}} />
            Ask AI
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <ClientTabs
        tabs={tabs}
        initialTab={initialTab}
        panels={{
          overview:  <OverviewTab d={d} />,
          ...(showAnalytics ? {
            analytics: <CoachAnalytics agencyId={agencyId!} firstName={firstName} searchParams={allParams as Record<string, string | string[] | undefined>} />,
            links: <LinkBuilder destinations={linkDestinations} />,
          } : {}),
          ...(showWebinar ? { webinar: <CoachWebinar agencyId={agencyId!} /> } : {}),
          revenue:   <RevenueTab d={d} />,
          trends:    <TrendsTab d={d} />,
          clients:   <ClientsTab d={d} />,
          pipeline:  <PipelineTab d={d} />,
          outreach:  <OutreachTab d={d} />,
          ads:       <AdsTab d={d} />,
          referrals: <ReferralsTab d={d} />,
          team:      <TeamTab d={d} />,
          cs:        <CSTab d={d} />,
        }}
      />
    </div>
  );
}

function PeriodSelector() {
  return (
    <div className="flex rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-0.5 text-xs">
      {["7d", "30d", "90d", "YTD", "All"].map((p, i) => (
        <button
          key={p}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            i === 1
              ? "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]"
              : "text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"
          }`}
        >{p}</button>
      ))}
    </div>
  );
}
