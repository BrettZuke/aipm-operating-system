"use client";

import { useState, useTransition } from "react";
import { Users, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteTeamMember } from "./actions";

// Only the access levels the system actually enforces. (Sales roles like "closer/setter"
// are tracked from call data, not from workspace access — they don't belong here.)
const ROLES = [
  { value: "member", label: "Member", desc: "Standard access to this workspace" },
  { value: "admin",  label: "Admin",  desc: "Can manage settings and invite people" },
  { value: "viewer", label: "Viewer", desc: "Read-only access" },
];

export function TeamInviteDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [invite, setInvite] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const email = String(formData.get("email") ?? "");
      const result = await inviteTeamMember(null, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const link = `${window.location.origin}/invite/${result.token}`;
      setInvite({ email, link, emailed: result.emailed });
    });
  }

  async function copyLink() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.link);
    } catch {
      // Fallback for browsers/contexts where the async clipboard API is blocked.
      const el = document.createElement("textarea");
      el.value = invite.link;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try { document.execCommand("copy"); } catch { /* user can still copy manually */ }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function reset() {
    setOpen(false);
    setInvite(null);
    setError(null);
    setCopied(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
          <Users className="size-4" /> Invite member
        </button>
      </DialogTrigger>
      <DialogContent>
        {invite ? (
          // ---- Success: hand over the share link ----
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Invite ready</h2>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                Send this private link to <span className="text-[rgba(245,245,247,0.9)]">{invite.email}</span>. They&apos;ll sign in with that email and land straight in this workspace.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/60 p-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap px-2 py-1 font-mono text-xs text-[rgba(245,245,247,0.8)]">{invite.link}</code>
              <button
                type="button"
                onClick={copyLink}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
              >
                {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy link</>}
              </button>
            </div>

            <p className="text-xs text-[#6B7280]">
              {invite.emailed
                ? "We also emailed them this link."
                : "The link works on its own — send it however you like (Slack, WhatsApp, email)."}{" "}
              It expires in 7 days and only works for that email address.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <Button type="button" variant="outline" onClick={() => setInvite(null)}>Invite another</Button>
              <Button type="button" onClick={reset}>Done</Button>
            </div>
          </div>
        ) : (
          // ---- Form ----
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Invite a team member</h2>
              <p className="mt-1 text-sm text-[#9CA3AF]">You&apos;ll get a private link to share. They only get access to this workspace.</p>
            </div>

            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" name="email" type="email" required placeholder="member@company.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Access level</Label>
                <select id="role" name="role" defaultValue="member" className="h-10 w-full rounded-md border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/50 px-3 text-sm text-[#F5F5F7]">
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create invite link"}</Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
