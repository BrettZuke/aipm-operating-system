"use client";

import { useState, useTransition, useRef } from "react";
import { Plus, Check, ArrowLeft, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient, updateClient } from "./actions";

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  status: string | null;
  mrr: number | null;
  total_pending: number | null;
  notes: string | null;
};

type Props = {
  mode: "create" | "edit";
  client?: ClientRow;
  triggerVariant?: "header" | "empty-state";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const STEPS = [
  { num: "01", label: "Contact" },
  { num: "02", label: "Company" },
  { num: "03", label: "Opportunity" },
  { num: "04", label: "Review" },
];

const SOURCES = ["Referral", "Inbound", "Outbound", "Event", "Other"];

export function ClientFormDialog({
  mode,
  client,
  triggerVariant,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Form state for review step
  const [formState, setFormState] = useState({
    name: client?.name ?? "",
    email: client?.email ?? "",
    company: "",
    title: "",
    phone: "",
    source: "",
    status: client?.status ?? "lead",
    mrr: String(client?.mrr ?? 0),
    total_pending: String(client?.total_pending ?? 0),
    notes: client?.notes ?? "",
  });

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const result =
        mode === "create"
          ? await createClient(null, formData)
          : await updateClient(client!.id, formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setOpen(false);
        setStep(0);
      }
    });
  }

  function handleNext() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }
  function handlePrev() {
    if (step > 0) setStep(step - 1);
  }
  function update<K extends keyof typeof formState>(k: K, v: string) {
    setFormState(prev => ({ ...prev, [k]: v }));
  }

  // Edit mode: keep flat single-form layout for simplicity
  if (mode === "edit") {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Edit client</h2>
            <p className="text-sm text-[#9CA3AF]">Update this client&apos;s information.</p>
          </div>
          <form action={handleSubmit} className="space-y-4">
            <FieldGrid>
              <Field label="Name *"><Input name="name" required defaultValue={client?.name ?? ""} placeholder="Acme Inc." /></Field>
              <Field label="Contact email"><Input name="email" type="email" defaultValue={client?.email ?? ""} placeholder="contact@acme.com" /></Field>
            </FieldGrid>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select name="status" defaultValue={client?.status ?? "lead"} className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]">
                  <option value="lead">Lead</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="churned">Churned</option>
                </select>
              </Field>
              <Field label="MRR"><Input name="mrr" type="number" step="0.01" min="0" defaultValue={client?.mrr ?? 0} /></Field>
            </div>
            <Field label="Pending revenue"><Input name="total_pending" type="number" step="0.01" min="0" defaultValue={client?.total_pending ?? 0} /></Field>
            <Field label="Notes">
              <textarea name="notes" rows={3} defaultValue={client?.notes ?? ""} placeholder="Anything important about this client" className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
            </Field>
            {error && <ErrorBox msg={error} />}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // Create mode: 4-step wizard
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerVariant === "header" && (
        <DialogTrigger asChild>
          <Button size="sm"><Plus />New client</Button>
        </DialogTrigger>
      )}
      {triggerVariant === "empty-state" && (
        <DialogTrigger asChild>
          <button className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">Add Client</button>
        </DialogTrigger>
      )}
      <DialogContent>
        {/* Progress dots */}
        <div className="mb-5 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(i)}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                i === step
                  ? "bg-[rgba(0,131,255,0.10)] text-blue-400"
                  : i < step
                    ? "text-[rgba(245,245,247,0.8)] hover:bg-[rgba(255,255,255,0.05)]"
                    : "text-[#6B7280]"
              }`}
            >
              <span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${
                i < step ? "bg-emerald-500/20 text-emerald-400" : i === step ? "bg-[rgba(0,131,255,0.20)] text-blue-400" : "bg-[rgba(255,255,255,0.06)]"
              }`}>{i < step ? <Check className="size-3" /> : s.num}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Step content */}
        <form ref={formRef} action={handleSubmit} className="space-y-4">
          {/* Step 1: Contact */}
          {step === 0 && (
            <>
              <h2 className="text-lg font-semibold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Who is this?</h2>
              <FieldGrid>
                <Field label="Full name *">
                  <Input name="name" required value={formState.name} onChange={e => update("name", e.target.value)} placeholder="Jane Doe" />
                </Field>
                <Field label="Title">
                  <Input value={formState.title} onChange={e => update("title", e.target.value)} placeholder="Founder" />
                </Field>
              </FieldGrid>
              <FieldGrid>
                <Field label="Email">
                  <Input name="email" type="email" value={formState.email} onChange={e => update("email", e.target.value)} placeholder="jane@acme.com" />
                </Field>
                <Field label="Phone">
                  <Input value={formState.phone} onChange={e => update("phone", e.target.value)} placeholder="+1 (555) 000-0000" />
                </Field>
              </FieldGrid>
              <Field label="How did they find us?">
                <div className="flex flex-wrap gap-2">
                  {SOURCES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => update("source", s)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        formState.source === s
                          ? "border-[rgba(0,131,255,0.30)] bg-[rgba(0,131,255,0.10)] text-blue-400"
                          : "border-[rgba(255,255,255,0.08)] text-[#9CA3AF] hover:text-[#F5F5F7]"
                      }`}
                    >{s}</button>
                  ))}
                </div>
              </Field>
              <button type="button" className="text-xs text-blue-400 hover:underline">✨ Auto-fill from email</button>
            </>
          )}

          {/* Step 2: Company */}
          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>What company are they with?</h2>
              <Field label="Company name">
                <Input value={formState.company} onChange={e => update("company", e.target.value)} placeholder="Acme Inc." />
              </Field>
              <Field label="Website">
                <Input placeholder="https://acme.com" />
              </Field>
              <Field label="Industry">
                <select className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]">
                  <option value="">Select industry…</option>
                  <option>Coaching / consulting</option>
                  <option>Info-products</option>
                  <option>Agency</option>
                  <option>SaaS</option>
                  <option>E-commerce</option>
                  <option>Other</option>
                </select>
              </Field>
            </>
          )}

          {/* Step 3: Opportunity */}
          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>What&apos;s the opportunity?</h2>
              <FieldGrid>
                <Field label="Status">
                  <select name="status" value={formState.status} onChange={e => update("status", e.target.value)} className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]">
                    <option value="lead">Lead</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="churned">Churned</option>
                  </select>
                </Field>
                <Field label="MRR (USD)">
                  <Input name="mrr" type="number" step="0.01" min="0" value={formState.mrr} onChange={e => update("mrr", e.target.value)} />
                </Field>
              </FieldGrid>
              <Field label="Pending revenue">
                <Input name="total_pending" type="number" step="0.01" min="0" value={formState.total_pending} onChange={e => update("total_pending", e.target.value)} />
              </Field>
              <Field label="Notes">
                <textarea name="notes" rows={3} value={formState.notes} onChange={e => update("notes", e.target.value)} placeholder="Anything important about this client" className="w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
              </Field>
            </>
          )}

          {/* Step 4: Review */}
          {step === 3 && (
            <>
              <h2 className="text-lg font-semibold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Review</h2>
              <div className="space-y-3 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4 text-sm">
                <ReviewRow label="Name"     value={formState.name} />
                <ReviewRow label="Email"    value={formState.email} />
                <ReviewRow label="Company"  value={formState.company} />
                <ReviewRow label="Source"   value={formState.source} />
                <ReviewRow label="Status"   value={formState.status} />
                <ReviewRow label="MRR"      value={`$${formState.mrr}`} />
                <ReviewRow label="Pending"  value={`$${formState.total_pending}`} />
              </div>
              {/* Hidden inputs to ensure form submission has the data */}
              <input type="hidden" name="name" value={formState.name} />
              <input type="hidden" name="email" value={formState.email} />
              <input type="hidden" name="status" value={formState.status} />
              <input type="hidden" name="mrr" value={formState.mrr} />
              <input type="hidden" name="total_pending" value={formState.total_pending} />
              <input type="hidden" name="notes" value={formState.notes} />
            </>
          )}

          {error && <ErrorBox msg={error} />}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <button
              type="button"
              onClick={step === 0 ? () => setOpen(false) : handlePrev}
              className="flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[#F5F5F7]"
            >
              {step === 0 ? "Cancel" : <><ArrowLeft className="size-3.5" /> Back</>}
            </button>
            {!isLast ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                Continue <kbd className="rounded border border-white/30 px-1 text-[10px]">⌘↵</kbd>
              </button>
            ) : (
              <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create client"}</Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function ErrorBox({ msg }: { msg: string }) {
  return <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{msg}</div>;
}
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#9CA3AF]">{label}</span>
      <span className="text-[#F5F5F7] font-medium">{value || <span className="text-[#6B7280]">,</span>}</span>
    </div>
  );
}
