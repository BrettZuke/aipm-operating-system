import { FileText, Calendar, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { Section } from "../dashboard/tabs";

export const dynamic = "force-dynamic";

const TEMPLATES = [
  {
    key: "weekly",   title: "Weekly review",       desc: "What changed this week — revenue, pipeline, team performance.",
    cadence: "Weekly · auto-runs Monday 8am", variants: ["Operational", "Board deck"],
  },
  {
    key: "monthly",  title: "Monthly business review", desc: "Full-month snapshot: KPIs, deltas, pipeline health, team execution.",
    cadence: "Monthly · auto-runs on the 1st", variants: ["Operational", "Board deck"],
  },
  {
    key: "quarterly", title: "Quarterly business review", desc: "Strategic quarterly: themes, wins, risks, what's next.",
    cadence: "Quarterly · manual trigger", variants: ["Operational", "Board deck"],
  },
  {
    key: "sales-perf", title: "Sales team performance", desc: "Per-rep activity, calls, deals, attainment, commissions.",
    cadence: "Weekly", variants: ["Operational"],
  },
  {
    key: "client-recap", title: "Client recap", desc: "Client-facing summary of work done, results delivered, next steps.",
    cadence: "Per-client · manual", variants: ["Operational", "Board deck"],
  },
  {
    key: "ad-perf", title: "Ad performance", desc: "Spend, ROAS, leads, by platform — for marketing reviews.",
    cadence: "Weekly", variants: ["Operational"],
  },
  {
    key: "custom", title: "Custom report", desc: "Roll your own. Pick metrics, timeframe, and audience.",
    cadence: "Ad hoc", variants: ["Operational", "Board deck"],
  },
];

const SCHEDULED = [
  { template: "Weekly review",       cadence: "Every Monday at 8:00am", recipients: "Owners, managers" },
  { template: "Monthly business review", cadence: "1st of every month", recipients: "Founders, finance" },
  { template: "Quarterly business review", cadence: "1st of each quarter", recipients: "Board, executives" },
];

export default async function ReportsPage() {
  const { supabase, agencyId } = await getAuthContext();
  const { data: reports } = await supabase.from("reports").select("id,name,created_at").eq("agency_id", agencyId!).order("created_at", { ascending: false }).limit(10);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">INSIGHTS · DELIVERABLES</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Reports</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Weekly and monthly reports — operational for your team, presentation for your board.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.10)] px-3 py-2 text-sm text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.06)]">
            <Calendar className="size-3.5" /> Manage schedule
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
            <Plus className="size-3.5" /> New report
          </button>
        </div>
      </div>

      <Section num="02" title="Scheduled" sub="Reports that auto-run on a cadence.">
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
          {SCHEDULED.map((s, i) => (
            <div key={s.template} className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? "border-t border-[rgba(255,255,255,0.06)]" : ""}`}>
              <div className="flex items-center gap-3">
                <Calendar className="size-4 text-[#9CA3AF]" />
                <div>
                  <div className="text-sm font-medium text-[#F5F5F7]">{s.template}</div>
                  <div className="text-xs text-[#6B7280]">{s.cadence} · {s.recipients}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Active</span>
                <button className="text-xs text-[#9CA3AF] hover:text-[#F5F5F7]">Edit</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section num="03" title="Templates" sub="Pre-built reports — pick a template to generate a fresh one.">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {TEMPLATES.map(t => (
            <div key={t.key} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5 hover:border-[rgba(255,255,255,0.12)] cursor-pointer transition-colors">
              <div className="flex items-center justify-between mb-3">
                <FileText className="size-4 text-[#9CA3AF]" />
                <div className="flex gap-1">
                  {t.variants.map(v => (
                    <span key={v} className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${v === "Operational" ? "bg-[rgba(0,131,255,0.10)] text-blue-400" : "bg-purple-500/10 text-purple-400"}`}>{v}</span>
                  ))}
                </div>
              </div>
              <div className="text-sm font-semibold text-[#F5F5F7]">{t.title}</div>
              <div className="mt-1 text-xs text-[#9CA3AF] leading-relaxed">{t.desc}</div>
              <div className="mt-3 text-[10px] uppercase tracking-wider text-[#6B7280]">{t.cadence}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section num="04" title="Recent reports" sub={`${reports?.length ?? 0} generated`}>
        {!reports?.length ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 py-12 text-center">
            <FileText className="size-6 text-[rgba(245,245,247,0.3)] mb-3" />
            <div className="text-sm text-[#9CA3AF]">No reports yet.</div>
            <div className="mt-1 text-xs text-[#6B7280]">Generate one from a template above.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(r => (
              <div key={r.id} className="flex items-center gap-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-5 py-3.5 hover:border-[rgba(255,255,255,0.12)] cursor-pointer">
                <FileText className="size-4 text-[#6B7280] shrink-0" />
                <span className="flex-1 text-sm font-medium text-[#F5F5F7]">{r.name}</span>
                <span className="text-xs text-[#6B7280]">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
