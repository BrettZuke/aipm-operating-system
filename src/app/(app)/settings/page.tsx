import { getAuthContext } from "@/lib/auth";
import { SettingsForm } from "./settings-form";
import { SettingsHeader, SettingsCard } from "./_section";

export const dynamic = "force-dynamic";

export default async function SettingsProfilePage() {
  const { supabase, user, agencyId, role } = await getAuthContext();

  const [{ data: profile }, { data: agency }] = await Promise.all([
    supabase.from("profiles").select("id,full_name,email,timezone").eq("id", user.id).maybeSingle(),
    agencyId
      ? supabase.from("agencies").select("id,name").eq("id", agencyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-8">
      <SettingsHeader title="Profile" sub="Your account on Settoku. Display name, avatar, and preferences." />

      <SettingsCard>
        <SettingsForm
          profile={profile}
          agencyName={agency?.name ?? "My Workspace"}
          role={role}
          email={user.email ?? ""}
        />
      </SettingsCard>

      <SettingsCard title="Appearance" sub="Theme and display preferences.">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#9CA3AF]">Choose your default application theme.</p>
          <div className="flex rounded-lg border border-[rgba(255,255,255,0.10)] overflow-hidden">
            {[{ icon: "☀️", label: "Light" }, { icon: "⚙", label: "System" }, { icon: "🌙", label: "Dark" }].map((t) => (
              <button key={t.label} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${t.label === "Dark" ? "bg-[rgba(255,255,255,0.06)] text-[#F5F5F7]" : "bg-transparent text-[#6B7280] hover:text-[rgba(245,245,247,0.8)]"}`}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
