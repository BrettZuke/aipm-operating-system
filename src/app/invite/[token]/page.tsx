import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ACTIVE_AGENCY_COOKIE = "settoku-active-agency";

interface Params {
  token: string;
}

export default async function InviteAcceptPage({ params }: { params: Promise<Params> }) {
  const { token } = await params;
  const supabase = await createClient();

  // The invitations table is admin-only under RLS, and the invitee usually hits this link
  // logged-out (no session) — so we MUST read/write it with the service-role key, or the
  // lookup returns null and the invitee sees a false "Invalid invite link".
  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!adminUrl || !adminKey) {
    return <ErrorCard title="Invites unavailable" message="The server isn't configured to process invites right now. Ask the workspace owner to check Supabase admin credentials." />;
  }
  const admin = createAdminClient(adminUrl, adminKey, { auth: { persistSession: false } });

  // 1. Look up the invitation by token (admin client — no session required yet).
  const { data: invitation } = await admin
    .from("invitations")
    .select("id, agency_id, invited_email, role, accepted_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invitation) {
    return <ErrorCard title="Invalid invite link" message="We couldn't find that invitation. The link may be wrong or the invite was revoked." />;
  }

  if (invitation.accepted_at) {
    redirect("/dashboard");
  }

  if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
    return <ErrorCard title="Invite expired" message="This invite link is older than 7 days. Ask the workspace owner to send a fresh one." />;
  }

  // 2. Auth: if not logged in, bounce to /login with this URL as the `next` target
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  // 3. If the logged-in user's email doesn't match the invited email, show mismatch
  if (user.email?.toLowerCase() !== invitation.invited_email.toLowerCase()) {
    return (
      <ErrorCard
        title="Wrong account"
        message={`This invite is for ${invitation.invited_email}, but you're signed in as ${user.email}. Sign out and sign back in with the right email.`}
        actionHref="/auth/signout"
        actionLabel="Sign out"
      />
    );
  }

  // 4. Insert membership + mark invitation accepted (admin client — agency_members writes are
  //    admin-only under RLS, so a self-join via the user's session would be blocked).
  //    unique (agency_id, user_id) means the upsert is safe to retry.
  const { error: memberError } = await admin.from("agency_members").upsert(
    {
      agency_id: invitation.agency_id,
      user_id: user.id,
      role: invitation.role,
      status: "active",
    },
    { onConflict: "agency_id,user_id" },
  );

  if (memberError) {
    return <ErrorCard title="Could not join workspace" message={memberError.message} />;
  }

  await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  // 5. Switch active workspace cookie to the freshly-joined agency
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_AGENCY_COOKIE, invitation.agency_id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}

function ErrorCard({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090C] p-6">
      <div className="max-w-md rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-8 text-center">
        <h1 className="text-xl font-semibold text-[#F5F5F7]">{title}</h1>
        <p className="mt-2 text-sm text-[#9CA3AF]">{message}</p>
        {actionHref && actionLabel && (
          <a
            href={actionHref}
            className="mt-6 inline-block rounded-lg bg-[#0083FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#00A4FF]"
          >
            {actionLabel}
          </a>
        )}
      </div>
    </div>
  );
}
