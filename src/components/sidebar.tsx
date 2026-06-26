"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  FileText,
  TrendingUp,
  Trophy,
  Wallet,
  Target,
  PhoneCall,
  Repeat,
  Megaphone,
  BarChart3,
  BarChart2,
  ListTodo,
  FolderKanban,
  BookOpen,
  Sparkles,
  MessageSquare,
  Bot,
  LineChart,
  ChevronDown,
  ChevronRight,
  Search,
  Settings,
  HelpCircle,
  Zap,
  Gift,
  PhoneIncoming,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { useAgencyStore } from "@/lib/store/agency-store";
import { cn, initialsFromName } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; children?: { href: string; label: string }[] };
type NavSection = { key: string; label: string; count: number; items: NavItem[] };

const sections: NavSection[] = [
  {
    key: "revenue",
    label: "REVENUE",
    count: 14,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/clients/dashboard", label: "Client Dashboard", icon: Users },
      {
        href: "/sales",
        label: "Sales",
        icon: TrendingUp,
        children: [
          { href: "/sales", label: "Sales Hub" },
          { href: "/leaderboard", label: "Leaderboard" },
          { href: "/commissions", label: "Commissions" },
          { href: "/quotas", label: "Quotas" },
          { href: "/sales/eod", label: "EOD Reports" },
          { href: "/sales/calls", label: "Call Library" },
          { href: "/eod-templates", label: "EOD Templates" },
        ],
      },
      { href: "/transactions", label: "Transactions", icon: Repeat },
      { href: "/payments", label: "Payment plans", icon: Wallet },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/ads", label: "Ads", icon: BarChart2 },
      { href: "/goals", label: "Goals", icon: Target },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    key: "operations",
    label: "OPERATIONS",
    count: 10,
    items: [
      { href: "/clients", label: "Customers", icon: Users },
      { href: "/team", label: "Team", icon: Users },
      {
        href: "/tasks",
        label: "Tasks & Projects",
        icon: CheckSquare,
        children: [
          { href: "/tasks/my", label: "My Tasks" },
          { href: "/tasks/all", label: "All Tasks" },
          { href: "/tasks/projects", label: "Projects" },
          { href: "/tasks/templates", label: "Templates" },
        ],
      },
      { href: "/today", label: "Today", icon: Clock },
      { href: "/content", label: "Content", icon: FileText },
      { href: "/playbooks", label: "Playbooks & SOPs", icon: BookOpen },
      { href: "/refer-settoku", label: "Refer Settoku", icon: Gift },
    ],
  },
  {
    key: "intelligence",
    label: "INTELLIGENCE",
    count: 6,
    items: [
      { href: "/settoku-chat", label: "Settoku Chat", icon: Sparkles },
      { href: "/ai-setter", label: "AI Setter", icon: Bot },
      { href: "/ai-dialer", label: "AI Dialer", icon: PhoneIncoming },
      { href: "/insights", label: "Insights", icon: LineChart },
      { href: "/actions", label: "Actions", icon: Zap },
      { href: "/knowledge", label: "Knowledge Library", icon: BookOpen },
    ],
  },
];

import { WorkspaceSwitcher } from "./workspace-switcher";

type Workspace = { id: string; name: string; role: string };

type Props = {
  workspaceName: string;
  userName: string | null;
  userEmail: string;
  userRole: string | null;
  workspaces?: Workspace[];
  activeAgencyId?: string | null;
  template?: string | null;
};

export function Sidebar({ workspaceName, userName, userEmail, userRole, workspaces, activeAgencyId, template }: Props) {
  const pathname = usePathname();
  const { openSections, toggleSection } = useAgencyStore();
  const workspaceInitial = workspaceName.charAt(0).toUpperCase();

  // Coach-only links (hardcoded the coach rev-share split + the FanBasis/transactions portfolio) are
  // hidden from creator workspaces; those pages also guard by template.
  const COACH_ONLY = new Set(["/commissions", "/clients/dashboard"]);
  const navSections =
    template === "coach"
      ? sections
      : sections.map((s) => ({
          ...s,
          items: s.items
            .filter((it) => !COACH_ONLY.has(it.href))
            .map((it) =>
              it.children ? { ...it, children: it.children.filter((c) => !COACH_ONLY.has(c.href)) } : it,
            ),
        }));

  // Every workspace shows the same nav structure. Each PAGE renders the active workspace's own data
  // (the coach's sheet only for the sheet-owning workspace; Stripe/Supabase for everyone else).

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/sales") return pathname === "/sales" || pathname.startsWith("/sales/");
    if (href === "/tasks") return pathname === "/tasks" || pathname.startsWith("/tasks/");
    return pathname === href;
  }

  return (
    <aside
      className="flex h-full w-60 shrink-0 flex-col border-r border-[rgba(255,255,255,0.07)]"
      style={{
        backgroundColor: "rgba(12,12,16,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Workspace selector */}
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.07)] px-3 py-3">
        {workspaces && workspaces.length > 0 ? (
          <WorkspaceSwitcher workspaces={workspaces} activeId={activeAgencyId ?? null} />
        ) : (
          <button className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[rgba(255,255,255,0.05)] transition-colors duration-100">
            <div className="flex size-6 items-center justify-center rounded overflow-hidden shrink-0">
              <img src="/logo.svg" alt="Settoku" width={24} height={24} className="object-cover w-full h-full" />
            </div>
            <span className="truncate text-sm font-medium text-[#F5F5F7]">{workspaceName}</span>
            <ChevronDown className="size-3.5 shrink-0 text-[#6B7280]" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="border-b border-[rgba(255,255,255,0.07)] px-3 py-2.5">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
          className="flex w-full items-center gap-2 rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
        >
          <Search className="size-3.5 shrink-0 text-[#6B7280]" />
          <span className="flex-1 text-left text-xs text-[#9CA3AF]">Search...</span>
          <kbd className="rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)]/80 px-1 font-mono text-xs text-[#9CA3AF]">⌘K</kbd>
        </button>
      </div>

      {/* Welcome */}
      <div className="px-2 py-1.5">
        <Link
          href="/onboarding"
          className={cn(
            "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm",
            pathname === "/onboarding"
              ? "bg-[rgba(0,131,255,0.10)] text-[#F5F5F7]"
              : "text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F5F5F7] transition-[background-color,color] duration-100",
          )}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" />
            Welcome
          </div>
          <span className="rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{backgroundColor:"rgba(0,131,255,0.15)",color:"#00A4FF"}}>
            SETUP
          </span>
        </Link>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {navSections.map((section) => (
          <div key={section.key} className="mb-1">
            <button
              onClick={() => toggleSection(section.key)}
              className="flex w-full items-center justify-between px-2 py-2 text-[10px] font-semibold tracking-widest text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"
            >
              <span>{section.label}</span>
              <span className="text-xs text-[#6B7280]">{section.count}</span>
            </button>

            {openSections[section.key] !== false && (
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavItemComponent
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    isActive={isActive}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="my-2 border-t border-[rgba(255,255,255,0.05)]" />
        <div className="space-y-0.5">
          <SimpleNavLink href="/messages" label="Messages" icon={MessageSquare} active={pathname === "/messages"} />
        </div>
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-[rgba(255,255,255,0.07)] px-2 py-1.5 space-y-0.5">
        <SimpleNavLink href="/settings" label="Settings" icon={Settings} active={pathname.startsWith("/settings")} />
        <SimpleNavLink href="/docs" label="Docs" icon={BookOpen} active={pathname === "/docs"} />
        <SimpleNavLink href="/help" label="Help" icon={HelpCircle} active={pathname === "/help"} />
      </div>

      {/* User area */}
      <div className="border-t border-[rgba(255,255,255,0.07)] px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
            {initialsFromName(userName ?? userEmail)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-[#F5F5F7]">{userName ?? userEmail}</div>
            <div className="truncate text-xs text-[#6B7280] capitalize">{userRole} · {workspaceName}</div>
          </div>
          <ChevronDown className="size-3.5 shrink-0 text-[#6B7280]" />
        </div>
      </div>
    </aside>
  );
}

function NavItemComponent({
  item,
  pathname,
  isActive,
}: {
  item: NavItem;
  pathname: string;
  isActive: (href: string) => boolean;
}) {
  const { openSections, toggleSection } = useAgencyStore();
  const hasChildren = item.children && item.children.length > 0;
  const expanded = openSections[`sub_${item.href}`] !== false;
  const active = isActive(item.href);

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => toggleSection(`sub_${item.href}`)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-[background-color,color] duration-100",
            active
              ? "bg-[rgba(0,131,255,0.10)] text-[#F5F5F7]"
              : "text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F5F5F7]",
          )}
        >
          <item.icon className="size-4 shrink-0" />
          <span className="flex-1 text-left truncate">{item.label}</span>
          {expanded ? (
            <ChevronDown className="size-3 shrink-0 text-[#6B7280]" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-[#6B7280]" />
          )}
        </button>
        {expanded && (
          <div className="ml-6 mt-0.5 space-y-0.5">
            {item.children!.map((child) => {
              const childActive = pathname === child.href;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm",
                    childActive
                      ? "bg-[rgba(0,131,255,0.10)] text-[#F5F5F7]"
                      : "text-[#6B7280] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F5F5F7]",
                  )}
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-[background-color,color,box-shadow] duration-100",
        active
          ? "bg-[rgba(0,131,255,0.10)] text-[#F5F5F7] shadow-[inset_2px_0_0_#0083FF]"
          : "text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F5F5F7]",
      )}
    >
      <item.icon className={cn("size-4 shrink-0", active ? "text-[#0083FF]" : "")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SimpleNavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-[background-color,color,box-shadow] duration-100",
        active
          ? "bg-[rgba(0,131,255,0.10)] text-[#F5F5F7] shadow-[inset_2px_0_0_#0083FF]"
          : "text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F5F5F7]",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
