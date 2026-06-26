"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Sparkles, LayoutDashboard, Users, TrendingUp, CheckSquare, BarChart3, Settings, Trophy, Wallet, Target, Phone, Bot, BookOpen, ListTodo, Clock, FileText, Zap, MessageSquare, GitBranch, Megaphone, Repeat, Gift } from "lucide-react";

type Item = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
};

const ITEMS: Item[] = [
  // Workspace
  { id: "dashboard",    label: "Dashboard",         sub: "Overview · metrics",   href: "/dashboard",    group: "WORKSPACE", icon: LayoutDashboard },
  { id: "today",        label: "Today",             sub: "Daily agenda",          href: "/today",        group: "WORKSPACE", icon: Clock },
  { id: "settoku-chat",     label: "Settoku AI",            sub: "Assistant · chat",      href: "/settoku-chat",     group: "WORKSPACE", icon: Sparkles },
  { id: "messages",     label: "Messages",          sub: "Team inbox",            href: "/messages",     group: "WORKSPACE", icon: MessageSquare },

  // Sales
  { id: "sales",        label: "Sales Hub",         href: "/sales",        group: "SALES", icon: TrendingUp },
  { id: "leaderboard",  label: "Sales Leaderboard", href: "/leaderboard",  group: "SALES", icon: Trophy },
  { id: "pipeline",     label: "Deals Pipeline",    href: "/sales",        group: "SALES", icon: GitBranch, keywords: "deals kanban" },
  { id: "commissions",  label: "Commissions",       href: "/commissions",  group: "SALES", icon: Wallet },
  { id: "quotas",       label: "Quotas",            href: "/quotas",       group: "SALES", icon: Target },
  { id: "calls",        label: "Call Library",      href: "/sales/calls",  group: "SALES", icon: Phone },
  { id: "eod",          label: "EOD Reports",       href: "/sales/eod",    group: "SALES", icon: Clock },

  // Operations
  { id: "clients",      label: "Clients",           href: "/clients",      group: "OPERATIONS", icon: Users },
  { id: "client-dash",  label: "Client Dashboard",  href: "/clients/dashboard", group: "OPERATIONS", icon: BarChart3 },
  { id: "team",         label: "Team",              href: "/team",         group: "OPERATIONS", icon: Users },
  { id: "tasks",        label: "Tasks",             href: "/tasks/all",    group: "OPERATIONS", icon: CheckSquare },
  { id: "content",      label: "Content",           href: "/content",      group: "OPERATIONS", icon: FileText },
  { id: "playbooks",    label: "Playbooks & SOPs",  href: "/playbooks",    group: "OPERATIONS", icon: BookOpen },
  { id: "transactions", label: "Transactions",      href: "/transactions", group: "OPERATIONS", icon: Repeat },
  { id: "campaigns",    label: "Campaigns",         href: "/campaigns",    group: "OPERATIONS", icon: Megaphone },
  { id: "goals",        label: "Goals",             href: "/goals",        group: "OPERATIONS", icon: Target },

  // AI
  { id: "ai-setter",    label: "AI Setter",         href: "/ai-setter",    group: "AI", icon: Bot },
  { id: "ai-dialer",    label: "AI Dialer",         href: "/ai-dialer",    group: "AI", icon: Phone },
  { id: "insights",     label: "Insights",          href: "/insights",     group: "AI", icon: ListTodo },
  { id: "actions",      label: "Actions",           href: "/actions",      group: "AI", icon: Zap },
  { id: "knowledge",    label: "Knowledge Library", href: "/knowledge",    group: "AI", icon: BookOpen },

  // Settings
  { id: "settings",      label: "Settings · Profile",      href: "/settings",                group: "SETTINGS", icon: Settings },
  { id: "integrations",  label: "Settings · Integrations", href: "/settings/integrations",   group: "SETTINGS", icon: Settings },
  { id: "team-mgmt",     label: "Settings · Team",         href: "/settings/team",           group: "SETTINGS", icon: Settings },
  { id: "ai-access",     label: "Settings · AI access",    href: "/settings/ai-access",      group: "SETTINGS", icon: Settings },
  { id: "billing",       label: "Settings · Billing",      href: "/settings/billing",        group: "SETTINGS", icon: Settings },

  // Referrals
  { id: "refer",         label: "Refer Settoku",         href: "/refer-settoku",   group: "EXTRAS", icon: Gift },
];

export function CommandPalette({ template }: { template?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Cmd+K toggle + custom event listener
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    function handleOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", handleKey);
    window.addEventListener("open-command-palette", handleOpenEvent);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("open-command-palette", handleOpenEvent);
    };
  }, [open]);

  // Coach-only views (hardcoded the coach rev-share + FanBasis/transactions portfolio); hide from creators.
  const baseItems = useMemo(
    () => (template === "coach" ? ITEMS : ITEMS.filter(it => it.id !== "commissions" && it.id !== "client-dash")),
    [template],
  );

  // Filter
  const filtered = useMemo(() => {
    if (!query.trim()) return baseItems;
    const q = query.toLowerCase();
    return baseItems.filter(it =>
      it.label.toLowerCase().includes(q) ||
      it.group.toLowerCase().includes(q) ||
      (it.keywords && it.keywords.toLowerCase().includes(q))
    );
  }, [query, baseItems]);

  // Group filtered items
  const grouped = useMemo(() => {
    const out: Record<string, Item[]> = {};
    for (const item of filtered) {
      if (!out[item.group]) out[item.group] = [];
      out[item.group].push(item);
    }
    return out;
  }, [filtered]);

  // Reset state when opening/closing
  useEffect(() => {
    if (!open) { setQuery(""); setActiveIndex(0); }
  }, [open]);

  // Arrow key nav
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        const item = filtered[activeIndex];
        if (item) {
          router.push(item.href);
          setOpen(false);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, filtered, activeIndex, router]);

  if (!open) return null;

  let runningIdx = 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4" onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-xl rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,131,255,0.10)" }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
          <Search className="size-4 text-[#6B7280] shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Search anything · type a command, /, or # to filter"
            className="flex-1 bg-transparent text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none"
          />
          <kbd className="rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] font-mono text-[#6B7280]">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#6B7280]">No matches.</div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-2">
                <div className="px-4 py-1 text-[10px] font-semibold tracking-widest text-[#6B7280]">{group}</div>
                {items.map(item => {
                  const idx = runningIdx++;
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => { router.push(item.href); setOpen(false); }}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                        isActive ? "bg-[rgba(0,131,255,0.10)]" : "hover:bg-[rgba(255,255,255,0.04)]"
                      }`}
                    >
                      <item.icon className={`size-4 shrink-0 ${isActive ? "text-blue-400" : "text-[#9CA3AF]"}`} />
                      <div className="flex-1 min-w-0">
                        <span className={isActive ? "text-[#F5F5F7]" : "text-[rgba(245,245,247,0.8)]"}>{item.label}</span>
                        {item.sub && <span className="ml-2 text-[11px] text-[#6B7280]">{item.sub}</span>}
                      </div>
                      <span className="ml-auto rounded-md bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] text-[#6B7280]">Page</span>
                      {isActive && <ArrowRight className="size-3.5 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[rgba(255,255,255,0.08)] bg-[#09090C] px-4 py-2 text-[11px] text-[#6B7280]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] font-mono">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[10px] font-mono">↵</kbd> Open</span>
          </div>
          <span className="flex items-center gap-1.5"><Sparkles className="size-3 text-blue-400" /> AI search</span>
        </div>
      </div>
    </div>
  );
}
