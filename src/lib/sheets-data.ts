/**
 * Sheets-backed data layer. Pulls a workspace's source-of-truth metrics from a Google Sheet.
 * Optional: only used when SALES_SHEET_ID and SALES_SHEET_AGENCY_ID are configured.
 */
import { google } from 'googleapis';

const SHEET_ID = process.env.SALES_SHEET_ID || '';

// The Google Sheet belongs to ONE workspace. Only that workspace reads it; every other workspace
// gets empty data so it shows its OWN (Stripe/Supabase) numbers. Set both env vars to enable.
export const SHEET_OWNER_AGENCY_ID = process.env.SALES_SHEET_AGENCY_ID || '';
export function salesSheetIdFor(agencyId: string | null | undefined): string | null {
  return agencyId === SHEET_OWNER_AGENCY_ID ? SHEET_ID : null;
}

let cached: { sheets: any; expires: number } | null = null;

function getSheetsClient() {
  if (cached && cached.expires > Date.now()) return cached.sheets;
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  cached = { sheets, expires: Date.now() + 50 * 60 * 1000 };
  return sheets;
}

async function readTab(tabName: string, sheetId: string | null = null): Promise<Record<string, any>[]> {
  if (!sheetId) return []; // non-owner workspace → no sheet data (shows its own empty state)
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A1:ZZ`,
    });
    const rows = res.data.values || [];
    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map((row: any[]) => {
      const obj: Record<string, any> = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] ?? ''; });
      return obj;
    });
  } catch (e: any) {
    console.error(`readTab(${tabName}) failed:`, e.message);
    return [];
  }
}

// Test/dev emails the operator used while setting up the PCF form — exclude from analytics.
const TEST_EMAILS = new Set([
  'test1@example.com',
  'test2@example.com',
  'test_pcf_webhook@example.com',
  'oauth_test@example.com',
  'iclosed_test@example.com',
  'full_test@example.com',
  'e2e_test@example.com',
  'n8n_pcf_test@example.com',
]);

function isTestRow(emailField: string): boolean {
  const e = (emailField || '').toLowerCase().trim();
  if (!e) return false;
  if (TEST_EMAILS.has(e)) return true;
  if (e.includes('test') && e.includes('@example.com')) return true;
  return false;
}

export async function getStudents(sheetId: string | null = null) {
  const rows = await readTab('Students', sheetId);
  return rows.filter(r => !isTestRow(r['Email']));
}
export async function getCloser(sheetId: string | null = null) {
  const rows = await readTab('Closer', sheetId);
  return rows.filter(r => !isTestRow(r['Lead Email']));
}
export async function getPaymentSchedule(sheetId: string | null = null) {
  const rows = await readTab('Payment Schedule', sheetId);
  return rows.filter(r => !isTestRow(r['Student Email']));
}
export async function getBookings(sheetId: string | null = null) {
  const rows = await readTab('Bookings', sheetId);
  return rows.filter(r => !isTestRow(r['Email']));
}
export async function getCallRecordings(sheetId: string | null = null) {
  const rows = await readTab('Call Recordings', sheetId);
  return rows.filter(r => !isTestRow(r['Student Email']));
}
export async function getOnboarding(sheetId: string | null = null) {
  const rows = await readTab('Onboarding', sheetId);
  return rows.filter(r => !isTestRow(r['Email']));
}
// Raw FanBasis webhook events captured into the sheet (via the existing FanBasis → Make → sheet
// pipe). Columns: Received At / Event Type / Amount (raw) / Currency / Payment ID / Buyer Email /
// Buyer Name / Subscription ID / Subscription Renewed At / Subscription Status. This is the only
// source of per-subscription renew/fail status — the FanBasis pull API does not expose it. Not
// test-filtered here; the consumer filters setup/audit rows itself.
export async function getFanbasisEvents(sheetId: string | null = null) {
  return readTab('FanBasis Raw Events', sheetId);
}

export function parseDDMMYYYY(s: string): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}

// Parse a money string from the sheet. Handles US ("1,234.50"), EU ("1.234,50"), accounting
// negatives ("(123)" → -123), currency symbols, and bare numbers. When both separators are
// present the LAST one is the decimal; a lone comma is a decimal only when exactly 2 digits
// follow it (cents), otherwise it's a thousands separator. Anything unparseable → 0.
export function num(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || !v) return 0;
  let s = v.trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$€£\s]/g, '');
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const commaCount = (s.match(/,/g) || []).length;
    s = commaCount === 1 && s.length - lastComma - 1 === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : (neg ? -n : n);
}

export function inMonth(dateStr: string, ym: string): boolean {
  const d = parseDDMMYYYY(dateStr) || (dateStr && /\d{4}-\d{2}-\d{2}/.test(dateStr) ? new Date(dateStr) : null);
  if (!d) return false;
  const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return k === ym;
}

const CLOSED = ['PIF', 'Financed via Fanbasis', 'Financed In House', 'Put Deposit'];
// Outcomes that mean the call never happened — exclude from "live/shown" denominator.
const NO_HAPPEN = ['No Show', 'Cancelled'];
const NON_SETTERS = new Set(['', 'No Setter', 'Unsure of Setter']);

// Lifecycle classification driven by markers in the Students 'Notes' column.
// - 'unconfirmed' — payment attempted but never went through (failed ACH, customer didn't confirm Fanbasis txn, etc.)
// - 'refund'      — paid then got money back (true refund / chargeback marked as refund)
// - 'active'      — normal paying student
export type StudentLifecycle = 'active' | 'refund' | 'unconfirmed';
const UNCONFIRMED_MARKER = /\b(UNCONFIRMED|NOT CONFIRMED|FAILED PAYMENT|ACH FAILED|FAILED)\b/;
const REFUND_MARKER = /\b(REFUND|REFUNDED|CHARGEBACK)\b/;
export function getStudentLifecycle(notes: string): StudentLifecycle {
  const n = (notes || '').toUpperCase();
  if (UNCONFIRMED_MARKER.test(n)) return 'unconfirmed';
  if (REFUND_MARKER.test(n)) return 'refund';
  return 'active';
}

export function computeSalesMetrics(closer: any[], students: any[], schedule: any[]) {
  const validStudents = students.filter(s => s['Email']);
  const byLifecycle = (lc: StudentLifecycle) => validStudents.filter(s => getStudentLifecycle(s['Notes']) === lc);
  const activeNotRefunded = byLifecycle('active');
  const refundedRows = byLifecycle('refund');
  const unconfirmedRows = byLifecycle('unconfirmed');

  const totalCash = activeNotRefunded.reduce((s, st) => s + num(st['Total Paid']), 0);
  const totalContract = activeNotRefunded.reduce((s, st) => s + num(st['Contract']), 0);

  const cashToCollect = schedule
    .filter(r => r['Status'] === 'Pending' || r['Status'] === 'Late')
    .reduce((s, r) => s + num(r['Amount']), 0);

  const activeStudents = activeNotRefunded.filter(s => s['Status'] !== 'GRADUATED' && s['Status'] !== '').length;
  const graduatedStudents = activeNotRefunded.filter(s => s['Status'] === 'GRADUATED').length;
  const refundedStudents = refundedRows.length;
  const unconfirmedCount = unconfirmedRows.length;
  // Sum of attempted dollar amount on unconfirmed payments — pulled from "Contract" if non-zero,
  // otherwise parse $X from the Notes text. Useful so the operator sees how much money is "stuck".
  const unconfirmedAmount = unconfirmedRows.reduce((sum, st) => {
    const contract = num(st['Contract']);
    if (contract > 0) return sum + contract;
    const m = (st['Notes'] || '').match(/\$([0-9][0-9,]*\.?\d*)/);
    return sum + (m ? num(m[1]) : 0);
  }, 0);

  const totalBooked = closer.length;
  const totalNoShow = closer.filter(r => r['Call Result'] === 'No Show').length;
  const totalCancelled = closer.filter(r => r['Call Result'] === 'Cancelled').length;
  const totalLive = totalBooked - totalNoShow - totalCancelled;
  const totalClosed = closer.filter(r => CLOSED.includes(r['Call Result'])).length;

  const closeRate = totalLive ? totalClosed / totalLive : 0;          // closed ÷ held (calls that happened)
  const bookedCloseRate = totalBooked ? totalClosed / totalBooked : 0; // closed ÷ all booked
  const showRate = totalBooked ? totalLive / totalBooked : 0;
  const aov = activeNotRefunded.length ? totalContract / activeNotRefunded.length : 0;

  // Cash collected per call, straight from the closer PCF's "Cash Collected ($)" column — the
  // money actually taken on/around each call (distinct from cumulative student Total Paid).
  const callsCashCollected = closer.reduce((s, r) => s + num(r['Cash Collected ($)']), 0);
  const cashPerBookedCall_collected = totalBooked ? callsCashCollected / totalBooked : 0;
  const cashPerHeldCall_collected = totalLive ? callsCashCollected / totalLive : 0;

  // Use UTC midnight (parseDDMMYYYY returns UTC midnight) so a payment due *today* isn't
  // excluded by `d >= today` just because the current wall-clock time is past midnight.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const in30 = new Date(today.getTime() + 30 * 86400000);
  // Include Late rows in 30-day projection — they're real money expected, just past due.
  const nextMonthProjection = schedule
    .filter(r => { const s = String(r['Status'] ?? '').trim(); return s === 'Pending' || s === 'Late'; })
    .filter(r => {
      const d = parseDDMMYYYY(r['Due Date']);
      // For Late rows, include regardless of date (they're already overdue).
      if (String(r['Status'] ?? '').trim() === 'Late') return true;
      return d && d >= today && d <= in30;
    })
    .reduce((s, r) => s + num(r['Amount']), 0);

  const studentsWithLate = new Set(schedule.filter(r => String(r['Status'] ?? '').trim() === 'Late').map(r => r['Student Email']));
  // "delinquencyRate" is the right name — % of active students who have at least one late payment.
  // Kept `churnRate` alias for backward compat with old call sites.
  const delinquencyRate = activeNotRefunded.length ? studentsWithLate.size / activeNotRefunded.length : 0;
  const churnRate = delinquencyRate;

  const lateRows = schedule.filter(r => String(r['Status'] ?? '').trim() === 'Late');
  const lateCount = lateRows.length;
  const lateAmount = lateRows.reduce((s, r) => s + num(r['Amount']), 0);
  const pendingCount = schedule.filter(r => String(r['Status'] ?? '').trim() === 'Pending').length;

  // Cash per CALL (live / held only)
  const cashPerCall = totalLive ? totalCash / totalLive : 0;
  // Cash per BOOKED call (includes no-shows, cancels — i.e., total ÷ everything booked)
  const cashPerBookedCall = totalBooked ? totalCash / totalBooked : 0;

  // Pipeline-ish breakdown
  const totalDeposits = closer.filter(r => r['Call Result'] === 'Put Deposit').length;
  const totalNoCloses = closer.filter(r => r['Call Result'] === 'No Close').length;
  const totalDQd = closer.filter(r => r['Call Result'] === "Financially DQ'd").length;
  const totalFollowUps = closer.filter(r => r['Call Result'] === 'Booked Follow Up').length;

  return {
    totalCash, totalContract, cashToCollect, aov,
    totalBooked, totalLive, totalClosed, totalNoShow, totalCancelled,
    totalDeposits, totalNoCloses, totalDQd, totalFollowUps,
    closeRate, bookedCloseRate, showRate, cashPerCall, cashPerBookedCall,
    callsCashCollected, cashPerBookedCall_collected, cashPerHeldCall_collected,
    activeStudents, graduatedStudents, refundedStudents,
    unconfirmedCount, unconfirmedAmount, unconfirmedRows,
    nextMonthProjection, churnRate, delinquencyRate,
    lateCount, lateAmount, pendingCount,
    studentsCount: activeNotRefunded.length,
  };
}

export interface CloserBreakdown {
  name: string;
  booked: number;        // PCFs filed where they were the closer
  noShow: number;
  cancelled: number;
  live: number;          // booked - noShow - cancelled
  closed: number;
  noClose: number;
  dq: number;
  followUps: number;
  students: number;      // paying students attributed to them
  cash: number;          // cash collected from their students
  contract: number;      // total contract value of their students
  showRate: number;      // live / booked
  closeRate: number;     // closed / live
  bookedCloseRate: number; // closed / booked (raw conversion incl. flake)
  aov: number;           // contract / students
  cashPerShown: number;  // cash / live
  cashPerBooked: number; // cash / booked
  pipelineValue: number; // followUps * teamCloseRate * teamAOV
}

export function breakdownByCloser(closer: any[], students: any[]): CloserBreakdown[] {
  // "valid" = paying customers who didn't refund AND aren't stuck on a failed payment.
  // Unconfirmed students never actually paid, so their cash/contract shouldn't be attributed to a closer/setter.
  const valid = students.filter(s => s['Email'] && getStudentLifecycle(s['Notes']) === 'active');

  // Team-level baselines for pipeline expectation math
  const teamLive = closer.filter(r => !NO_HAPPEN.includes(r['Call Result'])).length;
  const teamClosed = closer.filter(r => CLOSED.includes(r['Call Result'])).length;
  const teamCloseRate = teamLive ? teamClosed / teamLive : 0;
  const teamAOV = valid.length ? valid.reduce((s, st) => s + num(st['Contract']), 0) / valid.length : 0;

  // Discover closer names from data so new hires show up automatically.
  const found = new Set<string>();
  for (const r of closer) if (r['Closer Name']) found.add(r['Closer Name']);
  for (const s of valid) if (s['Closer']) found.add(s['Closer']);

  return Array.from(found).map((name) => {
    const calls = closer.filter(r => r['Closer Name'] === name);
    const booked = calls.length;
    const noShow = calls.filter(r => r['Call Result'] === 'No Show').length;
    const cancelled = calls.filter(r => r['Call Result'] === 'Cancelled').length;
    const live = booked - noShow - cancelled;
    const closed = calls.filter(r => CLOSED.includes(r['Call Result'])).length;
    const noClose = calls.filter(r => r['Call Result'] === 'No Close').length;
    const dq = calls.filter(r => r['Call Result'] === "Financially DQ'd").length;
    const followUps = calls.filter(r => r['Call Result'] === 'Booked Follow Up').length;

    const studs = valid.filter(s => s['Closer'] === name);
    const cash = studs.reduce((s, st) => s + num(st['Total Paid']), 0);
    const contract = studs.reduce((s, st) => s + num(st['Contract']), 0);

    return {
      name,
      booked,
      noShow,
      cancelled,
      live,
      closed,
      noClose,
      dq,
      followUps,
      students: studs.length,
      cash,
      contract,
      showRate: booked ? live / booked : 0,
      closeRate: live ? closed / live : 0,
      bookedCloseRate: booked ? closed / booked : 0,
      aov: studs.length ? contract / studs.length : 0,
      cashPerShown: live ? cash / live : 0,
      cashPerBooked: booked ? cash / booked : 0,
      pipelineValue: followUps * teamCloseRate * teamAOV,
    };
  }).filter(c => c.booked > 0 || c.students > 0);
}

// Back-compat — old code referenced `c.calls` instead of `c.booked`.
// Keep an alias so we don't break existing UI immediately.
export type CloserStat = CloserBreakdown & { calls: number };
export function withLegacyCallsField(rows: CloserBreakdown[]): CloserStat[] {
  return rows.map(r => ({ ...r, calls: r.booked }));
}

export interface SetterBreakdown {
  name: string;
  sets: number;          // PCFs filed where they were the setter
  setsShown: number;     // sets that ended up live
  setsClosed: number;    // sets that ended up closed
  noShow: number;
  cancelled: number;
  ghosts: number;        // noShow + cancelled — booked-but-didn't-happen
  ghostRate: number;     // ghosts / sets — high = bad lead quality
  showRate: number;      // setsShown / sets
  closeRate: number;     // setsClosed / setsShown — quality of leads they bring
  setToCloseRate: number;// setsClosed / sets — overall productivity per set
  cash: number;          // cash from students they set
  students: number;
}

export function breakdownBySetter(closer: any[], students: any[]): SetterBreakdown[] {
  // "valid" = paying customers who didn't refund AND aren't stuck on a failed payment.
  // Unconfirmed students never actually paid, so their cash/contract shouldn't be attributed to a closer/setter.
  const valid = students.filter(s => s['Email'] && getStudentLifecycle(s['Notes']) === 'active');

  const found = new Set<string>();
  for (const r of closer) {
    const n = (r['Setter Name'] || '').trim();
    if (n && !NON_SETTERS.has(n)) found.add(n);
  }
  for (const s of valid) {
    const n = (s['Setter'] || '').trim();
    if (n && !NON_SETTERS.has(n)) found.add(n);
  }

  return Array.from(found).map((name) => {
    const sets = closer.filter(r => (r['Setter Name'] || '').trim() === name);
    const noShow = sets.filter(r => r['Call Result'] === 'No Show').length;
    const cancelled = sets.filter(r => r['Call Result'] === 'Cancelled').length;
    const ghosts = noShow + cancelled;
    const setsShown = sets.length - ghosts;
    const setsClosed = sets.filter(r => CLOSED.includes(r['Call Result'])).length;

    const studs = valid.filter(s => (s['Setter'] || '').trim() === name);
    const cash = studs.reduce((s, st) => s + num(st['Total Paid']), 0);

    return {
      name,
      sets: sets.length,
      setsShown,
      setsClosed,
      noShow,
      cancelled,
      ghosts,
      ghostRate: sets.length ? ghosts / sets.length : 0,
      showRate: sets.length ? setsShown / sets.length : 0,
      closeRate: setsShown ? setsClosed / setsShown : 0,
      setToCloseRate: sets.length ? setsClosed / sets.length : 0,
      cash,
      students: studs.length,
    };
  }).filter(s => s.sets > 0 || s.students > 0);
}

export function breakdownByOutcome(closer: any[]) {
  const outcomes = ['PIF', 'Financed via Fanbasis', 'Financed In House', 'Put Deposit', 'Booked Follow Up', 'No Close', "Financially DQ'd", 'No Show', 'Cancelled'];
  const total = closer.length || 1;
  return outcomes.map(o => ({
    outcome: o,
    count: closer.filter(r => r['Call Result'] === o).length,
    pct: closer.filter(r => r['Call Result'] === o).length / total,
  }));
}
