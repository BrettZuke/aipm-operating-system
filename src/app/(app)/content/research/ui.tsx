"use client";

// The small pieces the Research screens share, built from this dashboard's own colours and shapes
// so they sit beside the Board and the Roster without looking like a different product: the compact
// dropdown of a filter row, the two-option switch, the honest progress line, the eyebrow and the
// quoted line, a collapsed row, an empty state, and pictures that fall back quietly when a host
// refuses them.

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Loader2, type LucideIcon } from "lucide-react";
import { safeAvatarUrl, safeThumbUrl } from "@/lib/research/safe-view";

export const OFFLINE = "That did not go through. Check your connection and try again.";

/** The current time, starting from the moment the server rendered the page and moving on a timer.
    Read during render it would be a different number on every re-render, which React forbids and
    which would make "3 min ago" jump about. */
export function useNow(initial: number, everyMs = 15_000): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/** The card every Research panel sits in. One place, so they all match. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] ${className}`}>{children}</div>;
}

export function SelectPill<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-10 appearance-none rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] pl-3 pr-8 text-[13px] text-[#F5F5F7] outline-none transition-colors hover:border-[rgba(255,255,255,0.18)] focus:border-[#0083FF] disabled:opacity-50 sm:h-8 sm:text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0C0C10]">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-[#5C6472]" aria-hidden />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`min-h-10 rounded-full px-3.5 text-xs font-medium transition-colors duration-200 disabled:opacity-50 sm:min-h-8 ${
              on ? "bg-[rgba(255,255,255,0.08)] text-[#F5F5F7]" : "text-[#7C8595] hover:text-[#F5F5F7]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  icon?: LucideIcon;
};

export function PrimaryButton({ children, onClick, busy, disabled, type = "button", title, icon: Icon }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0083FF] px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#0072e0] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function QuietButton({ children, onClick, busy, disabled, type = "button", title, icon: Icon }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.12)] px-3.5 text-[13px] font-medium text-[#F5F5F7] transition-colors duration-200 hover:bg-[rgba(255,255,255,0.05)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** What a long job is doing and how long it has taken. No invented percentage: the seconds are
    real, and past a certain point it says so rather than pretending to be nearly done. */
export function Progress({ text, startedAt }: { text: string; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.round((now - startedAt) / 1000));
  return (
    <p role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#A8B0BD]">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-[#0083FF]" aria-hidden />
      <span>{text}</span>
      <span className="font-mono text-[11px] text-[#5C6472]">{secs}s</span>
      {secs >= 75 && <span className="text-xs text-[#5C6472]">Still working. This one is taking longer than usual.</span>}
    </p>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[13px] leading-relaxed text-[#FF6466]">
      {children}
    </p>
  );
}

export function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[rgba(255,255,255,0.06)] pb-2">
      <span className="font-mono text-[11px] text-[#5C6472]">{n}</span>
      <h3 className="text-[15px] font-semibold text-[#F5F5F7]">{title}</h3>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[#7C8595]">
      <span className="size-1.5 shrink-0 rounded-full bg-[#0083FF]" aria-hidden />
      {children}
    </div>
  );
}

export function Quote({ children }: { children: ReactNode }) {
  return (
    <blockquote
      className="text-balance break-words text-[22px] font-semibold leading-[1.2] text-[#F5F5F7] sm:text-[28px] lg:text-[30px]"
      style={{ fontFamily: "var(--font-settoku-display), Georgia, serif" }}
    >
      &ldquo;{children}&rdquo;
    </blockquote>
  );
}

/** A pair of labelled columns under a quoted line. */
export function TwoColumns({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <div className="grid gap-5 border-t border-[rgba(255,255,255,0.06)] pt-5 sm:grid-cols-2 sm:gap-8">
      {items.map((item) => (
        <div key={item.title} className="min-w-0">
          <div className="text-[13px] font-semibold text-[#F5F5F7]">{item.title}</div>
          <div className="mt-1.5 text-sm leading-relaxed text-[#A8B0BD]">{item.body}</div>
        </div>
      ))}
    </div>
  );
}

/** A collapsed row: the summary carries the headline, the body opens on a click. No script needed. */
export function Disclosure({ title, meta, children }: { title: string; meta?: string | null; children: ReactNode }) {
  return (
    <details className="group border-b border-[rgba(255,255,255,0.06)] last:border-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-[rgba(255,255,255,0.02)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-[13px] font-medium text-[#F5F5F7]">{title}</span>
        {meta ? <span className="max-w-[45%] truncate font-mono text-[11px] text-[#7C8595]">{meta}</span> : null}
        <ChevronRight className="size-3.5 shrink-0 text-[#5C6472] transition-transform duration-300 group-open:rotate-90" aria-hidden />
      </summary>
      <div className="px-4 pb-4 pt-1 text-sm leading-relaxed text-[#A8B0BD]">{children}</div>
    </details>
  );
}

export function ResearchEmpty({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <Icon className="size-5 text-[#5C6472]" strokeWidth={1.5} aria-hidden />
      <p className="mt-3 text-[15px] text-[#F5F5F7]">{title}</p>
      <div className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#7C8595]">{children}</div>
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
    </Card>
  );
}

/** A cover image, only from this dashboard's own storage or YouTube's picture host. A quiet
    placeholder shows when there is none, the address is not allowed, or the host refuses it. */
export function Thumb({ src: raw, alt = "", className = "" }: { src: string | null; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = safeThumbUrl(raw, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-[#0A0A0F] ${className}`}>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5C6472]">No preview</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`object-cover ${className}`} />
  );
}

/** A profile picture, only from YouTube's or Instagram's own hosts, else the initials. */
export function Avatar({ src: raw, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = safeAvatarUrl(raw);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (!src || failed) {
    return (
      <span
        aria-hidden
        className="flex size-[30px] shrink-0 items-center justify-center rounded-[10px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.05)] text-[11px] font-semibold text-[#A8B0BD]"
      >
        {initials || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-[30px] shrink-0 rounded-[10px] border border-[rgba(255,255,255,0.10)] object-cover"
    />
  );
}

/** Change the address's query without reloading the page, keeping every other part of it. */
export function replaceQuery(mutate: (params: URLSearchParams) => URLSearchParams | void): void {
  const current = new URLSearchParams(window.location.search);
  const next = mutate(current) ?? current;
  const qs = next.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

/** The element that scrolls this one. The app scrolls an inner panel, not the window. */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

/** The message when a key is missing, naming the key and where to get one free. */
export function MissingKeys({ keys }: { keys: { name: string; what: string; where: string }[] }) {
  if (keys.length === 0) return null;
  return (
    <div className="rounded-xl border border-[rgba(248,175,0,0.22)] bg-[rgba(248,175,0,0.05)] p-4">
      <p className="text-[13px] font-medium text-[#F5F5F7]">
        {keys.length === 1 ? "One key is missing" : `${keys.length} keys are missing`}, so parts of Research cannot run yet.
      </p>
      <ul className="mt-2 space-y-2">
        {keys.map((k) => (
          <li key={k.name} className="text-[13px] leading-relaxed text-[#A8B0BD]">
            <span className="font-mono text-xs text-[#F8AF00]">{k.name}</span>
            <span className="block">{k.what}</span>
            <span className="block text-[#7C8595]">Free at {k.where}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[#7C8595]">
        Add them to .env.local when you run this on your own machine, or to your project settings on Vercel, then restart it.
      </p>
    </div>
  );
}
