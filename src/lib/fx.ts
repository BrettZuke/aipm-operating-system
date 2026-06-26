/**
 * Currency normalization for the OS dashboard.
 *
 * Why: the operator's Sheets store amounts in their native currency. Payment Schedule rows have a
 * `Currency` column (USD/EUR). Students rows infer currency from `Region` (UK→GBP, EU→EUR,
 * RoW→USD). Without normalization, summing 750 EUR rows as if they were USD silently
 * understates revenue. This module converts everything to USD before aggregation.
 *
 * Rates: fetched from frankfurter.app (free, no API key) and cached for 24h. Falls back to
 * hardcoded recent rates if the API is unreachable — better to be slightly stale than wrong.
 */

const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.25,
};

let rateCache: { rates: Record<string, number>; expires: number } | null = null;

export async function getRates(): Promise<Record<string, number>> {
  if (rateCache && rateCache.expires > Date.now()) return rateCache.rates;
  try {
    const [eurRes, gbpRes] = await Promise.all([
      fetch('https://api.frankfurter.app/latest?from=EUR&to=USD', { next: { revalidate: 86400 } }),
      fetch('https://api.frankfurter.app/latest?from=GBP&to=USD', { next: { revalidate: 86400 } }),
    ]);
    const eur = await eurRes.json();
    const gbp = await gbpRes.json();
    const rates: Record<string, number> = {
      USD: 1.0,
      EUR: typeof eur?.rates?.USD === 'number' ? eur.rates.USD : FALLBACK_RATES.EUR,
      GBP: typeof gbp?.rates?.USD === 'number' ? gbp.rates.USD : FALLBACK_RATES.GBP,
    };
    rateCache = { rates, expires: Date.now() + 24 * 60 * 60 * 1000 };
    return rates;
  } catch {
    return FALLBACK_RATES;
  }
}

export function toUSDSync(amount: number, currency: string | undefined, rates: Record<string, number>): number {
  const code = (currency || 'USD').trim().toUpperCase();
  const rate = rates[code] ?? 1;
  return amount * rate;
}

export function regionToCurrency(region: string | undefined): 'USD' | 'EUR' | 'GBP' {
  const r = (region || '').trim().toUpperCase();
  if (r === 'UK') return 'GBP';
  if (r === 'EU') return 'EUR';
  return 'USD';
}

/**
 * Returns the same students array but with `Total Paid` and `Contract` rewritten to USD
 * equivalents (based on `Region`). All downstream math sees USD only.
 *
 * Original native-currency values are preserved on `__totalPaidNative` and `__contractNative`
 * if a UI wants to show them.
 */
export function normalizeStudentsToUSD(students: any[], rates: Record<string, number>): any[] {
  return students.map((s) => {
    const cur = regionToCurrency(s['Region']);
    const totalPaid = parseAmount(s['Total Paid']);
    const contract = parseAmount(s['Contract']);
    return {
      ...s,
      __currency: cur,
      __totalPaidNative: totalPaid,
      __contractNative: contract,
      'Total Paid': toUSDSync(totalPaid, cur, rates),
      'Contract': toUSDSync(contract, cur, rates),
    };
  });
}

/**
 * Returns the same payment-schedule rows but with `Amount` rewritten to USD equivalent.
 * Original `Amount` preserved on `__amountNative`.
 */
export function normalizeScheduleToUSD(schedule: any[], rates: Record<string, number>): any[] {
  return schedule.map((r) => {
    const cur = (r['Currency'] || 'USD').toString().trim().toUpperCase();
    const amount = parseAmount(r['Amount']);
    return {
      ...r,
      __currency: cur,
      __amountNative: amount,
      'Amount': toUSDSync(amount, cur, rates),
    };
  });
}

// Mirror of num() in sheets-data: US/EU separators, accounting negatives, currency symbols.
// Kept as a local copy to avoid a circular import; behaviour must stay in sync.
function parseAmount(v: any): number {
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
