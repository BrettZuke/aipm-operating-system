"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-8 shadow-2xl backdrop-blur">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 font-semibold text-white">
          S
        </div>
        <span className="font-semibold text-[#F5F5F7]">AI Partner</span>
      </header>

      <h1 className="text-2xl font-semibold text-[#F5F5F7]">Reset password</h1>
      <p className="mt-2 text-sm text-[#9CA3AF]">
        Enter your email — we&apos;ll send a reset link.
      </p>

      <div className="my-6 h-px bg-[rgba(255,255,255,0.06)]" />

      {sent ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Reset link sent to <strong>{email}</strong>. Check your inbox.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="pl-10"
              />
            </div>
          </div>
          {error && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Sending…" : "Send reset link"} <ArrowRight />
          </Button>
        </form>
      )}

      <Link
        href="/login"
        className="mt-6 block text-center text-sm text-blue-400 hover:underline"
      >
        ← Back to sign in
      </Link>
    </div>
  );
}
