"use client";

import { useState, useTransition } from "react";
import { DollarSign } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logManualPayment } from "./actions";

type ClientOpt = { id: string; name: string; email: string | null };

export function LogPaymentDialog({ clients }: { clients: ClientOpt[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientOpt | null>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const result = await logManualPayment(null, formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(`Logged · transaction ${result.transactionId?.slice(0, 8) ?? ""}`);
        setSelectedClient(null);
        setSearch("");
        setTimeout(() => { setOpen(false); setSuccess(null); }, 1200);
      }
    });
  }

  const matches = search.trim().length >= 2
    ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelectedClient(null); setSearch(""); setError(null); setSuccess(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <DollarSign className="size-3.5" /> Log payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Log a manual payment</h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">For payments outside FanBasis (Stripe, wire, in-house finance, cash). Triggers the same pipeline: tx → deal link, balance recompute, Slack notify.</p>
          </div>

          <input type="hidden" name="client_id" value={selectedClient?.id ?? ""} />

          {/* Client picker */}
          <div className="space-y-1.5">
            <Label>Client</Label>
            {selectedClient ? (
              <div className="flex items-center justify-between rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium text-[#F5F5F7]">{selectedClient.name}</div>
                  <div className="text-xs text-[#6B7280]">{selectedClient.email ?? "no email"}</div>
                </div>
                <button type="button" onClick={() => { setSelectedClient(null); setSearch(""); }} className="text-xs text-[#6B7280] hover:text-[#F5F5F7]">change</button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  autoComplete="off"
                />
                {matches.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border border-[rgba(255,255,255,0.07)] bg-[#0C0C10]/60">
                    {matches.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setSelectedClient(c); setSearch(""); }}
                        className="flex w-full items-center justify-between border-b border-[rgba(255,255,255,0.04)] px-3 py-2 text-left text-sm last:border-0 hover:bg-[rgba(255,255,255,0.04)]"
                      >
                        <span className="text-[#F5F5F7]">{c.name}</span>
                        <span className="text-xs text-[#6B7280]">{c.email ?? ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0.01" placeholder="2997.00" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kind">Kind</Label>
              <select name="kind" id="kind" defaultValue="payment" className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 text-sm text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="payment">Payment</option>
                <option value="refund">Refund</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="paid_date">Date received</Label>
              <Input id="paid_date" name="paid_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <select name="source" id="source" defaultValue="stripe" className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/40 px-3 text-sm text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="stripe">Stripe</option>
                <option value="bank_wire">Bank wire</option>
                <option value="in_house_finance">In-house finance</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" name="description" placeholder="Tier 1 deposit / wire from Antonio / etc." />
          </div>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
          {success && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">{success}</div>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !selectedClient}>{pending ? "Logging…" : "Log payment"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
