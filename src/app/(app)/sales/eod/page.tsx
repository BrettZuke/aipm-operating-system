import Link from "next/link";
import { Trophy, TrendingUp, Sparkles, AlertTriangle, Search } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { initialsFromName } from "@/lib/utils";
import { Section, EmptyPanel } from "../../dashboard/tabs";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default async function EodReportsPage() {
  const { supabase, agencyId } = await getAuthContext();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: todayReports }, { data: members }] = await Promise.all([
    supabase.from("eod_reports").select("id,member_id,responses,submitted_at").eq("agency_id", agencyId!).eq("report_date", today),
    supabase.from("agency_members").select("user_id,role,profiles(id,full_name,email)").eq("agency_id", agencyId!).eq("status", "active"),
  ]);

  const submittedIds = new Set((todayReports ?? []).map(r => r.member_id));
  const totalReps = members?.length ?? 0;
  const submittedCount = todayReports?.length ?? 0;
  const submissionRate = totalReps > 0 ? (submittedCount / totalReps) * 100 : 0;
  const overdue = totalReps - submittedCount;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">SALES · END-OF-DAY</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]">Daily check-ins</h1>
          <p className="mt-1 text-sm text-[#9CA3AF] max-w-xl">Review submitted reports and track team compliance. Every rep submits a day-in-review by 8pm: metrics, highlights, blockers, and tomorrow's plan.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-3 py-1.5 text-xs text-[#9CA3AF]">
            📅 {formatDate(new Date())} · closes 8:00 PM
          </div>
          <Link href="/eod-templates" className="rounded-lg border border-[rgba(255,255,255,0.10)] px-3 py-1.5 text-xs text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.06)]">Edit template</Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[rgba(255,255,255,0.08)]">
        {[{ label: "Today", count: submittedCount }, { label: "History", count: 0 }].map((t, i) => (
          <button key={t.label} className={`flex items-center gap-2 border-b-2 px-4 pb-3 text-sm font-medium ${i === 0 ? "border-blue-500 text-[#F5F5F7]" : "border-transparent text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"}`}>
            {t.label}
            <span className={`rounded-full px-1.5 text-[10px] font-semibold ${i === 0 ? "bg-blue-500 text-white" : "bg-[rgba(255,255,255,0.06)] text-[#6B7280]"}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "REPORTS TODAY", value: `${submittedCount}`, sub: `/ ${totalReps}`, badge: submittedCount === 0 ? "0%" : `${submissionRate.toFixed(0)}%`, badgeColor: "text-red-400 bg-red-500/10" },
          { label: "SUBMISSION RATE", value: `${submissionRate.toFixed(0)}%`, sub: `Target 100% · ${formatDate(new Date())}`, badge: "needs nudge", badgeColor: "text-orange-400" },
          { label: "TEAM-LONGEST STREAK", value: "0d", sub: "consecutive days", badge: undefined, badgeColor: undefined },
          { label: "OVERDUE", value: String(overdue), sub: `${overdue} haven't submitted yet`, textColor: overdue > 0 ? "text-amber-400" : "text-[#F5F5F7]" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">{s.label}</div>
            <div className={`mt-2 text-2xl font-semibold ${(s as any).textColor ?? "text-[#F5F5F7]"}`}>
              {s.value} {s.sub?.startsWith("/") && <span className="text-base text-[#6B7280]">{s.sub}</span>}
            </div>
            {!(s.sub?.startsWith("/")) && <div className="mt-0.5 text-xs text-[#6B7280]">{s.sub}</div>}
            {s.badge && <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.badgeColor}`}>• {s.badge}</span>}
          </div>
        ))}
      </div>

      {/* Compliance */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">COMPLIANCE · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#F5F5F7]">{submissionRate.toFixed(0)}%</span>
              <span className="text-sm text-[#9CA3AF]">{submittedCount} / {totalReps} reps</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" defaultValue={today} className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] px-3 py-1.5 text-sm text-[rgba(245,245,247,0.8)] focus:outline-none" />
            {overdue > 0 && (
              <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
                ✦ Nudge {overdue} late
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Submission status by rep */}
      <div>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-[#F5F5F7]">Submission status by rep</h2>
          <div className="text-xs text-[#6B7280]">{totalReps} rep{totalReps !== 1 ? "s" : ""} · cutoff 8:00 PM</div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 divide-y divide-[rgba(255,255,255,0.08)]">
          {(members ?? []).map(m => {
            const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            const name = p?.full_name ?? p?.email ?? "Unknown";
            const submitted = submittedIds.has(m.user_id);
            return (
              <div key={m.user_id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-sm font-semibold text-[#F5F5F7]">{initialsFromName(name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#F5F5F7]">{name}</div>
                  <div className="text-xs text-[#6B7280] capitalize">{m.role}</div>
                </div>
                {submitted ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-400" />Submitted</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-[#6B7280]"><span className="size-1.5 rounded-full bg-[rgba(255,255,255,0.15)]" />Missing</span>
                )}
              </div>
            );
          })}
          {!members?.length && <div className="px-5 py-6 text-center text-sm text-[#6B7280]">No team members yet.</div>}
        </div>
      </div>

      {/* 02 · Streak leaderboard */}
      <Section num="02" title="Streak leaderboard" sub="Consecutive days submitted — who's been showing up.">
        {!members?.length ? (
          <EmptyPanel icon={Trophy} title="No reps yet" sub="Once your team starts submitting, the streak board lights up." />
        ) : (
          <div className="space-y-2">
            {(members ?? []).slice(0, 5).map((m, i) => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              const name = p?.full_name ?? p?.email ?? "Unknown";
              return (
                <div key={m.user_id} className="flex items-center gap-3 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    i === 0 ? "bg-amber-500/20 text-amber-400" : i === 1 ? "bg-[rgba(255,255,255,0.15)] text-[#F5F5F7]" : "bg-[rgba(255,255,255,0.06)] text-[#9CA3AF]"
                  }`}>{i + 1}</div>
                  <div className="flex size-7 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-xs font-semibold text-[#F5F5F7]">{initialsFromName(name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#F5F5F7]">{name}</div>
                    <div className="text-xs text-[#6B7280] capitalize">{m.role}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#F5F5F7] tabular-nums">{submittedIds.has(m.user_id) ? "1" : "0"}</div>
                    <div className="text-[10px] text-[#6B7280]">day streak</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 03 · Compliance trend */}
      <Section num="03" title="Compliance trend" sub="Submission patterns over time.">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="text-sm font-semibold text-[#F5F5F7] mb-3">By role · last 30 days</div>
            <EmptyPanel icon={TrendingUp} title="Need 30+ days" sub="Stacked compliance chart populates as reports accrue." />
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="text-sm font-semibold text-[#F5F5F7] mb-3">Daily volume · last 30 days</div>
            <EmptyPanel icon={TrendingUp} title="Need 30+ days" sub="Daily submission volume bars appear here." />
          </div>
        </div>
      </Section>

      {/* 05 · Today's signals */}
      <Section num="05" title="Today's signals" sub="What the reports said.">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="size-4 text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Wins worth amplifying</span>
            </div>
            {submittedCount === 0 ? (
              <p className="text-sm text-[#9CA3AF]">No reports yet today. Wins surface here once reps submit.</p>
            ) : (
              <p className="text-sm text-[#9CA3AF]">{submittedCount} submission{submittedCount === 1 ? "" : "s"} so far. AI extracts highlights when reports include narrative.</p>
            )}
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="size-4 text-amber-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Blockers needing attention</span>
            </div>
            {submittedCount === 0 ? (
              <p className="text-sm text-[#9CA3AF]">No reports yet today.</p>
            ) : (
              <p className="text-sm text-[#9CA3AF]">No blockers flagged. AI surfaces patterns from blocker fields automatically.</p>
            )}
          </div>
        </div>
      </Section>

      {/* 06 · Submissions feed */}
      <Section num="06" title="Submissions feed" sub="Browse the actual reports.">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" />
            <input placeholder="Search reports…" className="h-9 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 pl-9 pr-3 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          </div>
          <div className="flex gap-1.5">
            {["All", "Closers", "Setters", "Dialers"].map((t, i) => (
              <button key={t} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                i === 0 ? "border-[rgba(0,131,255,0.30)] bg-[rgba(0,131,255,0.10)] text-blue-400" : "border-[rgba(255,255,255,0.08)] text-[#9CA3AF] hover:text-[#F5F5F7]"
              }`}>{t}</button>
            ))}
          </div>
        </div>
        {submittedCount === 0 ? (
          <EmptyPanel icon={TrendingUp} title="No submissions today" sub="Reports show here as reps submit them." />
        ) : (
          <div className="space-y-2">
            {(todayReports ?? []).map(r => {
              const m = (members ?? []).find(mb => mb.user_id === r.member_id);
              const p = m ? (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) : null;
              const name = p?.full_name ?? p?.email ?? "Unknown";
              return (
                <div key={r.id} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-xs font-semibold text-[#F5F5F7]">{initialsFromName(name)}</div>
                      <div>
                        <div className="text-sm font-medium text-[#F5F5F7]">{name}</div>
                        <div className="text-xs text-[#6B7280] capitalize">{m?.role ?? ""}</div>
                      </div>
                    </div>
                    <span className="text-xs text-[#6B7280]">{new Date(r.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
