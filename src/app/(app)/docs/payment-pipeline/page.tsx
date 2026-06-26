import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default function PaymentPipelineDocPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <Link href="/docs" className="inline-flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[#F5F5F7]">
        <ArrowLeft className="size-3.5" /> Docs
      </Link>

      <header>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">PAYMENTS · PIPELINE</div>
        <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>How payments flow into Settoku</h1>
        <p className="mt-2 text-sm text-[#9CA3AF]">From the moment a client pays to the moment the dashboard updates — the full pipeline in 30 seconds.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">The flow</h2>
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5 space-y-3 text-sm text-[rgba(245,245,247,0.85)]">
          <div className="flex gap-3"><span className="font-mono text-blue-400 shrink-0">1.</span><span>Client pays via FanBasis (or Stripe / wire / cash).</span></div>
          <div className="flex gap-3"><span className="font-mono text-blue-400 shrink-0">2.</span><span>Zapier catches the FanBasis event and POSTs to <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">/api/webhook/fanbasis</code>. (Manual payments → Log Payment dialog on <Link href="/payments" className="text-blue-400 hover:underline">/payments</Link>.)</span></div>
          <div className="flex gap-3"><span className="font-mono text-blue-400 shrink-0">3.</span><span>The webhook upserts the client + inserts a <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">transactions</code> row.</span></div>
          <div className="flex gap-3"><span className="font-mono text-blue-400 shrink-0">4.</span><span>The post-payment pipeline fires automatically: links the tx to a matching closed_won deal, recomputes <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">contracted_total / collected_total / outstanding_balance</code> on the client.</span></div>
          <div className="flex gap-3"><span className="font-mono text-blue-400 shrink-0">5.</span><span>Slack <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">#wins</code> gets a 💰 message. If it&apos;s the first payment on a deal, the message reads &ldquo;🎉 deal closed.&rdquo;</span></div>
          <div className="flex gap-3"><span className="font-mono text-blue-400 shrink-0">6.</span><span>Dashboard + <Link href="/payments" className="text-blue-400 hover:underline">/payments</Link> + the client&apos;s detail page all reflect the new balance immediately.</span></div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">If a payment didn&apos;t come via FanBasis</h2>
        <p className="text-sm text-[#9CA3AF]">Click <strong className="text-[#F5F5F7]">Log payment</strong> on <Link href="/payments" className="text-blue-400 hover:underline">/payments</Link>. Search the client, enter amount + source (Stripe / wire / cash / in-house finance), submit. The same pipeline fires — link → recompute → Slack.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">Orphan deals</h2>
        <p className="text-sm text-[#9CA3AF]">A closed_won deal with no linked transactions gets flagged with <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">needs_review</code>. The flag clears the moment a payment lands. Surfaced on the client detail page and in the missing-data report.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">Outstanding balance</h2>
        <p className="text-sm text-[#9CA3AF]">Computed as <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">contracted_total − collected_total</code>. The Outstanding Balances section on <Link href="/payments" className="text-blue-400 hover:underline">/payments</Link> shows every client owing money, sorted by amount. The nightly maintenance cron recomputes for everyone in case any updates were missed.</p>
      </section>

      <Link href="/docs" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:underline">
        Back to docs <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
