import { SettingsHeader, SettingsCard } from "../_section";
import { Building2, Lock, Globe, Headphones } from "lucide-react";

const FEATURES = [
  { icon: Building2, title: "SSO + SCIM",       desc: "SAML / Okta / Azure AD with auto-provisioning." },
  { icon: Lock,      title: "Audit logs",       desc: "Full activity trail of who did what, when." },
  { icon: Globe,     title: "Data residency",   desc: "Choose where your data is stored (US / EU)." },
  { icon: Headphones, title: "Dedicated support", desc: "Slack channel + a named account manager." },
];

export default function EnterprisePage() {
  return (
    <div className="space-y-6">
      <SettingsHeader title="Enterprise" sub="Built for the agencies that need more." />

      <SettingsCard>
        <div className="text-center py-4">
          <div className="text-base font-semibold text-[#F5F5F7]">You're on the Starter plan</div>
          <p className="mt-1 max-w-md mx-auto text-sm text-[#9CA3AF]">
            Enterprise unlocks SSO, audit logs, advanced security, and dedicated support. Talk to us if you're scaling past 25 seats.
          </p>
          <button className="mt-5 rounded-lg bg-blue-500 px-5 py-2 text-sm font-medium text-white hover:bg-blue-600">Contact sales</button>
        </div>
      </SettingsCard>

      <div className="grid grid-cols-2 gap-3">
        {FEATURES.map(f => (
          <div key={f.title} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)] mb-3">
              <f.icon className="size-4 text-[#9CA3AF]" />
            </div>
            <div className="text-sm font-semibold text-[#F5F5F7]">{f.title}</div>
            <div className="mt-1 text-xs text-[#9CA3AF]">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
