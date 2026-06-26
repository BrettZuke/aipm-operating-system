import Link from "next/link";
import { Search, BookOpen, ArrowRight, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

type DocItem = { label: string; href: string; isNew?: boolean; available: boolean };
type DocSection = { label: string; items: DocItem[] };

const SIDEBAR_SECTIONS: DocSection[] = [
  {
    label: "CAMPAIGNS",
    items: [{ label: "Track campaigns with UTMs", href: "/docs/utm-tracking", available: true }],
  },
  {
    label: "PAYMENTS",
    items: [{ label: "How payments flow into Settoku", href: "/docs/payment-pipeline", isNew: true, available: true }],
  },
  {
    label: "EVENTS",
    items: [{ label: "Webinars + auto-SMS", href: "/docs/webinars", isNew: true, available: true }],
  },
  {
    label: "SYSTEM",
    items: [{ label: "Improvements loop", href: "/docs/improvements-loop", isNew: true, available: true }],
  },
];

const ARTICLES = [
  { title: "Track campaigns with UTMs",   description: "Wire UTM parameters into payment links, opt-in pages, and booking calendars. The clean way to attribute every dollar to its source.", href: "/docs/utm-tracking", isNew: false },
  { title: "How payments flow into Settoku",  description: "From a client paying to the dashboard updating — the full pipeline in 30 seconds. FanBasis webhook, manual entry, orphan deals, outstanding balances.", href: "/docs/payment-pipeline", isNew: true },
  { title: "Webinars + auto-SMS",         description: "Schedule a webinar, paste registrations, Settoku texts attendees at T-24h, T-1h, T-15m, and live. Step-by-step.", href: "/docs/webinars", isNew: true },
  { title: "The improvements loop",       description: "Settoku's self-annealing queue. How bugs and feature requests get auto-discovered, prioritised, and worked down by you (or an LLM).", href: "/docs/improvements-loop", isNew: true },
];

export default function DocsPage() {
  return (
    <div className="grid grid-cols-[220px_1fr] gap-8 -mt-2">
      {/* Left rail */}
      <DocsNav />

      {/* Content */}
      <div className="max-w-3xl">
        <header className="mb-8">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">DOCS</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>How Settoku works</h1>
          <p className="mt-1 text-sm text-[#9CA3AF] max-w-xl">Short, opinionated, no fluff. Each guide walks you through one job. Start with what you need — ignore the rest.</p>
        </header>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" />
          <input placeholder="Search docs…" className="h-10 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 pl-9 pr-3 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>

        {/* Article list */}
        <div className="space-y-3">
          {ARTICLES.map(a => (
            <Link key={a.href} href={a.href} className="block rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5 hover:border-[rgba(255,255,255,0.12)] transition-colors group">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(0,131,255,0.10)]">
                    <BookOpen className="size-4 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-[#F5F5F7] group-hover:text-blue-400 transition-colors">{a.title}</span>
                      {a.isNew && <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">New</span>}
                    </div>
                    <p className="mt-1 text-sm text-[#9CA3AF]">{a.description}</p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-[rgba(245,245,247,0.3)] group-hover:text-blue-400 transition-colors mt-1" />
              </div>
            </Link>
          ))}
        </div>

        {/* Help footer */}
        <div className="mt-12 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5 text-center">
          <Sparkles className="mx-auto size-5 text-blue-400 mb-2" />
          <div className="text-sm font-medium text-[#F5F5F7]">Need something specific?</div>
          <p className="mt-1 text-xs text-[#9CA3AF]">Ask Settoku in chat — it has full context on your workspace and will walk you through any feature.</p>
          <Link href="/settoku-chat" className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline">Open Settoku Chat <ArrowRight className="size-3" /></Link>
        </div>
      </div>
    </div>
  );
}

function DocsNav() {
  return (
    <aside className="space-y-5 sticky top-0 self-start">
      <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#F5F5F7]">
        <ArrowRight className="size-3 rotate-180" /> Open Settoku
      </Link>
      {SIDEBAR_SECTIONS.map(section => (
        <div key={section.label}>
          <div className="px-3 mb-2 text-[10px] font-semibold tracking-widest text-[#6B7280]">{section.label}</div>
          <div className="space-y-0.5">
            {section.items.map((item, i) => (
              <a
                key={i}
                href={item.available ? item.href : undefined}
                className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors duration-100 ${
                  item.available
                    ? "text-[rgba(245,245,247,0.8)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F5F5F7]"
                    : "text-[#4B5563] cursor-not-allowed"
                }`}
              >
                <span>{item.label}</span>
                {item.isNew && <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-400">New</span>}
              </a>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}
