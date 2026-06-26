"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { getAuthContext } from "@/lib/auth";

type Result =
  | { ok: true; token: string; emailed: boolean }
  | { ok: false; error: string };

type InvitationRole = "admin" | "member" | "viewer";

export async function inviteTeamMember(_prev: unknown, formData: FormData): Promise<Result> {
  const email   = String(formData.get("email") ?? "").trim().toLowerCase();
  const rawRole = String(formData.get("role") ?? "member");

  if (!email || !email.includes("@")) {
    return { ok: false, error: "A valid email is required." };
  }

  // member_role enum only supports owner/admin/member/viewer — owner can't be granted via invite.
  const role: InvitationRole =
    rawRole === "admin" ? "admin" : rawRole === "viewer" ? "viewer" : "member";

  // Security gate: only owners/admins of the ACTIVE workspace may invite, and the invite is
  // always scoped to that workspace's agency_id — so an invitee can only ever land here.
  const { agencyId, role: inviterRole, user: inviter } = await getAuthContext();
  if (!agencyId) return { ok: false, error: "No active workspace." };
  if (inviterRole !== "owner" && inviterRole !== "admin") {
    return { ok: false, error: "Only workspace owners and admins can invite people." };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Server is missing Supabase admin credentials — contact support." };
  }
  // Admin client: the invitations table is admin-only under RLS, so writing it with the
  // service-role key is what makes the invite reliably get created (and readable by the
  // logged-out invitee later). It does NOT widen tenant access — the row carries this agency_id.
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const expires = new Date(); expires.setDate(expires.getDate() + 7);
  const token = randomBytes(24).toString("hex");

  // Replace any stale pending invite for this email+workspace, then insert a fresh one.
  // (Avoids duplicate pending rows and always hands back a working, non-expired token.)
  await admin.from("invitations")
    .delete()
    .eq("agency_id", agencyId)
    .eq("invited_email", email)
    .is("accepted_at", null);

  const { error: inviteErr } = await admin.from("invitations").insert({
    agency_id: agencyId,
    invited_email: email,
    role,
    expires_at: expires.toISOString(),
    token,
  });
  if (inviteErr) return { ok: false, error: inviteErr.message };

  // Best-effort email. The copy-link is the primary mechanism, so a failed/!configured
  // email must NOT roll back the invite (that was the old bug — invites vanished silently).
  let emailed = false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(`/invite/${token}`)}`,
      data: {
        invited_to_agency_id: agencyId,
        invited_role: role,
        invited_by: inviter.email,
      },
    });
    emailed = !emailErr;
  }

  revalidatePath("/team");
  return { ok: true, token, emailed };
}
