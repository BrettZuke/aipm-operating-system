import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Topbar } from "@/components/topbar";
import { SettokuFloat } from "@/components/settoku-float";
import { SetupBanner } from "@/components/setup-banner";
import { CommandPalette } from "@/components/command-palette";
import { getAuthContext, getUserAgencies } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user, agencyId, role } = await getAuthContext();
  const workspaces = await getUserAgencies();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const activeWorkspace = workspaces.find(w => w.id === agencyId);
  const workspaceName = activeWorkspace?.name ?? "Settoku OS";

  // Workspace template gates the sheet-based (coach-tenant) nav — creator tenants (e.g. the creator) don't see it.
  let dashboardTemplate: string | null = null;
  if (agencyId) {
    const { data: agencyRow } = await supabase
      .from("agencies")
      .select("dashboard_template")
      .eq("id", agencyId)
      .maybeSingle<{ dashboard_template: string }>();
    dashboardTemplate = agencyRow?.dashboard_template ?? null;
  }

  const userName = profile?.full_name ?? user.user_metadata?.full_name ?? null;
  const userEmail = profile?.email ?? user.email ?? "";
  const userRole = role;

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{backgroundColor:"#09090C"}}>
      <SetupBanner />
      <Topbar
        workspaceName={workspaceName}
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        agencyId={agencyId}
      />

      <AppShell
        workspaceName={workspaceName}
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        workspaces={workspaces}
        activeAgencyId={agencyId}
        template={dashboardTemplate}
      >
        {children}
      </AppShell>

      <SettokuFloat agencyId={agencyId ?? ""} userId={user.id} />
      <CommandPalette template={dashboardTemplate} />
    </div>
  );
}
