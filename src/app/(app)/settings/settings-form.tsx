"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameWorkspace, updateProfile } from "./actions";

type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  timezone: string | null;
} | null;

export function SettingsForm({
  profile,
  agencyName,
  role,
  email,
}: {
  profile: Profile;
  agencyName: string;
  role: string | null;
  email: string;
}) {
  const [pending, sp] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(fd: FormData) {
    sp(async () => {
      setError(null);
      const result = await updateProfile(fd);
      if (!result.ok) setError(result.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name</Label>
          <Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} placeholder="Your full name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email_display">Email</Label>
          <Input id="email_display" value={email} disabled className="opacity-60" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="company_name">Company Name</Label>
          <Input id="company_name" name="company_name" defaultValue={agencyName} placeholder="Your company" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="job_title">Job Title</Label>
          <Input id="job_title" name="job_title" placeholder="e.g. Sales Manager" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" placeholder="+1 (555) 000-0000" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">TIMEZONE</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={profile?.timezone ?? "America/New_York"}
            className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7] focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney", "UTC"].map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Profile"}
        </Button>
        {saved && !pending && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <Check className="size-3.5" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

export function WorkspaceForm({ name, role }: { name: string; role: string | null }) {
  const [pending, sp] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role === "owner" || role === "admin";

  function onSubmit(fd: FormData) {
    sp(async () => {
      setError(null);
      const result = await renameWorkspace(fd);
      if (!result.ok) setError(result.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="workspace_name">Workspace name</Label>
        <Input id="workspace_name" name="name" defaultValue={name} maxLength={120} disabled={!isAdmin} />
      </div>
      {error && <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !isAdmin}>{pending ? "Saving…" : "Save changes"}</Button>
        {saved && !pending && <span className="flex items-center gap-1 text-sm text-emerald-400"><Check className="size-3.5" /> Saved</span>}
      </div>
    </form>
  );
}
