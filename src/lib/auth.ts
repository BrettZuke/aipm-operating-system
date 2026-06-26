import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_AGENCY_COOKIE = "settoku-active-agency";

/**
 * Server-side helper: returns the current user + their active agency context.
 * Redirects to /login if no session.
 *
 * Active agency is determined by:
 * 1. The `settoku-active-agency` cookie (set via switchWorkspace action)
 * 2. Falls back to the user's first active membership
 */
export async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch all active memberships
  const { data: memberships } = await supabase
    .from("agency_members")
    .select("agency_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) {
    return { supabase, user, agencyId: null, role: null };
  }

  // Resolve active agency from cookie, fall back to first membership
  const cookieStore = await cookies();
  const cookieAgencyId = cookieStore.get(ACTIVE_AGENCY_COOKIE)?.value;
  const active = memberships.find(m => m.agency_id === cookieAgencyId) ?? memberships[0];

  return {
    supabase,
    user,
    agencyId: active.agency_id,
    role: active.role,
  };
}

/**
 * Gate a Google-Sheet-backed (coach-tenant) page. Those pages read a single hardcoded sheet, so they
 * must only render for the sheet-owning workspace. Creator-template tenants (e.g. the creator) are
 * redirected to their own dashboard so one workspace never shows another's source-of-truth data.
 */
/** Active workspace's id, name, and dashboard_template ('creator' = the creator-style Stripe/GA4 tenant). */
export async function getActiveAgencyTemplate(): Promise<{ agencyId: string | null; template: string | null; name: string | null }> {
  const { supabase, agencyId } = await getAuthContext();
  if (!agencyId) return { agencyId: null, template: null, name: null };
  const { data } = await supabase
    .from("agencies")
    .select("name, dashboard_template")
    .eq("id", agencyId)
    .maybeSingle<{ name: string; dashboard_template: string }>();
  return { agencyId, template: data?.dashboard_template ?? null, name: data?.name ?? null };
}

/**
 * Returns all agencies the user is a member of (for the workspace switcher).
 */
export async function getUserAgencies() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("agency_members")
    .select("agency_id, role, agencies(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active");

  return (memberships ?? []).map(m => {
    const agency = Array.isArray(m.agencies) ? m.agencies[0] : m.agencies;
    return {
      id: m.agency_id,
      name: agency?.name ?? "Workspace",
      role: m.role,
    };
  });
}
