import { SettingsHeader, SettingsCard } from "../_section";
import { Crown, Shield, User, Phone, Megaphone } from "lucide-react";

const ROLES = [
  { key: "owner",   label: "Owner",   icon: Crown,     desc: "Full access to everything. Can transfer ownership.",      perms: ["All settings", "Billing", "Delete workspace"] },
  { key: "admin",   label: "Admin",   icon: Shield,    desc: "Manage workspace, team, integrations, and content.",       perms: ["Settings", "Team", "Integrations"] },
  { key: "manager", label: "Manager", icon: User,      desc: "Lead a team — assign work and review reports.",           perms: ["Goals", "Quotas", "Team performance"] },
  { key: "closer",  label: "Closer",  icon: Phone,     desc: "Take sales calls and close deals.",                        perms: ["Calls", "Deals", "EOD reports"] },
  { key: "setter",  label: "Setter",  icon: Megaphone, desc: "Source leads and book qualified appointments.",            perms: ["DMs", "Bookings", "EOD reports"] },
];

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader title="Roles & permissions" sub="What each role can see and do." />

      <div className="grid grid-cols-1 gap-3">
        {ROLES.map(role => (
          <div key={role.key} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
                  <role.icon className="size-4 text-[#9CA3AF]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#F5F5F7]">{role.label}</div>
                  <div className="mt-0.5 text-xs text-[#9CA3AF]">{role.desc}</div>
                </div>
              </div>
              <button className="text-xs text-[#9CA3AF] hover:text-[#F5F5F7]">Edit</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.perms.map(p => (
                <span key={p} className="rounded-md bg-[rgba(0,131,255,0.10)] px-2 py-0.5 text-xs text-blue-400">{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SettingsCard title="Custom roles" sub="Define a role tailored to your workspace.">
        <div className="text-sm text-[#9CA3AF]">No custom roles yet.</div>
        <div className="mt-3"><button className="rounded-lg border border-[rgba(255,255,255,0.10)] px-4 py-2 text-sm text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.06)]">+ New custom role</button></div>
      </SettingsCard>
    </div>
  );
}
