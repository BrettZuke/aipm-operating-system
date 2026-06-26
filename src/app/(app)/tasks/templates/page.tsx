import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

// These are illustrative — Settoku doesn't auto-apply them yet. The button below
// adds the "build this feature" item to your improvements queue.
const PATTERNS = [
  { name: "New client onboarding", taskCount: 8, desc: "Welcome kit, kickoff call, tool setup, initial reporting." },
  { name: "Weekly team check-in",  taskCount: 4, desc: "EOD review, pipeline update, blockers, next week planning." },
  { name: "Campaign launch",       taskCount: 6, desc: "Brief, copy approval, launch, tracking, reporting." },
  { name: "Client offboarding",    taskCount: 5, desc: "Final report, access revoke, testimonial, archiving." },
];

export default function TaskTemplatesPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">OPERATIONS · TASKS</div>
        <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Task templates</h1>
        <p className="mt-1 text-sm text-[#9CA3AF] max-w-2xl">Common workflow patterns. The auto-apply feature isn&apos;t built yet — these are reference checklists you can copy into <Link href="/tasks" className="text-blue-400 hover:underline">/tasks</Link> manually.</p>
      </header>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-xs text-amber-300">
        <strong>Roadmap item:</strong> 1-click apply (templates → tasks under a new project). Want it sooner? <Link href="/improvements" className="underline hover:text-amber-200">Add to your improvements queue.</Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {PATTERNS.map(t => (
          <div key={t.name} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5">
            <div className="flex items-start gap-3">
              <FileText className="size-5 text-[#9CA3AF] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#F5F5F7]">{t.name}</h3>
                <p className="mt-1 text-sm text-[#9CA3AF]">{t.desc}</p>
                <p className="mt-2 text-xs text-[#6B7280]">{t.taskCount} suggested tasks</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:underline">
        Go to tasks <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
