import Link from "next/link";
import { Bell } from "lucide-react";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Tab = "all" | "urgent" | "warning" | "fyi" | "wins";
type SubTab = "open" | "unread" | "actioned" | "dismissed";

const TABS: { key: Tab; label: string }[] = [
  { key: "all",     label: "All" },
  { key: "urgent",  label: "Urgent" },
  { key: "warning", label: "Warning" },
  { key: "fyi",     label: "FYI" },
  { key: "wins",    label: "Wins" },
];

const SUBTABS: { key: SubTab; label: string }[] = [
  { key: "open",      label: "Open + done" },
  { key: "unread",    label: "Unread only" },
  { key: "actioned",  label: "Actioned" },
  { key: "dismissed", label: "Dismissed" },
];

// Map old DB kinds to new tab buckets
const KIND_TO_TAB: Record<string, Tab> = {
  critical: "urgent",
  warning:  "warning",
  notice:   "fyi",
  info:     "fyi",
  win:      "wins",
};

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ tab?: Tab; sub?: SubTab }> }) {
  const { tab = "all", sub = "open" } = await searchParams;
  const { supabase, agencyId } = await getAuthContext();
  const { data: insights } = await supabase
    .from("insights")
    .select("id,kind,title,body,created_at,resolved_at")
    .eq("agency_id", agencyId!)
    .order("created_at", { ascending: false });

  const counts: Record<string, number> = { all: 0, urgent: 0, warning: 0, fyi: 0, wins: 0 };
  for (const i of insights ?? []) {
    const bucket = KIND_TO_TAB[i.kind] ?? "fyi";
    counts[bucket]++;
    counts.all++;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SETTOKU · MORNING PAPER</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Insights</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">What Settoku noticed across your workspace · {counts.all} signals</p>
        </div>
        <button className="flex size-10 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)]">
          <Bell className="size-4 text-[#9CA3AF]" />
        </button>
      </div>

      {/* Primary tabs */}
      <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60">
        <div className="flex gap-0 border-b border-[rgba(255,255,255,0.08)]">
          {TABS.map(t => (
            <Link key={t.key} href={`?tab=${t.key}&sub=${sub}`} replace scroll={false} className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors duration-100 ${tab === t.key ? "border-[#0083FF] text-[#F5F5F7] bg-[#0C0C10]/80" : "border-transparent text-[#6B7280] hover:text-[rgba(245,245,247,0.8)] hover:bg-white/[0.03]"}`}>
              {t.label}
              <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] tabular-nums text-[#9CA3AF]">{counts[t.key] ?? 0}</span>
            </Link>
          ))}
        </div>

        {/* Secondary tabs */}
        <div className="flex gap-0 border-b border-[rgba(255,255,255,0.06)] bg-[#0C0C10]/40 px-2 py-1.5">
          {SUBTABS.map(s => (
            <Link key={s.key} href={`?tab=${tab}&sub=${s.key}`} replace scroll={false} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-100 ${sub === s.key ? "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]" : "text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"}`}>
              {s.label}
            </Link>
          ))}
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] mb-4">
            <Bell className="size-5 text-[#6B7280]" />
          </div>
          <div className="text-base font-medium text-[rgba(245,245,247,0.8)]">Settoku&apos;s still reading the room…</div>
          <p className="mt-1 max-w-sm text-sm text-[#9CA3AF]">Anomalies, ad-fatigue warnings, pipeline stalls, and opportunities surface here as they happen.</p>
        </div>
      </div>
    </div>
  );
}
