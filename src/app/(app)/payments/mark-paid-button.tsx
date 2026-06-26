"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { markPaymentPaid } from "./actions";

export function MarkPaidButton({ clientId, paymentId, amount }: { clientId: string; paymentId: string; amount: number }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Mark $${amount.toFixed(2)} as paid?`)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("client_id", clientId);
      fd.set("payment_id", paymentId);
      fd.set("amount", String(amount));
      fd.set("paid_date", new Date().toISOString().slice(0, 10));
      await markPaymentPaid(null, fd);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
      title="Mark as paid"
    >
      <Check className="size-3" /> {pending ? "..." : "Paid"}
    </button>
  );
}
