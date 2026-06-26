import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SettingsHeader, SettingsCard } from "../_section";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const { supabase, agencyId } = await getAuthContext();
  const [{ data: members, count }] = await Promise.all([
    agencyId
      ? supabase.from("agency_members").select("user_id,role,profiles(full_name,email)", { count: "exact" }).eq("agency_id", agencyId).eq("status","active")
      : Promise.resolve({ data: [], count: 0 }),
  ]);

  return (
    <div className="space-y-6">
      <SettingsHeader title="Team" sub={`${count ?? 0} active member${count === 1 ? "" : "s"} in this workspace.`} />

      <SettingsCard title="Members" sub="Add, remove, and assign roles. Full management lives at /team.">
        {(members ?? []).length === 0 ? (
          <div className="text-sm text-[#9CA3AF] text-center py-6">No team members yet.</div>
        ) : (
          <div className="space-y-2">
            {(members ?? []).slice(0, 5).map((m) => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              return (
                <div key={m.user_id} className="flex items-center justify-between rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-[#F5F5F7]">{p?.full_name ?? p?.email ?? "—"}</div>
                    <div className="text-xs text-[#6B7280]">{p?.email}</div>
                  </div>
                  <span className="text-xs text-[#9CA3AF] capitalize">{m.role}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Link href="/team" className="flex items-center gap-1.5 text-sm text-blue-400 hover:underline">
            Open Team page <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </SettingsCard>
    </div>
  );
}
