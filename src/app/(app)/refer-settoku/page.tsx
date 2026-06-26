import { Gift } from "lucide-react";

export default function ReferPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-xl"
          style={{ background: "rgba(0,131,255,0.12)", border: "1px solid rgba(0,131,255,0.25)" }}
        >
          <Gift className="size-5" style={{ color: "#0083FF" }} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-[#F5F5F7]">Refer Settoku</h1>
          <p className="text-sm text-[#9CA3AF]">Share Settoku with another team and earn a reward when they join.</p>
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
          Your referral link
        </label>
        <div className="break-all rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#0C0C10]/60 px-3 py-2.5 font-mono text-[13px] text-[#00D393]">
          https://your-app.example.com/signup?ref=your-code
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-[#9CA3AF]">
          Wire this page up to your own referral program: generate a per-workspace code, store referrals, and reward
          both sides when a referred team upgrades.
        </p>
      </div>
    </div>
  );
}
