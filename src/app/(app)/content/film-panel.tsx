"use client";

import { useMemo, useState, useTransition } from "react";
import { Camera, Check, ListChecks, Loader2, Trash2 } from "lucide-react";
import { parseFilmScript, readingLength, speakingSeconds, toLines } from "@/lib/content/film";
import { moveCard, rejectScript } from "./board-actions";

// The filming view. Nineteen finished scripts sat on the board and none had been filmed, because a
// board card is something to read and this is something to work from: one script at a time, the
// hook big enough to read while talking, the words broken into lines you say, and the exact screens
// to capture underneath.
//
// Collapse, don't stack (the standing rule): a compact picker plus ONE script's full detail, never
// nineteen scripts expanded down the page. The swap is client-side state, never a router
// navigation, because a query-param navigation re-renders the whole content page server-side and
// an operator reads that delay as "it's broken".

export type FilmCard = {
  id: string;
  title: string;
  platform: string | null;
  format: string | null;
  script: string | null;
  notes: string | null;
  source: string | null;
};

const PLATFORM: Record<string, string> = { ig: "Instagram", yt: "YouTube", tt: "TikTok" };

export function FilmPanel({ cards }: { cards: FilmCard[] }) {
  const scripts = useMemo(() => cards.map(parseFilmScript), [cards]);
  const [selected, setSelected] = useState(scripts[0]?.id ?? "");
  const [filmed, setFilmed] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ready = scripts.filter((s) => !filmed.includes(s.id));
  const current = ready.find((s) => s.id === selected) ?? ready[0] ?? null;

  if (!current) {
    return (
      <div className="sk-card p-10 text-center">
        <Camera className="mx-auto mb-3 h-6 w-6 text-[var(--settoku-text-4)]" strokeWidth={1.25} />
        <p className="text-[15px] text-[var(--settoku-text-2)]">
          {scripts.length === 0 ? "Nothing is ready to film yet." : "Everything here is filmed."}
        </p>
        <p className="mt-1 text-[13px] text-[var(--settoku-text-4)]">
          {scripts.length === 0
            ? "Scripts land here every morning, under Scripted on the board."
            : "Three more arrive tomorrow morning."}
        </p>
      </div>
    );
  }

  const secs = speakingSeconds(current.beats);

  function markFilmed(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await moveCard(id, "filming", null, null);
      // Only drop it from the list once the board actually accepted the move, so a failure leaves
      // the script exactly where it was rather than quietly losing it from this view.
      if (res.ok) setFilmed((f) => [...f, id]);
      else setError(res.error);
    });
  }

  function bin(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await rejectScript(id, reason);
      if (res.ok) {
        setFilmed((f) => [...f, id]);
        setRejecting(false);
        setReason("");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-[248px_1fr]">
      {/* Picker: a strip on a phone, a rail on a laptop. min-w-0 is load-bearing on both children:
          a grid item defaults to min-width auto, so the scrolling strip refused to shrink and blew
          the whole panel wider than a phone, cutting the hook off mid-word. */}
      <div className="min-w-0">
        <div className="sk-label mb-2">Ready to film ({ready.length})</div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:block md:space-y-1 md:overflow-visible md:pb-0">
          {ready.map((s) => {
            const on = s.id === current.id;
            return (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors duration-200 md:w-full ${
                  on
                    ? "border-[var(--settoku-accent-ring)] bg-[var(--settoku-accent-soft)]"
                    : "border-[var(--settoku-border)] bg-[rgba(255,255,255,0.02)] hover:border-[var(--settoku-border-2)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="sk-label shrink-0">{s.platform === "yt" ? "YT" : "IG"}</span>
                  <span
                    className={`truncate text-[13px] ${
                      on ? "text-[var(--settoku-text-1)]" : "text-[var(--settoku-text-2)]"
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* The one script, laid out in the order it gets used. */}
      <article className="sk-card min-w-0 p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="sk-chip sk-chip-blue">{PLATFORM[current.platform ?? ""] ?? "Content"}</span>
          <span className="sk-chip">{readingLength(secs)} spoken</span>
          {current.subject ? (
            <span className="text-[12px] text-[var(--settoku-text-4)]">{current.subject}</span>
          ) : null}
        </div>

        {/* The hero: the first thing out of his mouth, sized to be read from arm's length. */}
        <div className="sk-label mb-2">The hook</div>
        <h2
          className="text-balance break-words text-[1.6rem] leading-[1.15] tracking-[-0.02em] text-[var(--settoku-text-1)] sm:text-[2.1rem] lg:text-[2.5rem]"
          style={{ fontFamily: "var(--font-settoku-display)" }}
        >
          {current.hook || current.title}
        </h2>

        {current.onScreen ? (
          <div className="mt-5 rounded-xl border border-dashed border-[var(--settoku-border-2)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
            <div className="sk-label mb-1">On screen</div>
            <p
              className="text-[15px] uppercase tracking-[0.08em] text-[var(--settoku-text-1)]"
              style={{ fontFamily: "var(--font-settoku-mono)" }}
            >
              {current.onScreen}
            </p>
          </div>
        ) : null}

        {current.platform === "yt" && (current.videoTitle || current.thumbnail) ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {current.videoTitle ? (
              <div>
                <div className="sk-label mb-1">Video title</div>
                <p className="text-[14px] text-[var(--settoku-text-2)]">{current.videoTitle}</p>
              </div>
            ) : null}
            {current.thumbnail ? (
              <div>
                <div className="sk-label mb-1">Thumbnail words</div>
                <p className="text-[14px] text-[var(--settoku-text-1)]">{current.thumbnail}</p>
                {current.thumbnailProps ? (
                  <p className="mt-1 text-[12px] text-[var(--settoku-text-4)]">{current.thumbnailProps}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* The words. One sentence per line: a paragraph is unreadable while talking to a camera. */}
        <div className="sk-label mb-2 mt-7">What you say</div>
        <div className="space-y-4">
          {current.beats.map((beat, i) => (
            <p key={i} className="text-[16px] leading-[1.75] text-[var(--settoku-text-2)] sm:text-[17px]">
              {toLines(beat).map((line, j) => (
                <span key={j} className="block">
                  {line}
                </span>
              ))}
            </p>
          ))}
        </div>

        {current.cta ? (
          <div className="mt-6 border-l-2 border-[var(--settoku-accent)] pl-4">
            <div className="sk-label mb-1">The ask</div>
            <p className="text-[16px] leading-relaxed text-[var(--settoku-text-1)]">{current.cta}</p>
          </div>
        ) : null}

        {current.shots.length > 0 ? (
          <div className="mt-7 rounded-xl border border-[var(--settoku-border)] bg-[rgba(255,255,255,0.02)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[var(--settoku-text-3)]" strokeWidth={1.5} />
              <span className="sk-label">Record these ({current.shots.length})</span>
            </div>
            <ol className="space-y-2">
              {current.shots.map((shot, i) => (
                <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-[var(--settoku-text-2)]">
                  <span
                    className="shrink-0 text-[var(--settoku-text-4)]"
                    style={{ fontFamily: "var(--font-settoku-mono)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{shot}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[var(--settoku-border)] pt-5">
          <button
            onClick={() => markFilmed(current.id)}
            disabled={pending}
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--settoku-accent)] px-5 py-2.5 text-[14px] font-medium text-white transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[var(--settoku-accent-2)] active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105">
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </span>
            )}
            Filmed it
          </button>
          <span className="text-[12px] text-[var(--settoku-text-4)]">
            Moves this card to Filming on the board.
          </span>
          {!rejecting ? (
            <button
              onClick={() => { setRejecting(true); setError(null); }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] text-[var(--settoku-text-3)] transition-colors duration-200 hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--settoku-text-1)]"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              Not this one
            </button>
          ) : null}
        </div>

        {/* Rejecting is how the writer is taught, so the reason is the point of the interaction and
            not an optional extra. It goes into a Brain document the writer reads on every run. */}
        {rejecting ? (
          <div className="mt-4 rounded-xl border border-[var(--settoku-border-2)] bg-[rgba(255,255,255,0.02)] p-4">
            <div className="sk-label mb-2">What is wrong with it?</div>
            <p className="mb-3 text-[13px] leading-relaxed text-[var(--settoku-text-3)]">
              Say it however you would say it out loud. This goes into your Brain and every script
              written after this one has to clear it, so a sentence here is worth more than binning
              ten scripts quietly.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Too generic, any AI account could post this. The hook is a topic, not a hook."
              className="w-full resize-y rounded-lg border border-[var(--settoku-border)] bg-[var(--settoku-bg-input)] px-3 py-2 text-[14px] leading-relaxed text-[var(--settoku-text-1)] outline-none transition-colors duration-200 placeholder:text-[var(--settoku-text-4)] focus:border-[var(--settoku-accent-ring)]"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => bin(current.id)}
                disabled={pending || reason.trim().length < 4}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--settoku-border-2)] px-4 py-2 text-[13px] font-medium text-[var(--settoku-text-1)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[rgba(255,255,255,0.05)] active:scale-[0.98] disabled:opacity-40"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
                Bin it and teach the writer
              </button>
              <button
                onClick={() => { setRejecting(false); setReason(""); setError(null); }}
                className="rounded-full px-3 py-2 text-[13px] text-[var(--settoku-text-3)] transition-colors duration-200 hover:text-[var(--settoku-text-1)]"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-[13px] text-[#FF6B6B]">{error}</p>
        ) : null}
      </article>
    </div>
  );
}
