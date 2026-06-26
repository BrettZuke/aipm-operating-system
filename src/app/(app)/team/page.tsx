import { Users } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { initialsFromName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TeamInviteDialog } from "./team-invite-dialog";
import { CopyInviteLink } from "./copy-invite-link";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { supabase, agencyId } = await getAuthContext();
  const [{ data: members }, { data: invites }, { data: agency }] = await Promise.all([
    supabase.from("agency_members").select("id,role,status,joined_at,user_id,profiles(id,full_name,email)").eq("agency_id", agencyId!).order("joined_at"),
    supabase.from("invitations").select("id,invited_email,role,expires_at,created_at,token").eq("agency_id", agencyId!).is("accepted_at", null),
    supabase.from("agencies").select("id").eq("id", agencyId!).maybeSingle(),
  ]);

  const ROLE_VARIANT: Record<string,"primary"|"default"|"muted"> = { owner:"primary", admin:"primary", member:"default", viewer:"muted" };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#F5F5F7]">Team</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Manage your agency team</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search member" className="h-9 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 pl-9 pr-3 text-sm text-[rgba(245,245,247,0.8)] placeholder:text-[#6B7280] focus:outline-none" />
          </div>
          <TeamInviteDialog />
        </div>
      </div>

      {/* How invites work */}
      <div className="flex items-center gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-5 py-3.5 text-sm text-[#9CA3AF]">
        <svg className="size-4 shrink-0 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <span>Use <span className="text-[rgba(245,245,247,0.9)]">Invite member</span> to create a private link for each teammate. Each link only grants access to <span className="text-[rgba(245,245,247,0.9)]">this</span> workspace and only works for the email you invite.</span>
      </div>

      {/* Filter row */}
      <div className="flex gap-2">
        {["All Roles", "All Status"].map(f => (
          <button key={f} className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/60 px-3 py-1.5 text-sm text-[#9CA3AF] hover:border-[rgba(255,255,255,0.18)]">{f}</button>
        ))}
        <button className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/60 px-3 py-1.5 text-sm text-[#9CA3AF] hover:text-[rgba(245,245,247,0.8)]">Clear</button>
      </div>

      {/* Members */}
      {!members?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 py-16 text-center">
          <Users className="size-8 text-[rgba(245,245,247,0.3)] mb-3" />
          <p className="text-sm text-[#9CA3AF]">No team members found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
          <ul className="divide-y divide-[rgba(255,255,255,0.08)]">
            {members.map(m => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              const name = p?.full_name ?? p?.email ?? "Unknown";
              return (
                <li key={m.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-sm font-semibold text-[#F5F5F7]">{initialsFromName(name)}</div>
                    <div>
                      <div className="text-sm font-medium text-[#F5F5F7]">{name}</div>
                      <div className="text-xs text-[#6B7280]">{p?.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={ROLE_VARIANT[m.role] ?? "default"} className="capitalize">{m.role}</Badge>
                    <span className="text-xs text-[#6B7280]">{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Pending invites */}
      {invites && invites.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
          <div className="border-b border-[rgba(255,255,255,0.08)] px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#6B7280]">Pending invitations</div>
          <ul className="divide-y divide-[rgba(255,255,255,0.08)]">
            {invites.map(inv => (
              <li key={inv.id} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-[rgba(245,245,247,0.8)]">{inv.invited_email}</span>
                <div className="flex items-center gap-3">
                  <Badge variant={ROLE_VARIANT[inv.role] ?? "default"} className="capitalize">{inv.role}</Badge>
                  <span className="text-xs text-[#6B7280]">Expires {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "—"}</span>
                  <CopyInviteLink token={inv.token} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
