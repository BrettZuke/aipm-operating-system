"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTransaction, updateTransaction } from "./actions";

type Row = {
  id: string;
  client_id: string | null;
  amount: number | null;
  currency: string | null;
  kind: string | null;
  description: string | null;
  occurred_at: string | null;
};

type ClientOpt = { id: string; name: string };

type Props = {
  mode: "create" | "edit";
  transaction?: Row;
  clients: ClientOpt[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function TransactionFormDialog({
  mode,
  transaction,
  clients,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const result =
        mode === "create"
          ? await createTransaction(null, formData)
          : await updateTransaction(transaction!.id, formData);
      if (!result.ok) setError(result.error);
      else setOpen(false);
    });
  }

  // Convert ISO occurred_at → "yyyy-MM-ddThh:mm" for datetime-local input
  const defaultOccurredAt = transaction?.occurred_at
    ? new Date(transaction.occurred_at).toISOString().slice(0, 16)
    : new Date().toISOString().slice(0, 16);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">
              <Plus />
              New transaction
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Record a transaction" : "Edit transaction"}
          </DialogTitle>
          <DialogDescription>
            Track payments, refunds, chargebacks, and manual adjustments.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={transaction?.amount ?? ""}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                name="currency"
                maxLength={3}
                defaultValue={transaction?.currency ?? "USD"}
                placeholder="USD"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="kind">Type</Label>
            <select
              id="kind"
              name="kind"
              defaultValue={transaction?.kind ?? "payment"}
              className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]"
            >
              <option value="payment">Payment</option>
              <option value="refund">Refund</option>
              <option value="chargeback">Chargeback</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_id">Client</Label>
            <select
              id="client_id"
              name="client_id"
              defaultValue={transaction?.client_id ?? ""}
              className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]"
            >
              <option value="">— No client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="text-xs text-[#6B7280]">
                Add clients first to attribute revenue.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="occurred_at">Occurred at</Label>
            <Input
              id="occurred_at"
              name="occurred_at"
              type="datetime-local"
              defaultValue={defaultOccurredAt}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              defaultValue={transaction?.description ?? ""}
              placeholder="e.g. Monthly retainer — January"
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : mode === "create"
                  ? "Record transaction"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
