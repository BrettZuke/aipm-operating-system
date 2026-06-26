"use client";

import { useState, useTransition } from "react";
import { Lock, KeyRound, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, signOutEverywhere } from "./actions";

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const r = await changePassword(null, formData);
      if (!r.ok) setError(r.error);
      else { setSaved(true); setTimeout(() => setSaved(false), 2500); (document.getElementById("change-password-form") as HTMLFormElement)?.reset(); }
    });
  }

  return (
    <form id="change-password-form" action={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs text-red-400">{error}</span>}
        {saved && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="size-3" />Password updated</span>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Change password"}</Button>
      </div>
    </form>
  );
}

export function SignOutEverywhereButton() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirm("This will sign you out on every other device (laptops, mobile, etc). You'll stay signed in here. Continue?")) return;
    startTransition(async () => {
      setError(null);
      const r = await signOutEverywhere();
      if (!r.ok) setError(r.error);
      else { setDone(true); setTimeout(() => setDone(false), 3000); }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
          <KeyRound className="size-4 text-[#9CA3AF]" />
        </div>
        <div>
          <div className="text-sm font-medium text-[#F5F5F7]">Other sessions</div>
          <div className="text-xs text-[#6B7280]">Sign out on all other devices</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-400">{error}</span>}
        {done  && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="size-3" />Done</span>}
        <button onClick={handleClick} disabled={pending} className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50">
          {pending ? "…" : "Sign out everywhere"}
        </button>
      </div>
    </div>
  );
}
