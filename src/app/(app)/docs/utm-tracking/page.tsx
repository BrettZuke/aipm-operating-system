import Link from "next/link";
import { ArrowRight, ArrowLeft, Link2, AlertTriangle, Sparkles } from "lucide-react";

export default function UtmTrackingDoc() {
  return (
    <div className="grid grid-cols-[220px_1fr_220px] gap-8 -mt-2">
      {/* Left rail nav (same as parent) */}
      <aside className="space-y-5 sticky top-0 self-start">
        <Link href="/docs" className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#F5F5F7]">
          <ArrowLeft className="size-3" /> All docs
        </Link>
        <div>
          <div className="px-3 mb-2 text-[10px] font-semibold tracking-widest text-[#6B7280]">CAMPAIGNS</div>
          <Link href="/docs/utm-tracking" className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm bg-[rgba(0,131,255,0.10)] text-[#F5F5F7] shadow-[inset_2px_0_0_#0083FF]">
            <span>Track campaigns with UTMs</span>
            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-400">New</span>
          </Link>
        </div>
      </aside>

      {/* Article content */}
      <article className="max-w-3xl">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">DOCS · CAMPAIGNS</div>
        <h1 className="mt-1 text-4xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Track campaigns with UTMs</h1>
        <p className="mt-3 text-base text-[#9CA3AF]">Wire UTM parameters into payment links, opt-in pages, and booking calendars. The clean way to attribute every dollar to its source.</p>

        <div className="mt-6 flex gap-2">
          <Link href="/campaigns" className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            <Link2 className="size-3.5" /> Open UTM builder
          </Link>
          <Link href="/dashboard" className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.10)] px-4 py-2 text-sm text-[#F5F5F7] hover:bg-[rgba(255,255,255,0.06)]">
            Open Settoku <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="mt-10 space-y-8 text-[#9CA3AF]">
          <section>
            <h2 id="why" className="text-xl font-semibold text-[#F5F5F7] mb-3">Why UTMs matter</h2>
            <p className="leading-relaxed">When a payment lands, the most expensive question you can ask is: "where did this come from?" UTMs answer that. Tag every link your campaigns produce, and Settoku stitches the dollars back to the source automatically.</p>
          </section>

          <section>
            <h2 id="anatomy" className="text-xl font-semibold text-[#F5F5F7] mb-3">Anatomy of a UTM</h2>
            <p className="leading-relaxed mb-3">A tracked URL has up to five UTM parameters appended:</p>
            <CodeBlock>
              {`https://yoursite.com/offer
?utm_source=instagram
&utm_medium=organic
&utm_campaign=q2-launch
&utm_content=carousel-1
&utm_term=funded-trader`}
            </CodeBlock>
            <ul className="mt-4 space-y-2 text-sm">
              <li><span className="font-mono text-[#F5F5F7]">utm_source</span>:where the click came from (instagram, youtube, email)</li>
              <li><span className="font-mono text-[#F5F5F7]">utm_medium</span>:the channel type (organic, paid, dm, referral)</li>
              <li><span className="font-mono text-[#F5F5F7]">utm_campaign</span>:your campaign name (q2-launch, summer-sale)</li>
              <li><span className="font-mono text-[#F5F5F7]">utm_content</span>:the specific creative or piece (carousel-1, video-3)</li>
              <li><span className="font-mono text-[#F5F5F7]">utm_term</span>:keyword or audience segment</li>
            </ul>
          </section>

          <section>
            <h2 id="payment-links" className="text-xl font-semibold text-[#F5F5F7] mb-3">Payment links</h2>
            <p className="leading-relaxed mb-3">All major payment processors accept UTM parameters and pass them into webhooks:</p>
            <CodeBlock>
              {`# Stripe Checkout
https://buy.stripe.com/abc123?utm_source=instagram&utm_campaign=q2-launch

# Whop
https://whop.com/c/YOUR-OFFER?utm_source=email&utm_campaign=q2-launch

# Fanbasis
https://fanbasis.com/i/YOUR-OFFER?utm_source=youtube&utm_campaign=q2-launch`}
            </CodeBlock>
            <p className="mt-3 leading-relaxed">When the payment completes, Settoku reads the UTMs from the webhook payload and tags the transaction.</p>
          </section>

          <section>
            <h2 id="opt-ins" className="text-xl font-semibold text-[#F5F5F7] mb-3">Opt-in pages</h2>
            <p className="leading-relaxed mb-3">Most ESPs preserve UTMs on submission:</p>
            <CodeBlock>
              {`# Typeform
https://yourname.typeform.com/to/abc123?utm_source=tiktok&utm_campaign=summer

# ConvertKit / Kit
https://kit.com/your-form?utm_source=instagram&utm_campaign=spring-launch

# Beehiiv
https://yourpub.beehiiv.com?utm_source=newsletter-swap`}
            </CodeBlock>
          </section>

          <section>
            <h2 id="calendar" className="text-xl font-semibold text-[#F5F5F7] mb-3">Calendar booking links</h2>
            <p className="leading-relaxed mb-3">Cal.com and Calendly both pass UTMs through to webhook events:</p>
            <CodeBlock>
              {`# Cal.com
https://cal.com/yourname/sales-call?utm_source=youtube&utm_campaign=outreach

# Calendly
https://calendly.com/yourname/30min?utm_source=instagram&utm_medium=dm`}
            </CodeBlock>
          </section>

          <section>
            <h2 id="auto-capture" className="text-xl font-semibold text-[#F5F5F7] mb-3">Auto-capture on your pages</h2>
            <p className="leading-relaxed mb-3">Tagged links carry the source forward, but most checkout processors strip UTMs before the sale lands. To close the loop, drop one script on your funnel and opt-in pages. It remembers the first-touch source, forwards it onto your checkout links, and sends the visitor&apos;s email plus source to Settoku on opt-in, so the eventual sale ties back to its source by email even when the processor drops the UTMs.</p>
            <CodeBlock>
              {`<script src="https://YOUR-SETTOKU-DOMAIN/settoku-insights.js"
        data-endpoint="https://YOUR-SETTOKU-DOMAIN/api/attribution"
        data-ga4="G-XXXXXXXXXX"
        async></script>`}
            </CodeBlock>
            <ul className="mt-4 space-y-2 text-sm">
              <li><span className="font-mono text-[#F5F5F7]">data-endpoint</span> (required): your deployed Settoku URL + <span className="font-mono">/api/attribution</span>. Set <span className="font-mono">FANBASIS_TARGET_AGENCY_ID</span> in your Settoku environment so captures land in your workspace.</li>
              <li><span className="font-mono text-[#F5F5F7]">data-ga4</span> (optional): a GA4 Measurement ID; turns on the traffic and scroll-depth funnel.</li>
              <li><span className="font-mono text-[#F5F5F7]">data-checkout-hosts</span> (optional): comma-separated hosts to forward UTMs onto. Sensible defaults are built in.</li>
            </ul>
            <p className="mt-3 leading-relaxed">The file ships in <span className="font-mono">public/settoku-insights.js</span>. If your funnel lives on the same domain as Settoku, <span className="font-mono">src=&quot;/settoku-insights.js&quot;</span> is enough; if it is a separate site, use the full URL above or copy the file onto that site.</p>
            <p className="mt-3 leading-relaxed">Prefer ready-made links? Your <Link href="/links" className="text-blue-400 hover:underline">/links</Link> page has a quick builder plus a channel link bank (<span className="font-mono">/go/bio</span>, <span className="font-mono">/go/youtube</span>, and so on). The full walkthrough lives in <span className="font-mono">UTM-GUIDE.md</span>.</p>
          </section>

          <section>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="size-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">Common pitfalls</span>
              </div>
              <ul className="space-y-1.5 text-sm text-[#9CA3AF]">
                <li>· Don&apos;t use uppercase. <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">utm_source=Instagram</code> ≠ <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">utm_source=instagram</code></li>
                <li>· Use kebab-case for campaign names: <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">q2-launch</code> not <code className="rounded bg-[rgba(255,255,255,0.06)] px-1 text-xs">Q2 Launch</code></li>
                <li>· Be consistent. Pick a naming convention and stick to it for at least a quarter.</li>
                <li>· URL-encode spaces and special characters.</li>
                <li>· Don&apos;t tag internal links, only external promotion.</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 id="next" className="text-xl font-semibold text-[#F5F5F7] mb-3">What&apos;s next</h2>
            <p className="leading-relaxed">Once you start tagging, head to <Link href="/dashboard?tab=revenue" className="text-blue-400 hover:underline">Dashboard → Revenue</Link> and check &quot;Revenue by channel.&quot; Within a few weeks you&apos;ll see exactly which channels deserve more budget.</p>
          </section>
        </div>
      </article>

      {/* Right rail: On this page */}
      <aside className="hidden xl:block sticky top-0 self-start">
        <div className="text-[10px] font-semibold tracking-widest text-[#6B7280] mb-2">ON THIS PAGE</div>
        <ul className="space-y-1 text-sm">
          <li><a href="#why" className="text-[#9CA3AF] hover:text-[#F5F5F7]">Why UTMs matter</a></li>
          <li><a href="#anatomy" className="text-[#9CA3AF] hover:text-[#F5F5F7]">Anatomy of a UTM</a></li>
          <li><a href="#payment-links" className="text-[#9CA3AF] hover:text-[#F5F5F7]">Payment links</a></li>
          <li><a href="#opt-ins" className="text-[#9CA3AF] hover:text-[#F5F5F7]">Opt-in pages</a></li>
          <li><a href="#calendar" className="text-[#9CA3AF] hover:text-[#F5F5F7]">Calendar booking links</a></li>
          <li><a href="#auto-capture" className="text-[#9CA3AF] hover:text-[#F5F5F7]">Auto-capture on your pages</a></li>
          <li><a href="#next" className="text-[#9CA3AF] hover:text-[#F5F5F7]">What&apos;s next</a></li>
        </ul>
        <div className="mt-6 rounded-xl border border-[rgba(0,131,255,0.20)] bg-[rgba(0,131,255,0.04)] p-3">
          <Sparkles className="size-3.5 text-blue-400 mb-1.5" />
          <div className="text-xs font-medium text-[#F5F5F7]">Ask Settoku about UTMs</div>
          <p className="mt-0.5 text-[11px] text-[#9CA3AF]">Stuck on a specific case? Open Settoku Chat.</p>
        </div>
      </aside>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-[rgba(255,255,255,0.07)] bg-[#09090C] p-4 text-xs leading-relaxed text-[rgba(245,245,247,0.85)] font-mono whitespace-pre">
      {children}
    </pre>
  );
}
