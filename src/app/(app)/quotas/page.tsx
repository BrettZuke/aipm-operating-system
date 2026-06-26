import { Trophy, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { formatCurrency, initialsFromName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Period = "all" | "weekly" | "monthly" | "quarterly";
type Scope = "all" | "individual" | "role" | "team";

const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "All" },
  { key: "weekly", label: "Week" },
  { key: "monthly", label: "Month" },
  { key: "quarterly", label: "Quarter" },
];
const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "individual", label: "Individual" },
  { key: "role", label: "Role" },
  { key: "team", label: "Team" },
];

export default async function QuotasPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: Period; scope?: Scope }>;
}) {
  const { period = "all", scope = "all" } = await searchParams;
  const { supabase, agencyId } = await getAuthContext();

  const startOfMonth = (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  const [{ data: quotas }, { data: members }, { data: monthTx }] =
    await Promise.all([
      supabase
        .from("quotas")
        .select("id,member_id,target_amount,currency,period")
        .eq("agency_id", agencyId!),
      supabase
        .from("agency_members")
        .select("user_id,profiles(id,full_name,email)")
        .eq("agency_id", agencyId!)
        .eq("status", "active"),
      supabase
        .from("transactions")
        .select("amount,kind,member_id")
        .eq("agency_id", agencyId!)
        .gte("occurred_at", startOfMonth)
        .eq("kind", "payment"),
    ]);

  const profileMap = new Map<string, string>();
  for (const m of members ?? []) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (p) profileMap.set(m.user_id, p.full_name ?? p.email ?? "Unknown");
  }

  const earnedMap = new Map<string, number>();
  for (const t of monthTx ?? []) {
    if (!t.member_id) continue;
    earnedMap.set(
      t.member_id,
      (earnedMap.get(t.member_id) ?? 0) + Number(t.amount ?? 0),
    );
  }

  // Filter by period/scope
  const filtered = (quotas ?? []).filter((q) => {
    if (period !== "all" && q.period !== period) return false;
    return true;
  });

  const rows = filtered.map((q) => ({
    id: q.id,
    memberId: q.member_id,
    memberName: profileMap.get(q.member_id) ?? "Unknown",
    target: Number(q.target_amount),
    earned: earnedMap.get(q.member_id) ?? 0,
    currency: q.currency ?? "USD",
    period: q.period,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#F5F5F7]">Quotas & KPIs</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            Set targets, track progress, and reward performance.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
          <Plus className="size-4" /> New quota
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
            PERIOD
          </span>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <a
                key={p.key}
                href={`?period=${p.key}&scope=${scope}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  period === p.key
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/60 text-[#9CA3AF] hover:border-[rgba(255,255,255,0.18)] hover:text-[#F5F5F7]"
                }`}
              >
                {p.label}
              </a>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
            SCOPE
          </span>
          <div className="flex gap-1">
            {SCOPES.map((s) => (
              <a
                key={s.key}
                href={`?period=${period}&scope=${s.key}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  scope === s.key
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/60 text-[#9CA3AF] hover:border-[rgba(255,255,255,0.18)] hover:text-[#F5F5F7]"
                }`}
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {!rows.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] mb-4">
            <Trophy className="size-6 text-[#6B7280]" />
          </div>
          <div className="text-base font-medium text-[rgba(245,245,247,0.8)]">
            No quotas yet
          </div>
          <p className="mt-1 max-w-sm text-sm text-[#9CA3AF]">
            Create quotas to set targets and track your team&apos;s performance.
          </p>
          <button className="mt-6 flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            <Plus className="size-4" /> Create first quota
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const pct =
              r.target > 0
                ? Math.min(100, (r.earned / r.target) * 100)
                : 0;
            const ahead = pct >= 100;
            return (
              <article
                key={r.id}
                className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-5"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex size-8 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-xs font-semibold text-[#F5F5F7]">
                    {initialsFromName(r.memberName)}
                  </div>
                  <div>
                    <div className="font-medium text-[#F5F5F7]">
                      {r.memberName}
                    </div>
                    <div className="text-xs text-[#6B7280] capitalize">
                      {r.period} quota
                    </div>
                  </div>
                  <div
                    className={`ml-auto text-sm font-mono font-semibold ${
                      pct >= 100
                        ? "text-emerald-400"
                        : pct >= 70
                          ? "text-amber-400"
                          : "text-[#9CA3AF]"
                    }`}
                  >
                    {pct.toFixed(0)}%
                  </div>
                </div>
                <div className="flex items-baseline justify-between text-sm mb-2">
                  <span className="text-[#9CA3AF]">
                    {formatCurrency(r.earned, r.currency)} earned
                  </span>
                  <span className="text-[#6B7280]">
                    / {formatCurrency(r.target, r.currency)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                  <div
                    className={`h-full transition-all ${
                      ahead
                        ? "bg-emerald-500"
                        : pct >= 70
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
