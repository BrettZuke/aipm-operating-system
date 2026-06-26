"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, ChevronDown, ChevronsLeft, ChevronsRight, ExternalLink, LogOut, MessageSquare, Settings, User } from "lucide-react";
import { useAgencyStore } from "@/lib/store/agency-store";
import { CreditsWidget } from "@/components/credits-widget";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { initialsFromName } from "@/lib/utils";

// Map pathnames to page titles
const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clients": "Clients",
  "/clients/dashboard": "Client Dashboard",
  "/sales": "Sales Hub",
  "/leaderboard": "Leaderboard",
  "/commissions": "Commissions",
  "/quotas": "Quotas",
  "/sales/eod": "EOD Reports",
  "/sales/calls": "Call Library",
  "/eod-templates": "EOD Templates",
  "/transactions": "Transactions",
  "/campaigns": "Campaigns",
  "/ads": "Ads",
  "/goals": "Goals",
  "/reports": "Reports",
  "/team": "Team",
  "/tasks": "Tasks",
  "/tasks/my": "My Tasks",
  "/tasks/all": "All Tasks",
  "/tasks/projects": "Projects",
  "/tasks/templates": "Templates",
  "/tasks/today": "Today",
  "/content": "Content",
  "/playbooks": "Playbooks & SOPs",
  "/refer-settoku": "Refer Settoku",
  "/settoku-chat": "AI Chat",
  "/ai-setter": "AI Setter",
  "/ai-dialer": "AI Dialer",
  "/insights": "Insights",
  "/actions": "Actions",
  "/knowledge": "Knowledge Library",
  "/messages": "Messages",
  "/settings": "Settings",
  "/settings/integrations": "Integrations",
  "/docs": "Docs",
  "/help": "Help",
  "/onboarding": "Welcome",
};

type Props = {
  workspaceName: string;
  userName: string | null;
  userEmail: string;
  userRole: string | null;
  agencyId: string | null;
};

export function Topbar({ workspaceName, userName, userEmail, userRole, agencyId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAgencyStore();

  const pageTitle =
    PAGE_TITLES[pathname] ??
    (pathname.startsWith("/clients/") ? "Client" : "your agency");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const workspaceInitial = workspaceName.charAt(0).toUpperCase();

  return (
    <header
      className="flex h-14 w-full shrink-0 items-center border-b border-[rgba(255,255,255,0.07)]"
      style={{
        background: "rgba(9,9,12,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Sidebar-width logo zone */}
      <div className="flex h-full w-60 shrink-0 items-center border-r border-[rgba(255,255,255,0.07)] px-4">
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <img
            src="/logo.svg"
            alt="your agency"
            width={28}
            height={28}
            className="rounded-md object-cover shrink-0"
            style={{width:28,height:28}}
          />
          <span
            className="font-bold text-xs tracking-wide text-[#F5F5F7] truncate"
            style={{fontFamily:"var(--font-inter),sans-serif",letterSpacing:"0.04em"}}
          >
            AI PARTNER
          </span>
        </Link>
      </div>

      {/* Sidebar collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex size-8 items-center justify-center text-[#6B7280] hover:text-[#9CA3AF]"
        aria-label="Toggle sidebar"
      >
        {sidebarCollapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
      </button>

      {/* Main topbar */}
      <div className="flex flex-1 items-center gap-3 px-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <span className="flex size-5 items-center justify-center rounded bg-[#0083FF] text-[10px] font-bold text-white">
            {workspaceInitial}
          </span>
          <span className="text-[#9CA3AF]">{workspaceName}</span>
          <span className="text-[#6B7280]">/</span>
          <span className="font-medium text-[#F5F5F7]">{pageTitle}</span>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
          className="flex h-8 items-center gap-2 rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3 text-xs text-[#6B7280] hover:border-[rgba(255,255,255,0.12)] hover:text-[rgba(245,245,247,0.8)]"
        >
          <span>Search...</span>
          <kbd className="rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] px-1 font-mono text-[10px]">⌘K</kbd>
        </button>

        {/* Credits */}
        <CreditsWidget />

        {/* Docs */}
        <Link
          href="/docs"
          className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#F5F5F7]"
        >
          Docs
          <ExternalLink className="size-3" />
        </Link>

        {/* Feedback */}
        <button className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#F5F5F7]">
          <MessageSquare className="size-4" />
          Feedback
        </button>

        {/* Bell */}
        <button className="relative rounded-md p-1.5 text-[#9CA3AF] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5F5F7]">
          <Bell className="size-4" />
        </button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[rgba(255,255,255,0.06)]">
              <div className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {initialsFromName(userName ?? userEmail)}
              </div>
              <ChevronDown className="size-3 text-[#6B7280]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="z-50 min-w-[200px] rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] p-1 shadow-xl"
          >
            <DropdownMenuLabel className="px-2 py-1.5 text-xs text-[#6B7280]">
              <div className="font-medium text-[#F5F5F7]">{userName ?? "—"}</div>
              <div className="truncate">{userEmail}</div>
              {userRole && <div className="mt-0.5 capitalize text-[#6B7280]">{userRole}</div>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1 h-px bg-[rgba(255,255,255,0.08)]" />
            <DropdownMenuItem asChild>
              <a href="/settings" className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[rgba(245,245,247,0.8)] outline-none hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5F5F7]">
                <User className="size-4" />Profile
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/settings" className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[rgba(245,245,247,0.8)] outline-none hover:bg-[rgba(255,255,255,0.06)] hover:text-[#F5F5F7]">
                <Settings className="size-4" />Settings
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 h-px bg-[rgba(255,255,255,0.08)]" />
            <DropdownMenuItem
              onSelect={handleLogout}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-400 outline-none hover:bg-[rgba(255,255,255,0.06)]"
            >
              <LogOut className="size-4" />Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
