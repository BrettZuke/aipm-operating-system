import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Email confirmation / OAuth / invite callback.
 * Supabase redirects here after a user clicks any auth email link or finishes OAuth.
 *
 * Access control:
 *   1. Exchange code for session.
 *   2. Accept any pending invitations matching their email (this grants the membership).
 *   3. Authorize: a user may proceed only if they have a workspace membership OR their email
 *      is on the TEAM_ALLOWED_EMAILS allowlist. Otherwise they're signed out.
 *      A valid invite is authorization on its own — invitees don't need to be on the allowlist.
 *
 * Tenant isolation: we NEVER auto-assign an un-invited user to a default workspace. Access to a
 * workspace comes only from an invitation (or an explicit membership), so an invitee can only ever
 * see the workspace they were invited to.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Prevent open-redirect: only same-origin absolute paths, never protocol-relative ("//evil.com").
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (!code) return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.redirect(`${origin}/login?error=no_email`);

  const email = user.email.toLowerCase();

  const allowlist = (process.env.TEAM_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const onAllowlist = allowlist.includes(email);

  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!adminUrl || !adminKey) {
    // Can't reconcile invites/memberships without admin — fall back to allowlist-only.
    if (allowlist.length > 0 && !onAllowlist) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_authorized`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  const admin = createSupabaseAdmin(adminUrl, adminKey, { auth: { persistSession: false } });

  // ---- Accept pending invitations (grants membership to the invited workspace only) ----
  const { data: invites } = await admin
    .from("invitations")
    .select("id,agency_id,role,expires_at,accepted_at")
    .eq("invited_email", email)
    .is("accepted_at", null);

  for (const inv of invites ?? []) {
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) continue;

    const { data: existing } = await admin
      .from("agency_members")
      .select("user_id")
      .eq("agency_id", inv.agency_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      await admin.from("agency_members").insert({
        agency_id: inv.agency_id,
        user_id: user.id,
        role: inv.role,
        status: "active",
      });
    }

    await admin.from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);
  }

  // ---- Authorize: membership (incl. just-accepted invites) OR allowlist ----
  const { data: memberships } = await admin
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  const hasMembership = !!(memberships && memberships.length > 0);

  if (!hasMembership && !onAllowlist) {
    // No workspace and not pre-approved. We deliberately do NOT drop them into a default
    // workspace (that would expose another tenant's data). Sign out with a clear reason.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_workspace`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
