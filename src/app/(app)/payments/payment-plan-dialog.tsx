"use client";

import { useState, useTransition } from "react";
import { Plus, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPaymentPlan } from "./actions";

type ClientOpt = { id: string; name: string; email: string | null };

export function PaymentPlanDialog({ clients }: { clients: ClientOpt[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [frequency, setFrequency] = useState("monthly");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const result = await createPaymentPlan(null, formData);
      if (!result.ok) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
          <Plus className="size-4" /> Schedule plan
        </button>
      </DialogTrigger>
      <DialogContent>
        <div className="mb-4">
          <div className="flex items-center gap-2 text-blue-400">
            <Calendar className="size-4" />
            <span className="text-[10px] font-semibold uppercase tracking-widest">PAYMENT PLAN</span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Schedule manual payments</h2>
          <p className="mt-1 text-sm text-[#9CA3AF]">For clients on a payment plan that isn&apos;t auto-billed via subscription.</p>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client_id">Client *</Label>
            <select id="client_id" name="client_id" required className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]">
              <option value="">Select a client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.email ? `· ${c.email}` : ""}</option>
              ))}
            </select>
            {clients.length === 0 && <p className="text-xs text-[#6B7280]">No clients without a plan yet — every client already has one.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="total_amount">Total contract value (USD) *</Label>
              <Input id="total_amount" name="total_amount" type="number" step="0.01" min="0" required placeholder="2997" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="num_payments"># of payments *</Label>
              <Input id="num_payments" name="num_payments" type="number" min="1" required defaultValue="3" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start_date">First payment date *</Label>
              <Input id="start_date" name="start_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency</Label>
              <select id="frequency" name="frequency" value={frequency} onChange={e => setFrequency(e.target.value)} className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]">
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {frequency === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom_days">Days between payments</Label>
              <Input id="custom_days" name="custom_days" type="number" min="1" defaultValue="30" />
            </div>
          )}

          {error && <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

          <div className="rounded-md border border-[rgba(0,131,255,0.20)] bg-[rgba(0,131,255,0.05)] p-3 text-xs text-[#9CA3AF]">
            We&apos;ll auto-generate evenly-spaced installments. You can mark each one paid (or it auto-detects when matching transactions land).
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create plan"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
