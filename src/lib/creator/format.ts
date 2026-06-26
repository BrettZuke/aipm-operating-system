export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtMoney(n: number, currency = "USD"): string {
  if (!Number.isFinite(n)) return "—";
  // Intl throws RangeError on a non-ISO-4217 currency code; guard + fall back so a bad code
  // from a data row can never 500 a page that renders money outside a try/catch.
  const cur = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${cur} ${Math.round(n).toLocaleString("en-US")}`;
  }
}

export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m === 0 ? `${r}s` : `${m}m ${r}s`;
}

export function fmtPath(p: string): string {
  if (!p) return "/";
  if (p === "(not set)") return "/";
  return p;
}

export function fmtReferrer(r: string): string {
  if (!r || r === "(direct)" || r === "(not set)") return "Direct";
  return r;
}

export function fmtUtmSource(s: string): string {
  if (!s || s === "(not set)" || s === "(direct)") return "Direct";
  return s;
}
