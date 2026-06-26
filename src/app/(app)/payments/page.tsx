import { Wallet, AlertCircle, Clock, CheckCircle2, ChevronRight } from "lucide-react";
import { getPaymentSchedule, getStudents, num, salesSheetIdFor } from "@/lib/sheets-data";
import { formatCurrency } from "@/lib/utils";
import { getRates, normalizeScheduleToUSD } from "@/lib/fx";
import { Section } from "../dashboard/tabs";
import { getAuthContext } from "@/lib/auth";
import { CreatorPayments } from "./creator-payments";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function PaymentsPage() {
  const { agencyId, supabase } = await getAuthContext();

  // Creator-template tenants (e.g. the creator) get their Stripe subscription schedule instead of
  // the coach-tenant Google-Sheet payment plans.
  const { data: agencyRow } = await supabase
    .from("agencies")
    .select("name, dashboard_template")
    .eq("id", agencyId!)
    .maybeSingle<{ name: string; dashboard_template: string }>();
  if (agencyRow?.dashboard_template === "creator") {
    return <CreatorPayments agencyId={agencyId!} workspaceName={agencyRow.name ?? "Workspace"} />;
  }

  const sheetId = salesSheetIdFor(agencyId);
  const [scheduleRaw, students, rates] = await Promise.all([getPaymentSchedule(sheetId), getStudents(sheetId), getRates()]);
  // Normalize Amount to USD for totals. Per-row table still shows native currency + USD-equivalent.
  const schedule = normalizeScheduleToUSD(scheduleRaw, rates);
  const valid = schedule.filter((r: any) => r['Student Email']);

  const late = valid.filter((r: any) => r['Status'] === 'Late');
  const pending = valid.filter((r: any) => r['Status'] === 'Pending');
  const paid = valid.filter((r: any) => r['Status'] === 'Paid');

  const sumAmt = (rows: any[]) => rows.reduce((s, r) => s + num(r['Amount']), 0);

  const byStudent = new Map<string, any[]>();
  for (const r of valid) {
    const k = r['Student Email'];
    if (!byStudent.has(k)) byStudent.set(k, []);
    byStudent.get(k)!.push(r);
  }
  for (const list of byStudent.values()) {
    list.sort((a, b) => {
      const ad = a['Due Date']?.split('/').reverse().join('') || '0';
      const bd = b['Due Date']?.split('/').reverse().join('') || '0';
      return ad.localeCompare(bd);
    });
  }

  const studentLookup = new Map(students.map((s: any) => [s['Email'], s]));

  const statusPill = (s: string) => {
    if (s === 'Paid') return { bg: 'rgba(0,211,147,0.15)', color: '#00D393' };
    if (s === 'Late') return { bg: 'rgba(255,100,102,0.15)', color: '#FF6466' };
    if (s === 'Pending') return { bg: 'rgba(248,175,0,0.15)', color: '#F8AF00' };
    return { bg: 'rgba(255,255,255,0.06)', color: '#9CA3AF' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">FINANCE · PAYMENTS</div>
          <h1 className="mt-1 text-3xl font-bold flex items-center gap-2 text-[#F5F5F7]" style={{fontFamily:'var(--font-playfair),Georgia,serif'}}>
            <Wallet size={26} style={{color:'#F8AF00'}}/>Payment Schedule
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            {valid.length} expected payments across {byStudent.size} students · auto-reconciled at 9am daily.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 relative">
          <div className="absolute top-0 left-0 w-[2px] h-full bg-red-500"/>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold"><AlertCircle className="size-4 text-red-400"/> Late</div>
          <div className="mt-2 text-3xl font-bold tabular-nums text-red-400">{late.length}</div>
          <div className="mt-1 text-sm text-[#9CA3AF]">{formatCurrency(sumAmt(late))}</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 relative">
          <div className="absolute top-0 left-0 w-[2px] h-full bg-amber-500"/>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold"><Clock className="size-4 text-amber-400"/> Pending</div>
          <div className="mt-2 text-3xl font-bold tabular-nums text-amber-400">{pending.length}</div>
          <div className="mt-1 text-sm text-[#9CA3AF]">{formatCurrency(sumAmt(pending))}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 relative">
          <div className="absolute top-0 left-0 w-[2px] h-full bg-emerald-500"/>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#9CA3AF] font-semibold"><CheckCircle2 className="size-4 text-emerald-400"/> Paid</div>
          <div className="mt-2 text-3xl font-bold tabular-nums text-emerald-400">{paid.length}</div>
          <div className="mt-1 text-sm text-[#9CA3AF]">{formatCurrency(sumAmt(paid))}</div>
        </div>
      </div>

      <Section num="01" title="By Student" sub="Click any to expand all their upcoming payments. Late students auto-expand.">
        <div className="space-y-2">
          {Array.from(byStudent.entries()).map(([email, payments]) => {
            const student: any = studentLookup.get(email) || {};
            const lateCount = payments.filter(p => p['Status'] === 'Late').length;
            const pendingCount = payments.filter(p => p['Status'] === 'Pending').length;
            const paidCount = payments.filter(p => p['Status'] === 'Paid').length;
            const remainingAmt = sumAmt(payments.filter(p => p['Status'] !== 'Paid'));
            const tier = student['Tier'];
            return (
              <details key={email} className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)]" open={lateCount > 0}>
                <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] rounded-xl transition-colors list-none">
                  <ChevronRight size={16} className="text-[#6B7280] transition-transform"/>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#F5F5F7] flex items-center gap-2">
                      {payments[0]['Student Name']}
                      {tier && <span className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ background: tier === 'Tier 2' ? 'rgba(181,126,255,0.15)' : 'rgba(0,131,255,0.15)', color: tier === 'Tier 2' ? '#B57EFF' : '#0083FF' }}>{tier}</span>}
                    </div>
                    <div className="text-xs text-[#6B7280] truncate">{email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lateCount > 0 && <span className="rounded px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(255,100,102,0.15)', color: '#FF6466' }}>{lateCount} late</span>}
                    {pendingCount > 0 && <span className="rounded px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(248,175,0,0.15)', color: '#F8AF00' }}>{pendingCount} pending</span>}
                    {paidCount > 0 && <span className="rounded px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(0,211,147,0.15)', color: '#00D393' }}>{paidCount} paid</span>}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-[#F5F5F7] tabular-nums">{formatCurrency(remainingAmt)}</div>
                    <div className="text-xs text-[#6B7280]">remaining</div>
                  </div>
                </summary>
                <div className="border-t border-[rgba(255,255,255,0.05)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[rgba(255,255,255,0.02)]">
                      <tr className="text-[10px] uppercase tracking-wider text-[#6B7280]">
                        <th className="text-center px-4 py-2 font-semibold">#</th>
                        <th className="text-left px-4 py-2 font-semibold">Due</th>
                        <th className="text-right px-4 py-2 font-semibold">Amount</th>
                        <th className="text-left px-4 py-2 font-semibold">Source</th>
                        <th className="text-left px-4 py-2 font-semibold">Status</th>
                        <th className="text-center px-4 py-2 font-semibold">Days Late</th>
                        <th className="text-left px-4 py-2 font-semibold">Paid Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, i) => {
                        const sp = statusPill(p['Status']);
                        return (
                          <tr key={i} className="border-t border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                            <td className="px-4 py-2 tabular-nums text-center text-[#9CA3AF]">{p['Payment #']}</td>
                            <td className="px-4 py-2 tabular-nums text-[#F5F5F7]">{p['Due Date']}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-medium text-[#F5F5F7]">
                              {p.__currency && p.__currency !== 'USD' ? (
                                <>
                                  <span>{p.__currency} {p.__amountNative?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  <span className="ml-2 text-[10px] text-[#6B7280]">≈ {formatCurrency(p['Amount'])}</span>
                                </>
                              ) : (
                                <>{formatCurrency(p['Amount'])}</>
                              )}
                            </td>
                            <td className="px-4 py-2 text-xs text-[#9CA3AF]">{p['Source']}</td>
                            <td className="px-4 py-2"><span className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ background: sp.bg, color: sp.color }}>{p['Status']}</span></td>
                            <td className="px-4 py-2 text-center tabular-nums" style={{ color: p['Days Late'] ? '#FF6466' : '#6B7280' }}>{p['Days Late'] || '—'}</td>
                            <td className="px-4 py-2 text-xs text-[#6B7280]">{p['Paid Date'] || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
