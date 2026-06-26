"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Hash } from "lucide-react";
import { sendPaymentReminder } from "../settings/integrations/test-actions";
import { slackOverduePayment } from "./slack-actions";

type Props = {
  clientId: string;
  clientName: string;
  phone: string | null;
  amount: number;
  daysOverdue: number;
  productName?: string;
};

export function SendReminderButton(props: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSms() {
    if (!props.phone) {
      setResult({ ok: false, msg: "No phone on file for this client." });
      return;
    }
    startTransition(async () => {
      const r = await sendPaymentReminder({
        clientId: props.clientId,
        phone: props.phone!,
        clientName: props.clientName,
        amount: props.amount,
        daysOverdue: props.daysOverdue,
        productName: props.productName,
      });
      setResult({ ok: r.ok, msg: r.ok ? r.message : r.error });
    });
  }

  function handleSlack() {
    startTransition(async () => {
      const r = await slackOverduePayment({
        clientName: props.clientName,
        amount: props.amount,
        daysOverdue: props.daysOverdue,
        email: null,
      });
      setResult({ ok: r.ok, msg: r.ok ? r.message : r.error });
    });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleSms}
        disabled={pending || !props.phone}
        title={props.phone ? `Text reminder to ${props.phone}` : "No phone on file"}
        className="flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-1 text-[10px] text-blue-400 hover:bg-blue-500/10 disabled:opacity-40"
      >
        <MessageSquare className="size-3" /> SMS
      </button>
      <button
        onClick={handleSlack}
        disabled={pending}
        title="Post overdue alert to Slack #ops"
        className="flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/5 px-2 py-1 text-[10px] text-purple-400 hover:bg-purple-500/10 disabled:opacity-40"
      >
        <Hash className="size-3" /> Slack
      </button>
      {result && (
        <span className={`ml-1.5 text-[10px] ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
          {result.ok ? "✓" : "✗"}
        </span>
      )}
    </div>
  );
}
