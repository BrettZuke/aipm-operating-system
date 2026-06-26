import { SettingsHeader, SettingsCard } from "../_section";
import { Sparkles, Mail, Users, Mic } from "lucide-react";

const USAGE = [
  { icon: Sparkles, label: "AI calls",            used: 0, limit: 5000 },
  { icon: Mail,     label: "Email generation",    used: 0, limit: 1000 },
  { icon: Users,    label: "Lead enrichment",     used: 0, limit: 500  },
  { icon: Mic,      label: "Voice transcription", used: 0, limit: 200  },
];

export default function PlanPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader title="Plan & usage" sub="What you're on, what you've used, and what's left." />

      <SettingsCard>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-[#F5F5F7]">Starter</span>
              <span className="rounded-md bg-[rgba(0,131,255,0.10)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">Current plan</span>
            </div>
            <div className="mt-0.5 text-sm text-[#9CA3AF]">$0 / month · 5,000 AI calls included</div>
          </div>
          <button className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Upgrade</button>
        </div>
      </SettingsCard>

      <SettingsCard title="Usage this month" sub="Resets the 1st of each month.">
        <div className="space-y-4">
          {USAGE.map(u => {
            const pct = Math.min(100, (u.used / u.limit) * 100);
            return (
              <div key={u.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <u.icon className="size-3.5 text-[#9CA3AF]" />
                    <span className="text-sm text-[#F5F5F7]">{u.label}</span>
                  </div>
                  <span className="text-xs font-mono text-[#9CA3AF]">{u.used.toLocaleString()} / {u.limit.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                  <div className="h-full rounded-full bg-[#0083FF]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="Add-ons" sub="Top-ups and additional features.">
        <div className="text-sm text-[#9CA3AF]">No add-ons active.</div>
      </SettingsCard>
    </div>
  );
}
