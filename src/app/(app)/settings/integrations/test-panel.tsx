"use client";

import { useState, useTransition } from "react";
import { Send, MessageSquare, Phone, Download, ShieldCheck, CheckCircle2, XCircle, AlertCircle, Circle } from "lucide-react";
import { testSlackMessage, testSms, importCloseLeads, verifyAllIntegrations, type AllStatusResult } from "./test-actions";

type Tab = "verify" | "slack" | "sms" | "close";

export function TestPanel() {
  const [tab, setTab] = useState<Tab>("verify");
  const [pending, startTransition] = useTransition();
  const [output, setOutput] = useState<{ ok: boolean; msg: string } | null>(null);
  const [verifyResult, setVerifyResult] = useState<AllStatusResult | null>(null);

  const [slackChannel, setSlackChannel] = useState("#general");
  const [phone, setPhone] = useState("");

  function handleSlack() {
    startTransition(async () => {
      setOutput(null);
      const r = await testSlackMessage(slackChannel);
      setOutput({ ok: r.ok, msg: r.ok ? r.message : r.error });
    });
  }
  function handleSms() {
    startTransition(async () => {
      setOutput(null);
      const r = await testSms(phone);
      setOutput({ ok: r.ok, msg: r.ok ? r.message : r.error });
    });
  }
  function handleCloseImport() {
    startTransition(async () => {
      setOutput(null);
      const r = await importCloseLeads();
      setOutput({ ok: r.ok, msg: r.ok ? r.message : r.error });
    });
  }
  function handleVerifyAll() {
    startTransition(async () => {
      setOutput(null);
      setVerifyResult(null);
      const r = await verifyAllIntegrations();
      setVerifyResult(r);
      if (!r.ok) setOutput({ ok: false, msg: r.error });
    });
  }

  return (
    <div className="rounded-xl border border-[rgba(0,131,255,0.20)] bg-[rgba(0,131,255,0.04)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Send className="size-4 text-blue-400" />
        <span className="text-sm font-semibold text-[#F5F5F7]">Test integrations</span>
      </div>
      <p className="mb-4 text-xs text-[#9CA3AF]">Verify each integration is wired correctly by sending a test action.</p>

      <div className="flex gap-1 border-b border-[rgba(255,255,255,0.06)] mb-3">
        {[
          { key: "verify" as const, label: "Verify all", icon: ShieldCheck },
          { key: "slack"  as const, label: "Slack",      icon: MessageSquare },
          { key: "sms"    as const, label: "Twilio SMS", icon: Phone },
          { key: "close"  as const, label: "Close CRM",  icon: Download },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setOutput(null); setVerifyResult(null); }}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium -mb-px ${
              tab === t.key ? "border-blue-500 text-[#F5F5F7]" : "border-transparent text-[#9CA3AF] hover:text-[#F5F5F7]"
            }`}
          >
            <t.icon className="size-3" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "verify" && (
        <div className="space-y-3">
          <p className="text-xs text-[#9CA3AF]">Re-runs every integration&apos;s connectivity check in parallel. Free — no messages sent, no money spent.</p>
          <button
            onClick={handleVerifyAll}
            disabled={pending}
            className="rounded-md bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >{pending ? "Verifying…" : "Verify all integrations"}</button>

          {verifyResult?.ok && (
            <div className="space-y-1 mt-3">
              {verifyResult.results.map(r => {
                const Icon = r.status.status === "connected" ? CheckCircle2
                          : r.status.status === "configured" ? AlertCircle
                          : r.status.status === "error" ? XCircle
                          : Circle;
                const colorCls = r.status.status === "connected" ? "text-emerald-400"
                              : r.status.status === "configured" ? "text-amber-400"
                              : r.status.status === "error" ? "text-red-400"
                              : "text-[#6B7280]";
                return (
                  <div key={r.name} className="flex items-start gap-2 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0C0C10]/40 px-3 py-2">
                    <Icon className={`size-3.5 shrink-0 mt-0.5 ${colorCls}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[#F5F5F7]">{r.name}</div>
                      <div className={`text-[11px] font-mono ${colorCls}`}>{r.status.info}</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-[#6B7280]">{r.status.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "slack" && (
        <div className="space-y-2">
          <label className="text-xs text-[#9CA3AF]">Channel name or ID (e.g. #general, #wins, or C012ABC)</label>
          <div className="flex gap-2">
            <input
              value={slackChannel}
              onChange={e => setSlackChannel(e.target.value)}
              placeholder="#general"
              className="flex-1 h-9 rounded-md border border-[rgba(255,255,255,0.10)] bg-[#09090C] px-3 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              onClick={handleSlack}
              disabled={pending}
              className="rounded-md bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >{pending ? "…" : "Send test"}</button>
          </div>
        </div>
      )}

      {tab === "sms" && (
        <div className="space-y-2">
          <label className="text-xs text-[#9CA3AF]">Your phone number (E.164 format with country code)</label>
          <div className="flex gap-2">
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+15551234567"
              className="flex-1 h-9 rounded-md border border-[rgba(255,255,255,0.10)] bg-[#09090C] px-3 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              onClick={handleSms}
              disabled={pending}
              className="rounded-md bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >{pending ? "…" : "Send test SMS"}</button>
          </div>
        </div>
      )}

      {tab === "close" && (
        <div className="space-y-2">
          <p className="text-xs text-[#9CA3AF]">Imports all leads from Close CRM as clients. Idempotent — running again only updates/adds new ones.</p>
          <button
            onClick={handleCloseImport}
            disabled={pending}
            className="rounded-md bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >{pending ? "Importing…" : "Import all Close leads"}</button>
        </div>
      )}

      {output && (
        <div className={`mt-3 rounded-md px-3 py-2 text-xs font-mono ${
          output.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        }`}>
          {output.ok ? "✓ " : "✗ "}{output.msg}
        </div>
      )}
    </div>
  );
}
