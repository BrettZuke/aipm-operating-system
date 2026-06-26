import Link from "next/link";
import { Upload, Plus, FileText, Mic, Briefcase, Users, GitBranch, BarChart3, Phone, X } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { Markdown } from "@/components/markdown";
import { StatCard } from "../dashboard/tabs";

export const dynamic = "force-dynamic";

type Tab = "all" | "voice" | "offers" | "documents" | "people" | "decisions";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "all",       label: "All",         icon: FileText  },
  { key: "voice",     label: "Brand voice", icon: Mic       },
  { key: "offers",    label: "Offers",      icon: Briefcase },
  { key: "documents", label: "Documents",   icon: FileText  },
  { key: "people",    label: "People",      icon: Users     },
  { key: "decisions", label: "Decisions",   icon: GitBranch },
];

// Source-type → tab routing. Null means "skip from category-specific tabs".
function tabForSource(sourceType: string | null): Tab {
  switch (sourceType) {
    case "client_dossier":     return "people";
    case "call_note":          return "decisions";
    case "aggregate_insights": return "documents";
    case "weekly_report":      return "documents";
    case "brand_voice":        return "voice";
    case "offer":              return "offers";
    default:                   return "documents";
  }
}

// Per-source-type icon for visual scanning
function iconForSource(sourceType: string | null) {
  switch (sourceType) {
    case "client_dossier":     return Users;
    case "call_note":          return Phone;
    case "aggregate_insights": return BarChart3;
    case "weekly_report":      return BarChart3;
    case "brand_voice":        return Mic;
    case "offer":              return Briefcase;
    default:                   return FileText;
  }
}

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ tab?: Tab; q?: string; doc?: string }> }) {
  const { tab = "all", q = "", doc: docId } = await searchParams;
  const { supabase, agencyId } = await getAuthContext();

  // If a doc is being viewed, fetch its full content for the side drawer.
  const openDoc = docId
    ? (await supabase.from("knowledge_docs").select("id,title,source_type,content_text,created_at,updated_at,metadata").eq("agency_id", agencyId!).eq("id", docId).maybeSingle()).data
    : null;

  // Counts by source_type (always one row per type — small + cheap).
  // We fetch lightweight metadata for ALL docs so the tab counts are accurate
  // even when the user is filtering by `q`.
  const { data: allMeta } = await supabase
    .from("knowledge_docs")
    .select("id,source_type")
    .eq("agency_id", agencyId!);

  const counts: Record<Tab, number> = { all: 0, voice: 0, offers: 0, documents: 0, people: 0, decisions: 0 };
  for (const d of allMeta ?? []) {
    counts.all++;
    counts[tabForSource(d.source_type)]++;
  }

  // Search query: match q against title + content_text (server-side ilike).
  // Without q, we just fetch metadata sorted by recency.
  let listing = supabase
    .from("knowledge_docs")
    .select("id,title,source_url,source_type,created_at")
    .eq("agency_id", agencyId!)
    .order("created_at", { ascending: false })
    .limit(500);
  if (q.trim()) {
    // PostgREST `or` syntax — ilike on either field. Comma escapes for special chars.
    const escaped = q.replace(/[,()*]/g, "");
    listing = listing.or(`title.ilike.%${escaped}%,content_text.ilike.%${escaped}%`);
  }
  const { data: docs } = await listing;

  // Apply tab filter client-side (cheap on ≤500 rows).
  const visible = (docs ?? []).filter(d => {
    if (tab === "all") return true;
    return tabForSource(d.source_type) === tab;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SETTOKU · MEMORY</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Knowledge Library</h1>
          <p className="mt-1 text-sm text-[#9CA3AF] max-w-2xl">Settoku&apos;s memory of the workspace. Every page reads from here — brand voice, offers, decisions, and the people behind the work.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.10)] px-3 py-2 text-sm text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.06)]">
            <Upload className="size-3.5" /> Upload
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
            <Plus className="size-3.5" /> Add knowledge
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total entries" value={String(counts.all)} sub="Across all categories" accent />
        <StatCard label="People" value={String(counts.people)} sub="Client dossiers" />
        <StatCard label="Decisions" value={String(counts.decisions)} sub="Call notes & outcomes" />
        <StatCard label="Documents" value={String(counts.documents)} sub="Reports & references" />
      </div>

      {/* Layout: tabs + content + right rail */}
      <div className="grid grid-cols-[1fr_280px] gap-3">
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60">
          {/* Tabs */}
          <div className="flex gap-0 border-b border-[rgba(255,255,255,0.08)] overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              return (
                <Link
                  key={t.key}
                  href={`?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  replace
                  scroll={false}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors duration-100 ${
                    isActive
                      ? "border-[#0083FF] text-[#F5F5F7] bg-[#0C0C10]/80"
                      : "border-transparent text-[#9CA3AF] hover:text-[#F5F5F7] hover:bg-white/[0.03]"
                  }`}
                >
                  <Icon className="size-3.5 shrink-0" />
                  {t.label}
                  <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] tabular-nums text-[#9CA3AF]">{counts[t.key]}</span>
                </Link>
              );
            })}
          </div>

          {/* Search */}
          <form className="border-b border-[rgba(255,255,255,0.06)] px-5 py-3">
            <input type="hidden" name="tab" value={tab} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search knowledge…"
              className="w-full rounded-md border border-[rgba(255,255,255,0.07)] bg-[#09090C] px-3 py-1.5 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </form>

          {/* Content */}
          <div className="p-5">
            {visible.length > 0 ? (
              <div className="space-y-2">
                {visible.map(d => {
                  const Icon = iconForSource(d.source_type);
                  const params = new URLSearchParams();
                  if (tab !== "all") params.set("tab", tab);
                  if (q) params.set("q", q);
                  params.set("doc", d.id);
                  return (
                    <Link
                      key={d.id}
                      href={`?${params.toString()}`}
                      scroll={false}
                      className="flex items-center gap-3 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3 hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.05)] cursor-pointer transition-colors"
                    >
                      <Icon className="size-4 text-[#9CA3AF]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#F5F5F7] truncate">{d.title}</div>
                        <div className="text-xs text-[#6B7280]">{d.source_type ?? "—"}</div>
                      </div>
                      <span className="text-xs text-[#6B7280] whitespace-nowrap">{new Date(d.created_at).toLocaleDateString()}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.06)] mb-3">
                  <FileText className="size-5 text-[#6B7280]" />
                </div>
                <div className="text-sm font-medium text-[#9CA3AF]">{q ? "No matches" : "Nothing in this category yet"}</div>
                <p className="mt-1 max-w-sm text-xs text-[#6B7280]">{q ? "Try a different search term." : "Add your first entry to start training Settoku on your workspace."}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right rail — either the open doc detail or the "who's reading what" placeholder */}
        {openDoc ? (
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 self-start max-h-[calc(100vh-140px)] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">{openDoc.source_type ?? "Document"}</div>
                <div className="text-sm font-semibold text-[#F5F5F7] mt-1 line-clamp-2">{openDoc.title}</div>
                <div className="text-[11px] text-[#6B7280] mt-1">
                  Created {new Date(openDoc.created_at).toLocaleDateString()}
                  {openDoc.updated_at && openDoc.updated_at !== openDoc.created_at && ` · updated ${new Date(openDoc.updated_at).toLocaleDateString()}`}
                </div>
              </div>
              <Link
                href={`?${(() => { const p = new URLSearchParams(); if (tab !== "all") p.set("tab", tab); if (q) p.set("q", q); return p.toString(); })()}`}
                scroll={false}
                className="rounded-md p-1 text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5F5F7]"
                aria-label="Close"
              >
                <X className="size-4" />
              </Link>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {openDoc.content_text ? (
                <Markdown text={openDoc.content_text} />
              ) : (
                <div className="text-sm text-[#6B7280] italic">No content stored on this entry.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 p-5 self-start">
            <div className="mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">Click any row →</div>
              <div className="text-sm font-medium text-[#F5F5F7]">View doc content here</div>
            </div>
            <div className="text-xs text-[#9CA3AF] mt-3">Click a doc on the left to read its full markdown content. Search by content or title using the box above.</div>
            <div className="mt-5 border-t border-[rgba(255,255,255,0.06)] pt-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280] mb-2">Who&apos;s reading what</div>
              <div className="text-xs text-[#6B7280]">Per-surface pull stats appear once consumption telemetry lands.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
