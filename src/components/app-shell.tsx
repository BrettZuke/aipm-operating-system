"use client";

import { useAgencyStore } from "@/lib/store/agency-store";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { cn } from "@/lib/utils";

type Workspace = { id: string; name: string; role: string };

type Props = {
  children: React.ReactNode;
  workspaceName: string;
  userName: string | null;
  userEmail: string;
  userRole: string | null;
  workspaces?: Workspace[];
  activeAgencyId?: string | null;
  template?: string | null;
};

export function AppShell({
  children,
  workspaceName,
  userName,
  userEmail,
  userRole,
  workspaces,
  activeAgencyId,
  template,
}: Props) {
  const { sidebarCollapsed } = useAgencyStore();
  const pathname = usePathname();

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className={cn(
          "transition-all duration-200",
          sidebarCollapsed ? "w-0 overflow-hidden" : "w-60",
        )}
      >
        <Sidebar
          workspaceName={workspaceName}
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          workspaces={workspaces}
          activeAgencyId={activeAgencyId}
          template={template}
        />
      </div>
      <div className="relative flex-1 overflow-hidden">
        {/* Ambient glow — nekter.ai section mood */}
        <div className="pointer-events-none absolute -top-48 -right-48 h-[600px] w-[600px] rounded-full opacity-100" style={{background:"radial-gradient(circle, rgba(0,131,255,0.07) 0%, transparent 65%)"}} />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-[400px] w-[400px] rounded-full" style={{background:"radial-gradient(circle, rgba(0,211,147,0.05) 0%, transparent 65%)"}} />
        <main className="flex-1 overflow-y-auto p-6 h-full">
          <div key={pathname} className="page-enter h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
