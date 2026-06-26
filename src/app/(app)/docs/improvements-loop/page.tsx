import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ImprovementsLoopDocPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <Link href="/docs" className="inline-flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[#F5F5F7]">
        <ArrowLeft className="size-3.5" /> Docs
      </Link>

      <header>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SYSTEM · SELF-IMPROVEMENT</div>
        <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>The improvements loop</h1>
        <p className="mt-2 text-sm text-[#9CA3AF]">Settoku has a built-in &ldquo;to-do list of fixes for itself.&rdquo; Bugs, tech debt, feature ideas — all in one queue, prioritised, with a robot that auto-finds new items.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">What&apos;s on the queue</h2>
        <p className="text-sm text-[#9CA3AF]">Open <Link href="/improvements" className="text-blue-400 hover:underline">/improvements</Link>. You&apos;ll see tabs for Open / In progress / Blocked / Done. Each item has a kind (bug, tech debt, feature, audit, security, perf, data quality), a priority (P1-P5), and an expandable detail with description / proposed fix / evidence.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">Where items come from</h2>
        <ul className="list-disc pl-6 space-y-1.5 text-sm text-[rgba(245,245,247,0.85)]">
          <li><strong>You</strong>: click <strong>New improvement</strong> and add anything you want fixed/built.</li>
          <li><strong>The self-discovery cron</strong> at <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">/api/cron/self-discover</code> (4am UTC daily). Audits webhook freshness, outstanding balances, orphan deals, missing notes, missing phones, unattributed transactions. Adds findings as <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">source: self_discover</code>.</li>
          <li><strong>External tools</strong>: any service can POST to add an item via the same endpoint pattern.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">Working an item</h2>
        <ol className="list-decimal pl-6 space-y-1.5 text-sm text-[rgba(245,245,247,0.85)]">
          <li>Click ▶ on a row to mark it <strong>in_progress</strong>.</li>
          <li>Do the work (or hand the item to Claude Code as a prompt).</li>
          <li>Run <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">node scripts/quality-harness.mjs --pretty</code> — it runs tsc, lint, build, smoke, health. Must be ✅ green.</li>
          <li>Click ✓ to mark <strong>done</strong>. Or 🚫 if blocked.</li>
        </ol>
      </section>

      <Link href="/docs" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:underline">
        Back to docs <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
