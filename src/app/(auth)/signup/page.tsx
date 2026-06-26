"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Lock, Mail, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, account_type: "agency" },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-8">
        <h1 className="text-2xl font-semibold text-[#F5F5F7]">Check your email</h1>
        <p className="mt-2 text-sm text-[#9CA3AF]">
          We sent a confirmation link to <strong>{email}</strong>. Click it to
          activate your account.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm hover:underline" style={{color:"#0083FF"}}
        >
          Back to sign in →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-8 shadow-2xl backdrop-blur">
      <header className="mb-8 flex items-center gap-3">
        <img src="/logo.svg" alt="your agency" width={36} height={36} className="rounded-lg object-cover" />
        <span className="font-semibold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair)",letterSpacing:"-0.01em"}}>your agency</span>
      </header>

      <h1 className="text-2xl font-semibold text-[#F5F5F7]">Create your workspace</h1>
      <p className="mt-2 text-sm text-[#9CA3AF]">
        The AI operating system for info-product teams.
      </p>

      <div className="my-6 h-px bg-[rgba(255,255,255,0.06)]" />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
            <Input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="pl-10"
            />
          </div>
        </div>

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

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
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
          {loading ? "Creating…" : "Create workspace"}
          <ArrowRight />
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-[#6B7280]">
        Already have an account?{" "}
        <Link href="/login" className="hover:underline" style={{color:"#0083FF"}}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
