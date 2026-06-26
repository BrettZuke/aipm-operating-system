"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, X, Sparkles, CheckCircle2 } from "lucide-react";

/**
 * Onboarding wizard — fullscreen takeover for the onboarding flow.
 * Shows a dark fullscreen overlay with progress dots + step-by-step setup.
 */

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to AI Partner",
    subtitle: "Let's set up your workspace in under 2 minutes.",
    cta: "Get Started",
  },
  {
    id: "workspace",
    title: "Set up your workspace",
    subtitle: "Tell us a little about your agency so Settoku can tune itself for you.",
    cta: "Continue",
  },
  {
    id: "team",
    title: "Who's on your team?",
    subtitle: "Add your sales reps, setters, and managers. You can always add more later.",
    cta: "Continue",
  },
  {
    id: "integrations",
    title: "Connect your tools",
    subtitle: "Sync your CRM, ad accounts, and payment platforms to start seeing live data.",
    cta: "Continue",
  },
  {
    id: "done",
    title: "You're all set up",
    subtitle: "Your workspace is ready. Head to the dashboard to start operating.",
    cta: "Go to Dashboard",
  },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  function advance() {
    if (isLast) {
      window.location.href = "/dashboard";
    } else {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#060608]">
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(59,130,246,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-5">
        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`rounded-full transition-all ${
                i === step
                  ? "h-2 w-6 bg-blue-500"
                  : i < step
                    ? "size-2 bg-[rgba(255,255,255,0.15)]"
                    : "size-2 bg-[rgba(255,255,255,0.06)]"
              }`}
            />
          ))}
        </div>
        {/* Close */}
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[rgba(245,245,247,0.8)]"
        >
          <X className="size-4" />
          Close setup
        </Link>
      </div>

      {/* Main card */}
      <div className="relative z-10 flex flex-col items-center text-center px-8 max-w-md w-full">
        {/* Icon */}
        <div className="flex size-16 items-center justify-center rounded-2xl bg-blue-500/20 border border-blue-500/30 mb-6">
          {step === STEPS.length - 1 ? (
            <CheckCircle2 className="size-8 text-emerald-400" />
          ) : (
            <Sparkles className="size-8 text-blue-400" />
          )}
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-[#F5F5F7] leading-tight">
          {current.title}
        </h1>

        {/* Subtitle */}
        <p className="mt-4 text-base text-[#9CA3AF] leading-relaxed">
          {current.subtitle}
        </p>

        {/* Step content */}
        {step === 1 && (
          <div className="mt-6 w-full space-y-3 text-left">
            <div>
              <label className="text-xs font-medium text-[#9CA3AF]">Workspace name</label>
              <input
                type="text"
                placeholder="e.g. Acme Growth"
                className="mt-1.5 w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] px-4 py-2.5 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#9CA3AF]">Industry / niche</label>
              <select className="mt-1.5 w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] px-4 py-2.5 text-sm text-[#F5F5F7] focus:border-blue-500 focus:outline-none">
                <option value="">Select an industry…</option>
                <option>Coaching / consulting</option>
                <option>Info-products</option>
                <option>Agency</option>
                <option>SaaS</option>
                <option>E-commerce</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#9CA3AF]">Website URL</label>
              <input
                type="url"
                placeholder="https://yoursite.com"
                className="mt-1.5 w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10] px-4 py-2.5 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 w-full space-y-2">
            {["Sales Rep", "Setter", "Closer", "Manager"].map((role) => (
              <div
                key={role}
                className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-4 py-3 text-sm text-[#9CA3AF] hover:border-[rgba(255,255,255,0.10)] cursor-pointer"
              >
                <span>{role}</span>
                <input type="checkbox" className="accent-blue-500" />
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="mt-6 w-full grid grid-cols-2 gap-2">
            {["CRM", "Meta Ads", "Google Ads", "Stripe", "Whop", "Zapier"].map(
              (tool) => (
                <div
                  key={tool}
                  className="flex items-center gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-4 py-3 text-sm text-[#9CA3AF] hover:border-[rgba(255,255,255,0.10)] cursor-pointer"
                >
                  <div className="size-6 rounded-md bg-[rgba(255,255,255,0.08)]" />
                  {tool}
                </div>
              ),
            )}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={advance}
          className="mt-8 flex items-center gap-2 rounded-xl bg-blue-500 px-8 py-3.5 text-base font-semibold text-white hover:bg-blue-600 transition-colors"
        >
          {current.cta}
          {!isLast && <ArrowRight className="size-5" />}
        </button>

        {/* Skip (not last step, not first) */}
        {step > 0 && !isLast && (
          <button
            onClick={advance}
            className="mt-3 text-sm text-[#6B7280] hover:text-[#9CA3AF]"
          >
            Skip for now
          </button>
        )}
      </div>

      {/* Step counter */}
      <div className="absolute bottom-6 text-xs text-[rgba(245,245,247,0.3)]">
        Step {step + 1} of {STEPS.length}
      </div>
    </div>
  );
}
