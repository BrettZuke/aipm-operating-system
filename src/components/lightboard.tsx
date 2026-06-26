/**
 * Light-theme scoped components — light + colorful theme that mirrors
 * https://example.com
 * All these are pure components that work inside a `.lightboard` wrapper.
 */
import { ReactNode } from 'react';

const PALETTES: Record<string, { color: string; soft: string }> = {
  primary: { color: 'var(--d-blue)',    soft: 'var(--d-blue-soft)' },
  blue:    { color: 'var(--d-blue)',    soft: 'var(--d-blue-soft)' },
  indigo:  { color: 'var(--d-indigo)',  soft: 'var(--d-indigo-soft)' },
  violet:  { color: 'var(--d-violet)',  soft: 'var(--d-violet-soft)' },
  pink:    { color: 'var(--d-pink)',    soft: 'var(--d-pink-soft)' },
  rose:    { color: 'var(--d-rose)',    soft: 'var(--d-rose-soft)' },
  orange:  { color: 'var(--d-orange)',  soft: 'var(--d-orange-soft)' },
  amber:   { color: 'var(--d-amber)',   soft: 'var(--d-amber-soft)' },
  emerald: { color: 'var(--d-emerald)', soft: 'var(--d-emerald-soft)' },
  teal:    { color: 'var(--d-teal)',    soft: 'var(--d-teal-soft)' },
  cyan:    { color: 'var(--d-cyan)',    soft: 'var(--d-cyan-soft)' },
};

const HERO_GRADIENTS: Record<string, [string, string]> = {
  primary: ['#1e3a8a', '#3b82f6'],
  indigo:  ['#4338ca', '#6366f1'],
  violet:  ['#7c3aed', '#a855f7'],
  pink:    ['#db2777', '#ec4899'],
  orange:  ['#ea580c', '#f97316'],
  emerald: ['#059669', '#10b981'],
  teal:    ['#0d9488', '#14b8a6'],
  rose:    ['#dc2626', '#f43f5e'],
};

export function DanCard({ label, value, hint, icon, accent = 'blue' }: {
  label: string; value: string; hint?: string; icon?: ReactNode; accent?: keyof typeof PALETTES;
}) {
  const p = PALETTES[accent];
  return (
    <div className="kpi-card" style={{ ['--card-color' as any]: p.color, ['--card-soft' as any]: p.soft }}>
      {icon && <div className="icon-wrap">{icon}</div>}
      <div className="text-[10px] uppercase tracking-[0.06em] font-semibold" style={{color: 'var(--d-text-3)'}}>{label}</div>
      <div className="text-[24px] font-semibold mt-0.5 leading-none tabular-nums" style={{color: 'var(--d-text-1)'}}>{value}</div>
      {hint && <div className="text-xs mt-2" style={{color:'var(--d-text-3)'}}>{hint}</div>}
    </div>
  );
}

export function DanHero({ label, value, hint, icon, accent = 'primary' }: {
  label: string; value: string; hint?: string; icon?: ReactNode; accent?: keyof typeof HERO_GRADIENTS;
}) {
  const [from, to] = HERO_GRADIENTS[accent];
  return (
    <div className="hero-card" style={{ ['--accent-from' as any]: from, ['--accent-to' as any]: to }}>
      {icon && <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/15 mb-3">{icon}</div>}
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold opacity-80">{label}</div>
      <div className="text-[28px] font-bold mt-1 leading-none tabular-nums">{value}</div>
      {hint && <div className="text-xs opacity-80 mt-2">{hint}</div>}
    </div>
  );
}

export function DanSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="h-section">{title}</div>
      {children}
    </section>
  );
}

export function fmt$(n: number): string {
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}
export function fmtPct(n: number): string { return `${(n * 100).toFixed(1)}%`; }
export function fmtN(n: number): string { return new Intl.NumberFormat('en-US').format(n); }
