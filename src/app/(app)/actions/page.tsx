import { Play, Sparkles, Clock, Search } from "lucide-react";
import { Section } from "../dashboard/tabs";

export const dynamic = "force-dynamic";

const MOST_USED = [
  { key: "ckf-training",   title: "Comment Keyword Flow — Free Training", time: "30s", channel: "Instagram" },
  { key: "ckf-pdf",        title: "Comment Keyword Flow — Free PDF",      time: "30s", channel: "Instagram" },
  { key: "ckf-custom",     title: "Comment Keyword Flow — Custom Offer",  time: "45s", channel: "Instagram" },
  { key: "story-magnet",   title: "Story Reply Flow — Lead Magnet",       time: "30s", channel: "Instagram" },
];

const LEAD_GENERATION = [
  { key: "ckf-training",  title: "Comment Keyword Flow — Free Training",  desc: "Auto-DM users who comment a keyword — send a free training link.", time: "30s", needsApproval: false, automated: true },
  { key: "ckf-pdf",       title: "Comment Keyword Flow — Free PDF",       desc: "Auto-DM users who comment a keyword — send a PDF lead magnet.",  time: "30s", needsApproval: false, automated: true },
  { key: "ckf-custom",    title: "Comment Keyword Flow — Custom Offer",   desc: "Configurable comment trigger → custom offer DM.",                 time: "45s", needsApproval: false, automated: true },
  { key: "story-magnet",  title: "Story Reply Flow — Lead Magnet",        desc: "Capture story replies and route them into a lead-magnet flow.",   time: "30s", needsApproval: false, automated: true },
  { key: "dm-trigger",    title: "DM Keyword Trigger — Custom",            desc: "Trigger an automation when a DM matches your keyword.",          time: "1m",  needsApproval: false, automated: true },
  { key: "app-coaching",  title: "Application Form — Coaching",            desc: "Send an application form for coaching offers; auto-route by score.", time: "1m", needsApproval: true, automated: false },
  { key: "app-custom",    title: "Application Form — Custom",              desc: "Configurable application flow with scoring and routing.",        time: "1m",  needsApproval: true, automated: false },
];

const SALES = [
  { key: "story-booking",     title: "Story Reply Flow — Booking",  desc: "Book qualified replies straight onto your sales calendar.", time: "45s", needsApproval: false, automated: true },
  { key: "discovery-setup",   title: "Discovery Call Setup",        desc: "Wire calendar + reminder + reschedule logic for discovery calls.", time: "2m", needsApproval: true, automated: false },
];

export default function ActionsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SETTOKU · ON DEMAND</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Actions</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Things Settoku can run on demand. Pick one, click run, watch it work.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" />
        <input
          placeholder="Search actions…"
          className="w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 pl-9 pr-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      <Section title="Most used" sub="Your top-running actions across the workspace.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {MOST_USED.map(a => (
            <button key={a.key} className="text-left rounded-xl border border-[rgba(0,131,255,0.20)] bg-gradient-to-br from-[rgba(0,131,255,0.08)] to-[rgba(0,131,255,0.02)] p-4 hover:border-[rgba(0,131,255,0.40)] transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="size-3.5 text-blue-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">{a.channel}</span>
              </div>
              <div className="text-sm font-semibold text-[#F5F5F7]">{a.title}</div>
              <div className="mt-3 flex items-center gap-2 text-xs text-[#6B7280]">
                <Clock className="size-3" /> {a.time}
              </div>
            </button>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[#6B7280]">Filter:</span>
        {["All", "lead_generation", "sales", "engagement"].map((t, i) => (
          <button key={t} className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            i === 0
              ? "border-[rgba(0,131,255,0.30)] bg-[rgba(0,131,255,0.10)] text-blue-400"
              : "border-[rgba(255,255,255,0.08)] bg-transparent text-[#9CA3AF] hover:text-[#F5F5F7]"
          }`}>{t}</button>
        ))}
      </div>

      <Section title="Lead generation" sub={`${LEAD_GENERATION.length} recipes`}>
        <div className="space-y-2">
          {LEAD_GENERATION.map(a => <ActionRow key={a.key} action={a} />)}
        </div>
      </Section>

      <Section title="Sales" sub={`${SALES.length} recipes`}>
        <div className="space-y-2">
          {SALES.map(a => <ActionRow key={a.key} action={a} />)}
        </div>
      </Section>
    </div>
  );
}

function ActionRow({ action }: { action: { title: string; desc: string; time: string; needsApproval: boolean; automated: boolean } }) {
  return (
    <div className="flex items-start justify-between rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4 hover:border-[rgba(255,255,255,0.12)] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-semibold text-[#F5F5F7]">{action.title}</span>
          {action.needsApproval && (
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">Needs approval</span>
          )}
          {action.automated && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Automated</span>
          )}
        </div>
        <div className="text-xs text-[#9CA3AF]">{action.desc}</div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-[#6B7280]">
          <span className="flex items-center gap-1"><Clock className="size-3" /> {action.time}</span>
        </div>
      </div>
      <button className="ml-4 flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 shrink-0">
        <Play className="size-3.5" /> Run
      </button>
    </div>
  );
}
