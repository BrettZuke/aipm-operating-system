import { Trophy, Phone, AlertCircle, Target, Activity, Ghost, UserCheck } from "lucide-react";
import { getStudents, getCloser, getPaymentSchedule, computeSalesMetrics, breakdownByCloser, breakdownBySetter, breakdownByOutcome, getStudentLifecycle, num, parseDDMMYYYY, SHEET_OWNER_AGENCY_ID, salesSheetIdFor } from "@/lib/sheets-data";
import type { CloserBreakdown, SetterBreakdown } from "@/lib/sheets-data";
import { getRates, normalizeStudentsToUSD, normalizeScheduleToUSD } from "@/lib/fx";
import { OutcomeDonut, CashByCloser, ProjectionLine } from "@/components/settoku-charts";
import { fmt$, fmtPct, fmtN } from "@/components/lightboard";
import { getActiveAgencyTemplate } from "@/lib/auth";
import { CreatorSales } from "./creator-sales";

export const dynamic = "force-dynamic";
export const revalidate = 60;

// Settoku theme accent palette — keeps the per-outcome donut colors on-brand against the dark UI.
const OUTCOME_COLORS: Record<string, string> = {
  'PIF': '#00D393',
  'Financed via Fanbasis': '#00A4FF',
  'Financed In House': '#0083FF',
  'Put Deposit': '#F8AF00',
  'Booked Follow Up': '#B57EFF',
  'No Close': '#9CA3AF',
  "Financially DQ'd": '#FF6466',
  'No Show': '#6B7280',
  'Cancelled': '#F8AF00',
};

// Map the legacy lightboard accent keywords onto Settoku theme hexes so Stat/FunnelStep/KPI stay consistent.
const ACCENT: Record<string, string> = {
  emerald: '#00D393', teal: '#00D393',
  amber: '#F8AF00', orange: '#F8AF00',
  rose: '#FF6466',
  blue: '#0083FF', indigo: '#0083FF',
  cyan: '#00A4FF',
  violet: '#B57EFF', pink: '#B57EFF',
};
const accentColor = (a?: string) => (a && ACCENT[a]) || '#F5F5F7';

const PANEL = "rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0E0E12]";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ goal?: string; range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  // Creator tenants (e.g. the creator) get a Stripe-powered Sales view; coach-tenant keeps the sheet Sales Hub below.
  const { agencyId, name } = await getActiveAgencyTemplate();
  // Only the coach's sheet-owning workspace sees the Google-Sheet Sales Hub; every other workspace
  // (the creator + all others) gets its own Stripe-powered Sales view.
  if (agencyId !== SHEET_OWNER_AGENCY_ID) {
    return <CreatorSales agencyId={agencyId ?? ""} workspaceName={name ?? "Workspace"} searchParams={sp} />;
  }
  const goal = parseFloat(sp.goal || '50000');

  // Pass the sheet id explicitly (agencyId is the coach's here, past the guard above). The sheets-data
  // getters no longer default to the coach's sheet, so an omitted id is now safe-empty, not a leak.
  const sheetId = salesSheetIdFor(agencyId);
  const [studentsRaw, closer, scheduleRaw, rates] = await Promise.all([
    getStudents(sheetId), getCloser(sheetId), getPaymentSchedule(sheetId), getRates(),
  ]);
  // Normalize every dollar figure to USD before any aggregation. UK rows are GBP, EU rows are EUR.
  const students = normalizeStudentsToUSD(studentsRaw, rates);
  const schedule = normalizeScheduleToUSD(scheduleRaw, rates);
  const m = computeSalesMetrics(closer, students, schedule);
  const closerStats = breakdownByCloser(closer, students);
  const setterStats = breakdownBySetter(closer, students);
  const outcomeStats = breakdownByOutcome(closer).filter(o => o.count > 0);

  // Sort closers by cash collected (top performer first)
  const closerStatsRanked = [...closerStats].sort((a, b) => b.cash - a.cash);
  const setterStatsRanked = [...setterStats].sort((a, b) => b.cash - a.cash);

  // Bucket scheduled cash by calendar month. Key by sortable YYYY-MM so the chart reads
  // chronologically — the rows arrive in sheet order, not date order.
  const projection: Record<string, { label: string; expected: number }> = {};
  for (const r of schedule) {
    if (r['Status'] !== 'Pending' && r['Status'] !== 'Paid') continue;
    const d = parseDDMMYYYY(r['Due Date']);
    if (!d) continue;
    const sortKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = `${d.toLocaleString('en', { month: 'short', timeZone:'UTC' })} ${String(d.getUTCFullYear()).slice(-2)}`;
    if (!projection[sortKey]) projection[sortKey] = { label, expected: 0 };
    projection[sortKey].expected += num(r['Amount']);
  }
  const projectionData = Object.entries(projection)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 8)
    .map(([, { label, expected }]) => ({ month: label, expected }));
  const goalProgress = goal > 0 ? m.totalCash / goal : 0;

  // Funnel data
  const funnelRows = [
    { label: 'Booked',  value: m.totalBooked },
    { label: 'Live',    value: m.totalLive },
    { label: 'Closed',  value: m.totalClosed },
  ];
  const funnelMax = Math.max(1, ...funnelRows.map(r => r.value));

  // Lifetime totals
  const lifetimeRevenue = m.totalContract;
  const cashCollectionRate = lifetimeRevenue > 0 ? m.totalCash / lifetimeRevenue : 0;
  const largestPaid = students.filter((s: any) => getStudentLifecycle(s['Notes']) === 'active').reduce((max, s: any) => Math.max(max, num(s['Total Paid'])), 0);

  // Weighted forecast (next 30 days × 0.85 confidence)
  const weightedForecast = m.nextMonthProjection * 0.85;

  return (
    <div className="space-y-10">
      {/* Premium header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">SALES · LIVE FROM SHEETS</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[#F5F5F7]" style={{fontFamily:'var(--font-playfair),Georgia,serif'}}>
            Sales Hub
          </h1>
          <p className="mt-2 text-sm max-w-xl text-[#9CA3AF]">
            Where calls become offers, offers become wins, and the team&apos;s effort shows up as revenue.
          </p>
        </div>
        <form className="flex gap-2 text-sm">
          <label className="flex items-center gap-2 text-xs text-[#6B7280]">Monthly goal:
            <input name="goal" type="number" defaultValue={goal} className="settoku-input rounded-lg px-3 py-1.5 w-28 text-sm text-[#F5F5F7]"/>
          </label>
          <button type="submit" className="btn-primary text-white rounded-lg px-4 py-1.5 text-sm font-medium" style={{background:'#0083FF'}}>Apply</button>
        </form>
      </div>

      {m.lateCount > 0 && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{borderLeft:'3px solid #FF6466', background:'rgba(255,100,102,0.08)', border:'1px solid rgba(255,100,102,0.2)'}}>
          <AlertCircle size={18} style={{color:'#FF6466'}}/>
          <span className="text-sm text-[#F5F5F7]">
            <span className="font-semibold" style={{color:'#FF6466'}}>{m.lateCount}</span> late payment{m.lateCount===1?'':'s'}
            {m.pendingCount > 0 && <>, <span className="font-semibold" style={{color:'#F8AF00'}}>{m.pendingCount}</span> pending</>}
            <a href="/payments" className="ml-2 font-medium" style={{color:'#0083FF'}}>Review →</a>
          </span>
        </div>
      )}

      {/* 01 · Money — premium hero strip */}
      <Section num="01" title="Money" sub="Cash flowing in. Contract value sold. What's still owed.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Hero label="Cash Collected"        value={fmt$(m.totalCash)}        sub="actual money in" accent="#0083FF"/>
          <Hero label="Contract Value"        value={fmt$(m.totalContract)}    sub="lifetime closed" accent="#00D393"/>
          <Hero label="Cash to Be Collected"  value={fmt$(m.cashToCollect)}    sub={`${m.lateCount + m.pendingCount} payments outstanding`} accent="#F8AF00"/>
          <Hero label="Active Students"       value={fmtN(m.activeStudents)}   sub={`${m.studentsCount} total · ${m.refundedStudents} refunded`} accent="#B57EFF"/>
        </div>
      </Section>

      {/* 02 · Activity & Calls */}
      <Section num="02" title="Activity & Calls" sub="The phone ringing. The meetings happening.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Booked calls"       value={String(m.totalBooked)}/>
          <Stat label="Live calls"         value={String(m.totalLive)}     sub={`${m.totalNoShow} no-shows`}/>
          <Stat label="Cash per booked"    value={fmt$(m.cashPerBookedCall)} sub="Includes no-shows + cancels" accent="cyan"/>
          <Stat label="Cash per call"      value={fmt$(m.cashPerCall)}     sub="Live calls only" accent="indigo"/>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <Stat label="Closed deals"       value={String(m.totalClosed)}   sub={`${fmtPct(m.closeRate)} close rate`} accent="emerald"/>
          <Stat label="Show rate"          value={fmtPct(m.showRate)}      sub={`${m.totalLive}/${m.totalBooked} held`}/>
          <Stat label="Deposits"           value={String(m.totalDeposits)} sub="Soft commits"/>
          <Stat label="Follow-ups booked"  value={String(m.totalFollowUps)} sub="Pipeline coming"/>
        </div>
      </Section>

      {/* 03 · Lead-to-Close Funnel */}
      <Section num="03" title="Lead-to-Close Funnel" sub="The journey from booking to signed contract.">
        <div className="grid grid-cols-3 gap-3">
          <div className={`${PANEL} p-6 col-span-2`}>
            <div className="text-xs font-semibold mb-4 text-[#9CA3AF]">Funnel · all-time</div>
            <div className="space-y-3">
              {funnelRows.map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  <div className="w-20 text-xs text-right shrink-0 text-[#6B7280]">{row.label}</div>
                  <div className="flex-1 h-8 rounded-lg overflow-hidden" style={{background:'rgba(255,255,255,0.04)'}}>
                    <div className="h-full rounded-lg flex items-center px-3 transition-all duration-500" style={{ width: `${(row.value / funnelMax) * 100}%`, background: 'linear-gradient(90deg, #0083FF, #00A4FF)' }}>
                      <span className="text-xs font-semibold text-white tabular-nums">{row.value}</span>
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm font-semibold tabular-nums text-[#F5F5F7]">
                    {row.label === 'Booked' ? '100%' : fmtPct(row.value / funnelRows[0].value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`${PANEL} p-6`}>
            <div className="text-xs font-semibold mb-3 text-[#9CA3AF]">Conversion summary</div>
            <div className="space-y-3">
              <Mini label="Show rate" value={fmtPct(m.showRate)} color="#00D393"/>
              <Mini label="Live → close" value={fmtPct(m.closeRate)} color="#0083FF"/>
              <Mini label="Booked → close" value={fmtPct(m.totalBooked ? m.totalClosed / m.totalBooked : 0)} color="#B57EFF"/>
              <Mini label="Refund rate" value={fmtPct(m.studentsCount ? m.refundedStudents / (m.studentsCount + m.refundedStudents) : 0)} color="#FF6466"/>
            </div>
          </div>
        </div>
      </Section>

      {/* 04 · Revenue & Deal Quality */}
      <Section num="04" title="Revenue & Deal Quality" sub="The money inside the calls — what's closing big, what's collecting.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Avg order value"        value={fmt$(m.aov)}                sub="per active student" accent="amber"/>
          <Stat label="Largest single payment" value={fmt$(largestPaid)}          sub="from any student" accent="emerald"/>
          <Stat label="Cash collection rate"   value={fmtPct(cashCollectionRate)} sub="cash / contract" accent="cyan"/>
          <Stat label="Next 30d projection"    value={fmt$(m.nextMonthProjection)} sub={`weighted: ${fmt$(weightedForecast)}`} accent="indigo"/>
        </div>
        {projectionData.length > 0 && (
          <div className={`${PANEL} p-6 mt-3`}>
            <div className="text-xs font-semibold mb-3 text-[#9CA3AF]">8-month cash projection from active payment plans</div>
            <ProjectionLine data={projectionData}/>
          </div>
        )}
      </Section>

      {/* 05 · Team Performance — per-closer + per-setter deep dive */}
      <Section num="05" title="Team Performance" sub="Per-person funnel and dollar throughput. Top performers first.">
        {/* Outcome mix + cash by closer */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <div className={`${PANEL} p-6`}>
            <div className="text-xs font-semibold mb-4 text-[#9CA3AF]">Outcome mix</div>
            {outcomeStats.length > 0 ? (
              <>
                <OutcomeDonut data={outcomeStats.map(o => ({ name: o.outcome, value: o.count, color: OUTCOME_COLORS[o.outcome] || '#9CA3AF' }))}/>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-xs">
                  {outcomeStats.map(o => (
                    <div key={o.outcome} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{background: OUTCOME_COLORS[o.outcome] || '#9CA3AF'}}/>
                      <span className="flex-1 truncate text-[#9CA3AF]">{o.outcome}</span>
                      <span className="font-semibold tabular-nums text-[#F5F5F7]">{o.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm py-8 text-center text-[#6B7280]">No PCFs filed.</p>}
          </div>
          <div className={`${PANEL} p-6`}>
            <div className="text-xs font-semibold mb-4 text-[#9CA3AF]">Cash collected by closer</div>
            <CashByCloser data={closerStats.map(c => ({ name: c.name, cash: c.cash }))}/>
          </div>
        </div>

        {/* Per-closer deep cards */}
        <div className="mb-3 flex items-center gap-2">
          <UserCheck size={14} style={{color:'#6B7280'}}/>
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">Closers</h3>
          <span className="text-xs text-[#6B7280]">· {closerStatsRanked.length} active</span>
        </div>
        {closerStatsRanked.length === 0 ? (
          <div className={`${PANEL} p-8 text-center text-sm text-[#6B7280]`}>No closer activity yet.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {closerStatsRanked.map((c, i) => <CloserCard key={c.name} c={c} rank={i + 1}/>)}
          </div>
        )}

        {/* Per-setter cards */}
        <div className="mt-8 mb-3 flex items-center gap-2">
          <Phone size={14} style={{color:'#6B7280'}}/>
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]">Setters</h3>
          <span className="text-xs text-[#6B7280]">· {setterStatsRanked.length} active</span>
          <span className="text-xs ml-auto text-[#6B7280]">Ghost rate = booked but didn&apos;t show or cancelled</span>
        </div>
        {setterStatsRanked.length === 0 ? (
          <div className={`${PANEL} p-8 text-center text-sm text-[#6B7280]`}>
            No setter data yet — closers haven&apos;t tagged a setter on PCFs.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {setterStatsRanked.map((s, i) => <SetterCard key={s.name} s={s} rank={i + 1}/>)}
          </div>
        )}
      </Section>

      {/* 06 · Pipeline & Forecast */}
      <Section num="06" title="Pipeline & Forecast" sub="What's open. What's likely to land.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Active payment plans" value={String(m.studentsCount - m.graduatedStudents)} sub="paying customers" accent="indigo"/>
          <Stat label="Cash to be collected" value={fmt$(m.cashToCollect)} sub={`${m.pendingCount} pending`}/>
          <Stat label="Late payments" value={String(m.lateCount)} sub={m.lateAmount > 0 ? `${fmt$(m.lateAmount)} behind` : 'all caught up'} accent={m.lateCount > 0 ? 'rose' : 'emerald'}/>
          <Stat label="Delinquency rate" value={fmtPct(m.delinquencyRate)} sub="students with late payment" accent={m.delinquencyRate > 0 ? 'rose' : 'emerald'}/>
        </div>
      </Section>

      {/* 07 · Failed / Unconfirmed Payments — only render when there are any */}
      {m.unconfirmedCount > 0 && (
        <Section num="07" title="Failed / Unconfirmed Payments" sub="Money attempted but never landed. Different from refunds — chase or write off.">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Stat label="Stuck deals" value={String(m.unconfirmedCount)} sub={`${m.unconfirmedCount === 1 ? 'student' : 'students'}`} accent="amber"/>
            <Stat label="Stuck amount" value={fmt$(m.unconfirmedAmount)} sub="attempted" accent="amber"/>
            <Stat label="Refund rate (true refunds only)" value={fmtPct(m.studentsCount + m.refundedStudents > 0 ? m.refundedStudents / (m.studentsCount + m.refundedStudents) : 0)} sub={`${m.refundedStudents} of ${m.studentsCount + m.refundedStudents}`} accent={m.refundedStudents > 0 ? 'rose' : 'emerald'}/>
            <Stat label="Recovery upside" value={m.totalCash > 0 ? `+${fmtPct(m.unconfirmedAmount / m.totalCash)}` : '—'} sub="vs current cash" accent="violet"/>
          </div>
          <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0C0C10]/40 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.08)] bg-[#0C0C10]/60 text-left text-[11px] font-medium uppercase tracking-wider text-[#6B7280]">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Closer</th>
                  <th className="px-4 py-3">Setter</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3 text-right">Attempted</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
                {m.unconfirmedRows.map((r: any, i: number) => {
                  const attempted = num(r['Contract']) || (() => {
                    const mm = (r['Notes'] || '').match(/\$([0-9][0-9,]*\.?\d*)/);
                    return mm ? num(mm[1]) : 0;
                  })();
                  return (
                    <tr key={i} className="hover:bg-[#0C0C10]/40">
                      <td className="px-4 py-3 font-medium text-[#F5F5F7]">{r['Name'] || '—'}</td>
                      <td className="px-4 py-3 text-xs text-[#6B7280]">{r['Email']}</td>
                      <td className="px-4 py-3"><span className="rounded px-2 py-0.5 text-[10px] font-semibold" style={{background:'rgba(181,126,255,0.15)', color:'#B57EFF'}}>{r['Closer'] || '—'}</span></td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF]">{r['Setter'] && r['Setter'] !== 'No Setter' && r['Setter'] !== 'Unsure of Setter' ? r['Setter'] : '—'}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF]">{r['Join Date'] || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{color:'#F8AF00'}}>{attempted > 0 ? fmt$(attempted) : '—'}</td>
                      <td className="px-4 py-3 text-xs max-w-md truncate text-[#9CA3AF]" title={r['Notes']}>{r['Notes']}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 08 · Goal Tracker */}
      <Section num="08" title="Monthly Goal Tracker" sub={`Tracking against ${fmt$(goal)} target.`}>
        <div className={`${PANEL} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'linear-gradient(135deg, #B57EFF, #0083FF)'}}>
                <Target className="text-white" size={18}/>
              </div>
              <div>
                <div className="text-base font-semibold text-[#F5F5F7]" style={{fontFamily:'var(--font-playfair),Georgia,serif'}}>
                  {fmt$(m.totalCash)} <span className="text-sm font-normal text-[#6B7280]">of {fmt$(goal)}</span>
                </div>
                <div className="text-xs text-[#6B7280]">{goalProgress >= 1 ? '🎉 hit!' : `${fmt$(Math.max(0, goal - m.totalCash))} to go`}</div>
              </div>
            </div>
            <div className="text-3xl font-bold tabular-nums" style={{ color: goalProgress >= 1 ? '#00D393' : goalProgress >= 0.5 ? '#F8AF00' : '#FF6466', fontFamily:'var(--font-playfair),Georgia,serif' }}>
              {fmtPct(goalProgress)}
            </div>
          </div>
          <div className="rounded-full overflow-hidden" style={{height:'10px', background:'rgba(255,255,255,0.06)'}}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, goalProgress * 100)}%`, background: goalProgress >= 1 ? 'linear-gradient(90deg, #00D393, #00A4FF)' : 'linear-gradient(90deg, #B57EFF, #0083FF)' }}/>
          </div>
        </div>
      </Section>

      {/* 09 · Win/Loss Insights — links to /sales/insights */}
      <Section num="09" title="Win/Loss Insights" sub="What's working. What's not.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className={`${PANEL} p-6`} style={{borderLeft:'3px solid #00D393'}}>
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={16} style={{color:'#00D393'}}/>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{color:'#00D393'}}>Winning patterns</span>
            </div>
            <p className="text-sm text-[#9CA3AF]">{m.totalClosed} closes across {fmt$(m.totalContract)} contract value · {Object.values(closerStats.reduce((acc: any, c) => { acc[c.name] = c.closed; return acc; }, {})).filter((v: any) => v > 0).length} closers contributing</p>
            <a href="/sales/insights" className="mt-3 inline-block text-xs font-medium" style={{color:'#0083FF'}}>See top patterns →</a>
          </div>
          <div className={`${PANEL} p-6`} style={{borderLeft:'3px solid #FF6466'}}>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={16} style={{color:'#FF6466'}}/>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{color:'#FF6466'}}>Loss reasons</span>
            </div>
            <p className="text-sm text-[#9CA3AF]">{m.totalDQd} DQ&apos;d · {m.totalNoCloses} no-closes · {m.totalNoShow} no-shows · top objection: money</p>
            <a href="/sales/insights" className="mt-3 inline-block text-xs font-medium" style={{color:'#0083FF'}}>See objections breakdown →</a>
          </div>
        </div>
      </Section>

      <div className="text-right">
        <a href="/sales/calls" className="text-xs font-medium" style={{color:'#0083FF'}}>View all {closer.length} calls →</a>
      </div>
    </div>
  );
}

function Section({ num, title, sub, children }: { num: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">{num}</div>
        <h2 className="mt-1 text-lg font-semibold text-[#F5F5F7]" style={{fontFamily:'var(--font-playfair),Georgia,serif'}}>{title}</h2>
        <p className="text-xs mt-0.5 text-[#6B7280]">{sub}</p>
      </div>
      {children}
    </section>
  );
}

function Hero({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="stat-card relative overflow-hidden rounded-xl border border-[rgba(255,255,255,0.07)] bg-[#0E0E12] p-5" style={{boxShadow:`0 0 24px ${accent}14`}}>
      <div className="absolute inset-x-0 top-0 h-0.5" style={{background: accent}}/>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B7280]">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-2 leading-none" style={{color: accent, fontFamily:'var(--font-playfair),Georgia,serif'}}>{value}</div>
      {sub && <div className="text-xs text-[#6B7280] mt-2">{sub}</div>}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="stat-card rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6B7280]">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums leading-none" style={{color: accentColor(accent), fontFamily:'var(--font-playfair),Georgia,serif'}}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[#6B7280]">{sub}</div>}
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#9CA3AF]">{label}</span>
      <span className="text-sm font-semibold tabular-nums" style={{color}}>{value}</span>
    </div>
  );
}

function FunnelStep({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: 'emerald' | 'amber' | 'rose' }) {
  return (
    <div className="rounded-lg p-3 border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[#6B7280]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums leading-none" style={{color: accentColor(accent), fontFamily:'var(--font-playfair),Georgia,serif'}}>{value}</div>
      {sub && <div className="mt-1 text-[11px] tabular-nums text-[#6B7280]">{sub}</div>}
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg p-2.5 border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
      <div className="text-[10px] uppercase tracking-wider text-[#6B7280]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{color: accentColor(accent)}}>{value}</div>
    </div>
  );
}

function CloserCard({ c, rank }: { c: CloserBreakdown; rank: number }) {
  const flake = c.noShow + c.cancelled;
  const closeAccent = c.closeRate >= 0.4 ? 'emerald' : c.closeRate >= 0.2 ? 'amber' : 'rose';
  const showAccent = c.showRate >= 0.7 ? 'emerald' : c.showRate >= 0.5 ? 'amber' : 'rose';
  return (
    <div className={`${PANEL} p-5 relative`}>
      {rank === 1 && c.cash > 0 && (
        <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md" style={{background:'linear-gradient(135deg, #F8AF00, #F97316)'}}>
          <Trophy size={10}/>Top
        </span>
      )}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-[#F5F5F7]">{c.name}</span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{background:'rgba(255,255,255,0.05)', color:'#6B7280'}}>#{rank}</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider mt-1 text-[#6B7280]">{c.students} student{c.students===1?'':'s'} · {fmt$(c.contract)} contract</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums" style={{color:'#00D393', fontFamily:'var(--font-playfair),Georgia,serif'}}>{fmt$(c.cash)}</div>
          <div className="text-[10px] uppercase tracking-wider text-[#6B7280]">cash collected</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <FunnelStep label="Booked" value={c.booked} sub={flake > 0 ? `${flake} flake` : undefined}/>
        <FunnelStep label="Showed" value={c.live} sub={fmtPct(c.showRate)} accent={showAccent}/>
        <FunnelStep label="Closed" value={c.closed} sub={fmtPct(c.closeRate)} accent={closeAccent}/>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2">
        <KPI label="AOV" value={fmt$(c.aov)}/>
        <KPI label="$ / shown" value={fmt$(c.cashPerShown)}/>
        <KPI label="$ / booked" value={fmt$(c.cashPerBooked)}/>
      </div>

      <div className="mt-3 pt-3 flex items-center justify-between text-xs" style={{borderTop:'1px solid rgba(255,255,255,0.07)'}}>
        <span className="flex items-center gap-1.5 text-[#6B7280]">
          <Activity size={12}/>
          Pipeline · {c.followUps} follow-up{c.followUps===1?'':'s'}
        </span>
        <span className="font-semibold tabular-nums" style={{color:'#B57EFF'}}>{fmt$(c.pipelineValue)} expected</span>
      </div>
    </div>
  );
}

function SetterCard({ s, rank }: { s: SetterBreakdown; rank: number }) {
  const ghostAccent = s.ghostRate >= 0.4 ? '#FF6466' : s.ghostRate >= 0.25 ? '#F8AF00' : '#00D393';
  const closeAccent = s.closeRate >= 0.3 ? 'emerald' : s.closeRate >= 0.15 ? 'amber' : 'rose';
  return (
    <div className={`${PANEL} p-5 relative`}>
      {rank === 1 && s.cash > 0 && (
        <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md" style={{background:'linear-gradient(135deg, #00A4FF, #0083FF)'}}>
          <Trophy size={10}/>Top
        </span>
      )}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-[#F5F5F7]">{s.name}</span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums" style={{background:'rgba(255,255,255,0.05)', color:'#6B7280'}}>#{rank}</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider mt-1 text-[#6B7280]">{s.students} student{s.students===1?'':'s'} attributed</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums" style={{color:'#00A4FF', fontFamily:'var(--font-playfair),Georgia,serif'}}>{fmt$(s.cash)}</div>
          <div className="text-[10px] uppercase tracking-wider text-[#6B7280]">cash attributed</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <FunnelStep label="Set" value={s.sets}/>
        <FunnelStep label="Showed" value={s.setsShown} sub={fmtPct(s.showRate)}/>
        <FunnelStep label="Closed" value={s.setsClosed} sub={fmtPct(s.closeRate)} accent={closeAccent}/>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <KPI label="Set→close" value={fmtPct(s.setToCloseRate)}/>
        <KPI label="$ / set" value={s.sets > 0 ? fmt$(s.cash / s.sets) : fmt$(0)}/>
      </div>

      <div className="mt-3 pt-3 flex items-center justify-between text-xs" style={{borderTop:'1px solid rgba(255,255,255,0.07)'}}>
        <span className="flex items-center gap-1.5 text-[#6B7280]">
          <Ghost size={12}/>
          Ghost rate
        </span>
        <span className="font-semibold tabular-nums" style={{color: ghostAccent}}>
          {fmtPct(s.ghostRate)} · {s.ghosts} of {s.sets}
        </span>
      </div>
    </div>
  );
}
