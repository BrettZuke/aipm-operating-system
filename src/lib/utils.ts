import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number,
  currency: string = "USD",
): string {
  const value = Number.isFinite(amount) ? amount : 0;
  // Intl throws RangeError on a non-ISO-4217 code; fall back rather than 500 the page.
  const cur = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${cur} ${Math.round(value).toLocaleString("en-US")}`;
  }
}

export function initialsFromName(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
