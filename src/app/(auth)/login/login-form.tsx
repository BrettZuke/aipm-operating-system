"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "That email isn't on the team allowlist. Ask your admin to add you.",
  auth_callback_failed: "Sign-in failed. Please try again.",
  no_email: "Couldn't read an email from your account. Try a different sign-in method.",
  no_workspace: "You're not part of a workspace yet. Ask your admin to send you an invite link.",
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialError = (() => {
    const code = params.get("error");
    return code ? (ERROR_MESSAGES[code] ?? "Sign-in failed.") : null;
  })();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      const supabase = createClient();
      const next = params.get("next") || "/dashboard";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      const next = params.get("next") || "/dashboard";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl p-8" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",boxShadow:"0 0 0 1px rgba(255,255,255,0.04), 0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,131,255,0.05)"}}>
      <header className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="your agency" width={36} height={36} className="rounded-lg object-cover" />
          <span className="font-semibold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair)",letterSpacing:"-0.01em"}}>your agency</span>
        </div>
        <span className="rounded-full border border-[rgba(255,255,255,0.10)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">
          • Sign in
        </span>
      </header>

      <h1 className="text-2xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif", letterSpacing:"-0.01em"}}>Welcome back</h1>
      <p className="mt-2 text-sm text-[#9CA3AF]">
        Sign in to keep operating your workspace.
      </p>

      <div className="my-6 h-px bg-[rgba(255,255,255,0.06)]" />

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading || loading}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-[rgba(255,255,255,0.10)] bg-white px-4 py-2.5 text-sm font-medium text-[#1F1F1F] transition hover:bg-[#F5F5F5] disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {googleLoading ? "Redirecting…" : "Continue with Google"}
      </button>

      <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wider text-[#6B7280]">
        <div className="h-px flex-1 bg-[rgba(255,255,255,0.06)]" />
        or with email
        <div className="h-px flex-1 bg-[rgba(255,255,255,0.06)]" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[rgba(245,245,247,0.8)]">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="size-4 rounded border-[rgba(255,255,255,0.10)] bg-[#0C0C10] accent-blue-500"
            />
            Keep me signed in
          </label>
          <Link
            href="/forgot-password"
            className="text-sm hover:underline" style={{color:"#0083FF"}}
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
          <ArrowRight />
        </Button>
      </form>

      <footer className="mt-6 flex items-center justify-between text-xs text-[#6B7280]">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" /> Protected by SSO-grade auth
        </span>
        <span>
          New to AI Partner?{" "}
          <Link href="/signup" className="hover:underline" style={{color:"#0083FF"}}>
            Request access
          </Link>
        </span>
      </footer>
    </div>
  );
}
