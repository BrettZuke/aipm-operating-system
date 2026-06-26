import { SettingsHeader, SettingsCard } from "../_section";
import { Sparkles, FileText, Database, Mic, Mail } from "lucide-react";

const SCOPES = [
  { icon: Sparkles, label: "Settoku Chat",    desc: "Let Settoku read and reason over your workspace.", enabled: true },
  { icon: FileText, label: "Knowledge Library", desc: "Index documents, brand voice, offers, decisions.",  enabled: true },
  { icon: Database, label: "Data access",     desc: "Read clients, deals, transactions, calls, EOD.",   enabled: true },
  { icon: Mail,     label: "Outreach drafts", desc: "Generate DMs and email drafts on your behalf.",     enabled: false },
  { icon: Mic,      label: "Voice transcription", desc: "Transcribe call recordings and extract insights.", enabled: false },
];

export default function AIAccessPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader title="AI access" sub="Decide what Settoku can read, write, and act on." />

      <div className="space-y-3">
        {SCOPES.map(scope => (
          <div key={scope.label} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
                  <scope.icon className="size-4 text-[#9CA3AF]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#F5F5F7]">{scope.label}</div>
                  <div className="mt-0.5 text-xs text-[#9CA3AF]">{scope.desc}</div>
                </div>
              </div>
              <button className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                scope.enabled ? "bg-[rgba(0,131,255,0.5)]" : "bg-[rgba(255,255,255,0.08)]"
              }`}>
                <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${scope.enabled ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <SettingsCard title="Approval gates" sub="Require human approval before Settoku takes high-impact actions.">
        <div className="space-y-3 text-sm">
          {[
            "Sending an email or DM",
            "Booking a meeting on someone's calendar",
            "Creating an invoice or charging a customer",
            "Updating a client's data",
          ].map(item => (
            <div key={item} className="flex items-center justify-between">
              <span className="text-[#9CA3AF]">{item}</span>
              <span className="text-xs font-semibold text-emerald-400">Requires approval</span>
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
