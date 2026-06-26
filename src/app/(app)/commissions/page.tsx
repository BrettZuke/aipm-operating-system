import { ArrowDown, Calendar } from "lucide-react";
import { getStudents, getPaymentSchedule, salesSheetIdFor } from "@/lib/sheets-data";
import { computeMonthlyCommissions, getMonthOptions } from "@/lib/sheets-commissions";
import { formatCurrency } from "@/lib/utils";
import { getRates, normalizeStudentsToUSD, normalizeScheduleToUSD } from "@/lib/fx";
import { getAuthContext, getActiveAgencyTemplate } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PANEL = "rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0E0E12]";

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const { agencyId } = await getAuthContext();
  // Commissions is a coach-only view (the cascade + rev-share split is built for the coach's sheet).
  // Creator workspaces (the creator, a creator tenant, etc.) must never see it, even via direct URL.
  const { template } = await getActiveAgencyTemplate();
  if (template !== "coach") redirect("/dashboard");
  const sheetId = salesSheetIdFor(agencyId);
  const monthOptions = getMonthOptions();
  const now = new Date();
  const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const month = sp.month || defaultMonth;
  const isLifetime = month === 'lifetime';
  const monthLabel = monthOptions.find(m => m.value === month)?.label || month;

  const [studentsRaw, scheduleRaw, rates] = await Promise.all([getStudents(sheetId), getPaymentSchedule(sheetId), getRates()]);
  // Convert every native-currency amount to USD before the cascade runs.
  const students = normalizeStudentsToUSD(studentsRaw, rates);
  const schedule = normalizeScheduleToUSD(scheduleRaw, rates);
  const cycle = computeMonthlyCommissions(students, schedule, month);

  let payoutDate = '';
  if (!isLifetime) {
    const [yearStr, monthStr] = month.split('-');
    const next = new Date(Date.UTC(+yearStr, +monthStr, 1));
    payoutDate = `${String(next.getUTCMonth() + 1).padStart(2, '0')}/01/${next.getUTCFullYear()}`;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">FINANCE · COMMISSIONS</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[#F5F5F7]" style={{fontFamily:'var(--font-playfair),Georgia,serif'}}>
            Commissions
          </h1>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Cycle: <span className="font-semibold text-[#F5F5F7]">{monthLabel}</span>
            {payoutDate && <> · Payout: <span className="font-semibold text-[#F5F5F7]">{payoutDate}</span></>}
          </p>
        </div>
      </div>

      {/* Month picker — clickable links so URL changes guaranteed */}
      <div className={`flex flex-wrap gap-2 ${PANEL} p-2`}>
        {monthOptions.map(m => {
          const active = m.value === month;
          return (
            <a
              key={m.value}
              href={`/commissions?month=${m.value}`}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={active
                ? { background: '#0083FF', color: 'white' }
                : { color: '#9CA3AF' }
              }
            >
              {m.value === 'lifetime' ? '✦ Lifetime' : m.label.replace(' 2026','').replace(' 2025','').replace(' 2027','')}
            </a>
          );
        })}
      </div>

      {cycle.rows.length === 0 ? (
        <div className={`${PANEL} p-16 text-center`}>
          <Calendar size={32} className="mx-auto mb-3 text-[#6B7280]"/>
          <h3 className="text-lg font-semibold mb-1 text-[#F5F5F7]">No commissions for {monthLabel}</h3>
          <p className="text-sm text-[#6B7280]">No cash collected in this period yet.</p>
        </div>
      ) : (
        <>
          {/* Cascade — with refined typography */}
          <div className={`${PANEL} p-8`}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <HSection>Payout Cascade</HSection>
                <div className="text-xs mt-1 text-[#6B7280]">{cycle.rows.length} {cycle.rows.length === 1 ? 'transaction' : 'transactions'} · {monthLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[#6B7280]">Total to distribute</div>
                <div className="text-2xl font-bold tabular-nums text-[#F5F5F7]" style={{fontFamily:'var(--font-playfair),Georgia,serif'}}>{formatCurrency(cycle.gross)}</div>
              </div>
            </div>
            <div className="space-y-1.5 max-w-2xl mx-auto">
              <CascadeRow label="Gross revenue" value={formatCurrency(cycle.gross)} accent="primary" big/>
              <CascadeArrow label="− Fanbasis transaction fees" value={`-${formatCurrency(cycle.fees)}`}/>
              {Object.entries(cycle.closerComms).filter(([, v]) => v > 0).map(([name, comm]) => (
                <CascadeArrow key={name} label={`− ${name} (closer 10%)`} value={`-${formatCurrency(comm)}`}/>
              ))}
              {Object.entries(cycle.setterComms).filter(([, v]) => v > 0).map(([name, comm]) => (
                <CascadeArrow key={name} label={`− ${name} (setter 5%)`} value={`-${formatCurrency(comm)}`}/>
              ))}
              {cycle.vat > 0 && <CascadeArrow label="− VAT (the coach sets aside to pay HMRC)" value={`-${formatCurrency(cycle.vat)}`}/>}
              <div className="h-px my-3" style={{background: 'rgba(255,255,255,0.08)'}}/>
              <CascadeRow label="the operator · 20% rev share" value={formatCurrency(cycle.brettShare)} accent="warning" big/>
              <CascadeRow label="the coach · 80% residual" value={formatCurrency(cycle.danShare)} accent="success" big/>
            </div>
          </div>

          {/* Payouts cards */}
          <div>
            <HSection className="mb-4">Final Payouts {payoutDate && `on ${payoutDate}`}</HSection>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.entries(cycle.closerComms).filter(([, v]) => v > 0).map(([name, amt]) => (
                <PayoutCard key={name} name={name} role="closer · 10%" amount={amt} accent="pink"/>
              ))}
              {Object.entries(cycle.setterComms).filter(([, v]) => v > 0).map(([name, amt]) => (
                <PayoutCard key={`s-${name}`} name={name} role="setter · 5%" amount={amt} accent="cyan"/>
              ))}
              <PayoutCard name="the operator" role="20% rev share" amount={cycle.brettShare} accent="amber"/>
              {cycle.vat > 0 && <PayoutCard name="HMRC" role="VAT — the coach sets aside" amount={cycle.vat} accent="rose"/>}
            </div>
          </div>

          {/* Per-deal table */}
          <div>
            <HSection className="mb-4">Per-Deal Breakdown</HSection>
            <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0C0C10]/40 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                    <th className="px-4 py-3">Date</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Region</th>
                    <th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">Fee</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3 text-right">VAT</th>
                    <th className="px-4 py-3">Closer</th><th className="px-4 py-3 text-right">Closer Comm</th>
                    <th className="px-4 py-3">Setter</th><th className="px-4 py-3 text-right">Setter Comm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
                  {cycle.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-[#0C0C10]/40">
                      <td className="px-4 py-3 text-xs text-[#9CA3AF]">{r.date}</td>
                      <td className="px-4 py-3 font-medium text-[#F5F5F7]">{r.client}</td>
                      <td className="px-4 py-3">{regionPill(r.region)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#F5F5F7]">{formatCurrency(r.gross)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#6B7280]">{formatCurrency(r.fee)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#9CA3AF]">{formatCurrency(r.net)}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{color: r.vat ? '#FF6466' : '#6B7280'}}>{formatCurrency(r.vat)}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF]">{r.closer}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{color:'#00D393'}}>{formatCurrency(r.closerComm)}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF]">{r.setter !== 'No Setter' && r.setter !== 'Unsure of Setter' ? r.setter : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{color: r.setterComm > 0 ? '#00D393' : '#6B7280'}}>{r.setterComm > 0 ? formatCurrency(r.setterComm) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-xs font-semibold uppercase tracking-[0.06em] text-[#6B7280] flex items-center gap-2 ${className}`}>{children}</div>
  );
}

function regionPill(region: string) {
  const style =
    region === 'UK' ? { background: 'rgba(0,131,255,0.15)', color: '#0083FF' }
    : region === 'EU' ? { background: 'rgba(181,126,255,0.15)', color: '#B57EFF' }
    : { background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' };
  return <span className="rounded px-2 py-0.5 text-[10px] font-semibold" style={style}>{region}</span>;
}

function CascadeRow({ label, value, accent, big }: { label: string; value: string; accent?: string; big?: boolean }) {
  const map: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'rgba(0,131,255,0.10)', text: '#0083FF' },
    warning: { bg: 'rgba(248,175,0,0.10)', text: '#F8AF00' },
    success: { bg: 'rgba(0,211,147,0.10)', text: '#00D393' },
  };
  const c = map[accent || ''] || { bg: 'transparent', text: '#F5F5F7' };
  return (
    <div className={`flex items-center justify-between rounded-lg px-4 ${big ? 'py-3' : 'py-2'}`} style={{ background: c.bg }}>
      <div className={`${big ? 'text-base font-semibold' : 'text-sm'}`} style={{ color: c.text }}>{label}</div>
      <div className={`tabular-nums ${big ? 'text-xl font-bold' : 'text-sm'}`} style={{ color: c.text, fontFamily: big ? 'var(--font-playfair),Georgia,serif' : undefined }}>{value}</div>
    </div>
  );
}

function CascadeArrow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5 text-sm">
      <div className="flex items-center gap-2 text-[#9CA3AF]"><ArrowDown size={12} className="text-[#6B7280]"/>{label}</div>
      <div className="tabular-nums" style={{color:'#FF6466'}}>{value}</div>
    </div>
  );
}

function PayoutCard({ name, role, amount, accent }: { name: string; role: string; amount: number; accent: string }) {
  const map: Record<string, string> = {
    pink:  '#B57EFF',
    cyan:  '#00A4FF',
    amber: '#F8AF00',
    rose:  '#FF6466',
  };
  const color = map[accent] || map.pink;
  return (
    <div className="relative overflow-hidden rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{background: color}}/>
      <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[#6B7280]">{name}</div>
      <div className="text-[10px] mt-0.5 text-[#6B7280]">{role}</div>
      <div className="mt-3 text-2xl font-bold tabular-nums" style={{color, fontFamily:'var(--font-playfair),Georgia,serif'}}>{formatCurrency(amount)}</div>
    </div>
  );
}
