import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, User, Phone, Play, ExternalLink, AlertCircle } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OUTCOME_VARIANT: Record<string, "success" | "danger" | "muted" | "warning" | "primary"> = {
  won: "success", lost: "danger", no_show: "muted", callback: "warning",
  booked: "success", rescheduled: "warning", not_interested: "muted", held: "primary",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatDuration(s: number | null): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, agencyId } = await getAuthContext();

  const [{ data: call }, { data: recording }, { data: profilesAll }] = await Promise.all([
    supabase
      .from("calls")
      .select("id,member_id,client_id,external_id,occurred_at,duration_sec,outcome,notes,data")
      .eq("agency_id", agencyId!)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("call_recordings")
      .select("url,transcript,summary,created_at")
      .eq("call_id", id)
      .maybeSingle(),
    supabase.from("profiles").select("id,full_name,email"),
  ]);

  if (!call) notFound();
  const callData = (call.data as Record<string, unknown> | null) ?? {};
  const profById = new Map((profilesAll ?? []).map(p => [p.id, p]));
  const closer = call.member_id ? profById.get(call.member_id) : null;
  const closerName = closer?.full_name ?? (callData.closer_name as string | undefined) ?? "Unattributed";

  // Pull related records
  const [{ data: client }, { data: dealsForClient }, { data: txsForClient }] = await Promise.all([
    call.client_id
      ? supabase.from("clients").select("id,name,email,status,data").eq("agency_id", agencyId!).eq("id", call.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    call.client_id
      ? supabase.from("deals").select("id,name,stage,amount,closed_at").eq("agency_id", agencyId!).eq("client_id", call.client_id).order("closed_at", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] }),
    call.client_id
      ? supabase.from("transactions").select("id,amount,kind,description,occurred_at").eq("agency_id", agencyId!).eq("client_id", call.client_id).order("occurred_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
  ]);

  const outcomeLabel = (callData.outcome_label as string | undefined) ?? call.outcome ?? "held";
  const cashCollected = Number(callData.cash_collected ?? 0);
  const contractValue = Number(callData.contract_value ?? 0);
  const presentedOffer = !!callData.presented_offer;

  // Closer-form fields, in display order
  const formFields: Array<[string, unknown, string?]> = [
    ["Notes",                call.notes],
    ["Gap",                  callData.gap,                "What's preventing them from buying?"],
    ["Objection",            callData.objection,          "Specific objection raised"],
    ["Where I struggled",    callData.struggled,          "What was hard for the closer"],
    ["What to improve",      callData.improvement,        "Closer's self-coaching note"],
    ["Marketing feedback",   callData.marketing_feedback, "Quality of the lead"],
    ["Follow-up script",     callData.follow_up_script,   "What to say next"],
  ];
  const filledFields = formFields.filter(([, v]) => v && String(v).trim());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/sales/calls" className="inline-flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[rgba(245,245,247,0.8)]">
          <ArrowLeft className="size-3.5" />Back to calls
        </Link>
        {client && (
          <Link href={`/clients/${client.id}`} className="text-sm text-blue-400 hover:underline">View full client →</Link>
        )}
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>
              {client?.name ?? "Unknown caller"}
            </h1>
            <Badge variant={OUTCOME_VARIANT[call.outcome ?? "held"] ?? "muted"}>{outcomeLabel}</Badge>
            {presentedOffer && <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">offer presented</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#9CA3AF]">
            <span className="flex items-center gap-1.5"><Clock className="size-3.5" />{formatDateTime(call.occurred_at)}</span>
            <span className="flex items-center gap-1.5"><User className="size-3.5" />Closer: <span className="text-[rgba(245,245,247,0.85)]">{closerName}</span></span>
            {call.duration_sec ? <span className="flex items-center gap-1.5"><Phone className="size-3.5" />{formatDuration(call.duration_sec)}</span> : null}
            {client?.email && <span>{client.email}</span>}
          </div>
        </div>
      </header>

      {/* Stat strip — only the numbers that exist on the call */}
      {(contractValue > 0 || cashCollected > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Contract value reported" value={contractValue > 0 ? formatCurrency(contractValue) : "—"} />
          <Stat label="Cash collected reported" value={cashCollected > 0 ? formatCurrency(cashCollected) : "—"} accent={cashCollected > 0} />
          <Stat label="Offer presented" value={presentedOffer ? "Yes" : "No"} />
          <Stat label="Outcome" value={outcomeLabel} />
        </div>
      )}

      {/* Recording / transcript */}
      {recording && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">Recording</h2>
          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5">
            <div className="flex items-center gap-3">
              {recording.url ? (
                <a href={recording.url} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
                  <Play className="size-3.5" /> Play recording
                </a>
              ) : <span className="text-sm text-[#6B7280]">No recording URL</span>}
              {recording.url && <a href={recording.url} target="_blank" rel="noopener" className="text-xs text-blue-400 hover:underline flex items-center gap-1"><ExternalLink className="size-3" />open externally</a>}
            </div>
            {recording.summary && (
              <div className="mt-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] mb-1">AI summary</div>
                <p className="text-sm text-[rgba(245,245,247,0.85)] whitespace-pre-wrap">{recording.summary}</p>
              </div>
            )}
            {recording.transcript && (
              <details className="mt-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
                <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] hover:text-[#9CA3AF]">Transcript ▾</summary>
                <pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap text-xs text-[#9CA3AF] font-mono leading-relaxed">{recording.transcript}</pre>
              </details>
            )}
          </div>
        </section>
      )}

      {/* Closer post-call form data */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">Closer post-call form</h2>
        {filledFields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.08)] py-10 text-center">
            <AlertCircle className="mx-auto size-5 text-amber-400 mb-2" />
            <div className="text-sm font-medium text-[#9CA3AF]">No closer notes filled in</div>
            <p className="mt-1 max-w-md mx-auto text-xs text-[#6B7280]">The post-call form was skipped. Coaching feedback for this call is missing — worth a Slack nudge to the closer.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filledFields.map(([label, value, hint]) => (
              <div key={label as string} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">{label}</div>
                {hint && <div className="text-[10px] text-[#4B5563] mt-0.5">{hint}</div>}
                <div className="mt-2 text-sm text-[rgba(245,245,247,0.9)] whitespace-pre-wrap">{String(value)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Linked deals */}
      {dealsForClient && dealsForClient.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">Deals on this client</h2>
          <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
                {dealsForClient.map(d => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 text-[#F5F5F7]">{d.name ?? "—"}</td>
                    <td className="px-4 py-3"><Badge variant={d.stage === "closed_won" ? "success" : d.stage === "closed_lost" ? "danger" : "primary"}>{d.stage}</Badge></td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(d.amount ?? 0))}</td>
                    <td className="px-4 py-3 text-xs text-[#9CA3AF]">{d.closed_at ? new Date(d.closed_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Linked transactions */}
      {txsForClient && txsForClient.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">Recent transactions on this client</h2>
          <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
                {txsForClient.map(t => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-xs text-[#9CA3AF]">{new Date(t.occurred_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-xs capitalize text-[#9CA3AF]">{t.kind}</td>
                    <td className="px-4 py-3 text-[#9CA3AF]">{t.description ?? "—"}</td>
                    <td className={`px-4 py-3 text-right font-mono ${t.kind === "refund" ? "text-red-400" : "text-emerald-400"}`}>{formatCurrency(Number(t.amount ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Raw external_id (Typeform token) — debug aid */}
      {call.external_id && (
        <div className="text-[10px] text-[#4B5563] font-mono">
          Typeform token: {call.external_id}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "border-emerald-500/30 bg-emerald-500/5" : "border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40"}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${accent ? "text-emerald-400" : "text-[#6B7280]"}`}>{label}</div>
      <div className={`mt-2 text-xl font-bold ${accent ? "text-emerald-400" : "text-[#F5F5F7]"}`}>{value}</div>
    </div>
  );
}
