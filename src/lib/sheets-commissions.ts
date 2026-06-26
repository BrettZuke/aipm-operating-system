import { num, parseDDMMYYYY, inMonth, getStudentLifecycle } from './sheets-data';

const FANBASIS_FEE_RATE = 0.0356;
const VAT_RATE = 1/6;
// coach-tenant payout rates. VAT applies to UK customers only. Creator-template tenants (e.g. the creator)
// run 0% commission and pay no VAT — they don't use this sheet-based engine (their revenue is Stripe).
const CLOSER_RATE = 0.10;
const SETTER_RATE = 0.05;

export interface CommissionRow {
  date: string; client: string; region: 'UK' | 'EU' | 'RoW';
  gross: number; net: number; vat: number; fee: number;
  closer: string; setter: string;
  closerComm: number; setterComm: number; cycleMonth: string;
}

export interface MonthlyCommissionCycle {
  month: string; rows: CommissionRow[];
  gross: number; fees: number; vat: number; netAfterFees: number;
  closerComms: Record<string, number>;
  setterComms: Record<string, number>;
  totalCloserComm: number; totalSetterComm: number;
  whatLeft: number; brettShare: number; danShare: number;
}

export function computeMonthlyCommissions(students: any[], schedule: any[], month: string): MonthlyCommissionCycle {
  const rows: CommissionRow[] = [];
  const isLifetime = month === 'lifetime';

  // Sum each student's already-collected installments from the Payment Schedule. A student's
  // `Total Paid` is cumulative and overlaps these "Paid" rows, so counting both double-counts cash.
  // We attribute only the UPFRONT remainder (Total Paid − installments) to their join month; the
  // installments themselves are counted by paid-date in the second loop below. Per-student the two
  // loops now sum to exactly Total Paid — no double count, no lost upfront.
  const paidByEmail = new Map<string, number>();
  for (const p of schedule) {
    if (String(p['Status'] ?? '').trim() !== 'Paid') continue;
    const email = p['Student Email'];
    if (!email) continue;
    paidByEmail.set(email, (paidByEmail.get(email) || 0) + num(p['Amount']));
  }

  for (const s of students) {
    if (!s['Email']) continue;
    // Skip refunded AND unconfirmed/failed payments — commissions only paid on real, settled revenue.
    if (getStudentLifecycle(s['Notes']) !== 'active') continue;
    if (!isLifetime && !inMonth(s['Join Date'], month)) continue;
    // Upfront lump = total collected minus the installments already itemised in the schedule.
    const gross = round2(num(s['Total Paid']) - (paidByEmail.get(s['Email']) || 0));
    if (gross <= 0) continue;

    const region = (s['Region'] === 'UK' ? 'UK' : s['Region'] === 'EU' ? 'EU' : 'RoW') as any;
    const fee = round2(gross * FANBASIS_FEE_RATE);
    const net = round2(gross - fee);
    const vat = region === 'UK' ? round2(gross * VAT_RATE) : 0;
    const closer = s['Closer'] || '';
    const setter = s['Setter'] || '';
    const closerComm = round2(net * CLOSER_RATE);
    const setterComm = setter && setter !== 'No Setter' && setter !== 'Unsure of Setter' ? round2(net * SETTER_RATE) : 0;
    rows.push({ date: s['Join Date'], client: s['Name'], region, gross, net, vat, fee, closer, setter, closerComm, setterComm, cycleMonth: month });
  }

  for (const p of schedule) {
    if (String(p['Status'] ?? '').trim() !== 'Paid') continue;
    if (!isLifetime && !inMonth(p['Paid Date'], month)) continue;
    const gross = num(p['Amount']);
    if (gross === 0) continue;
    const studentEmail = p['Student Email'];
    const student = students.find((s: any) => s['Email'] === studentEmail);
    // Don't pay commissions on payments tied to refunded/unconfirmed students.
    if (student && getStudentLifecycle(student['Notes']) !== 'active') continue;
    const region = (student?.['Region'] === 'UK' ? 'UK' : student?.['Region'] === 'EU' ? 'EU' : 'RoW') as any;
    const fee = round2(gross * FANBASIS_FEE_RATE);
    const net = round2(gross - fee);
    const vat = region === 'UK' ? round2(gross * VAT_RATE) : 0;
    const closer = student?.['Closer'] || '';
    const setter = student?.['Setter'] || '';
    const closerComm = round2(net * CLOSER_RATE);
    const setterComm = setter && setter !== 'No Setter' && setter !== 'Unsure of Setter' ? round2(net * SETTER_RATE) : 0;
    rows.push({ date: p['Paid Date'], client: `${p['Student Name']} (recurring #${p['Payment #']})`, region, gross, net, vat, fee, closer, setter, closerComm, setterComm, cycleMonth: month });
  }

  const gross = round2(rows.reduce((s, r) => s + r.gross, 0));
  const fees = round2(rows.reduce((s, r) => s + r.fee, 0));
  const vat = round2(rows.reduce((s, r) => s + r.vat, 0));
  const netAfterFees = round2(gross - fees);

  const closerComms: Record<string, number> = {};
  const setterComms: Record<string, number> = {};
  for (const r of rows) {
    closerComms[r.closer] = round2((closerComms[r.closer] || 0) + r.closerComm);
    if (r.setterComm > 0) setterComms[r.setter] = round2((setterComms[r.setter] || 0) + r.setterComm);
  }
  const totalCloserComm = round2(Object.values(closerComms).reduce((s, v) => s + v, 0));
  const totalSetterComm = round2(Object.values(setterComms).reduce((s, v) => s + v, 0));
  const whatLeft = round2(gross - fees - totalCloserComm - totalSetterComm - vat);
  const brettShare = round2(whatLeft * 0.20);
  const danShare = round2(whatLeft * 0.80);

  return { month, rows, gross, fees, vat, netAfterFees, closerComms, setterComms, totalCloserComm, totalSetterComm, whatLeft, brettShare, danShare };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export function getMonthOptions(): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = [{ value: 'lifetime', label: 'Lifetime (all time)' }];
  const now = new Date();
  for (let offset = -6; offset <= 6; offset++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const label = d.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    months.push({ value: `${y}-${m}`, label });
  }
  return months;
}
