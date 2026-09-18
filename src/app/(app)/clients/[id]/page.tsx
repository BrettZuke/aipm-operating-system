import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone as PhoneIcon, AtSign, Wallet, Clock, Trophy, AlertCircle, FileText } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { formatCurrency } from "@/lib/utils";
import { ClientFormDialog } from "../client-form-dialog";
import { ClientRowActions } from "../client-row-actions";
import { TransactionFormDialog } from "../../transactions/transaction-form-dialog";
import { TaskFormDialog } from "../../tasks/task-form-dialog";
import { TaskRow } from "../../tasks/task-row";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "primary" | "success" | "warning" | "muted"> = {
  lead: "primary",
  active: "success",
  paused: "warning",
  churned: "muted",
};

const KIND_VARIANT: Record<string, "primary" | "warning" | "danger" | "muted"> = {
  payment: "primary",
  refund: "warning",
  chargeback: "danger",
  adjustment: "muted",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, agencyId } = await getAuthContext();

  const [
    { data: client, error: clientErr },
    { data: transactions },
    { data: tasks },
    { data: members },
    { data: clients },
    { data: calls },
    { data: deals },
    { data: dossier },
    { data: profilesAll },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, email, status, mrr, total_pending, notes, data, created_at")
      .eq("agency_id", agencyId!)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("id, client_id, amount, currency, kind, description, occurred_at, metadata")
      .eq("agency_id", agencyId!)
      .eq("client_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("tasks")
      .select("id, title, description, status, priority, due_date, client_id, assignee_id")
      .eq("agency_id", agencyId!)
      .eq("client_id", id)
      .order("status")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("agency_members")
      .select("user_id, profiles(id, full_name, email)")
      .eq("agency_id", agencyId!)
      .eq("status", "active"),
    supabase.from("clients").select("id, name").eq("agency_id", agencyId!).order("name"),
    supabase
      .from("calls")
      .select("id, member_id, outcome, occurred_at, notes, data, duration_sec")
      .eq("agency_id", agencyId!)
      .eq("client_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("deals")
      .select("id, name, stage, amount, closed_at, owner_id, data")
      .eq("agency_id", agencyId!)
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("knowledge_docs")
      .select("id, title, content_text, source_type, updated_at")
      .eq("agency_id", agencyId!)
      .eq("source_type", "client_dossier")
      .eq("metadata->>client_id", id)
      .maybeSingle(),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  if (clientErr || !client) notFound();
  const clientData = (client.data as Record<string, unknown> | null) ?? {};
  const research = (clientData.market_research as Record<string, unknown> | undefined) ?? null;
  const phone = (clientData.phone as string | undefined) ?? (research?.phone as string | undefined);
  const igHandle = (clientData.ig_handle as string | undefined) ?? (research?.ig_handle as string | undefined);
  const contracted = Number(clientData.contracted_total ?? 0);
  const collected = Number(clientData.collected_total ?? 0);
  const outstanding = Number(clientData.outstanding_balance ?? 0);
  const lastPaymentAt = clientData.last_payment_at as string | null | undefined;
  const lastProduct = clientData.last_product as string | null | undefined;
  const profById = new Map((profilesAll ?? []).map(p => [p.id, p]));

  const memberOptions: { id: string; full_name: string | null; email: string }[] =
    (members ?? [])
      .map((m) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return p
          ? { id: p.id, full_name: p.full_name, email: p.email }
          : null;
      })
      .filter((x): x is { id: string; full_name: string | null; email: string } => x !== null);

  const totalRevenue = (transactions ?? [])
    .filter((t) => t.kind === "payment")
    .reduce((sum, t) => sum + Number(t.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-[rgba(245,245,247,0.8)]"
        >
          <ArrowLeft className="size-3.5" />
          Back to clients
        </Link>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-base font-semibold text-blue-300">
            {client.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-[#F5F5F7]">{client.name}</h1>
              <Badge variant={STATUS_VARIANT[client.status ?? "lead"] ?? "default"}>
                {client.status ?? "lead"}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#9CA3AF]">
              {client.email && (<span className="flex items-center gap-1.5"><Mail className="size-3.5" />{client.email}</span>)}
              {phone     && (<span className="flex items-center gap-1.5"><PhoneIcon className="size-3.5" />{phone}</span>)}
              {igHandle  && (<span className="flex items-center gap-1.5"><AtSign className="size-3.5" />{igHandle}</span>)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ClientFormDialog mode="edit" client={client} />
          <ClientRowActions client={client} />
        </div>
      </header>

      {/* Stat row, payment status takes priority since this is the most actionable info */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Contracted" value={formatCurrency(contracted)} icon={Trophy} />
        <StatCard label="Cash collected" value={formatCurrency(collected)} icon={Wallet} />
        <StatCard label={outstanding > 0 ? "Outstanding ⚠" : "Outstanding"} value={formatCurrency(outstanding)} icon={AlertCircle} accent={outstanding > 0} />
        <StatCard label="Last payment" value={lastPaymentAt ? new Date(lastPaymentAt).toLocaleDateString() : "-"} sub={lastProduct ?? undefined} icon={Clock} />
      </div>

      {client.notes && (
        <section className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5">
          <h2 className="text-sm font-semibold text-[rgba(245,245,247,0.8)]">Notes</h2>
          <p className="mt-2 text-sm text-[#9CA3AF] whitespace-pre-wrap">
            {client.notes}
          </p>
        </section>
      )}

      {/* Deals */}
      {(deals?.length ?? 0) > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Deals</h2>
            <span className="text-xs text-[#6B7280]">{deals!.length} deal{deals!.length === 1 ? "" : "s"}</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Closed</th>
                  <th className="px-4 py-3">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
                {deals!.map(d => {
                  const owner = d.owner_id ? profById.get(d.owner_id) : null;
                  const dealData = (d.data as Record<string, unknown> | null) ?? {};
                  const needsReview = !!dealData.needs_review;
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-3 font-medium text-[#F5F5F7]">{d.name ?? "-"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={d.stage === "closed_won" ? "success" : d.stage === "closed_lost" ? "danger" : "primary"}>{d.stage}</Badge>
                      </td>
                      <td className="px-4 py-3 text-[#9CA3AF]">{owner?.full_name ?? owner?.email ?? "-"}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#F5F5F7]">{formatCurrency(Number(d.amount ?? 0))}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF]">{d.closed_at ? new Date(d.closed_at).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3 text-xs">{needsReview && <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-400">⚠ needs review</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Calls (with closer notes inline) */}
      {(calls?.length ?? 0) > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Calls</h2>
            <span className="text-xs text-[#6B7280]">{calls!.length} call{calls!.length === 1 ? "" : "s"}</span>
          </div>
          <div className="space-y-3">
            {calls!.map(c => {
              const callData = (c.data as Record<string, unknown> | null) ?? {};
              const closerName = (callData.closer_name as string | undefined) ?? null;
              const member = c.member_id ? profById.get(c.member_id) : null;
              const closerLabel = member?.full_name ?? closerName ?? "-";
              const outcome = c.outcome ?? "held";
              const outcomeLabel = (callData.outcome_label as string | undefined) ?? outcome;
              const fields: Array<[string, unknown]> = [
                ["Notes",               c.notes],
                ["Gap",                 callData.gap],
                ["Objection",           callData.objection],
                ["Where I struggled",   callData.struggled],
                ["What to improve",     callData.improvement],
                ["Marketing feedback",  callData.marketing_feedback],
                ["Follow-up script",    callData.follow_up_script],
              ];
              const cashCollected = Number(callData.cash_collected ?? 0);
              const contractValue = Number(callData.contract_value ?? 0);
              return (
                <div key={c.id} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                    <Badge variant={outcome === "won" ? "success" : outcome === "lost" ? "danger" : outcome === "no_show" ? "muted" : "primary"}>{outcomeLabel}</Badge>
                    <span>{formatDateTime(c.occurred_at)}</span>
                    <span className="text-[#6B7280]">·</span>
                    <span>Closer: <span className="text-[rgba(245,245,247,0.85)]">{closerLabel}</span></span>
                    {contractValue > 0 && <><span className="text-[#6B7280]">·</span><span>Contract <span className="font-mono text-[rgba(245,245,247,0.85)]">{formatCurrency(contractValue)}</span></span></>}
                    {cashCollected > 0 && <><span className="text-[#6B7280]">·</span><span>Cash <span className="font-mono text-emerald-400">{formatCurrency(cashCollected)}</span></span></>}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {fields.filter(([, v]) => v && String(v).trim()).map(([label, value]) => (
                      <div key={label}>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">{label}</div>
                        <div className="mt-0.5 text-sm text-[rgba(245,245,247,0.85)] whitespace-pre-wrap">{String(value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Market research / onboarding */}
      {research && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Market research / onboarding</h2>
            <span className="text-xs text-[#6B7280]">Source: {(research.source as string) ?? "form"}</span>
          </div>
          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(research)
                .filter(([k, v]) => v && String(v).trim() && !["typeform_token", "submitted_at", "source", "ig_handle", "phone"].includes(k))
                .map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">{k.replace(/_/g, " ")}</div>
                    <div className="mt-0.5 text-sm text-[rgba(245,245,247,0.85)] whitespace-pre-wrap">{String(v)}</div>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Auto-generated knowledge dossier */}
      {dossier?.content_text && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#F5F5F7]">Knowledge dossier</h2>
            <Link href={`/knowledge?doc=${dossier.id}`} className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
              <FileText className="size-3" /> open in Library
            </Link>
          </div>
          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 p-5">
            <Markdown text={dossier.content_text} />
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#F5F5F7]">Transactions</h2>
          <TransactionFormDialog mode="create" clients={clients ?? []} />
        </div>
        {transactions && transactions.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-[rgba(245,245,247,0.8)]">
                      {formatDateTime(t.occurred_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={KIND_VARIANT[t.kind ?? "payment"] ?? "default"}>
                        {t.kind ?? "payment"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[#9CA3AF]">{t.description ?? "-"}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        t.kind === "refund" || t.kind === "chargeback"
                          ? "text-red-400"
                          : "text-[#F5F5F7]"
                      }`}
                    >
                      {formatCurrency(Number(t.amount ?? 0), t.currency ?? "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.08)] px-6 py-10 text-center text-sm text-[#9CA3AF]">
            No transactions yet for this client.
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#F5F5F7]">Tasks</h2>
          <TaskFormDialog
            mode="create"
            clients={clients ?? []}
            members={memberOptions}
          />
        </div>
        {tasks && tasks.length > 0 ? (
          <div className="space-y-1.5">
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                clients={clients ?? []}
                members={memberOptions}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.08)] px-6 py-10 text-center text-sm text-[#9CA3AF]">
            No tasks yet for this client.
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Mail;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "border-amber-500/30 bg-amber-500/5" : "border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40"}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium uppercase tracking-wide ${accent ? "text-amber-400" : "text-[#6B7280]"}`}>
          {label}
        </span>
        <Icon className={`size-4 ${accent ? "text-amber-400" : "text-[#6B7280]"}`} />
      </div>
      <div className={`mt-3 text-2xl font-semibold ${accent ? "text-amber-400" : "text-[#F5F5F7]"}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-[#6B7280] truncate">{sub}</div>}
    </div>
  );
}
