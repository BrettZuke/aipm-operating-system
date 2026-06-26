import Link from "next/link";
import { Users } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Settoku tracks CUSTOMERS (people who have paid), not leads. A row counts as a customer once the
// FanBasis sync stamps a `data.fanbasis` block onto it (lifetime spend, # payments, last payment,
// offer). We filter on the presence of that block, so the thousands of cold leads created by the
// closer-call / onboarding Typeforms never show here — while staying in the DB for call/deal linkage.
type FanbasisBlock = {
  lifetime?: number;
  payments?: number;
  last_payment?: string | null;
  offer?: string;
};
type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  data: unknown;
  created_at: string;
};

export default async function CustomersPage() {
  const { supabase, agencyId } = await getAuthContext();

  let rows: CustomerRow[];
  try {
    rows = await fetchAllPages<CustomerRow>((from, to) =>
      supabase
        .from("clients")
        .select("id, name, email, data, created_at")
        .eq("agency_id", agencyId!)
        .not("data->fanbasis", "is", null)
        .range(from, to),
    );
  } catch (e) {
    return (
      <div className="rounded-md border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-300">
        {e instanceof Error ? e.message : "Failed to load customers"}
      </div>
    );
  }

  const customers = (rows ?? [])
    .map((c) => {
      const fb = (c.data as { fanbasis?: FanbasisBlock } | null)?.fanbasis ?? {};
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        lifetime: Number(fb.lifetime ?? 0),
        payments: Number(fb.payments ?? 0),
        lastPayment: fb.last_payment ?? null,
        offer: fb.offer ?? "Other",
      };
    })
    .sort((a, b) => b.lifetime - a.lifetime);

  const totalRevenue = customers.reduce((s, c) => s + c.lifetime, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#F5F5F7]">Customers</h1>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            {customers.length} {customers.length === 1 ? "customer" : "customers"} who have paid
            {customers.length > 0 ? ` · ${formatCurrency(totalRevenue)} lifetime` : ""}
          </p>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40 py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] mb-4">
            <Users className="size-6 text-[#9CA3AF]" />
          </div>
          <div className="text-base font-medium text-[rgba(245,245,247,0.8)]">No customers yet</div>
          <p className="mt-1 text-sm text-[#9CA3AF]">When a payment lands, the buyer shows up here automatically.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Offer</th>
                <th className="px-4 py-3 text-right">Total paid</th>
                <th className="px-4 py-3 text-right">Payments</th>
                <th className="px-4 py-3">Last payment</th>
                <th className="px-4 py-3">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.08)]">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-[#0C0C10]/40">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/clients/${c.id}`} className="text-[#F5F5F7] hover:text-blue-400 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#9CA3AF]">{c.offer}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#F5F5F7]">{formatCurrency(c.lifetime)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#9CA3AF]">{c.payments || "—"}</td>
                  <td className="px-4 py-3 text-[#9CA3AF]">{c.lastPayment ?? "—"}</td>
                  <td className="px-4 py-3 text-[#9CA3AF]">{c.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
