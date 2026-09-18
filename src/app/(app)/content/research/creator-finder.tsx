"use client";

// Finding creators worth tracking.
//
// Two ways in, because a student either knows the niche or knows one account. "Niche on YouTube"
// searches the most watched videos of the last year and ranks the channels behind them. "Similar to
// an Instagram account" asks Instagram itself who it thinks is like an account you name.
//
// Tracking one puts them on the roster below and starts reading their posts straight away, so the
// answer says what is happening rather than leaving you to guess.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Loader2, Search, UserPlus } from "lucide-react";
import { CREATOR_ROLES, ROLE_LABEL, type CreatorRole } from "@/lib/content/creators";
import type { SimilarAccount, YoutubeCreatorResult } from "@/lib/research/search";
import { compactNumber } from "@/lib/research/view";
import { searchCreatorsAction } from "./ai-actions";
import { trackCreatorAction } from "./scan-actions";
import { Avatar, Card, ErrorLine, PrimaryButton, QuietButton, Segmented, SelectPill, Thumb, OFFLINE } from "./ui";

type Where = "youtube" | "instagram";

const PLACEHOLDER: Record<Where, string> = {
  youtube: "online coaching, course launches, client acquisition",
  instagram: "an Instagram handle you already know",
};

export function CreatorFinder({ focusSignal, onTracked }: { focusSignal: number; onTracked: () => void }) {
  const [where, setWhere] = useState<Where>("youtube");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<CreatorRole>("emulate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [youtube, setYoutube] = useState<YoutubeCreatorResult[] | null>(null);
  const [instagram, setInstagram] = useState<SimilarAccount[] | null>(null);
  const [cached, setCached] = useState(false);
  const [tracking, setTracking] = useState<string | null>(null);
  const [tracked, setTracked] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSignal > 0) input.current?.focus();
  }, [focusSignal]);

  const search = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setError("Type at least two characters to search for.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const answer = await searchCreatorsAction({ platform: where, query: q });
      if (!answer.ok) {
        setError(answer.error);
        return;
      }
      setCached(answer.cached);
      if (answer.platform === "youtube") {
        setYoutube(answer.results);
        setInstagram(null);
      } else {
        setInstagram(answer.results);
        setYoutube(null);
      }
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }, [query, where]);

  const track = useCallback(
    async (key: string, input: { name?: string; instagram?: string; youtube?: string; youtubeChannelId?: string }) => {
      setTracking(key);
      setError(null);
      try {
        const answer = await trackCreatorAction({ ...input, role });
        if (!answer.ok) setError(answer.error);
        else {
          setTracked((t) => ({ ...t, [key]: answer.note }));
          onTracked();
        }
      } catch {
        setError(OFFLINE);
      } finally {
        setTracking(null);
      }
    },
    [role, onTracked],
  );

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#F5F5F7]">Find creators</h3>
          <p className="mt-0.5 text-xs text-[#7C8595]">
            The people your client&apos;s customers already watch. Track the ones worth copying and every scan reads them.
          </p>
        </div>
        <Segmented
          label="Where to look"
          value={where}
          onChange={(v) => {
            setWhere(v);
            setYoutube(null);
            setInstagram(null);
            setError(null);
          }}
          options={[
            { value: "youtube", label: "Niche on YouTube" },
            { value: "instagram", label: "Similar to an Instagram account" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5C6472]" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder={PLACEHOLDER[where]}
            aria-label={where === "youtube" ? "Niche to search on YouTube" : "Instagram handle to start from"}
            className="h-10 w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] pl-9 pr-3 text-sm text-[#F5F5F7] placeholder:text-[#5C6472] focus:border-[#0083FF] focus:outline-none"
          />
        </div>
        <SelectPill
          label="What to use them for"
          value={role}
          onChange={(v) => setRole(v as CreatorRole)}
          options={CREATOR_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
        />
        <PrimaryButton onClick={search} busy={busy} icon={Search}>
          Search
        </PrimaryButton>
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}
      {cached && (youtube || instagram) && <p className="text-xs text-[#5C6472]">Shown from the last search for these words, which was less than a day ago.</p>}

      {youtube && youtube.length === 0 && <p className="text-[13px] text-[#7C8595]">No channels came back for that. Try fewer words, or a plainer way of saying it.</p>}
      {instagram && instagram.length === 0 && (
        <p className="text-[13px] text-[#7C8595]">Instagram had no similar accounts for that one. Try a bigger account in the same niche.</p>
      )}

      {youtube && youtube.length > 0 && (
        <ul className="divide-y divide-[rgba(255,255,255,0.06)] rounded-lg border border-[rgba(255,255,255,0.08)]">
          {youtube.map((c) => {
            const key = `yt:${c.channelId}`;
            const note = tracked[key];
            return (
              <li key={key} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar src={c.avatar} name={c.title} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[#F5F5F7]">{c.title}</div>
                  <div className="truncate font-mono text-[11px] text-[#7C8595]">
                    {c.handle ?? ""} {c.subscribers !== null ? `${compactNumber(c.subscribers)} subscribers` : "subscribers hidden"}
                    {c.instagramGuess ? ` - @${c.instagramGuess} from their description` : ""}
                  </div>
                  {c.bestVideo.url && (
                    <a
                      href={c.bestVideo.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xs text-[#A8B0BD] hover:text-[#F5F5F7]"
                    >
                      <Thumb src={c.bestVideo.thumb} alt="" className="h-6 w-10 shrink-0 rounded" />
                      <span className="truncate">{c.bestVideo.title ?? "Their best match"}</span>
                      <span className="shrink-0 font-mono text-[10px] text-[#7C8595]">{compactNumber(c.bestVideo.views)}</span>
                      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                    </a>
                  )}
                </div>
                {c.tracked && !note ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#7BE0A5]">
                    <Check className="size-3.5" aria-hidden /> Already tracked
                  </span>
                ) : note ? (
                  <span className="max-w-[240px] text-right text-xs text-[#7BE0A5]">{note}</span>
                ) : (
                  <QuietButton
                    onClick={() => track(key, { name: c.title, youtube: c.handle ?? undefined, youtubeChannelId: c.channelId })}
                    busy={tracking === key}
                    icon={UserPlus}
                  >
                    Track
                  </QuietButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {instagram && instagram.length > 0 && (
        <ul className="divide-y divide-[rgba(255,255,255,0.06)] rounded-lg border border-[rgba(255,255,255,0.08)]">
          {instagram.map((a) => {
            const key = `ig:${a.username}`;
            const note = tracked[key];
            return (
              <li key={key} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar src={a.avatar} name={a.fullName ?? a.username} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[#F5F5F7]">
                    {a.fullName ?? a.username}
                    {a.verified && <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#0083FF]">verified</span>}
                  </div>
                  <a
                    href={`https://www.instagram.com/${a.username}/`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[#7C8595] hover:text-[#F5F5F7]"
                  >
                    @{a.username} <ArrowUpRight className="size-3" aria-hidden />
                  </a>
                </div>
                {a.tracked && !note ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#7BE0A5]">
                    <Check className="size-3.5" aria-hidden /> Already tracked
                  </span>
                ) : note ? (
                  <span className="max-w-[240px] text-right text-xs text-[#7BE0A5]">{note}</span>
                ) : (
                  <QuietButton onClick={() => track(key, { name: a.fullName ?? a.username, instagram: a.username })} busy={tracking === key} icon={UserPlus}>
                    Track
                  </QuietButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {busy && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-[#A8B0BD]">
          <Loader2 className="size-3.5 animate-spin text-[#0083FF]" aria-hidden /> Searching
        </p>
      )}
    </Card>
  );
}
