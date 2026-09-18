import Link from "next/link";

// The content machine as one picture, so the operator can see where they are without reading.
//
// The complaint it answers: the parts seem messy, confusing and not connected, and an operator
// needs to see the whole thing at once without getting lost.
//
// Design posture: ONE hero (the pipeline rail), not a
// wall of equal cards. Numerals are the heroes, near-white and tabular. Colour carries meaning only
// in the accent rules and status dots. Detail collapses behind summary rows instead of stacking
// down the page, so the whole machine reads in a single screen.

export type MachineStats = {
  learnFrom: number;
  copy: number;
  posts: number;
  videos: number;
  brainChars: number;
  proofChars: number;
  winners: number;
  patterns: number;
  parsedAt: string | null;
  scripts: number;
  /** Who, by name. Counting people without naming them is what made this feel opaque. */
  names: { strategist: string[]; emulate: string[] };
};

type Node = {
  key: string;
  stage: string;
  name: string;
  value: string;
  unit: string;
  rule: string;
  ready: boolean;
  reads: string;
  gives: string;
  why: string;
  href?: string;
  hrefLabel?: string;
  /** Named so the operator can see who, not just how many. */
  people?: string[];
};

export function MachineMap({ stats, workspace }: { stats: MachineStats; workspace: string | null }) {
  const collected = stats.posts + stats.videos;

  // A page of zeros almost always means "this is a different workspace", not "the machine is
  // broken". That happens on a client workspace and there is no way to tell which it was. So an
  // entirely empty machine says which workspace it is empty IN, before anything else.
  const untouched =
    stats.brainChars === 0 && stats.proofChars === 0 && collected === 0 && stats.scripts === 0;
  if (untouched) return <NotSetUp workspace={workspace} />;

  const nodes: Node[] = [
    {
      key: "brain",
      stage: "Knows you",
      name: "The Brain",
      value: stats.brainChars ? `${Math.round(stats.brainChars / 1000)}k` : "0",
      unit: "words of craft",
      rule: "sk-rule-purple",
      ready: stats.brainChars > 0,
      reads: `The ${stats.learnFrom} creators you marked "Learn from"`,
      gives: "Structure, hooks, pacing, what makes someone stay",
      why: "This is HOW your content gets made. It studies the craft of creators you respect, never their topics.",
      people: stats.names.strategist,
      href: "/knowledge",
      hrefLabel: "Read it",
    },
    {
      key: "proof",
      stage: "Knows you",
      name: "Your Proof",
      value: stats.proofChars ? "Ready" : "Empty",
      unit: "to write from",
      rule: "sk-rule-warn",
      ready: stats.proofChars > 0,
      reads: "The systems you built and the things that broke",
      gives: "The specific screens and stories you can put on camera",
      why: "This is WHO you are. It is the reason your hooks name a real system instead of saying \"I build automations\". Nothing outside it gets claimed.",
      href: "/knowledge",
      hrefLabel: "Read it",
    },
    {
      key: "scraper",
      stage: "Watches the market",
      name: "The Scraper",
      value: collected.toLocaleString(),
      unit: "pieces collected",
      rule: "sk-rule-blue",
      ready: collected > 0,
      reads: `The ${stats.copy} creators you marked "Copy"`,
      gives: `${stats.posts.toLocaleString()} posts and ${stats.videos.toLocaleString()} videos, raw`,
      why: "It collects everything, judges nothing. Pausing someone on the Creators tab stops it collecting them from the next run.",
      people: stats.names.emulate,
      href: "/content?tab=creators",
      hrefLabel: "Manage who",
    },
    {
      key: "analyst",
      stage: "Watches the market",
      name: "The Analyst",
      value: stats.winners.toLocaleString(),
      unit: "winners found",
      rule: "sk-rule-money",
      ready: stats.winners > 0,
      reads: "Everything the scraper collected",
      gives: `Only posts that beat their own creator's average, plus ${stats.patterns} named patterns`,
      why: "Each creator is judged against their own average, so a 2 million view account cannot drown out a small one that just broke out.",
    },
  ];

  return (
    <section className="space-y-10">
      <Hero stats={stats} nodes={nodes} />

      <div className="space-y-3">
        <div>
          <div className="sk-label">WHAT EACH PART ACTUALLY DOES</div>
          <p className="mt-1.5 text-sm text-[#7C8595]">
            Open any one to see what it reads and what it hands to the next.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.07)]">
          {nodes.map((n) => (
            <Detail key={n.key} node={n} />
          ))}
          <Detail
            node={{
              key: "scripter",
              stage: "Writes",
              name: "The Scripter",
              value: String(stats.scripts),
              unit: "on your board",
              rule: "sk-rule-blue",
              ready: stats.scripts > 0,
              reads: "All four above, every single time it writes",
              gives: "Scripts on your board, each traceable to the post it competes with",
              why: "It takes a mechanism that is measurably working and runs it on something only you can show. It copies the mechanism, never the topic.",
              href: "/content?tab=board",
              hrefLabel: "Open the board",
            }}
          />
        </div>
      </div>
    </section>
  );
}

function NotSetUp({ workspace }: { workspace: string | null }) {
  return (
    <div className="rounded-[2rem] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.015)] p-1.5">
      <div className="rounded-[calc(2rem-6px)] bg-[#0C0C12] px-6 py-14 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.10)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#7C8595]">
          <span className="sk-dot sk-dot-idle" />
          Not set up here
        </span>
        <h2
          className="mx-auto mt-4 max-w-xl text-2xl tracking-tight text-[#F5F5F7]"
          style={{ fontFamily: "var(--font-settoku-display), Georgia, serif", fontWeight: 600, letterSpacing: "-0.02em" }}
        >
          {workspace ? `${workspace} has no content machine` : "This workspace has no content machine"}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#A8B0BD]">
          Every workspace keeps its own creators, brain, and scripts, so client work never mixes. If
          you set yours up somewhere else, switch workspace using the picker at the top left.
        </p>
        <Link
          href="/content?tab=creators"
          className="group mt-6 inline-flex items-center gap-2 rounded-full bg-[#0083FF] px-5 py-2.5 text-sm font-medium text-white transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
        >
          Set it up here
          <span className="flex size-6 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5">
            &rsaquo;
          </span>
        </Link>
      </div>
    </div>
  );
}

// The hero: one continuous rail, three groups, numerals doing the talking.
function Hero({ stats, nodes }: { stats: MachineStats; nodes: Node[] }) {
  const gaps = nodes.filter((n) => !n.ready).length;
  const output = stats.scripts;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.10)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#7C8595]">
            <span className={`sk-dot ${gaps === 0 ? "sk-dot-ok" : "sk-dot-warn"}`} />
            {gaps === 0 ? "Everything connected" : `${gaps} ${gaps === 1 ? "part" : "parts"} not set up`}
          </span>
          <h2
            className="mt-3 text-3xl tracking-tight text-[#F5F5F7]"
            style={{ fontFamily: "var(--font-settoku-display), Georgia, serif", fontWeight: 600, letterSpacing: "-0.02em" }}
          >
            Your content machine
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#A8B0BD]">
            Two things that know about you and never change. Two that run against your competitors
            every time. One writer that reads all four.
          </p>
        </div>
        <div className="text-right">
          <div className="sk-hero-num">{output}</div>
          <div className="mt-1 text-xs text-[#7C8595]">ready to film</div>
        </div>
      </div>

      {/* Double bezel: the rail sits in a machined tray rather than flat on the canvas. */}
      <div className="rounded-[2rem] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.015)] p-1.5">
        <div className="rounded-[calc(2rem-6px)] bg-[#0C0C12] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-7">
          <div className="grid items-stretch gap-x-4 gap-y-7 lg:grid-cols-[1fr_auto_1fr_auto_0.85fr]">
            <Group label="Knows you" caption="Fixed. Set once, corrected rarely.">
              <Cell node={nodes[0]} />
              <Cell node={nodes[1]} />
            </Group>

            <Rail />

            <Group label="Watches the market" caption="Runs fresh on every scrape.">
              <Cell node={nodes[2]} />
              <Cell node={nodes[3]} />
            </Group>

            <Rail />

            <Group label="You get" caption="Written, and waiting on your camera." accent>
              <Output value={stats.scripts} label="scripts" href="/content?tab=board" hrefLabel="Open board" />
            </Group>
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({
  label, caption, accent, children,
}: { label: string; caption: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="mb-3">
        <div className={`sk-label ${accent ? "text-[#0083FF]" : ""}`}>{label.toUpperCase()}</div>
        <div className="mt-1 text-[11px] text-[#545D6C]">{caption}</div>
      </div>
      <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">{children}</div>
    </div>
  );
}

function Cell({ node }: { node: Node }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3 transition-colors duration-500 hover:border-[rgba(255,255,255,0.12)]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[#F5F5F7]">{node.name}</span>
        {!node.ready && <span className="sk-dot sk-dot-warn" />}
      </div>
      <div className="mt-2 sk-stat-num text-xl text-[#F6F7F9]">{node.value}</div>
      <div className="text-[11px] text-[#7C8595]">{node.unit}</div>
      <span className={`sk-rule ${node.rule}`} />
    </div>
  );
}

function Output({
  value, label, href, hrefLabel,
}: { value: number; label: string; href: string; hrefLabel: string }) {
  return (
    <div className="rounded-xl border border-[rgba(0,131,255,0.20)] bg-[rgba(0,131,255,0.05)] px-3.5 py-3">
      <div className="sk-stat-num text-2xl text-[#F6F7F9]">{value}</div>
      <div className="text-[11px] text-[#7C8595]">{label}</div>
      <Link
        href={href}
        className="group mt-2 inline-flex items-center gap-1.5 text-[11px] text-[#0083FF] transition-colors duration-500"
      >
        {hrefLabel}
        <span className="inline-block transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5">
          &rsaquo;
        </span>
      </Link>
    </div>
  );
}

// Horizontal on wide screens, vertical between stacked groups on narrow ones.
function Rail() {
  return (
    <div className="flex items-center justify-center" aria-hidden>
      <span className="h-px w-full bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.14)] to-transparent lg:h-full lg:w-px lg:bg-gradient-to-b" />
    </div>
  );
}

// Collapsed by default: the summary row carries the headline, the body carries the handoff. Native
// details, no JS, matching the per-row expansion pattern used elsewhere in the app.
function Detail({ node }: { node: Node }) {
  return (
    <details className="group border-b border-[rgba(255,255,255,0.06)] last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors duration-500 hover:bg-[rgba(255,255,255,0.02)]">
        <span className={`sk-dot ${node.ready ? "sk-dot-ok" : "sk-dot-warn"}`} />
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium text-[#F5F5F7]">{node.name}</span>
          <span className="ml-2 text-xs text-[#7C8595]">{node.stage}</span>
        </span>
        <span className="hidden whitespace-nowrap text-xs text-[#7C8595] sm:inline">
          <span className="text-[#A8B0BD]">{node.value}</span> {node.unit}
        </span>
        <span className="text-[#545D6C] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-open:rotate-90">
          &rsaquo;
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-4 pl-10">
        <p className="max-w-2xl text-sm leading-relaxed text-[#A8B0BD]">{node.why}</p>
        {node.people && node.people.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {node.people.map((n) => (
              <span
                key={n}
                className="rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-0.5 text-[11px] text-[#A8B0BD]"
              >
                {n}
              </span>
            ))}
          </div>
        )}
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-[rgba(255,255,255,0.06)] px-3 py-2">
            <dt className="sk-label">READS</dt>
            <dd className="mt-1 text-[#A8B0BD]">{node.reads}</dd>
          </div>
          <div className="rounded-lg border border-[rgba(255,255,255,0.06)] px-3 py-2">
            <dt className="sk-label">HANDS ON</dt>
            <dd className="mt-1 text-[#A8B0BD]">{node.gives}</dd>
          </div>
        </dl>
        {node.href && (
          <Link href={node.href} className="inline-block text-xs text-[#0083FF] hover:underline">
            {node.hrefLabel}
          </Link>
        )}
      </div>
    </details>
  );
}
