import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default function WebinarsDocPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <Link href="/docs" className="inline-flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[#F5F5F7]">
        <ArrowLeft className="size-3.5" /> Docs
      </Link>

      <header>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">EVENTS · WEBINARS</div>
        <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Run a webinar with auto-SMS reminders</h1>
        <p className="mt-2 text-sm text-[#9CA3AF]">Schedule once, paste registrations, and Settoku texts attendees at T-24h, T-1h, T-15m, and live.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">1. Create the webinar</h2>
        <ol className="list-decimal pl-6 space-y-1.5 text-sm text-[rgba(245,245,247,0.85)]">
          <li>Go to <Link href="/webinars" className="text-blue-400 hover:underline">/webinars</Link> → click <strong>New webinar</strong>.</li>
          <li>Enter title, start date/time (UTC), join URL.</li>
          <li>You&apos;ll land on the detail page. Click <strong>Edit</strong> to tweak the 4 reminder templates if you want — defaults are fine.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">2. Add registrations</h2>
        <p className="text-sm text-[#9CA3AF]">Click <strong>Add registrations</strong> on the detail page. Paste CSV (comma OR tab separated). Header optional — first column = name, second = email, third = phone.</p>
        <div className="rounded-md border border-[rgba(255,255,255,0.10)] bg-[#09090C] px-3 py-2 font-mono text-xs text-[#9CA3AF]">
          name,email,phone<br/>
          Jane Doe,jane@example.com,+15550100001<br/>
          John Smith,john@example.com,+15550100002
        </div>
        <p className="text-xs text-[#6B7280]">Phones must be E.164 (<code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">+15551234567</code>). Rows without phone are still saved but won&apos;t get SMS.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">3. Reminders auto-fire</h2>
        <p className="text-sm text-[#9CA3AF]">A cron runs every 15 min checking for due reminders. Each registration shows ✓ marks per window once Twilio confirms send. If you want to blast NOW (before the window), use the 4 buttons on the detail page — there&apos;s a dry-run option + cost estimate before you commit.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F5F5F7]">Template placeholders</h2>
        <p className="text-sm text-[#9CA3AF]">Templates support: <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">{"{name}"}</code> · <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">{"{title}"}</code> · <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">{"{join_url}"}</code> · <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">{"{minutes}"}</code>. Leave a template blank to skip that reminder window.</p>
      </section>

      <Link href="/docs" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:underline">
        Back to docs <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
