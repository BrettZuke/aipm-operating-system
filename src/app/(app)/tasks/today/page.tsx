import Link from "next/link";
import { Calendar, Flame, Clock, Plus, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { StatCard, Section, EmptyPanel } from "../../dashboard/tabs";

export const dynamic = "force-dynamic";

function getVibeTagline(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "still locked in";
  if (hour < 9) return "early bird";
  if (hour < 12) return "morning grind";
  if (hour < 17) return "deep work hours";
  if (hour < 20) return "closing strong";
  if (hour < 23) return "evening flow";
  return "still locked in";
}

function getEodCutdown(): { text: string; expired: boolean } {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setHours(20, 0, 0, 0); // 8:00pm
  const diff = cutoff.getTime() - now.getTime();
  if (diff <= 0) return { text: "EOD cutoff passed", expired: true };
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return { text: `${hours}h ${minutes}m to cutoff at 8:00 pm`, expired: false };
}

export default async function TodayPage() {
  const { supabase, user, agencyId } = await getAuthContext();
  const today = new Date();
  const startOfDay = new Date(today); startOfDay.setHours(0,0,0,0);
  const startOfTomorrow = new Date(today); startOfTomorrow.setHours(24,0,0,0);
  const endOfTomorrow = new Date(today); endOfTomorrow.setHours(48,0,0,0);

  const [{ data: todayTasks }, { data: tomorrowTasks }, { data: eodReports }, { data: goals }] = await Promise.all([
    supabase.from("tasks")
      .select("id,title,priority,status,due_date")
      .eq("assignee_id", user.id)
      .gte("due_date", startOfDay.toISOString())
      .lt("due_date", startOfTomorrow.toISOString()),
    supabase.from("tasks")
      .select("id,title,priority,due_date")
      .eq("assignee_id", user.id)
      .gte("due_date", startOfTomorrow.toISOString())
      .lt("due_date", endOfTomorrow.toISOString()),
    supabase.from("eod_reports")
      .select("id,submitted_at")
      .eq("member_id", user.id)
      .gte("submitted_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("submitted_at", { ascending: false }),
    supabase.from("goals")
      .select("id,name,target_value,current_value")
      .eq("agency_id", agencyId!)
      .limit(3),
  ]);

  const todayList = todayTasks ?? [];
  const tomorrowList = tomorrowTasks ?? [];
  const overdue = todayList.filter(t => t.status !== "done" && new Date(t.due_date ?? Date.now()) < new Date()).length;
  const completed = todayList.filter(t => t.status === "done").length;

  // EOD streak — compute consecutive days with reports going back from today
  const reportDates = new Set((eodReports ?? []).map(r => new Date(r.submitted_at).toDateString()));
  let streak = 0;
  for (let i = 0; i < 14; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (reportDates.has(d.toDateString())) streak++;
    else if (i > 0) break; // allow today to not be submitted yet
  }

  const submittedToday = reportDates.has(new Date().toDateString());
  const cutdown = getEodCutdown();

  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = today.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const firstName = user.user_metadata?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">TODAY · {dayName.toUpperCase()}, {monthDay.toUpperCase()}</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>
            Today, {firstName} · {getVibeTagline()}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.10)] px-3 py-2 text-sm text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.06)]">
            <Calendar className="size-3.5" /> Plan tomorrow
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
            <Plus className="size-3.5" /> Add to today
          </button>
        </div>
      </div>

      {/* 4-card stat strip */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Today's tasks" value={`${completed}/${todayList.length}`} sub={overdue > 0 ? `${overdue} overdue` : "On track"} accent />
        <StatCard label="Tomorrow" value={String(tomorrowList.length)} sub={tomorrowList.length === 0 ? "Nothing scheduled" : "Pre-loaded"} />
        <StatCard label="EOD streak" value={`${streak}`} sub={streak > 0 ? `${streak} consecutive day${streak === 1 ? "" : "s"}` : "Start a streak"} />
        <StatCard label={submittedToday ? "EOD submitted" : "EOD check-in"} value={submittedToday ? "✓" : cutdown.text.split(" ")[0] + " " + cutdown.text.split(" ")[1]} sub={submittedToday ? "Locked in" : "Cutoff at 8:00 pm"} />
      </div>

      {/* 01 · Focus */}
      <Section num="01" title="Focus" sub={`${todayList.length} tasks · ${overdue} overdue · ${completed} done`}>
        {todayList.length === 0 ? (
          <EmptyPanel icon={CheckCircle2} title="Inbox zero" sub="Nothing on the list for today. Plan tomorrow or add what you intend to ship." />
        ) : (
          <div className="space-y-2">
            {todayList.map(t => {
              const isOverdue = t.status !== "done" && new Date(t.due_date ?? Date.now()) < new Date();
              return (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`size-4 rounded-full border-2 ${t.status === "done" ? "bg-emerald-500 border-emerald-500" : isOverdue ? "border-red-500" : "border-[rgba(255,255,255,0.3)]"}`}>
                      {t.status === "done" && <CheckCircle2 className="size-4 text-white" />}
                    </div>
                    <span className={`text-sm ${t.status === "done" ? "text-[#6B7280] line-through" : "text-[#F5F5F7]"}`}>{t.title}</span>
                    {isOverdue && <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">Overdue</span>}
                  </div>
                  <span className="text-xs text-[#6B7280] capitalize">{t.priority ?? "medium"}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 02 · Tomorrow */}
      <Section num="02" title="Tomorrow" sub={`${tomorrowList.length} task${tomorrowList.length === 1 ? "" : "s"} pre-loaded`} action={
        <Link href="/tasks/all" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
          View week <ArrowRight className="size-3" />
        </Link>
      }>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">Calendar not connected</span>
            <span className="text-xs text-[#9CA3AF]">Connect Google or Outlook to see meetings.</span>
          </div>
          {tomorrowList.length === 0 ? (
            <p className="text-sm text-[#6B7280] text-center py-6">Tomorrow is clear. Plan it ahead of time and you'll thank yourself.</p>
          ) : (
            <div className="space-y-2">
              {tomorrowList.map(t => (
                <div key={t.id} className="flex items-center justify-between rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0C0C10]/50 px-3 py-2">
                  <span className="text-sm text-[rgba(245,245,247,0.8)]">{t.title}</span>
                  <span className="text-xs text-[#6B7280] capitalize">{t.priority ?? "medium"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* 03 · Daily commitments */}
      <Section num="03" title="Daily commitments" sub="Pulled from active goals.">
        {(goals ?? []).length === 0 ? (
          <EmptyPanel icon={Flame} title="No goals set" sub="Set a goal at /goals — daily commitments are derived from your active targets." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {(goals ?? []).map(g => {
              const pct = g.target_value && Number(g.target_value) > 0
                ? Math.min(100, (Number(g.current_value ?? 0) / Number(g.target_value)) * 100) : 0;
              return (
                <div key={g.id} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4">
                  <div className="text-sm font-medium text-[#F5F5F7]">{g.name}</div>
                  <div className="mt-3 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                    <div className="h-full rounded-full bg-[#0083FF]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-[#9CA3AF] tabular-nums">{Number(g.current_value ?? 0)} / {Number(g.target_value ?? 0)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 04 · End of day */}
      <Section num="04" title="End of day" sub={cutdown.text}>
        <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
          <div className="flex items-start gap-3">
            {submittedToday ? (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="size-5 shrink-0 text-amber-400 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium text-[#F5F5F7]">
                {submittedToday ? "Submitted today — nice work" : "Pre-fill: Drop notes on wins, blockers, tomorrow's top three when you submit."}
              </div>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                EOD reports keep the team in sync. {streak > 0 && `${streak}-day streak going — keep it.`}
              </p>
            </div>
            <Link href="/sales/eod" className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 whitespace-nowrap">
              {submittedToday ? "View report" : "Submit EOD"}
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
