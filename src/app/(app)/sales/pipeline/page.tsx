import { getAuthContext } from "@/lib/auth";
import { PipelineBoard, type DealCard } from "./pipeline-board";

export const dynamic = "force-dynamic";

type Stage = "discovery" | "proposal" | "negotiation" | "closed_won" | "closed_lost";

export default async function PipelinePage() {
  const { supabase, agencyId } = await getAuthContext();

  const [{ data: deals }, { data: clients }, { data: profiles }] = await Promise.all([
    supabase
      .from("deals")
      .select("id,name,stage,amount,client_id,owner_id,closed_at,created_at,data")
      .eq("agency_id", agencyId!)
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id,name,email")
      .eq("agency_id", agencyId!),
    supabase.from("profiles").select("id,full_name,email"),
  ]);

  const clientById = new Map((clients ?? []).map(c => [c.id, c]));
  const profById = new Map((profiles ?? []).map(p => [p.id, p]));

  // Map raw deal stages to one of our 5 columns. "new" → discovery for the kanban view.
  function normalizeStage(raw: string | null): Stage {
    if (raw === "new") return "discovery";
    if (raw === "discovery" || raw === "proposal" || raw === "negotiation" || raw === "closed_won" || raw === "closed_lost") return raw;
    return "discovery";
  }

  const cards: DealCard[] = (deals ?? []).map(d => {
    const c = d.client_id ? clientById.get(d.client_id) : null;
    const owner = d.owner_id ? profById.get(d.owner_id) : null;
    const data = (d.data as Record<string, unknown> | null) ?? {};
    return {
      id: d.id,
      name: d.name ?? "Unnamed deal",
      stage: normalizeStage(d.stage),
      amount: Number(d.amount ?? 0),
      client_id: d.client_id ?? null,
      client_name: c?.name ?? null,
      client_email: c?.email ?? null,
      owner_name: owner?.full_name ?? owner?.email ?? null,
      closed_at: d.closed_at ?? null,
      created_at: d.created_at,
      needs_review: !!data.needs_review,
    };
  });

  const totalDeals = cards.length;
  const totalAmount = cards.reduce((s, d) => s + d.amount, 0);
  const wonCount = cards.filter(c => c.stage === "closed_won").length;
  const wonAmount = cards.filter(c => c.stage === "closed_won").reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">SALES · PIPELINE</div>
          <h1 className="mt-1 text-3xl font-bold text-[#F5F5F7]" style={{fontFamily:"var(--font-playfair),Georgia,serif"}}>Pipeline</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">{totalDeals} deal{totalDeals === 1 ? "" : "s"} · {wonCount} won · drag to update stage.</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">Pipeline value</div>
            <div className="text-xl font-bold text-[#F5F5F7] tabular-nums">${totalAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Won</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums">${wonAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
      </header>

      {totalDeals === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] py-16 text-center text-sm text-[#9CA3AF]">
          No deals yet. They&apos;ll appear here as closer post-call forms come in or you create them manually.
        </div>
      ) : (
        <PipelineBoard deals={cards} />
      )}
    </div>
  );
}
