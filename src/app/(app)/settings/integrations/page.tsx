import { CheckCircle2, AlertCircle, Circle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingsHeader } from "../_section";
import {
  checkSettokuChat, checkSlack, checkTwilio, checkClose, checkKit,
  checkBoosend, checkRetell, checkMake, checkN8N, checkTypeform, checkICLOSED, checkFanbasis,
  type IntegrationStatus,
} from "@/lib/integrations";
import { TestPanel } from "./test-panel";

export const dynamic = "force-dynamic";

type Integration = {
  name: string;
  category: string;
  desc: string;
  enables: string;
  status: IntegrationStatus;
};

export default async function IntegrationsPage() {
  // Run all status checks in parallel
  const [
    aiChat, slack, twilio, close, kit, boosend, retell, make, n8n, typeform, iclosed, fanbasis,
  ] = await Promise.all([
    checkSettokuChat(), checkSlack(), checkTwilio(), checkClose(), checkKit(),
    checkBoosend(), checkRetell(), checkMake(), checkN8N(), checkTypeform(), checkICLOSED(), checkFanbasis(),
  ]);

  const integrations: Integration[] = [
    { name: "Settoku Chat (Groq)",  category: "AI",       desc: "Free Groq Llama model — AI assistant with workspace context", enables: "Settoku Chat answers questions about your data", status: aiChat },
    { name: "Typeform",             category: "Forms",    desc: "Closer post-call form + onboarding form",                enables: "Calls + market research auto-flow in",        status: typeform },
    { name: "iClosed",              category: "Bookings", desc: "Sales call scheduling + outcome tracking",               enables: "Booked calls auto-create call records",       status: iclosed },
    { name: "FanBasis",             category: "Payments", desc: "Payment platform — webhook live, API pending key",       enables: "Real-time payment tracking + auto-Slack wins", status: fanbasis },
    { name: "Slack",                category: "Notifications", desc: "Bot for posting wins, overdue alerts, EOD digest",   enables: "Real-time team notifications",                status: slack },
    { name: "Twilio SMS",           category: "Messaging", desc: "Send SMS reminders for webinars, overdue payments",     enables: "Auto-text clients about due payments + webinars", status: twilio },
    { name: "Close CRM",            category: "CRM",      desc: "Two-way sync of contacts, leads, and deals",             enables: "Single source of truth for pipeline",         status: close },
    { name: "Kit (ConvertKit)",     category: "Email",    desc: "List size, subscribers, broadcast performance",          enables: "Email metrics on dashboard",                  status: kit },
    { name: "Boosend",              category: "Email",    desc: "Email automation send/open/click rates",                 enables: "Email campaign performance tracking",         status: boosend },
    { name: "Retell AI",            category: "Voice",    desc: "AI voice agent for outbound dialing",                    enables: "Auto-call leads who haven't picked up",       status: retell },
    { name: "Make.com",             category: "Automation", desc: "Trigger any workflow the coach has set up",                  enables: "Cross-tool workflow automation",              status: make },
    { name: "N8N",                  category: "Automation", desc: "Self-hosted workflow automation on Railway",            enables: "Custom workflow triggers",                    status: n8n },
  ];

  const connected = integrations.filter(i => i.status.ok && i.status.status === "connected").length;
  const configured = integrations.filter(i => i.status.status === "configured").length;
  const errors = integrations.filter(i => i.status.status === "error").length;
  const missing = integrations.filter(i => i.status.status === "missing").length;

  return (
    <div className="space-y-6">
      <SettingsHeader title="Integrations" sub="Every tool wired into the OS — green means it's verified, yellow means key is set but not live-tested, red means there's an issue." />

      <TestPanel />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Connected" value={connected} color="emerald" />
        <SummaryCard label="Configured" value={configured} color="amber" />
        <SummaryCard label="Errors" value={errors} color="red" />
        <SummaryCard label="Not configured" value={missing} color="muted" />
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-3">
        {integrations.map(i => {
          const sIcon = i.status.status === "connected" ? <CheckCircle2 className="size-4 text-emerald-400" />
                       : i.status.status === "configured" ? <AlertCircle className="size-4 text-amber-400" />
                       : i.status.status === "error" ? <XCircle className="size-4 text-red-400" />
                       : <Circle className="size-4 text-[#4B5563]" />;
          const borderColor = i.status.status === "connected" ? "border-emerald-500/20"
                            : i.status.status === "configured" ? "border-amber-500/20"
                            : i.status.status === "error" ? "border-red-500/20"
                            : "border-[rgba(255,255,255,0.07)]";
          return (
            <div key={i.name} className={`rounded-xl border ${borderColor} bg-[rgba(255,255,255,0.03)] p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-0.5 shrink-0">{sIcon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#F5F5F7]">{i.name}</span>
                      <Badge variant="muted">{i.category}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#9CA3AF]">{i.desc}</p>
                    <div className="mt-2 text-xs text-[#6B7280]">
                      <span className="text-[#9CA3AF]">→ </span>{i.enables}
                    </div>
                    <div className={`mt-3 inline-block rounded-md px-2.5 py-1 text-xs ${
                      i.status.status === "connected" ? "bg-emerald-500/10 text-emerald-400"
                      : i.status.status === "configured" ? "bg-amber-500/10 text-amber-400"
                      : i.status.status === "error" ? "bg-red-500/10 text-red-400"
                      : "bg-[rgba(255,255,255,0.06)] text-[#6B7280]"
                    }`}>
                      <span className="font-mono">{i.status.info}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-[rgba(0,131,255,0.20)] bg-[rgba(0,131,255,0.04)] p-4">
        <p className="text-xs text-[#9CA3AF]">
          Add or update API keys in <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-[10px]">.env.local</code> and restart the server (<code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-[10px]">npm start</code>) to refresh.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: "emerald" | "amber" | "red" | "muted" }) {
  const cls = {
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-400",
    red: "border-red-500/20 bg-red-500/5 text-red-400",
    muted: "border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] text-[#6B7280]",
  }[color];
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-90">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
