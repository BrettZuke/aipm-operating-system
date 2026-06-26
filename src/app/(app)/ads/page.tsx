import { BarChart2 } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { NewCampaignDialog } from "./new-campaign-dialog";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string,"success"|"warning"|"muted"|"primary"> = {
  draft:"muted", active:"success", paused:"warning", completed:"primary", archived:"muted",
};

const PLATFORM_COLORS: Record<string,string> = {
  meta:"text-blue-400", google:"text-emerald-400", tiktok:"text-pink-400", youtube:"text-red-400",
};

export default async function AdsPage() {
  const { supabase, agencyId } = await getAuthContext();
  const [{ data: campaigns, error }, { data: clients }] = await Promise.all([
    supabase.from("ad_campaigns").select("id,name,platform,status,budget_cents,spend_cents,client_id,created_at").eq("agency_id", agencyId!).order("created_at", { ascending: false }),
    supabase.from("clients").select("id,name").eq("agency_id", agencyId!).order("name").limit(500),
  ]);
  if (error) return <div className="text-red-300 text-sm p-4">{error.message}</div>;
  const clientMap = new Map((clients ?? []).map(c => [c.id, c.name]));

  const totalSpend = (campaigns ?? []).reduce((s,c) => s + Number(c.spend_cents ?? 0), 0) / 100;
  const totalBudget = (campaigns ?? []).reduce((s,c) => s + Number(c.budget_cents ?? 0), 0) / 100;
  const active = (campaigns ?? []).filter(c => c.status === "active").length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#F5F5F7]">Ads</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Paid ad campaigns across platforms. {campaigns?.length ?? 0} campaigns.</p>
        </div>
        <NewCampaignDialog clients={clients ?? []} />
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-4"><div className="text-xs uppercase tracking-wide text-[#6B7280] mb-2">Active campaigns</div><div className="text-2xl font-semibold text-[#F5F5F7]">{active}</div></div>
        <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-4"><div className="text-xs uppercase tracking-wide text-[#6B7280] mb-2">Total budget</div><div className="text-2xl font-semibold text-[#F5F5F7]">{formatCurrency(totalBudget)}</div></div>
        <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-4"><div className="text-xs uppercase tracking-wide text-[#6B7280] mb-2">Total spend</div><div className="text-2xl font-semibold text-[#F5F5F7]">{formatCurrency(totalSpend)}</div></div>
      </div>

      {!campaigns?.length ? (
        <EmptyState icon={BarChart2} title="No ad campaigns yet" description="Track Meta, Google, TikTok, and YouTube ad campaigns here. Connect via /edge/integrations." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
              <th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Client</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Spend / Budget</th>
            </tr></thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
              {campaigns.map(c => {
                const spend = Number(c.spend_cents ?? 0) / 100;
                const budget = Number(c.budget_cents ?? 0) / 100;
                const pct = budget > 0 ? (spend / budget) * 100 : 0;
                return (
                  <tr key={c.id} className="hover:bg-[#0C0C10]/40">
                    <td className="px-4 py-3 font-medium text-[#F5F5F7]">{c.name}</td>
                    <td className="px-4 py-3 capitalize"><span className={PLATFORM_COLORS[c.platform] ?? "text-[#9CA3AF]"}>{c.platform}</span></td>
                    <td className="px-4 py-3 text-[#9CA3AF]">{c.client_id ? clientMap.get(c.client_id) ?? "—" : "—"}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[c.status ?? "draft"]}>{c.status ?? "draft"}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-mono text-xs text-[#F5F5F7]">{formatCurrency(spend)} / {formatCurrency(budget)}</div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]"><div className="h-full bg-blue-500" style={{ width: `${pct}%` }} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
