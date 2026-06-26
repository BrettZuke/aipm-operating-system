import { Badge } from "@/components/ui/badge";
import { ClientTabs } from "@/components/ui/client-tabs";
import { fetchVoiceMetrics, fetchVoiceCalls, type VoiceMetrics, type VoiceCall } from "@/lib/settoku/data";

export const dynamic = "force-dynamic";

type Tab = "overview" | "calls" | "queue";

const TABS = [
  { key: "overview", label: "Overview", iconName: "Phone" },
  { key: "calls",    label: "Call Log", iconName: "List"  },
  { key: "queue",    label: "Queue",    iconName: "Layers" },
];

function relTime(iso: string | null) {
  if (!iso) return "—";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function durFmt(ms: number | null) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default async function AIDialerPage({ searchParams }: { searchParams: Promise<{ tab?: Tab }> }) {
  const { tab = "overview" } = await searchParams;

  const [metrics, calls] = await Promise.all([
    fetchVoiceMetrics().catch(() => null),
    fetchVoiceCalls(100).catch(() => [] as VoiceCall[]),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#F5F5F7]">AI Dialer</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">Sofia voice agent — call analytics, queue, and booking tracking.</p>
        </div>
        <Badge variant="primary">Settoku Add-on</Badge>
      </div>

      <ClientTabs tabs={TABS} initialTab={tab} panels={{
        overview: <OverviewContent m={metrics} />,
        calls:    <CallsContent calls={calls} />,
        queue:    <QueueContent m={metrics} />,
      }} />
    </div>
  );
}

function OverviewContent({ m }: { m: VoiceMetrics | null }) {
  if (!m) return <ErrorState msg="Could not load voice metrics." />;

  const cards = [
    { label: "Calls fired (30d)", value: m.total },
    { label: "Picked up",         value: m.picked_up },
    { label: "SMS sent",          value: m.sms_sent },
    { label: "Booked",            value: m.booked },
    { label: "Pickup rate",       value: `${m.pickup_rate}%` },
    { label: "Booking rate",      value: `${m.booking_rate}%` },
  ];

  const maxDay = Math.max(...m.daily.map(d => d.fired), 1);

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
        <div className="mb-3 text-sm font-medium text-[rgba(245,245,247,0.8)]">Call volume — last 30 days</div>
        <div className="flex items-end gap-0.5 h-28">
          {m.daily.map(d => (
            <div key={d.date} className="flex-1 flex flex-col justify-end h-full gap-px" title={d.date}>
              {d.booked > 0 && <div className="w-full rounded-sm bg-emerald-500" style={{ height: `${(d.booked / maxDay) * 100}%`, minHeight: 2 }} />}
              {(d.picked_up - d.booked) > 0 && <div className="w-full rounded-sm bg-blue-500/60" style={{ height: `${((d.picked_up - d.booked) / maxDay) * 100}%`, minHeight: 2 }} />}
              {(d.fired - d.picked_up) > 0 && <div className="w-full rounded-sm bg-[rgba(255,255,255,0.08)]" style={{ height: `${((d.fired - d.picked_up) / maxDay) * 100}%`, minHeight: 2 }} />}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-[#9CA3AF]">
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500 inline-block" />Booked</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-blue-500/60 inline-block" />Picked up</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-[rgba(255,255,255,0.08)] inline-block" />No answer</span>
        </div>
      </div>

      {m.by_agent.length > 0 && (
        <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/60 p-5">
          <div className="mb-3 text-sm font-medium text-[rgba(245,245,247,0.8)]">By agent</div>
          <div className="overflow-hidden rounded border border-[rgba(255,255,255,0.08)] settoku-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#09090C]/60">
                  {["Agent","Fired","Picked up","Booked","Pickup %","Booking %"].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium text-[#9CA3AF]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.by_agent.map(a => (
                  <tr key={a.name} className="border-b border-[rgba(255,255,255,0.08)]/50">
                    <td className="px-4 py-2 text-xs font-medium text-[rgba(245,245,247,0.8)]">{a.name}</td>
                    <td className="px-4 py-2 text-xs text-[#9CA3AF] tabular-nums">{a.fired}</td>
                    <td className="px-4 py-2 text-xs text-[#9CA3AF] tabular-nums">{a.picked_up}</td>
                    <td className="px-4 py-2 text-xs text-emerald-400 tabular-nums">{a.booked}</td>
                    <td className="px-4 py-2 text-xs text-[#9CA3AF] tabular-nums">{a.pickup_rate}%</td>
                    <td className="px-4 py-2 text-xs text-blue-400 tabular-nums">{a.booking_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CallsContent({ calls }: { calls: VoiceCall[] }) {
  if (!calls.length) return <div className="flex items-center justify-center py-16 text-sm text-[#9CA3AF]">No calls recorded yet.</div>;
  return (
    <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] settoku-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#09090C]/60">
            {["Lead","Agent","When","Duration","Picked up","SMS","Booked","Reason"].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-[#9CA3AF]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calls.map(c => (
            <tr key={c.call_id} className="border-b border-[rgba(255,255,255,0.08)]/50">
              <td className="px-4 py-2.5 text-xs text-[rgba(245,245,247,0.8)]">{c.lead_name ?? c.lead_phone ?? "—"}</td>
              <td className="px-4 py-2.5 text-xs text-[#9CA3AF]">{c.agent_name ?? "—"}</td>
              <td className="px-4 py-2.5 text-xs text-[#9CA3AF] whitespace-nowrap">{relTime(c.call_started_at)}</td>
              <td className="px-4 py-2.5 text-xs text-[#9CA3AF] tabular-nums">{durFmt(c.duration_ms)}</td>
              <td className="px-4 py-2.5 text-xs font-medium">{c.picked_up ? <span className="text-emerald-400">Yes</span> : <span className="text-[#6B7280]">No</span>}</td>
              <td className="px-4 py-2.5 text-xs">{c.sms_sent ? <span className="text-blue-400">Sent</span> : <span className="text-[#6B7280]">—</span>}</td>
              <td className="px-4 py-2.5 text-xs font-medium">{c.led_to_booking ? <span className="text-emerald-400">Yes</span> : <span className="text-[#6B7280]">—</span>}</td>
              <td className="px-4 py-2.5 text-xs text-[#9CA3AF] max-w-[120px] truncate">{c.disconnection_reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueueContent({ m }: { m: VoiceMetrics | null }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="stat-card rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/60 p-5">
          <div className="text-xs text-[#9CA3AF]">Pending in queue</div>
          <div className="mt-2 text-3xl font-bold text-[#F5F5F7] tabular-nums">{m?.queue_pending ?? "—"}</div>
        </div>
        <div className="stat-card rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/60 p-5">
          <div className="text-xs text-[#9CA3AF]">Currently calling</div>
          <div className="mt-2 text-3xl font-bold text-[#F5F5F7] tabular-nums">{m?.queue_calling ?? "—"}</div>
        </div>
      </div>
      <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#09090C]/40 p-5">
        <p className="text-sm text-[#9CA3AF]">Queue pause/resume is managed via N8N. Use the N8N dashboard to pause or resume the calling workflow.</p>
      </div>
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-sm text-red-400">{msg}</div>
      <p className="mt-1 text-xs text-[#6B7280]">Check Settoku Supabase env vars.</p>
    </div>
  );
}
