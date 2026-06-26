"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveOrganization } from "./actions";

const INDUSTRIES = [
  "Coaching / consulting",
  "Info-products",
  "Agency",
  "SaaS",
  "E-commerce",
  "Other",
];

export function OrganizationForm({ initial }: { initial: { name: string; industry: string; website: string } }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const r = await saveOrganization(null, formData);
      if (!r.ok) setError(r.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" defaultValue={initial.name} placeholder="your agency" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="industry">Industry</Label>
        <select id="industry" name="industry" defaultValue={initial.industry || INDUSTRIES[0]} className="h-9 w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#09090C] px-3 text-sm text-[#F5F5F7] focus:outline-none focus:ring-2 focus:ring-blue-500/20">
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" type="url" defaultValue={initial.website} placeholder="https://example.com" />
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        {error && <span className="text-xs text-red-400">{error}</span>}
        {saved && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="size-3" />Saved</span>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
