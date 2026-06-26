import { Badge } from "@/components/ui/badge";
import { ClientTabs } from "@/components/ui/client-tabs";
import {
  fetchDmMetrics, fetchConversations, fetchPipeline, fetchLeads, fetchKeywords,
  type DmMetrics, type Conversation, type PipelineData, type Lead, type KeywordRow,
} from "@/lib/settoku/data";

export const dynamic = "force-dynamic";

type Tab = "inbox" | "pipeline" | "analytics" | "config";

const TABS = [
  { key: "inbox",     label: "Inbox",     iconName: "MessageSquare" },
  { key: "pipeline",  label: "Pipeline",  iconName: "GitBranch"     },
  { key: "analytics", label: "Analytics", iconName: "Bot"           },
  { key: "config",    label: "Config",    iconName: "Hash"          },
];

const TAG_BADGE: Record<string, { label: string; variant: "success" | "primary" | "danger" | "warning" | "muted" }> = {
  CONFIRMED: { label: "Booked",     variant: "success" },
  COMMUNITY: { label: "Community",  variant: "primary" },
  APPLY:     { label: "Applied",    variant: "warning" },
  DISQUALIFY:{ label: "DQ",         variant: "danger"  },
  CONTINUE:  { label: "Active",     variant: "muted"   },
};

const PIPELINE_LABELS: Record<string, string> = {
  new_lead: "New Lead", qualifying: "Qualifying",
  link_sent: "Link Sent", booked: "Booked", closed: "Closed",
};

function relTime(iso: string | null) {
  if (!iso) return "—";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TagBadge({ tag }: { tag: string | null }) {
  const t = TAG_BADGE[tag ?? ""] ?? { label: tag ?? "—", variant: "muted" as const };
  return <Badge variant={t.variant}>{t.label}</Badge>;
}

export default async function AISetterPage({ searchParams }: { searchParams: Promise<{ tab?: Tab }> }) {
  const { tab = "inbox" } = await searchParams;

  const [metrics, conversations, pipeline, leads, keywords] = await Promise.all([
    fetchDmMetrics().catch(() => null),
    fetchConversations().catch(() => [] as Conversation[]),
    fetchPipeline().catch(() => null),
    fetchLeads().catch(() => [] as Lead[]),
    fetchKeywords().catch(() => [] as KeywordRow[]),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">INSTAGRAM SETTER</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>AI Setter</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Claude qualifies leads in your DMs and books calls. You see every reply before it sends — pause anytime.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-3 py-2 text-xs">
            <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="text-[#9CA3AF]">PAUSED · 1× no accounts</span>
          </div>
          <button className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10">Pause all AI</button>
          <Badge variant="primary">Settoku Add-on</Badge>
        </div>
      </div>

      {/* 4 stat pills */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Active",         value: metrics ? String(metrics.total - metrics.ghosted) : "0", sub: "0 need eyes" },
          { label: "Booked today",   value: metrics ? String(metrics.booked) : "0",                 sub: "from 0 active" },
          { label: "Flagged",        value: "0",                                                      sub: "all clear" },
          { label: "Avg confidence", value: "78%",                                                    sub: "Claude's draft confidence" },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">{c.label}</div>
            <div className="mt-2 text-2xl font-bold text-[#F5F5F7] tabular-nums">{c.value}</div>
            <div className="mt-0.5 text-xs text-[#9CA3AF]">{c.sub}</div>
          </div>
        ))}
      </div>

      <ClientTabs tabs={TABS} initialTab={tab} panels={{
        inbox:     <InboxContent convos={conversations} />,
        pipeline:  <PipelineContent pipeline={pipeline} />,
        analytics: <AnalyticsContent m={metrics} />,
        config:    <ConfigContent keywords={keywords} leads={leads} />,
      }} />
    </div>
  );
}

function AnalyticsContent({ m }: { m: DmMetrics | null }) {
  if (!m) return <ErrorState msg="Could not load metrics." />;
  const cards = [
    { label: "Total",        value: m.total },
    { label: "Applied",      value: m.applied },
    { label: "Booked",       value: m.booked },
    { label: "Disqualified", value: m.dq },
    { label: "Ghosted",      value: m.ghosted },
    { label: "Conversion",   value: `${m.conversion_rate}%` },
  ];
  const maxDay = Math.max(...m.daily.map(d => d.APPLY + d.CONFIRMED + d.DISQUALIFY + d.COMMUNITY + d.CONTINUE), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {cards.map(c => (
          <div key={c.label} className="stat-card rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/60 p-4">
            <div className="text-xs text-[#9CA3AF]">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold text-[#F5F5F7] tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/60 p-5">
        <div className="mb-3 text-sm font-medium text-[rgba(245,245,247,0.8)]">Activity — last 30 days</div>
        <div className="flex items-end gap-0.5 h-28">
          {m.daily.map(d => {
            const total = d.APPLY + d.CONFIRMED + d.DISQUALIFY + d.COMMUNITY + d.CONTINUE;
            const pct = (total / maxDay) * 100;
            return (
              <div key={d.date} className="flex-1 flex flex-col justify-end h-full" title={d.date}>
                <div className="w-full rounded-sm overflow-hidden flex flex-col-reverse" style={{ height: `${Math.max(2, pct)}%` }}>
                  {d.CONFIRMED > 0 && <div style={{ flex: d.CONFIRMED, background: "#22c55e" }} />}
                  {d.COMMUNITY > 0 && <div style={{ flex: d.COMMUNITY, background: "#a855f7" }} />}
                  {d.APPLY > 0 && <div style={{ flex: d.APPLY, background: "#0083FF" }} />}
                  {d.DISQUALIFY > 0 && <div style={{ flex: d.DISQUALIFY, background: "#ef4444" }} />}
                  {d.CONTINUE > 0 && <div style={{ flex: d.CONTINUE, background: "rgba(255,255,255,0.08)" }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-[#9CA3AF]">
          {[["#22c55e","Booked"],["#a855f7","Community"],["#0083FF","Applied"],["#ef4444","DQ"],["rgba(255,255,255,0.18)","Active"]].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1"><span className="size-2 rounded-sm inline-block" style={{ background: c }} />{l}</span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/60 p-5">
        <div className="mb-4 text-sm font-medium text-[rgba(245,245,247,0.8)]">Funnel</div>
        <div className="space-y-2">
          {[
            { label: "Total",   value: m.total,   pct: 100 },
            { label: "Applied", value: m.applied, pct: m.total ? (m.applied / m.total) * 100 : 0 },
            { label: "Booked",  value: m.booked,  pct: m.total ? (m.booked / m.total) * 100 : 0 },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-16 text-xs text-[#9CA3AF] text-right shrink-0">{row.label}</div>
              <div className="flex-1 h-4 rounded bg-[rgba(255,255,255,0.06)] overflow-hidden">
                <div className="h-full rounded transition-all duration-500" style={{ width: `${row.pct}%`, background: "linear-gradient(90deg, rgba(0,131,255,0.7), rgba(0,131,255,0.35))" }} />
              </div>
              <div className="w-10 text-right text-xs font-semibold text-[rgba(245,245,247,0.8)] tabular-nums">{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InboxContent({ convos }: { convos: Conversation[] }) {
  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2">
        <select className="h-9 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-3 text-xs text-[#F5F5F7] focus:outline-none">
          <option>All clients</option>
        </select>
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input placeholder="Search handle or message…" className="h-9 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 pl-9 pr-3 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <select className="h-9 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 px-3 text-xs text-[#F5F5F7] focus:outline-none">
          <option>All statuses</option>
          <option>Booked</option>
          <option>Applied</option>
          <option>Active</option>
          <option>DQ</option>
        </select>
      </div>
      {!convos.length ? <EmptyState label="No conversations yet." /> : (
    <div className="space-y-1.5">
      {convos.map(c => {
        const msgs = c.messages ?? [];
        const last = msgs[msgs.length - 1];
        return (
          <div key={c.contact_id} className="group flex items-center justify-between gap-4 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/40 px-4 py-3 hover:border-[rgba(255,255,255,0.10)] hover:bg-[#0C0C10]/60 transition-colors duration-100">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#F5F5F7]">@{c.instagram_handle ?? c.contact_id}</span>
                {c.lead_source && <span className="text-xs text-[#9CA3AF]">{c.lead_source}</span>}
              </div>
              <p className="mt-0.5 text-xs text-[#9CA3AF] truncate">{last?.content?.slice(0, 80) ?? "No messages"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <TagBadge tag={c.last_tag} />
              <span className="text-xs text-[#9CA3AF] whitespace-nowrap">{relTime(c.last_message_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
      )}
    </div>
  );
}

function PipelineContent({ pipeline }: { pipeline: PipelineData | null }) {
  if (!pipeline) return <ErrorState msg="Could not load pipeline." />;
  return (
    <div className="grid grid-cols-5 gap-2.5">
      {(["new_lead","qualifying","link_sent","booked","closed"] as const).map(stage => (
        <div key={stage} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/40 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-widest">{PIPELINE_LABELS[stage]}</span>
            <span className="text-xs font-medium text-[#9CA3AF] tabular-nums">{pipeline.totals[stage]}</span>
          </div>
          <div className="space-y-2">
            {pipeline.columns[stage].slice(0, 12).map(card => (
              <div key={card.contact_id} className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/80 p-2.5 hover:border-[rgba(255,255,255,0.10)] transition-colors duration-100">
                <div className="text-xs font-medium text-[#F5F5F7] truncate">@{card.handle}</div>
                {card.preview && <p className="mt-1 text-xs text-[#9CA3AF] line-clamp-2">{card.preview}</p>}
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[9px] text-[rgba(245,245,247,0.3)]">{card.message_count} msgs</span>
                  <span className="text-[9px] text-[rgba(245,245,247,0.3)]">{relTime(card.last_message_at)}</span>
                </div>
              </div>
            ))}
            {pipeline.columns[stage].length === 0 && (
              <p className="text-xs text-[#6B7280] text-center py-6">Empty</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadsContent({ leads }: { leads: Lead[] }) {
  if (!leads.length) return <EmptyState label="No lead profiles yet." />;
  return (
    <div className="space-y-1.5">
      {leads.slice(0, 50).map(l => (
        <div key={l.contact_id} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/40 px-4 py-3 hover:border-[rgba(255,255,255,0.10)] transition-colors duration-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] text-xs font-bold text-[rgba(245,245,247,0.8)] tabular-nums">
                {l.score}
              </div>
              <div className="min-w-0">
                <span className="text-sm font-medium text-[#F5F5F7]">@{l.handle}</span>
                {l.job && <span className="ml-2 text-xs text-[#6B7280]">{l.job}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <TagBadge tag={l.last_tag} />
              <span className="text-xs text-[#9CA3AF]">{relTime(l.last_message_at)}</span>
            </div>
          </div>
          {(l.pain || l.dream) && (
            <div className="mt-2 flex gap-6 text-xs text-[#9CA3AF]">
              {l.pain  && <span className="truncate"><span className="text-[#6B7280]">Pain:</span> {l.pain}</span>}
              {l.dream && <span className="truncate"><span className="text-[#6B7280]">Dream:</span> {l.dream}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function KeywordsContent({ keywords }: { keywords: KeywordRow[] }) {
  if (!keywords.length) return <EmptyState label="No opener data yet." />;
  return (
    <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] settoku-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#09090C]/60">
            {["Opener","Sent","Replied","Applied","Booked","Reply %","Book %"].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-[#9CA3AF]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keywords.map((k, i) => (
            <tr key={i} className="border-b border-[rgba(255,255,255,0.08)]/50">
              <td className="px-4 py-2.5 text-xs text-[rgba(245,245,247,0.8)] max-w-xs truncate">{k.opener}</td>
              <td className="px-4 py-2.5 text-xs text-[#9CA3AF] tabular-nums">{k.total}</td>
              <td className="px-4 py-2.5 text-xs text-[#9CA3AF] tabular-nums">{k.replied}</td>
              <td className="px-4 py-2.5 text-xs text-[#9CA3AF] tabular-nums">{k.applied}</td>
              <td className="px-4 py-2.5 text-xs text-emerald-400 tabular-nums">{k.booked}</td>
              <td className="px-4 py-2.5 text-xs text-[#9CA3AF] tabular-nums">{k.reply_rate}%</td>
              <td className="px-4 py-2.5 text-xs text-blue-400 tabular-nums">{k.book_rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfigContent({ keywords, leads }: { keywords: KeywordRow[]; leads: Lead[] }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
        <div className="mb-4 text-sm font-semibold text-[#F5F5F7]">Opener performance</div>
        <KeywordsContent keywords={keywords} />
      </div>
      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5">
        <div className="mb-4 text-sm font-semibold text-[#F5F5F7]">Lead profiles</div>
        {leads.length === 0 ? <EmptyState label="No lead profiles yet." /> : (
          <div className="text-xs text-[#9CA3AF]">{leads.length} lead profiles indexed.</div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="flex items-center justify-center py-16 text-sm text-[#9CA3AF]">{label}</div>;
}
function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-sm text-red-400">{msg}</div>
      <p className="mt-1 text-xs text-[#6B7280]">Check Settoku Supabase env vars.</p>
    </div>
  );
}
