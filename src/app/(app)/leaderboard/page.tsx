import { getAuthContext } from "@/lib/auth";
import { formatCurrency, initialsFromName } from "@/lib/utils";
import { getCloser, getStudents, breakdownByCloser, salesSheetIdFor } from "@/lib/sheets-data";

export const dynamic = "force-dynamic";

type Period = "today" | "week" | "month" | "all";
type View = "team" | "closers" | "setters" | "dialers";

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All-time" },
];

function periodSince(p: Period): string | null {
  const now = new Date();
  if (p === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (p === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (p === "month") {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  return null;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: Period; view?: View }>;
}) {
  const { period = "month", view = "team" } = await searchParams;
  const { supabase, agencyId, user: currentUser } = await getAuthContext();

  const since = periodSince(period);
  let txQuery = supabase
    .from("transactions")
    .select("amount,kind,member_id")
    .eq("agency_id", agencyId!);
  if (since) txQuery = txQuery.gte("occurred_at", since);

  const [{ data: transactions }, { data: members }, { data: calls }] =
    await Promise.all([
      txQuery,
      supabase
        .from("agency_members")
        .select("user_id,role,profiles(id,full_name,email,avatar_url)")
        .eq("agency_id", agencyId!)
        .eq("status", "active"),
      supabase
        .from("calls")
        .select("member_id,outcome,occurred_at")
        .eq("agency_id", agencyId!)
        .gte(
          "occurred_at",
          since ?? new Date(0).toISOString(),
        ),
    ]);

  // Aggregate stats per member
  const revenueMap = new Map<string, number>();
  for (const t of transactions ?? []) {
    if (!t.member_id || t.kind !== "payment") continue;
    revenueMap.set(
      t.member_id,
      (revenueMap.get(t.member_id) ?? 0) + Number(t.amount ?? 0),
    );
  }

  // "Deals closed" = won calls, NOT payment count (recurring installments would each count as a
  // deal and push close rate past 100%). "Shows" = calls that actually happened — exclude
  // no-shows / cancellations / unheld bookings — so closeRate = won / shows stays ≤ 100%.
  const NOT_HELD = new Set(["booked", "no_show", "no-show", "noshow", "cancelled", "canceled", "rescheduled"]);
  const apptMap = new Map<string, number>();
  const dealMap = new Map<string, number>();
  const showMap = new Map<string, number>();
  for (const c of calls ?? []) {
    if (!c.member_id) continue;
    const o = (c.outcome ?? "").toLowerCase();
    if (o === "booked") apptMap.set(c.member_id, (apptMap.get(c.member_id) ?? 0) + 1);
    if (o === "won") dealMap.set(c.member_id, (dealMap.get(c.member_id) ?? 0) + 1);
    if (!NOT_HELD.has(o)) showMap.set(c.member_id, (showMap.get(c.member_id) ?? 0) + 1);
  }

  const rows: {
    userId: string;
    name: string;
    title: string;
    revenue: number;
    deals: number;
    closeRate: number;
    isYou: boolean;
  }[] = [];

  for (const m of members ?? []) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (!p) continue;
    const revenue = revenueMap.get(m.user_id) ?? 0;
    const deals = dealMap.get(m.user_id) ?? 0;
    const shows = showMap.get(m.user_id) ?? 0;
    const closeRate = shows > 0 ? (deals / shows) * 100 : 0;
    rows.push({
      userId: m.user_id,
      name: p.full_name ?? p.email ?? "Unknown",
      title: m.role.charAt(0).toUpperCase() + m.role.slice(1),
      revenue,
      deals,
      closeRate,
      isYou: m.user_id === currentUser.id,
    });
  }
  // Sheet-owner (the coach): the Supabase transactions/calls tables are empty — real closer performance
  // lives in the Closer sheet. Rebuild the ranking from it (cash collected + closes per closer).
  const sheetId = salesSheetIdFor(agencyId);
  if (sheetId) {
    const [closerSheet, studentsSheet] = await Promise.all([getCloser(sheetId), getStudents(sheetId)]);
    const cb = breakdownByCloser(closerSheet, studentsSheet);
    rows.length = 0;
    for (const c of cb) {
      rows.push({ userId: c.name, name: c.name, title: "Closer", revenue: c.cash, deals: c.closed, closeRate: c.closeRate * 100, isYou: false });
    }
  }
  rows.sort((a, b) => b.revenue - a.revenue);

  // Aggregate team stats
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const avgCloseRate =
    rows.length > 0
      ? rows.reduce((s, r) => s + r.closeRate, 0) / rows.length
      : 0;

  // Top 3 for podium
  const [first, second, third] = rows;

  const PAYOUT_MULTIPLIERS = [
    { label: "Gold", multiplier: "1.15+", color: "text-amber-400" },
    { label: "Silver", multiplier: "1.08+", color: "text-[#9CA3AF]" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">
          REVENUE · LEADERBOARD
        </div>
        <div className="mt-1 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#F5F5F7]">
              Team scoreboard
            </h1>
            <p className="mt-1 text-sm text-[#9CA3AF]">
              Who&apos;s closing, who&apos;s climbing. Ranks update in
              real-time as Settoku syncs new activity. Gold medals carry to
              payout multipliers on the 1st.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.10)] px-3 py-2 text-sm text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.06)]">
              📢 Broadcast
            </button>
            <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
              ⊕ Set quota
            </button>
          </div>
        </div>
      </div>

      {/* View tabs + period tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-1">
          {(["team", "closers", "setters", "dialers"] as View[]).map((v) => (
            <a
              key={v}
              href={`?period=${period}&view=${v}`}
              className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                view === v
                  ? "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]"
                  : "text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </a>
          ))}
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <a
              key={p.key}
              href={`?period=${p.key}&view=${view}`}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                period === p.key
                  ? "border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]"
                  : "border-[rgba(255,255,255,0.08)] bg-transparent text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
      </div>

      {/* Stat cards with sparklines */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: "Team revenue",
            value: formatCurrency(totalRevenue),
            delta: `${rows.length} ${rows.length === 1 ? "rep" : "reps"}`,
            positive: false,
            sparkColor: "stroke-blue-500",
          },
          {
            label: "Team close rate",
            value: `${avgCloseRate.toFixed(1)}%`,
            delta: `avg across ${rows.length} ${rows.length === 1 ? "rep" : "reps"}`,
            positive: false,
            sparkColor: "stroke-emerald-500",
          },
          {
            label: "Quota attainment",
            value: rows.length === 0 ? "—" : "0%",
            delta: "+6.2p  tracking towards…",
            positive: true,
            sparkColor: "stroke-amber-500",
          },
          {
            label: "Current top streak",
            value: "0 days",
            delta: "Record: — days (RF)",
            positive: false,
            sparkColor: "stroke-purple-500",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="relative overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-4"
          >
            {/* Sparkline decoration */}
            <svg
              className="absolute right-0 bottom-0 h-12 w-24 opacity-30"
              viewBox="0 0 96 48"
              preserveAspectRatio="none"
            >
              <polyline
                points="0,40 24,30 48,20 72,28 96,8"
                fill="none"
                className={s.sparkColor}
                strokeWidth="2"
              />
            </svg>
            <div className="text-xs text-[#6B7280]">{s.label}</div>
            <div className="mt-2 text-2xl font-bold text-[#F5F5F7]">
              {s.value}
            </div>
            <div
              className={`mt-1 flex items-center gap-1 text-[11px] ${
                s.positive ? "text-emerald-400" : "text-[#6B7280]"
              }`}
            >
              {s.positive && <span>↑</span>}
              {s.delta}
            </div>
          </div>
        ))}
      </div>

      {/* This month's leaders / Podium */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 py-16 text-center">
          <p className="text-sm text-[#9CA3AF]">No entries yet</p>
          <p className="mt-1 text-xs text-[#6B7280]">
            Revenue data will appear once transactions are logged.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="font-semibold text-[#F5F5F7]">
                Podium · top 3
              </div>
              <div className="text-xs text-[#6B7280]">
                Top three by revenue closed · MTD
              </div>
            </div>
            <div className="flex gap-2">
              <select className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] px-3 py-1.5 text-xs text-[rgba(245,245,247,0.8)]">
                <option>Revenue</option>
              </select>
              <select className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] px-3 py-1.5 text-xs text-[rgba(245,245,247,0.8)]">
                <option>MTD</option>
              </select>
            </div>
          </div>

          {/* Podium — 2nd, 1st, 3rd */}
          <div className="flex items-end justify-center gap-4">
            {/* 2nd place */}
            {second && (
              <PodiumCard
                rank={2}
                name={second.name}
                title={second.title}
                revenue={second.revenue}
                closeRate={second.closeRate}
                deals={second.deals}
                isYou={second.isYou}
                height="h-36"
                medal="🥈"
                bgColor="bg-[rgba(255,255,255,0.06)]/60"
                borderColor="border-[rgba(255,255,255,0.18)]"
              />
            )}

            {/* 1st place — taller */}
            {first && (
              <PodiumCard
                rank={1}
                name={first.name}
                title={first.title}
                revenue={first.revenue}
                closeRate={first.closeRate}
                deals={first.deals}
                isYou={first.isYou}
                height="h-44"
                medal="🥇"
                bgColor="bg-amber-500/10"
                borderColor="border-amber-500/40"
              />
            )}

            {/* 3rd place */}
            {third && (
              <PodiumCard
                rank={3}
                name={third.name}
                title={third.title}
                revenue={third.revenue}
                closeRate={third.closeRate}
                deals={third.deals}
                isYou={third.isYou}
                height="h-32"
                medal="🥉"
                bgColor="bg-[rgba(255,255,255,0.06)]/40"
                borderColor="border-[rgba(255,255,255,0.10)]"
              />
            )}
          </div>

          {/* Payout multipliers */}
          <div className="mt-6 flex gap-6 border-t border-[rgba(255,255,255,0.08)] pt-4">
            {PAYOUT_MULTIPLIERS.map((pm) => (
              <div key={pm.label} className="flex items-center gap-2 text-xs">
                <span>{pm.label === "Gold" ? "🥇" : "🥈"}</span>
                <span className={`font-medium ${pm.color}`}>
                  {pm.label} →
                </span>
                <span className="text-[#6B7280]">
                  {pm.multiplier} payout multiplier
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 03 · Notable */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">03 · NOTABLE</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Biggest single deal</div>
              {rows[0] ? <>
                <div className="text-sm font-semibold text-[#F5F5F7]">{rows[0].name}</div>
                <div className="mt-1 text-lg font-bold text-[#F5F5F7]">{formatCurrency(Math.max(...rows.map(r => r.revenue)))}</div>
              </> : <div className="text-sm text-[#6B7280]">No deals yet</div>}
            </div>
            <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Most improved</div>
              <div className="text-sm text-[#9CA3AF]">Tracks week-over-week change once 2+ weeks of data accrue.</div>
            </div>
            <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-2">Hot streak</div>
              <div className="text-sm text-[#9CA3AF]">Rep with the longest consecutive days of activity.</div>
            </div>
          </div>
        </div>
      )}

      {/* 04 · Full table */}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60">
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">04 · FULL RANKING</span>
            <div className="flex items-center gap-3">
              <input placeholder="Search reps…" className="h-8 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-3 text-xs text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-1 focus:ring-blue-500 w-40" />
              <span className="text-xs text-[#9CA3AF]">{rows.length} reps</span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)] text-left text-[11px] font-medium text-[#9CA3AF]">
                {[
                  "Rank",
                  "Member",
                  "Deals Closed",
                  "Revenue Generated",
                  "Close Rate",
                  "TREND",
                ].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
              {rows.slice(3).map((r, idx) => (
                <tr
                  key={r.userId}
                  className={`hover:bg-[#0C0C10]/40 ${r.isYou ? "bg-blue-500/5" : ""}`}
                >
                  <td className="px-4 py-3 text-sm text-[#9CA3AF]">
                    {idx + 4}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-[10px] font-semibold text-[#F5F5F7]">
                        {initialsFromName(r.name)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[#F5F5F7]">
                          {r.name}
                        </div>
                        <div className="text-xs text-[#9CA3AF]">
                          {r.title}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[rgba(245,245,247,0.8)]">{r.deals}</td>
                  <td className="px-4 py-3 font-mono text-[#F5F5F7]">
                    {formatCurrency(r.revenue)}
                  </td>
                  <td className="px-4 py-3 text-[rgba(245,245,247,0.8)]">
                    {r.closeRate.toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-[#6B7280]">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PodiumCard({
  rank,
  name,
  title,
  revenue,
  closeRate,
  deals,
  isYou,
  height,
  medal,
  bgColor,
  borderColor,
}: {
  rank: number;
  name: string;
  title: string;
  revenue: number;
  closeRate: number;
  deals: number;
  isYou: boolean;
  height: string;
  medal: string;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {/* Avatar + medal */}
      <div className="relative">
        <div className="flex size-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-base font-bold text-[#F5F5F7]">
          {initialsFromName(name)}
        </div>
        <span className="absolute -bottom-1 -right-1 text-base">{medal}</span>
      </div>

      {/* Name + title */}
      <div className="text-center">
        <div
          className={`text-sm font-semibold ${isYou ? "text-blue-300" : "text-[#F5F5F7]"}`}
        >
          {name}
        </div>
        <div className="text-xs text-[#6B7280]">{title}</div>
      </div>

      {/* Card */}
      <div
        className={`flex w-40 flex-col items-center justify-center rounded-xl border ${borderColor} ${bgColor} p-4 text-center ${height}`}
      >
        <div className="text-xl font-bold text-[#F5F5F7]">
          {formatCurrency(revenue)}
        </div>
        <div className="mt-1 text-xs text-[#9CA3AF]">closed</div>
        <div className="mt-2 flex items-center gap-2 text-xs text-[#6B7280]">
          <span>{closeRate.toFixed(0)}% rate</span>
          {deals > 0 && (
            <span className="rounded bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 font-mono">
              {deals}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
