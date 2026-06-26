import { HelpCircle, MessageSquare, BookOpen, Zap, ChevronRight, Mail, Bug, Lightbulb, Keyboard } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const faqs = [
  { q: "How do I add a client?", a: "Go to Clients → New client. Fill in the name, status, and MRR. You can add transactions and tasks from the client detail page." },
  { q: "How do I enable AI Chat?", a: "Add ANTHROPIC_API_KEY to your .env.local file, then install the AI SDK: npm install ai @ai-sdk/anthropic. AI Chat will activate automatically." },
  { q: "How do I invite team members?", a: "Go to Team. Invitation emails require the /edge/auth/invite-user edge function to be deployed. Until then, create users directly in your Supabase dashboard." },
  { q: "How do I connect Instagram DMs?", a: "Go to Settings → Integrations. You need a Meta Business account and a META_ACCESS_TOKEN. Configure the /edge/ig/webhook edge function." },
  { q: "How do commissions get calculated?", a: "Commissions are estimated from payment transactions attributed to each team member. Set commission rates in the commission_assignments table." },
  { q: "How do I add knowledge base documents?", a: "Go to Knowledge Library. Documents stored in knowledge_docs will be indexed for AI Chat once you enable pgvector embeddings." },
];

const shortcuts = [
  { label: "Getting started", href: "/onboarding", icon: Zap },
  { label: "Settings & integrations", href: "/settings/integrations", icon: ChevronRight },
  { label: "Documentation", href: "/docs", icon: BookOpen },
  { label: "AI Chat", href: "/settoku-chat", icon: MessageSquare },
];

const DOC_LINKS = [
  { title: "Start Here",            desc: "Set up your workspace in under 2 minutes.",       href: "/docs",                        icon: Zap     },
  { title: "Agency Workspace Guide", desc: "How agencies, teams, and clients fit together.", href: "/docs/agency-workspace",       icon: BookOpen },
  { title: "Invites & Portals",     desc: "Add teammates, share client portals.",           href: "/docs/invites",                icon: BookOpen },
  { title: "AI Setter Guide",       desc: "Connect Instagram and let Claude qualify DMs.",  href: "/docs/ai-setter",              icon: BookOpen },
];

const KEYBOARD_SHORTCUTS = [
  { combo: "⌘K",       desc: "Open command palette" },
  { combo: "⌘N or +",  desc: "Create a new item on the current page" },
  { combo: "Esc",      desc: "Close open modal or dropdown" },
  { combo: "⌘?",       desc: "Open keyboard shortcuts" },
  { combo: "⌘Enter",   desc: "Submit feedback forms" },
];

export default function HelpPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Help & Support</h1>
        <p className="mt-1 text-sm text-[#9CA3AF]">Get help, report issues, and share feedback.</p>
      </header>

      {/* Contact + Feedback + Bug */}
      <div className="grid grid-cols-3 gap-3">
        <a href="mailto:support@your-domain.com" className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5 hover:border-[rgba(255,255,255,0.12)]">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(0,131,255,0.10)] mb-3">
            <Mail className="size-4 text-blue-400" />
          </div>
          <div className="text-sm font-semibold text-[#F5F5F7]">Contact Us</div>
          <div className="mt-1 text-xs text-[#9CA3AF]">Email Support → support@your-domain.com</div>
        </a>
        <button className="text-left rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5 hover:border-[rgba(255,255,255,0.12)]">
          <div className="flex size-10 items-center justify-center rounded-lg bg-purple-500/10 mb-3">
            <Lightbulb className="size-4 text-purple-400" />
          </div>
          <div className="text-sm font-semibold text-[#F5F5F7]">Feature Requests</div>
          <div className="mt-1 text-xs text-[#9CA3AF]">Suggest something new — we read everything.</div>
        </button>
        <button className="text-left rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5 hover:border-[rgba(255,255,255,0.12)]">
          <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/10 mb-3">
            <Bug className="size-4 text-red-400" />
          </div>
          <div className="text-sm font-semibold text-[#F5F5F7]">Report a Bug</div>
          <div className="mt-1 text-xs text-[#9CA3AF]">Something broken? Tell us with one click.</div>
        </button>
      </div>

      {/* Documentation */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-[#F5F5F7]">Documentation</h2>
        <div className="grid grid-cols-2 gap-3">
          {DOC_LINKS.map(d => (
            <Link key={d.title} href={d.href} className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5 hover:border-[rgba(255,255,255,0.12)] transition-colors group">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
                  <d.icon className="size-4 text-[#9CA3AF]" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[#F5F5F7]">{d.title}</div>
                  <div className="mt-0.5 text-xs text-[#9CA3AF]">{d.desc}</div>
                </div>
                <ChevronRight className="size-4 text-[rgba(245,245,247,0.3)] group-hover:text-[#9CA3AF]" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-[#F5F5F7]">
          <Keyboard className="size-4 text-[#9CA3AF]" />
          Keyboard Shortcuts
        </h2>
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 divide-y divide-[rgba(255,255,255,0.06)]">
          {KEYBOARD_SHORTCUTS.map(s => (
            <div key={s.combo} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-[#9CA3AF]">{s.desc}</span>
              <kbd className="rounded border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-xs font-mono text-[#F5F5F7]">{s.combo}</kbd>
            </div>
          ))}
        </div>
      </section>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2">
        {shortcuts.map(s => (
          <Link key={s.href} href={s.href} className="flex items-center gap-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-4 hover:border-[rgba(255,255,255,0.10)] group">
            <div className="flex size-9 items-center justify-center rounded-md bg-[rgba(255,255,255,0.06)]"><s.icon className="size-4 text-[rgba(245,245,247,0.8)]" /></div>
            <span className="font-medium text-[#F5F5F7]">{s.label}</span>
            <ChevronRight className="ml-auto size-4 text-[rgba(245,245,247,0.3)] group-hover:text-[#9CA3AF]" />
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-4 text-base font-semibold text-[#F5F5F7]">Frequently asked</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <details key={i} className="group rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
              <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-medium text-[#F5F5F7] list-none">
                <span>{f.q}</span>
                <ChevronRight className="size-4 text-[#6B7280] transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t border-[rgba(255,255,255,0.08)] px-5 py-4 text-sm text-[#9CA3AF]">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-6 text-center">
        <HelpCircle className="mx-auto size-8 text-[rgba(245,245,247,0.3)] mb-3" />
        <h3 className="text-base font-medium text-[rgba(245,245,247,0.8)]">Need more help?</h3>
        <p className="mt-1 text-sm text-[#9CA3AF]">Ask AI Chat — it has context on your workspace and can guide you through any feature.</p>
        <Link href="/settoku-chat" className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
          <MessageSquare className="size-4" /> Ask AI
        </Link>
      </div>
    </div>
  );
}
